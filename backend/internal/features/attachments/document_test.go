package attachments

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/objectstore"
)

func officeSample(t *testing.T, mime string, macro bool) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	main, content, body := "word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>عمل</w:t></w:r></w:p></w:body></w:document>`
	if mime == sheetMIME {
		main, content, body = "xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>`
	}
	entries := []struct{ name, data string }{
		{
			"[Content_Types].xml",
			`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/` + main + `" ContentType="` + content + `"/></Types>`,
		},
		{main, body},
		{
			"_rels/.rels",
			`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
		},
	}
	if macro {
		entries = append(entries, struct{ name, data string }{"word/vbaProject.bin", "macro"})
	}
	for _, entry := range entries {
		file, err := writer.Create(entry.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = file.Write([]byte(entry.data)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}
func TestDocumentValidationChecksContainersTypesBoundsAndArabic(t *testing.T) {
	pdf := []byte("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n")
	docx, xlsx := officeSample(t, wordMIME, false), officeSample(t, sheetMIME, false)
	for _, sample := range []struct {
		data []byte
		mime string
	}{
		{pdf, "application/pdf"},
		{
			[]byte("تعليق عربي\nEnglish"),
			"text/plain",
		},
		{
			[]byte("اسم,قيمة\nعمل,42\n"),
			"text/csv",
		},
		{docx, wordMIME},
		{xlsx, sheetMIME},
	} {
		if err := validateDocument(sample.data, sample.mime); err != nil {
			t.Fatalf("supported %s: %v", sample.mime, err)
		}
	}
	for _, sample := range []struct {
		data []byte
		mime string
	}{
		{pdf, "text/plain"},
		{
			[]byte("<svg onload='evil()'/>"),
			"text/plain",
		},
		{
			[]byte("<html>spoof</html>"),
			"application/pdf",
		},
		{[]byte{0, 1, 2}, "text/plain"},
		{[]byte{0xff}, "text/plain"},
		{[]byte("\"unfinished"), "text/csv"},
		{docx, sheetMIME},
		{xlsx, wordMIME},
		{docx[:len(docx)-20], wordMIME},
		{officeSample(t, wordMIME, true), wordMIME},
		{
			make([]byte, objectstore.MaximumSize+1),
			"application/pdf",
		},
	} {
		if err := validateDocument(sample.data, sample.mime); err == nil {
			t.Fatalf("invalid %s accepted", sample.mime)
		}
	}
	if _, err := normalizeMetadata(AttachmentUploadMetadata{"file.exe", "application/pdf"}); err == nil {
		t.Fatal("misnamed executable accepted")
	}
	for _, filename := range []string{"../a.pdf", "a\n.pdf", "a.svg"} {
		if _, err := normalizeMetadata(AttachmentUploadMetadata{filename, "application/pdf"}); err == nil {
			t.Fatal("invalid filename accepted")
		}
	}
}
func TestOfficeRejectsBombsCorruptCRCsTruncatedXMLAndMacroTypes(t *testing.T) {
	data := officeSample(t, wordMIME, false)
	corrupt := append([]byte{}, data...)
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	offset, err := archive.File[0].DataOffset()
	if err != nil {
		t.Fatal(err)
	}
	corrupt[offset+3] ^= 0xff
	if validOffice(corrupt, wordMIME) {
		t.Fatal("corrupt ZIP accepted")
	}
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	file, err := writer.Create("large.xml")
	if err != nil {
		t.Fatal(err)
	}
	chunk := []byte(strings.Repeat("x", 1024*1024))
	for range 101 {
		if _, err := file.Write(chunk); err != nil {
			t.Fatal(err)
		}
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	if validOffice(buffer.Bytes(), wordMIME) {
		t.Fatal("oversized decompressed package accepted")
	}
	for _, body := range []string{
		`<document xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`,
		`<!DOCTYPE document><document/>`,
		`<document/><document/>`,
	} {
		if _, ok := rootElement([]byte(body)); ok {
			t.Fatal("malformed XML accepted")
		}
	}
}
