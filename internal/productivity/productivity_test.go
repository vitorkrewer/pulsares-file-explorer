package productivity

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPreviewAndExecuteBatchRename(t *testing.T) {
	tmp := t.TempDir()
	f1 := filepath.Join(tmp, "foto_ferias_1.jpg")
	f2 := filepath.Join(tmp, "foto_ferias_2.jpg")
	if err := os.WriteFile(f1, []byte("a"), 0o644); err != nil {
		t.Fatalf("write f1: %v", err)
	}
	if err := os.WriteFile(f2, []byte("b"), 0o644); err != nil {
		t.Fatalf("write f2: %v", err)
	}

	opts := BatchRenameOptions{
		Find:         "ferias",
		Replace:      "viagem",
		Prefix:       "2026_",
		StartNumber:  1,
		StepNumber:   1,
		NumberDigits: 2,
	}

	preview, err := PreviewBatchRename([]string{f1, f2}, opts)
	if err != nil {
		t.Fatalf("PreviewBatchRename: %v", err)
	}
	if len(preview) != 2 {
		t.Fatalf("expected 2 preview items, got %d", len(preview))
	}
	if preview[0].NewName != "2026_foto_viagem_1_01.jpg" {
		t.Fatalf("unexpected new name[0]: %s", preview[0].NewName)
	}
	if preview[0].HasConflict || preview[1].HasConflict {
		t.Fatalf("unexpected conflict in preview")
	}

	count, err := ExecuteBatchRename(nil, []string{f1, f2}, opts)
	if err != nil {
		t.Fatalf("ExecuteBatchRename: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 renamed files, got %d", count)
	}
	if _, err := os.Stat(preview[0].NewPath); err != nil {
		t.Fatalf("expected renamed file on disk: %v", err)
	}
}

func TestCompareDirectoriesAndComputeHashes(t *testing.T) {
	left := t.TempDir()
	right := t.TempDir()

	_ = os.WriteFile(filepath.Join(left, "same.txt"), []byte("12345"), 0o644)
	_ = os.WriteFile(filepath.Join(right, "same.txt"), []byte("12345"), 0o644)

	_ = os.WriteFile(filepath.Join(left, "diff.txt"), []byte("short"), 0o644)
	_ = os.WriteFile(filepath.Join(right, "diff.txt"), []byte("longer-content"), 0o644)

	_ = os.WriteFile(filepath.Join(left, "only_left.txt"), []byte("L"), 0o644)
	_ = os.WriteFile(filepath.Join(right, "only_right.txt"), []byte("R"), 0o644)

	diffs, err := CompareDirectories(left, right)
	if err != nil {
		t.Fatalf("CompareDirectories: %v", err)
	}
	if len(diffs) != 4 {
		t.Fatalf("expected 4 diff items, got %d", len(diffs))
	}

	hashes, err := ComputeHashes(filepath.Join(left, "same.txt"))
	if err != nil {
		t.Fatalf("ComputeHashes: %v", err)
	}
	if hashes.MD5 == "" || hashes.SHA1 == "" || hashes.SHA256 == "" {
		t.Fatalf("expected non-empty MD5, SHA1, SHA256: %+v", hashes)
	}
}
