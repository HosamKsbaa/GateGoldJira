package contracts

// Compile-time probes cover provider/sanitizer pins without making network calls.
import (
	"cloud.google.com/go/cloudsqlconn"
	"cloud.google.com/go/storage"
	jwtmiddleware "github.com/auth0/go-jwt-middleware/v3"
	"github.com/microcosm-cc/bluemonday"
	"github.com/pressly/goose/v3"
	"golang.org/x/net/html"
)

var (
	_ *cloudsqlconn.Dialer
	_ *storage.Client
	_ *jwtmiddleware.JWTMiddleware
	_ *bluemonday.Policy
	_ *goose.Provider
	_ *html.Node
)
