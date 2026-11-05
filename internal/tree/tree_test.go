package tree

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"pulsares-file-explorer/internal/vfs"
	"pulsares-file-explorer/internal/vfs/local"
)

func TestService_ChildrenAndProbe(t *testing.T) {
	root := t.TempDir()

	// Pasta com subpasta -> TriYes
	dirWithChild := filepath.Join(root, "with_child")
	if err := os.MkdirAll(filepath.Join(dirWithChild, "nested"), 0755); err != nil {
		t.Fatalf("mkdir nested: %v", err)
	}

	// Pasta vazia (ou só com arquivo) -> TriNo
	dirOnlyFiles := filepath.Join(root, "only_files")
	if err := os.MkdirAll(dirOnlyFiles, 0755); err != nil {
		t.Fatalf("mkdir only_files: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dirOnlyFiles, "a.txt"), []byte("hi"), 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	// Arquivo na raiz -> não deve aparecer em Children
	if err := os.WriteFile(filepath.Join(root, "root_file.txt"), []byte("hi"), 0644); err != nil {
		t.Fatalf("write root file: %v", err)
	}

	svc := NewService(local.New())
	nodes, err := svc.Children(context.Background(), vfs.Location{Provider: "local", Path: root}, true)
	if err != nil {
		t.Fatalf("Children failed: %v", err)
	}

	if len(nodes) != 2 {
		t.Fatalf("expected 2 directory nodes, got %d", len(nodes))
	}

	byName := make(map[string]Node)
	for _, n := range nodes {
		byName[n.Name] = n
	}

	if byName["with_child"].HasChildren != TriYes {
		t.Errorf("expected with_child HasChildren=yes, got %s", byName["with_child"].HasChildren)
	}
	if byName["only_files"].HasChildren != TriNo {
		t.Errorf("expected only_files HasChildren=no, got %s", byName["only_files"].HasChildren)
	}
}

func TestService_Cancellation(t *testing.T) {
	svc := NewService(local.New())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := svc.Children(ctx, vfs.Location{Provider: "local", Path: t.TempDir()}, false)
	if err == nil {
		t.Fatal("expected context canceled error")
	}
}

