package issues

import (
	"strings"
	"testing"
)

func TestDescriptionRichBlocksPreserveMarkupAndDiscardInteractiveAttributes(t *testing.T) {
	source := `<pre onclick="bad()"><code>if (a &lt; b) {
  return "مرحبا";
}</code></pre><table style="width:999px"><tbody><tr><th colspan="2" dir="rtl"><p>العنوان</p></th></tr><tr><td rowspan="2"><p>Details</p></td><td colspan="999999" onclick="bad()"><p>عمل</p></td></tr></tbody></table><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" onclick="bad()"></label><div><p>Done</p></div></li><li data-type="taskItem" data-checked="false" dir="rtl"><p>التالي</p></li></ul><script>removed()</script>`
	clean, err := cleanDescription(source)
	if err != nil {
		t.Fatal(err)
	}
	for _, wanted := range []string{
		"<pre><code>",
		"a &lt; b",
		"مرحبا",
		"<table>",
		"<tbody>",
		`colspan="2"`,
		`rowspan="2"`,
		`dir="rtl"`,
		`data-type="taskList"`,
		`data-checked="true"`,
		`data-checked="false"`,
	} {
		if !strings.Contains(clean, wanted) {
			t.Fatalf("supported rich description lost %s", wanted)
		}
	}
	for _, bad := range []string{"onclick", "style=", "999999", "<input", "<script>", "removed()"} {
		if strings.Contains(clean, bad) {
			t.Fatalf("unsafe rich description persisted %s", bad)
		}
	}
	again, err := cleanDescription(clean)
	if err != nil || again != clean {
		t.Fatal("rich description not canonical", err)
	}
}
