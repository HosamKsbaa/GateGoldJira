package issues

import (
	"context"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"testing"
)

func TestDescriptionPublishesPrivateFilesAndPicturesAtomicallyAtOneRevision(t *testing.T) {
	for _, modern := range []bool{false, true} {
		t.Run(map[bool]string{false: "legacy", true: "modern"}[modern], func(t *testing.T) {
			f := issueDatabase(t)
			ctx := context.Background()
			work := f.create(t, "Private description")
			store, err := objectstore.NewLocal(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			assets := attachments.New(f.service.runner, f.service.cursors, store)
			f.service.WithAssets(assets)
			ids := []command.AssetID{}
			for _, example := range []struct {
				meta attachments.AssetMetadata
				data []byte
			}{
				{
					attachments.AssetMetadata{
						Kind:        attachments.FileAsset,
						Filename:    "وثيقة.txt",
						MIMEType:    "text/plain",
						Publication: attachments.DraftPublication,
					},
					[]byte("مسودة خاصة"),
				},
				{
					attachments.AssetMetadata{
						Kind:        attachments.ImageAsset,
						Filename:    "picture.png",
						Description: "صورة",
						MIMEType:    "image/png",
						Publication: attachments.DraftPublication,
					},
					testenv.PNG(t),
				},
			} {
				saved, err := assets.UploadAsset(ctx, f.member, attachments.AssetUploadInput{
					IssueID:        work.Summary.ID,
					Metadata:       example.meta,
					Data:           example.data,
					RetryReference: uuid.NewString(),
				})
				if err != nil {
					t.Fatal(err)
				}
				ids = append(ids, saved.Body.Result.ID)
				if _, err = assets.GetAsset(ctx, f.viewer, attachments.AssetGetInput{AssetID: saved.Body.Result.ID}); err == nil {
					t.Fatal("draft exposed")
				}
			}
			html := "<p dir=\"rtl\">وصف <a data-attachment-id=\"" + ids[0].String() + "\">وثيقة</a><img data-picture-id=\"" + ids[1].String() + "\" alt=\"صورة\"></p>"
			if modern {
				if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
					t.Fatal(err)
				}
				current, err := f.service.GetModern(ctx, f.member, work.Summary.ID)
				if err != nil {
					t.Fatal(err)
				}
				saved, err := f.service.UpdateModern(ctx, f.member, ModernUpdateInput{
					IssueID:          work.Summary.ID,
					ExpectedRevision: 1,
					Editable: ModernEditable{
						Title:             work.Summary.Title,
						Description:       html,
						DescriptionFormat: command.HTMLDescription,
						TypeID:            current.Summary.Type.ID,
						PriorityID:        current.Summary.Priority.ID,
						LabelIDs:          []command.LabelID{},
					},
					RetryReference: uuid.NewString(),
				})
				if err != nil || saved.Body.Result.Summary.Revision != 2 {
					t.Fatal("modern description", err)
				}
			} else {
				in := UpdateInput{
					IssueID:          work.Summary.ID,
					ExpectedRevision: 1,
					Editable:         editable(work),
					RetryReference:   uuid.NewString(),
				}
				in.Editable.Description = html
				in.Editable.DescriptionFormat = command.HTMLDescription
				saved, err := f.service.Update(ctx, f.member, in)
				if err != nil || saved.Body.Result.Summary.Revision != 2 {
					t.Fatal("legacy description", err)
				}
				replay, err := f.service.Update(ctx, f.member, in)
				if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Summary.Revision != 2 {
					t.Fatal("description replay", err)
				}
			}
			for _, id := range ids {
				view, err := assets.GetAsset(ctx, f.viewer, attachments.AssetGetInput{AssetID: id})
				if err != nil || view.State != attachments.PublishedAsset || view.IssueRevision != 2 {
					t.Fatal("publication", view, err)
				}
			}
		})
	}
}
