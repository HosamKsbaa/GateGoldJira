package comments

import (
	"gategoldjira/backend/internal/platform/command"
	"strings"
	"testing"
)

func TestRichBlocksPreserveArabicReferencesAndCanonicalCheckState(t *testing.T) {
	user, picture := command.NewID[command.UserKind](), command.NewID[command.PictureKind]()
	body := Body{HTML: `<pre><code>if (count &lt; 3) {
  print("مرحبا");
}</code></pre><table><thead><tr><th colspan="2" dir="rtl"><p>المهمة</p></th></tr></thead><tbody><tr><td><p><span data-user-id="` + user.String() + `">forged</span></p></td><td><p><img data-picture-id="` + picture.String() + `"></p></td></tr></tbody></table><ul data-type="taskList"><li data-type="taskItem" data-checked="true" dir="rtl"><label><input type="checkbox" checked></label><div><p>راجع العمل</p></div></li><li data-type="taskItem" data-checked="false"><p>اختبر التطبيق</p></li></ul>`, MentionUserIDs: []command.UserID{user}, PictureIDs: []command.PictureID{picture}}
	users, pictures := map[command.UserID]string{user: "مطور الفريق"}, map[command.PictureID]string{picture: "صورة الخطة"}
	clean, err := Canonicalize(body, users, pictures)
	if err != nil {
		t.Fatal(err)
	}
	for _, wanted := range []string{
		"<pre><code>",
		"count &lt; 3",
		"مرحبا",
		"<table>",
		`colspan="2"`,
		`dir="rtl"`,
		`data-type="taskList"`,
		`data-type="taskItem"`,
		`data-checked="true"`,
		`data-checked="false"`,
		user.String(),
		picture.String(),
	} {
		if !strings.Contains(clean.SafeHTML, wanted) {
			t.Fatalf("supported rich block lost %s", wanted)
		}
	}
	if strings.Contains(clean.SafeHTML, "<input") || strings.Contains(clean.SafeHTML, "forged") {
		t.Fatal("unsafe or forged editor attributes persisted")
	}
	for _, wanted := range []string{
		"count < 3",
		"مطور الفريق",
		"صورة الخطة",
		"راجع العمل",
		"اختبر التطبيق",
	} {
		if !strings.Contains(clean.PlainText, wanted) {
			t.Fatalf("derived text lost %s", wanted)
		}
	}
	body.HTML = clean.SafeHTML
	again, err := Canonicalize(body, users, pictures)
	if err != nil || again.SafeHTML != clean.SafeHTML || again.PlainText != clean.PlainText {
		t.Fatal("rich blocks not stable on retry", err)
	}
}

func TestRichBlocksRejectUnsafeAttributesAndStillEnforceReferenceAndTextLimits(t *testing.T) {
	source := `<table onclick="evil()" style="background:url(javascript:bad())"><tbody><tr><td colspan="999999" rowspan="-4" data-user-id="fake"><p>Safe <a href="javascript:evil()">link</a></p><script>removed()</script></td><th colspan="20" rowspan="2" dir="rtl">عربي</th></tr></tbody></table><ul data-type="taskList" onmouseover="evil()"><li data-type="taskItem" data-checked="javascript:evil()"><p>Task</p><input type="checkbox" onclick="evil()"></li></ul><pre class="language-js" onfocus="evil()"><code>const text = '&lt;script&gt;';</code></pre>`
	clean, err := Canonicalize(textBody(source), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{
		"onclick",
		"onmouseover",
		"onfocus",
		"style=",
		"javascript:",
		"999999",
		`rowspan="-4"`,
		"<script>",
		"removed()",
		"<input",
		`data-user-id="fake"`,
		"language-js",
	} {
		if strings.Contains(clean.SafeHTML, bad) {
			t.Fatalf("unsafe rich markup persisted %s", bad)
		}
	}
	if !strings.Contains(clean.SafeHTML, `colspan="20"`) || !strings.Contains(clean.SafeHTML, `data-checked="false"`) {
		t.Fatal("safe bounded attributes or unchecked default lost")
	}
	picture := command.NewID[command.PictureKind]()
	hidden := textBody(`<table><tr><td><p><img data-picture-id="` + picture.String() + `"></p></td></tr></table>`)
	if _, err := Canonicalize(hidden, nil, map[command.PictureID]string{picture: "private"}); err == nil {
		t.Fatal("table bypassed explicit picture references")
	}
	for _, html := range []string{
		`<pre><code>` + strings.Repeat("ع", 5001) + `</code></pre>`,
		`<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>` + strings.Repeat("x", 5001) + `</p></li></ul>`,
	} {
		if _, err := Canonicalize(textBody(html), nil, nil); err == nil {
			t.Fatal("rich block bypassed visible text limit")
		}
	}
}
