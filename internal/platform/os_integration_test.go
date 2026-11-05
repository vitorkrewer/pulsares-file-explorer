package platform

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetItemPropertiesFileAndFolder(t *testing.T) {
	tmp := t.TempDir()
	subDir := filepath.Join(tmp, "docs")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	filePath := filepath.Join(subDir, "readme.md")
	content := []byte("# Pulsares Explorer\n")
	if err := os.WriteFile(filePath, content, 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	fileProps, err := GetItemProperties(filePath)
	if err != nil {
		t.Fatalf("GetItemProperties file: %v", err)
	}
	if fileProps.Kind != "file" {
		t.Fatalf("expected kind 'file', got %q", fileProps.Kind)
	}
	if fileProps.Extension != "md" {
		t.Fatalf("expected extension 'md', got %q", fileProps.Extension)
	}
	if fileProps.Size != int64(len(content)) {
		t.Fatalf("expected size %d, got %d", len(content), fileProps.Size)
	}
	if fileProps.SHA256 == "" {
		t.Fatalf("expected non-empty SHA-256 for small file")
	}

	dirProps, err := GetItemProperties(tmp)
	if err != nil {
		t.Fatalf("GetItemProperties folder: %v", err)
	}
	if dirProps.Kind != "folder" {
		t.Fatalf("expected kind 'folder', got %q", dirProps.Kind)
	}
	if dirProps.FileCount != 1 || dirProps.FolderCount != 1 {
		t.Fatalf("expected 1 file and 1 folder, got files=%d folders=%d", dirProps.FileCount, dirProps.FolderCount)
	}
	if dirProps.Size != int64(len(content)) {
		t.Fatalf("expected recursive folder size %d, got %d", len(content), dirProps.Size)
	}
}
