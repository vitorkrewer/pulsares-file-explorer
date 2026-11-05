package archive

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCreateListAndExtractZipAndTarGz(t *testing.T) {
	tmp := t.TempDir()
	srcDir := filepath.Join(tmp, "project")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	fileA := filepath.Join(srcDir, "hello.txt")
	if err := os.WriteFile(fileA, []byte("hello archive world"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	// 1. Testar ZIP
	zipPath := filepath.Join(tmp, "bundle.zip")
	if err := CreateArchive([]string{srcDir}, zipPath); err != nil {
		t.Fatalf("CreateArchive zip: %v", err)
	}

	entries, err := ListArchive(zipPath)
	if err != nil {
		t.Fatalf("ListArchive zip: %v", err)
	}
	if len(entries) == 0 {
		t.Fatalf("expected non-empty zip entries")
	}

	outZipDir := filepath.Join(tmp, "out_zip")
	count, err := ExtractArchive(zipPath, outZipDir)
	if err != nil {
		t.Fatalf("ExtractArchive zip: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 extracted file from zip, got %d", count)
	}

	// 2. Testar TAR.GZ
	tgzPath := filepath.Join(tmp, "bundle.tar.gz")
	if err := CreateArchive([]string{srcDir}, tgzPath); err != nil {
		t.Fatalf("CreateArchive tar.gz: %v", err)
	}

	tgzEntries, err := ListArchive(tgzPath)
	if err != nil {
		t.Fatalf("ListArchive tar.gz: %v", err)
	}
	if len(tgzEntries) == 0 {
		t.Fatalf("expected non-empty tar.gz entries")
	}

	outTgzDir := filepath.Join(tmp, "out_tgz")
	countTgz, err := ExtractArchive(tgzPath, outTgzDir)
	if err != nil {
		t.Fatalf("ExtractArchive tar.gz: %v", err)
	}
	if countTgz != 1 {
		t.Fatalf("expected 1 extracted file from tar.gz, got %d", countTgz)
	}

	// 3. Testar proteção contra Zip-Slip
	if _, err := safeJoinDest(outZipDir, "../../evil.sh"); err == nil {
		t.Fatalf("expected safeJoinDest to block traversal path")
	}
}
