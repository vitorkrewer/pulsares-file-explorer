package archive

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func writeTestZip(t *testing.T, zipPath string, files map[string]string) {
	t.Helper()
	f, err := os.Create(zipPath)
	if err != nil {
		t.Fatalf("create zip: %v", err)
	}
	zw := zip.NewWriter(f)
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("zip entry: %v", err)
		}
		_, _ = w.Write([]byte(content))
	}
	_ = zw.Close()
	_ = f.Close()
}

func TestArchiveFolderName(t *testing.T) {
	cases := map[string]string{
		"/tmp/projeto.zip":       "projeto",
		"C:/dados/backup.tar.gz": "backup",
		"relatorio.final.tgz":    "relatorio.final",
		"fotos.TAR":              "fotos",
		"/tmp/.zip":              ".zip",
	}
	for in, want := range cases {
		if got := ArchiveFolderName(in); got != want {
			t.Fatalf("ArchiveFolderName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestExtractArchiveToSubfolderUniqueAndFlatten(t *testing.T) {
	tmp := t.TempDir()

	// 1. Compactado "solto" (arquivos na raiz) -> cria pasta "solto/"
	loose := filepath.Join(tmp, "solto.zip")
	writeTestZip(t, loose, map[string]string{"a.txt": "A", "sub/b.txt": "B"})
	res, err := ExtractArchiveTo(loose, "", true)
	if err != nil {
		t.Fatalf("extract loose: %v", err)
	}
	if res.DestDir != filepath.Join(tmp, "solto") || !res.CreatedFolder || res.Flattened {
		t.Fatalf("unexpected result: %+v", res)
	}
	if _, err := os.Stat(filepath.Join(tmp, "solto", "sub", "b.txt")); err != nil {
		t.Fatalf("missing extracted file: %v", err)
	}

	// 2. Extrair de novo -> não sobrescreve, cria "solto (2)/"
	res2, err := ExtractArchiveTo(loose, "", true)
	if err != nil {
		t.Fatalf("extract loose again: %v", err)
	}
	if res2.DestDir != filepath.Join(tmp, "solto (2)") {
		t.Fatalf("expected unique folder, got %q", res2.DestDir)
	}

	// 3. Compactado com pasta raiz de mesmo nome -> achata "projeto/projeto/" para "projeto/"
	nested := filepath.Join(tmp, "projeto.zip")
	writeTestZip(t, nested, map[string]string{"projeto/index.html": "<h1>x</h1>", "projeto/css/app.css": "body{}"})
	res3, err := ExtractArchiveTo(nested, "", true)
	if err != nil {
		t.Fatalf("extract nested: %v", err)
	}
	if !res3.Flattened {
		t.Fatalf("expected flatten, got %+v", res3)
	}
	if _, err := os.Stat(filepath.Join(tmp, "projeto", "css", "app.css")); err != nil {
		t.Fatalf("expected flattened file: %v", err)
	}

	// 4. Destino escolhido sem subpasta
	custom := filepath.Join(tmp, "destino")
	res4, err := ExtractArchiveTo(loose, custom, false)
	if err != nil {
		t.Fatalf("extract custom: %v", err)
	}
	if res4.DestDir != custom || res4.CreatedFolder {
		t.Fatalf("unexpected custom result: %+v", res4)
	}
	if _, err := os.Stat(filepath.Join(custom, "a.txt")); err != nil {
		t.Fatalf("missing file in custom dest: %v", err)
	}
}
