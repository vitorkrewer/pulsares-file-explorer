package search

import (
	"archive/zip"
	"context"
	"os"
	"path/filepath"
	"strings"
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

func TestSearch_ContentInOfficeODFAndSkipHeavyDirs(t *testing.T) {
	tmp := t.TempDir()
	svc := New(nil, nil)

	// 1. Cria um documento Word (.docx) sintético
	docxPath := filepath.Join(tmp, "contrato_anual.docx")
	{
		f, _ := os.Create(docxPath)
		zw := zip.NewWriter(f)
		w, _ := zw.Create("word/document.xml")
		_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:r><w:t>Cláusula de Confidencialidade Pulsares_99</w:t></w:r></w:p></w:body></w:document>`))
		_ = zw.Close()
		_ = f.Close()
	}

	// 2. Cria um documento LibreOffice Writer (.odt) sintético
	odtPath := filepath.Join(tmp, "relatorio_linux.odt")
	{
		f, _ := os.Create(odtPath)
		zw := zip.NewWriter(f)
		w, _ := zw.Create("content.xml")
		_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><office:document-content><office:body><office:text><text:p>Assinatura Digital Pulsares_99 aprovada</text:p></office:text></office:body></office:document-content>`))
		_ = zw.Close()
		_ = f.Close()
	}

	// 3. Cria uma pasta node_modules que DEVE ser ignorada automaticamente na busca por conteúdo
	nmDir := filepath.Join(tmp, "node_modules", "pkg")
	_ = os.MkdirAll(nmDir, 0o755)
	_ = os.WriteFile(filepath.Join(nmDir, "index.js"), []byte("const x = 'Pulsares_99';"), 0o644)

	results, err := svc.SearchSync(context.Background(), Options{
		RootPath:     tmp,
		ContentQuery: "Pulsares_99",
	})
	if err != nil {
		t.Fatalf("SearchSync failed: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected exactly 2 matches (.docx and .odt, skipping node_modules), got %d: %+v", len(results), results)
	}
	for _, r := range results {
		if !strings.Contains(r.Snippet, "Pulsares_99") {
			t.Fatalf("expected snippet to contain matched term, got %+v", r)
		}
	}

	// 4. Verifica que o primeiro lote é despachado imediatamente sem precisar acumular 25/50 itens
	var batches [][]ResultItem
	err = svc.walkAndFilter(context.Background(), Options{
		RootPath: tmp,
		Query:    "contrato",
	}, func(b []ResultItem) {
		batches = append(batches, b)
	})
	if err != nil || len(batches) == 0 || len(batches[0]) != 1 {
		t.Fatalf("expected immediate first-match flush of 1 item, got batches=%+v err=%v", batches, err)
	}
}



