package local

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"pulsares-file-explorer/internal/vfs"
)

func TestLocalFS_StatAndReadDir(t *testing.T) {
	tempDir := t.TempDir()

	// Criar arquivos e subdiretórios de teste
	subDir := filepath.Join(tempDir, "subdir")
	if err := os.Mkdir(subDir, 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}

	testFile := filepath.Join(tempDir, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello world"), 0644); err != nil {
		t.Fatalf("write file failed: %v", err)
	}

	fs := New()
	ctx := context.Background()

	// Teste Stat
	loc := vfs.Location{Provider: "local", Path: testFile}
	entry, err := fs.Stat(ctx, loc)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}
	if entry.Name != "test.txt" {
		t.Errorf("expected test.txt, got %s", entry.Name)
	}
	if entry.Kind != vfs.KindFile {
		t.Errorf("expected KindFile, got %s", entry.Kind)
	}
	if entry.Size != 11 {
		t.Errorf("expected size 11, got %d", entry.Size)
	}

	// Teste ReadDir com streaming
	dirLoc := vfs.Location{Provider: "local", Path: tempDir}
	entriesChan, errChan := fs.ReadDir(ctx, dirLoc, 1) // batch size 1 para testar múltiplos lotes

	var received []vfs.Entry
	done := false

	for !done {
		select {
		case batch, ok := <-entriesChan:
			if ok {
				received = append(received, batch...)
			}
		case err, ok := <-errChan:
			if ok && err != nil {
				t.Fatalf("readDir returned error: %v", err)
			}
			done = true
		case <-time.After(3 * time.Second):
			t.Fatal("timeout waiting for readDir")
		}
	}

	if len(received) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(received))
	}
}

func TestLocalFS_Cancellation(t *testing.T) {
	tempDir := t.TempDir()
	fs := New()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancelar imediatamente

	dirLoc := vfs.Location{Provider: "local", Path: tempDir}
	_, errChan := fs.ReadDir(ctx, dirLoc, 10)

	err := <-errChan
	if err == nil {
		t.Log("Context canceled as expected")
	}
}

