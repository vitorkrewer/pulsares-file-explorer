package search

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"pulsares-file-explorer/internal/storage"
)

func TestSearch_GlobRegexContentAndSQLiteIndex(t *testing.T) {
	tmp := t.TempDir()
	db, err := storage.OpenPath(filepath.Join(tmp, "test.db"))
	if err != nil {
		t.Fatalf("OpenPath failed: %v", err)
	}
	defer db.Close()

	root := filepath.Join(tmp, "workspace")
	subDir := filepath.Join(root, "internal", "api")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	_ = os.WriteFile(filepath.Join(root, "README.md"), []byte("# Pulsares Explorer\nBusca rápida em Go."), 0o644)
	_ = os.WriteFile(filepath.Join(subDir, "handler.go"), []byte("package api\n// TokenSecreto_42\nfunc Serve() {}\n"), 0o644)
	_ = os.WriteFile(filepath.Join(subDir, "handler_test.go"), []byte("package api\n"), 0o644)
	_ = os.WriteFile(filepath.Join(subDir, "binario.dat"), []byte{0x00, 0x01, 0x02, 'T', 'o', 'k', 'e', 'n'}, 0o644)

	svc := New(db, nil)

	// 1. Busca por Glob (*.go)
	goResults, err := svc.SearchSync(context.Background(), Options{
		RootPath: root,
		Query:    "*_test.go",
	})
	if err != nil || len(goResults) != 1 || goResults[0].Name != "handler_test.go" {
		t.Fatalf("expected 1 glob match (handler_test.go), got %+v (err=%v)", goResults, err)
	}

	// 2. Busca por Regex
	rxResults, err := svc.SearchSync(context.Background(), Options{
		RootPath: root,
		Query:    `^handler(\.go|_test\.go)$`,
		UseRegex: true,
	})
	if err != nil || len(rxResults) != 2 {
		t.Fatalf("expected 2 regex matches, got %d (err=%v)", len(rxResults), err)
	}

	// 3. Busca por conteúdo de texto (deve achar handler.go com snippet e ignorar binario.dat)
	contentResults, err := svc.SearchSync(context.Background(), Options{
		RootPath:     root,
		ContentQuery: "tokensecreto_42",
	})
	if err != nil || len(contentResults) != 1 {
		t.Fatalf("expected 1 content match, got %+v (err=%v)", contentResults, err)
	}
	if contentResults[0].LineNumber != 2 || contentResults[0].Snippet == "" {
		t.Fatalf("expected line 2 snippet, got %+v", contentResults[0])
	}

	// 4. Indexação SQLite e busca usando o índice
	count, err := svc.IndexDirectory(context.Background(), root)
	if err != nil || count < 4 {
		t.Fatalf("IndexDirectory failed: count=%d err=%v", count, err)
	}

	indexedResults, err := svc.SearchSync(context.Background(), Options{
		RootPath: root,
		Query:    "readme",
		UseIndex: true,
	})
	if err != nil || len(indexedResults) != 1 || indexedResults[0].Name != "README.md" {
		t.Fatalf("expected indexed match README.md, got %+v (err=%v)", indexedResults, err)
	}
}

