package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type fixtureUser struct {
	ID                      uuid.UUID
	Name, Email, Subject    string
	Administrator, Disabled bool
}

func fixtureUsers() []fixtureUser {
	return []fixtureUser{
		{
			uuid.MustParse("10000000-0000-4000-8000-000000000001"),
			"Local Owner",
			"owner@example.test",
			"local|owner",
			true,
			false,
		},
		{
			uuid.MustParse("10000000-0000-4000-8000-000000000002"),
			"مطور تجريبي",
			"member@example.test",
			"local|member",
			false,
			false,
		},
		{
			uuid.MustParse("10000000-0000-4000-8000-000000000003"),
			"Local Viewer",
			"viewer@example.test",
			"local|viewer",
			false,
			false,
		},
		{
			uuid.MustParse("10000000-0000-4000-8000-000000000004"),
			"Disabled Fixture",
			"disabled@example.test",
			"local|disabled",
			false,
			true,
		},
	}
}
func localOnly() error {
	if os.Getenv("APP_ENV") != "development" || os.Getenv("K_SERVICE") != "" || os.Getenv("AUTH_MODE") != "development" || os.Getenv("STORAGE_MODE") != "local" {
		return errors.New("fixture commands require explicit development authentication and local storage outside Cloud Run")
	}
	parsed, err := url.Parse(os.Getenv("DATABASE_URL"))
	if err != nil || parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost" && parsed.Hostname() != "::1" {
		return errors.New("fixture commands require loopback PostgreSQL")
	}
	return nil
}
func createSecret(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if errors.Is(err, os.ErrExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}
func localKeys() (*rsa.PrivateKey, error) {
	path := os.Getenv("DEV_SIGNING_KEY_FILE")
	if path == "" || os.Getenv("CURSOR_SECRET_FILE") == "" {
		return nil, errors.New("development key and cursor-secret paths are required")
	}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return nil, err
		}
		encoded, err := x509.MarshalPKCS8PrivateKey(key)
		if err != nil {
			return nil, err
		}
		if err := createSecret(path, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encoded})); err != nil {
			return nil, err
		}
	}
	encoded, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(encoded)
	if block == nil {
		return nil, errors.New("invalid development signing key")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok || key.N.BitLen() < 2048 {
		return nil, errors.New("development signing key must be RSA >=2048 bits")
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	if err := createSecret(os.Getenv("CURSOR_SECRET_FILE"), secret); err != nil {
		return nil, err
	}
	return key, nil
}

func initializeFixtures(ctx context.Context) error {
	if err := localOnly(); err != nil {
		return err
	}
	key, err := localKeys()
	if err != nil {
		return err
	}
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return errors.New("local database connection failed")
	}
	defer pool.Close()
	if err := migrations.Apply(ctx, pool); err != nil {
		return errors.New("local migration failed")
	}
	if err := seedFixtureRecords(ctx, pool); err != nil {
		return err
	}
	if err := seedFixturePicture(ctx, pool); err != nil {
		return err
	}
	return writeFixtureTokens(key)
}

func seedFixturePicture(ctx context.Context, pool *pgxpool.Pool) error {
	id := uuid.MustParse("90000000-0000-4000-8000-000000000001")
	var exists bool
	if err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pictures WHERE id=$1)", id).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	store, err := objectstore.NewLocal(os.Getenv("LOCAL_PICTURE_DIRECTORY"))
	if err != nil {
		return err
	}
	canvas := image.NewRGBA(image.Rect(0, 0, 24, 24))
	for y := 0; y < 24; y++ {
		for x := 0; x < 24; x++ {
			canvas.Set(x, y, color.RGBA{R: 218, G: 174, B: 56, A: 255})
		}
	}
	var picture bytes.Buffer
	if err := png.Encode(&picture, canvas); err != nil {
		return err
	}
	stagingKey := objectstore.Key("fixture/" + uuid.NewString())
	staging, err := store.CreateStaging(ctx, stagingKey, &picture, int64(picture.Len()), "image/png")
	if err != nil {
		return err
	}
	publishedKey := objectstore.Key("fixture/" + uuid.NewString())
	published, err := store.Publish(ctx, stagingKey, staging, publishedKey)
	if err != nil {
		return err
	}
	// Object I/O has finished before any database transaction or company lock.
	_, err = pool.Exec(ctx, `INSERT INTO pictures(id,project_id,issue_id,uploaded_by,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_gallery,uploaded_at,expires_at,published_at)
 VALUES($1,'20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','fixture.png','Local picture fixture','image/png',$2,$3,$4,$5,$6,$7,'published',true,now(),now()+interval '24 hours',now())`, id, published.Size, published.SHA256, string(stagingKey), staging.Generation, string(publishedKey), published.Generation)
	return err
}
func seedFixtureRecords(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	if _, err := tx.Exec(ctx, "SELECT singleton FROM company_settings FOR UPDATE"); err != nil {
		return err
	}
	users := fixtureUsers()
	for _, user := range users {
		var disabled *time.Time
		if user.Disabled {
			now := time.Now().UTC()
			disabled = &now
		}
		if _, err := tx.Exec(ctx, `INSERT INTO users(id,email,email_key,display_name,approved_at,disabled_at,is_administrator)
 VALUES($1,$2,$2,$3,now(),$4,$5) ON CONFLICT(id) DO NOTHING`, user.ID, user.Email, user.Name, disabled, user.Administrator); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "INSERT INTO user_identities(issuer,subject,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", os.Getenv("AUTH_ISSUER"), user.Subject, user.ID); err != nil {
			return err
		}
	}
	project := uuid.MustParse("20000000-0000-4000-8000-000000000001")
	var exists bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1)", project).Scan(&exists); err != nil {
		return err
	}
	if exists {
		if _, err := tx.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1 AND core_mode<>'modern'", project); err != nil {
			return err
		}
		return tx.Commit(ctx)
	} // Reinitialization preserves all edited work/roles.
	if _, err := tx.Exec(ctx, "INSERT INTO projects(id,key,name,description,created_by,next_issue_number) VALUES($1,'DEMO','GateGold Demo','Local workflow fixtures',$2,6)", project, users[0].ID); err != nil {
		return err
	}
	for _, status := range []command.Status{command.Todo, command.InProgress, command.Review, command.Done} {
		if _, err := tx.Exec(ctx, "INSERT INTO project_status_order(project_id,status) VALUES($1,$2)", project, string(status)); err != nil {
			return err
		}
	}
	for i, role := range []command.Role{command.Member, command.Viewer} {
		if _, err := tx.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)", project, users[i+1].ID, string(role)); err != nil {
			return err
		}
	}
	for i, name := range []string{"All Issues", "Review focus"} {
		id := uuid.MustParse(fmt.Sprintf("30000000-0000-4000-8000-%012d", i+1))
		var review *int
		if i == 1 {
			n := 2
			review = &n
		}
		if _, err := tx.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,is_default,saved_filters,review_limit) VALUES($1,$2,$3,$4,$5,$6,'{}',$7)", id, project, name, strings.ToLower(name), users[0].ID, i == 0, review); err != nil {
			return err
		}
	}
	issueIDs := []uuid.UUID{}
	for i := 1; i <= 5; i++ {
		issueIDs = append(issueIDs, uuid.MustParse(fmt.Sprintf("40000000-0000-4000-8000-%012d", i)))
	}
	for i, id := range issueIDs {
		status := []string{"todo", "in_progress", "review", "done", "todo"}[i]
		kind := "task"
		var parent *uuid.UUID
		if i == 4 {
			kind = "subtask"
			parent = &issueIDs[0]
		}
		if _, err := tx.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,description,type,status,reporter_id,assignee_id,due_date,parent_id,rank) VALUES($1,$2,$3,$4,'Local fixture',$5,$6,$7,$8,CURRENT_DATE,$9,$10)", id, project, i+1, []string{
			"تجهيز المشروع",
			"Build API",
			"مراجعة الواجهة",
			"Completed work",
			"مهمة فرعية",
		}[i], kind, status, users[0].ID, users[1].ID, parent, (i+1)*1024); err != nil {
			return err
		}
	}
	label := uuid.MustParse("50000000-0000-4000-8000-000000000001")
	if _, err := tx.Exec(ctx, "INSERT INTO labels(id,project_id,name,name_key,created_by) VALUES($1,$2,'عاجل','عاجل',$3)", label, project, users[0].ID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "INSERT INTO issue_labels(project_id,issue_id,label_id) VALUES($1,$2,$3)", project, issueIDs[0], label); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "INSERT INTO issue_dependencies(project_id,dependent_id,blocker_id,created_by) VALUES($1,$2,$3,$4)", project, issueIDs[0], issueIDs[1], users[0].ID); err != nil {
		return err
	}
	comment := uuid.MustParse("60000000-0000-4000-8000-000000000001")
	if _, err := tx.Exec(ctx, "INSERT INTO comments(id,project_id,issue_id,author_id) VALUES($1,$2,$3,$4)", comment, project, issueIDs[0], users[1].ID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "INSERT INTO comment_versions(comment_id,revision,issue_id,safe_html,plain_text) VALUES($1,1,$2,'<p dir=\"rtl\">جاهز للمراجعة <strong>Review</strong></p>','جاهز للمراجعة Review')", comment, issueIDs[0]); err != nil {
		return err
	}
	event := uuid.MustParse("70000000-0000-4000-8000-000000000001")
	if _, err := tx.Exec(ctx, `INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes)
 VALUES($1,$2,'web','create_comment','comment',$3,$4,$5,'{"version":1,"fields":[{"field":"body","before":null,"after":"جاهز للمراجعة Review"}]}')`, event, users[1].ID, comment, project, issueIDs[0]); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "INSERT INTO notifications(id,recipient_id,event_id,project_id,issue_id,actor_id,reasons,plain_text_summary) VALUES($1,$2,$3,$4,$5,$6,ARRAY['comment'],'تعليق جديد')", uuid.MustParse("80000000-0000-4000-8000-000000000001"), users[0].ID, event, project, issueIDs[0], users[1].ID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1 AND core_mode<>'modern'", project); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type developmentClaims struct {
	jwt.RegisteredClaims
	auth.Claims
}

func writeFixtureTokens(key *rsa.PrivateKey) error {
	if err := writeFixturePasswords(); err != nil {
		return err
	}
	directory := filepath.Join(filepath.Dir(os.Getenv("DEV_SIGNING_KEY_FILE")), "tokens")
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	for _, user := range fixtureUsers() {
		for _, audience := range []struct{ Name, URL string }{
			{"web", os.Getenv("REST_AUDIENCE")},
			{"mcp", os.Getenv("MCP_AUDIENCE")},
		} {
			now := time.Now()
			claims := developmentClaims{
				RegisteredClaims: jwt.RegisteredClaims{
					Issuer:    os.Getenv("AUTH_ISSUER"),
					Subject:   user.Subject,
					Audience:  jwt.ClaimStrings{audience.URL},
					IssuedAt:  jwt.NewNumericDate(now),
					ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
				},
				Claims: auth.Claims{
					Scope:         "gategoldjira:access",
					Email:         &user.Email,
					EmailVerified: true,
				},
			}
			token, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(key)
			if err != nil {
				return err
			}
			name := strings.TrimPrefix(user.Subject, "local|") + "-" + audience.Name + ".token"
			if err := os.WriteFile(filepath.Join(directory, name), []byte(token), 0600); err != nil {
				return err
			}
		}
	}
	return nil
}
