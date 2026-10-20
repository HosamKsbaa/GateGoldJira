package validation

import (
	"encoding/binary"
	"gategoldjira/backend/tests/testenv"
	"hash/crc32"
	"testing"
)

func TestPNGDimensionsAreBoundedWithoutDecodingPixels(t *testing.T) {
	data := testenv.PNG(t)
	if err := ValidateImage(data, "image/png"); err != nil {
		t.Fatal(err)
	}
	binary.BigEndian.PutUint32(data[16:20], 20000)
	binary.BigEndian.PutUint32(data[29:33], crc32.ChecksumIEEE(data[12:29]))
	if err := ValidateImage(data, "image/png"); err == nil {
		t.Fatal("oversized bitmap accepted")
	}
	if boundedDimensions(5000, 5000) {
		t.Fatal("pixel budget exceeded")
	}
}
