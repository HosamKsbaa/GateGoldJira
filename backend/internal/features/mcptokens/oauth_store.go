package mcptokens

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"gategoldjira/backend/internal/platform/database/dbgen"
	oauth "github.com/go-oauth2/oauth2/v4"
	oautherrors "github.com/go-oauth2/oauth2/v4/errors"
	"github.com/go-oauth2/oauth2/v4/manage"
	"github.com/go-oauth2/oauth2/v4/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const OAuthClientID = "gategoldjira-antigravity"
const OAuthAccessPrefix = "gg_oauth_"
const oauthScope = "gategoldjira:access"

var errRefreshReplay = errors.New("refresh credential already used")

func randomCredential(prefix string) (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return prefix + base64.RawURLEncoding.EncodeToString(value), nil
}
func credentialHash(value string) []byte {
	if value == "" {
		return nil
	}
	hash := sha256.Sum256([]byte(value))
	return hash[:]
}

type oauthCodeGenerator struct{}

func (oauthCodeGenerator) Token(context.Context, *oauth.GenerateBasic) (string, error) {
	return randomCredential("")
}

type oauthAccessGenerator struct{}

func (oauthAccessGenerator) Token(_ context.Context, _ *oauth.GenerateBasic, refresh bool) (string, string, error) {
	access, err := randomCredential(OAuthAccessPrefix)
	if err != nil {
		return "", "", err
	}
	if !refresh {
		return access, "", nil
	}
	renewal, err := randomCredential("gg_refresh_")
	return access, renewal, err
}

type oauthClients struct{}

func (oauthClients) GetByID(_ context.Context, id string) (oauth.ClientInfo, error) {
	if id != OAuthClientID {
		return nil, oautherrors.ErrInvalidClient
	}
	return &models.Client{ID: id, Public: true}, nil
}

// Each store belongs to a single database transaction and OAuth exchange. No
// secret is serialized: lookups restore only the presented code/refresh token.
type oauthStore struct {
	queries  *dbgen.Queries
	clientID string
	loadedID uuid.UUID
}

func (store *oauthStore) Create(ctx context.Context, info oauth.TokenInfo) error {
	original, ok := info.(*models.Token)
	if !ok {
		return errors.New("unexpected OAuth token model")
	}
	metadata := *original
	metadata.Code = ""
	metadata.Access = ""
	metadata.Refresh = ""
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	connection, err := uuid.Parse(info.GetUserID())
	if err != nil {
		return err
	}
	expires := pgtype.Timestamptz{}
	if info.GetAccess() != "" {
		expires = pgtype.Timestamptz{Time: info.GetAccessCreateAt().Add(info.GetAccessExpiresIn()), Valid: true}
	}
	return store.queries.OAuthCredentialCreate(ctx, dbgen.OAuthCredentialCreateParams{
		ID: uuid.New(), ConnectionID: connection, CodeHash: credentialHash(info.GetCode()), AccessHash: credentialHash(info.GetAccess()), RefreshHash: credentialHash(info.GetRefresh()), AccessExpiresAt: expires, Metadata: encoded,
	})
}
func (store *oauthStore) RemoveByCode(ctx context.Context, code string) error {
	return store.queries.OAuthCodeConsume(ctx, credentialHash(code))
}
func (store *oauthStore) RemoveByAccess(ctx context.Context, _ string) error {
	return store.queries.OAuthAccessRemove(ctx, store.loadedID)
}
func (store *oauthStore) RemoveByRefresh(ctx context.Context, refresh string) error {
	return store.queries.OAuthRefreshConsume(ctx, credentialHash(refresh))
}
func (store *oauthStore) GetByAccess(context.Context, string) (oauth.TokenInfo, error) {
	return nil, oautherrors.ErrInvalidAccessToken
}
func (store *oauthStore) decode(row dbgen.McpOauthCredential) (*models.Token, error) {
	var info models.Token
	if err := json.Unmarshal(row.Metadata, &info); err != nil {
		return nil, err
	}
	if info.ClientID != store.clientID || info.UserID != row.ConnectionID.String() {
		return nil, oautherrors.ErrInvalidClient
	}
	store.loadedID = row.ID
	return &info, nil
}
func (store *oauthStore) GetByCode(ctx context.Context, code string) (oauth.TokenInfo, error) {
	row, err := store.queries.OAuthCredentialByCode(ctx, credentialHash(code))
	if err != nil || row.CodeUsed {
		return nil, oautherrors.ErrInvalidAuthorizeCode
	}
	info, err := store.decode(row)
	if err != nil {
		return nil, err
	}
	info.Code = code
	return info, nil
}
func (store *oauthStore) GetByRefresh(ctx context.Context, refresh string) (oauth.TokenInfo, error) {
	row, err := store.queries.OAuthCredentialByRefresh(ctx, credentialHash(refresh))
	if err != nil {
		return nil, oautherrors.ErrInvalidRefreshToken
	}
	info, err := store.decode(row)
	if err != nil {
		return nil, err
	}
	if row.RefreshUsed {
		return nil, errRefreshReplay
	}
	info.Refresh = refresh
	return info, nil
}
func newOAuthManager(queries *dbgen.Queries, clientID string) *manage.Manager {
	manager := manage.NewDefaultManager()
	manager.MapClientStorage(oauthClients{})
	manager.MapTokenStorage(&oauthStore{queries: queries, clientID: clientID})
	manager.MapAuthorizeGenerate(oauthCodeGenerator{})
	manager.MapAccessGenerate(oauthAccessGenerator{})
	manager.SetAuthorizeCodeExp(2 * time.Minute)
	manager.SetAuthorizeCodeTokenCfg(&manage.Config{AccessTokenExp: 15 * time.Minute, RefreshTokenExp: 30 * 24 * time.Hour, IsGenerateRefresh: true})
	manager.SetRefreshTokenCfg(&manage.RefreshingConfig{AccessTokenExp: 15 * time.Minute, IsGenerateRefresh: true, IsRemoveAccess: true, IsRemoveRefreshing: true, IsResetRefreshTime: false})
	manager.SetValidateURIHandler(func(_, redirect string) error {
		if !validOAuthRedirect(redirect) {
			return oautherrors.ErrInvalidRedirectURI
		}
		return nil
	})
	return manager
}
