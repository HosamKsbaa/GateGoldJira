package attachments

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"io"
	"path"
	"strings"
	"unicode/utf8"

	"gategoldjira/backend/internal/platform/objectstore"
)

const wordMIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const sheetMIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

func supportedType(value string) bool {
	switch value {
	case "application/octet-stream", "application/pdf", "text/plain", "text/csv", wordMIME, sheetMIME:
		return true
	default:
		return false
	}
}
func matchingExtension(filename, mime string) bool {
	extension := strings.ToLower(path.Ext(filename))
	switch mime {
	case "application/octet-stream":
		return true
	case "application/pdf":
		return extension == ".pdf"
	case "text/plain":
		return extension == ".txt"
	case "text/csv":
		return extension == ".csv"
	case wordMIME:
		return extension == ".docx"
	case sheetMIME:
		return extension == ".xlsx"
	default:
		return false
	}
}

// Validate bounded containers without rendering documents or extracting files.
// Download always uses attachment disposition; none of these bytes enter HTML.
func validateDocument(data []byte, mime string) error {
	return validateDocumentBounded(data, mime, objectstore.MaximumSize)
}
func validateDocumentBounded(data []byte, mime string, maximum int64) error {
	invalid := validation("file", "Upload a complete PDF, UTF-8 TXT/CSV, DOCX or XLSX whose actual format matches its declared type within the configured size limit.")
	if len(data) < 1 || int64(len(data)) > maximum {
		return invalid
	}
	switch mime {
	case "application/octet-stream":
		return nil
	case "application/pdf":
		tail := data
		if len(tail) > 2048 {
			tail = tail[len(tail)-2048:]
		}
		if len(data) < 12 || !bytes.HasPrefix(data, []byte("%PDF-")) || !bytes.Contains(tail, []byte("%%EOF")) {
			return invalid
		}
		if data[5] != '1' && data[5] != '2' || data[6] != '.' || data[7] < '0' || data[7] > '9' {
			return invalid
		}
	case "text/plain", "text/csv":
		if !utf8.Valid(data) {
			return invalid
		}
		for _, r := range string(data) {
			if r < 32 && r != '\n' && r != '\r' && r != '\t' || r == 127 {
				return invalid
			}
		}
		lower := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(string(data), "\ufeff")))
		for _, prefix := range []string{"<!doctype html", "<html", "<svg", "<script", "<?xml", "%pdf-"} {
			if strings.HasPrefix(lower, prefix) {
				return invalid
			}
		}
		if mime == "text/csv" {
			reader := csv.NewReader(bytes.NewReader(data))
			reader.FieldsPerRecord = -1
			for {
				_, err := reader.Read()
				if err == io.EOF {
					break
				}
				if err != nil {
					return invalid
				}
			}
		}
	case wordMIME, sheetMIME:
		if !validOffice(data, mime) {
			return invalid
		}
	default:
		return invalid
	}
	return nil
}

type contentTypes struct {
	XMLName   xml.Name          `xml:"http://schemas.openxmlformats.org/package/2006/content-types Types"`
	Overrides []contentOverride `xml:"Override"`
}
type contentOverride struct {
	PartName    string `xml:"PartName,attr"`
	ContentType string `xml:"ContentType,attr"`
}

func readXML(file *zip.File, limit int64) ([]byte, bool) {
	reader, err := file.Open()
	if err != nil {
		return nil, false
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	return data, err == nil && int64(len(data)) <= limit
}
func rootElement(data []byte) (xml.Name, bool) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	var root xml.Name
	depth, roots := 0, 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return root, roots == 1 && depth == 0
		}
		if err != nil {
			return xml.Name{}, false
		}
		switch value := token.(type) {
		case xml.Directive:
			return xml.Name{}, false
		case xml.StartElement:
			if depth == 0 {
				root = value.Name
				roots++
				if roots > 1 {
					return xml.Name{}, false
				}
			}
			depth++
		case xml.EndElement:
			depth--
		}
	}
}

func validOffice(data []byte, mime string) bool {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil || len(archive.File) > 10000 {
		return false
	}
	main, kind, namespace, contentType := "word/document.xml", "document", "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
	if mime == sheetMIME {
		main, kind, namespace, contentType = "xl/workbook.xml", "workbook", "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
	}
	var manifest, document *zip.File
	seen := map[string]bool{}
	var expanded uint64
	for _, file := range archive.File {
		name := file.Name
		normalized := strings.TrimSuffix(name, "/")
		if normalized == "" || path.Clean(normalized) != normalized || strings.HasPrefix(normalized, "/") || strings.HasPrefix(normalized, "../") || strings.ContainsAny(name, "\\\x00") || seen[name] {
			return false
		}
		seen[name] = true
		if file.Flags&1 != 0 || strings.Contains(strings.ToLower(name), "vbaproject") || strings.Contains(strings.ToLower(name), "macros") {
			return false
		}
		if file.UncompressedSize64 > 100*1024*1024-expanded {
			return false
		}
		expanded += file.UncompressedSize64
		if name == "[Content_Types].xml" {
			manifest = file
		}
		if name == main {
			document = file
		}
		reader, err := file.Open()
		if err != nil {
			return false
		}
		_, err = io.Copy(io.Discard, io.LimitReader(reader, int64(file.UncompressedSize64)+1))
		closeErr := reader.Close()
		if err != nil || closeErr != nil {
			return false
		}
	}
	if manifest == nil || document == nil {
		return false
	}
	manifestData, ok := readXML(manifest, 1024*1024)
	if !ok {
		return false
	}
	var types contentTypes
	if xml.Unmarshal(manifestData, &types) != nil {
		return false
	}
	found := false
	for _, override := range types.Overrides {
		if strings.Contains(strings.ToLower(override.ContentType), "macroenabled") {
			return false
		}
		if override.PartName == "/"+main && override.ContentType == contentType {
			found = true
		}
	}
	if !found {
		return false
	}
	documentData, ok := readXML(document, 10*1024*1024)
	if !ok {
		return false
	}
	name, ok := rootElement(documentData)
	return ok && name.Local == kind && name.Space == namespace
}
