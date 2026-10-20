package testenv

import (
	"bytes"
	"context"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Workspace struct {
	Pool                         *pgxpool.Pool
	Project                      command.ProjectID
	Issue                        command.IssueID
	Admin, Author, Other, Viewer command.Actor
}

func Work(t *testing.T) Workspace {
	t.Helper()
	ctx := context.Background()
	w := Workspace{
		Pool:    Database(t),
		Project: command.NewID[command.ProjectKind](),
		Issue:   command.NewID[command.IssueKind](),
	}
	if err := migrations.Apply(ctx, w.Pool); err != nil {
		t.Fatal(err)
	}
	for i, actor := range []*command.Actor{&w.Admin, &w.Author, &w.Other, &w.Viewer} {
		*actor = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		if _, err := w.Pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", actor.UserID.UUID, []string{
			"admin@work.dev",
			"author@work.dev",
			"other@work.dev",
			"viewer@work.dev",
		}[i], []string{
			"Admin",
			"كاتب عربي",
			"مطور آخر",
			"Viewer",
		}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := w.Pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'GG','Discussion',$2)", w.Project.UUID, w.Admin.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	for i, actor := range []command.Actor{w.Author, w.Other, w.Viewer} {
		if _, err := w.Pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)", w.Project.UUID, actor.UserID.UUID, []string{"member", "member", "viewer"}[i]); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := w.Pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done'])", w.Project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,assignee_id,rank) VALUES($1,$2,1,'Discussion عمل',$3,$4,1024)", w.Issue.UUID, w.Project.UUID, w.Admin.UserID.UUID, w.Other.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	return w
}
func PNG(t *testing.T) []byte {
	t.Helper()
	picture := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	picture.SetNRGBA(0, 0, color.NRGBA{R: 64, G: 128, B: 192, A: 255})
	var bytes bytes.Buffer
	if err := png.Encode(&bytes, picture); err != nil {
		t.Fatal(err)
	}
	return bytes.Bytes()
}

// PNGSize creates a valid tiny bitmap with a bounded private ancillary chunk.
// It exercises maximum transport bytes without decompressing a large bitmap.
func PNGSize(t *testing.T, size int) []byte {
	t.Helper()
	small := PNG(t)
	if size < len(small)+12 {
		t.Fatal("fixture size too small")
	}
	payload := make([]byte, size-len(small)-12)
	kind := []byte("ggJr")
	result := append([]byte{}, small[:33]...)
	length := make([]byte, 4)
	binary.BigEndian.PutUint32(length, uint32(len(payload)))
	result = append(result, length...)
	result = append(result, kind...)
	result = append(result, payload...)
	crc := crc32.NewIEEE()
	_, _ = crc.Write(kind)
	_, _ = crc.Write(payload)
	binary.BigEndian.PutUint32(length, crc.Sum32())
	result = append(result, length...)
	result = append(result, small[33:]...)
	return result
}
