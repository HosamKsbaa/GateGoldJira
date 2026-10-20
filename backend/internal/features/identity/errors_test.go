package identity

import (
	"encoding/json"
	"gategoldjira/backend/internal/platform/command"
	"testing"
	"time"
)

func TestConflictCurrentRoundTripHasOneConcreteRecord(t *testing.T) {
	user := UserView{
		ID:          command.NewID[command.UserKind](),
		Email:       "employee@example.test",
		DisplayName: "مطور 😀",
		Approved:    true,
		Active:      true,
		Revision:    9007199254740993,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	membership := MembershipView{
		ProjectID: command.NewID[command.ProjectKind](),
		User:      UserSummary{ID: user.ID, DisplayName: user.DisplayName},
		Role:      command.Member,
		Revision:  2,
	}
	for _, input := range []Current{{User: &user}, {Membership: &membership}, {}} {
		encoded, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		var result Current
		if err := json.Unmarshal(encoded, &result); err != nil {
			t.Fatal(err)
		}
		if input.User != nil && (result.User == nil || result.User.Revision != user.Revision || result.Membership != nil) {
			t.Fatal("lost concrete user conflict")
		}
		if input.Membership != nil && (result.Membership == nil || result.Membership.ProjectID != membership.ProjectID || result.User != nil) {
			t.Fatal("lost concrete membership conflict")
		}
	}
	for _, malformed := range []string{
		`{}`,
		`{"id":"10000000-0000-4000-8000-000000000001"}`,
		`{"secret":"unknown"}`,
		`{"projectId":"10000000-0000-4000-8000-000000000001","id":"10000000-0000-4000-8000-000000000001"}`,
	} {
		var current Current
		if json.Unmarshal([]byte(malformed), &current) == nil {
			t.Fatal("accepted an incomplete or ambiguous conflict")
		}
	}
}
