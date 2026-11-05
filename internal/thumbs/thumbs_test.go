package thumbs

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestThumbnail_GenerationCacheAndBudgetPruning(t *testing.T) {
	tmp := t.TempDir()
	cacheDir := filepath.Join(tmp, "cache")

	// Limite baixo (800 bytes) para testar poda LRU quando houver múltiplas miniaturas
	svc := New(cacheDir, 800)

	img1Path := filepath.Join(tmp, "foto1.png")
	var buf1 bytes.Buffer
	if err := EncodeSamplePNG(&buf1, 320, 200); err != nil {
		t.Fatalf("EncodeSamplePNG failed: %v", err)
	}
	if err := os.WriteFile(img1Path, buf1.Bytes(), 0o644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	uri1, err := svc.Thumbnail(img1Path, 96)
	if err != nil {
		t.Fatalf("Thumbnail failed: %v", err)
	}
	if !strings.HasPrefix(uri1, "data:image/jpeg;base64,") {
		t.Fatalf("expected jpeg data URI, got prefix: %s", uri1[:25])
	}

	// Segunda chamada deve vir do cache em disco
	uri1Cached, err := svc.Thumbnail(img1Path, 96)
	if err != nil || uri1Cached != uri1 {
		t.Fatalf("expected identical cached URI")
	}

	// Gera mais imagens para acionar a poda pelo limite de cache
	for i := 2; i <= 5; i++ {
		p := filepath.Join(tmp, "foto_extra_"+string(rune('0'+i))+".png")
		var b bytes.Buffer
		_ = EncodeSamplePNG(&b, 240+i*10, 180)
		_ = os.WriteFile(p, b.Bytes(), 0o644)
		if _, err := svc.Thumbnail(p, 96); err != nil {
			t.Fatalf("Thumbnail %d failed: %v", i, err)
		}
	}

	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		t.Fatalf("ReadDir cacheDir failed: %v", err)
	}
	var totalBytes int64
	for _, e := range entries {
		if info, err := e.Info(); err == nil {
			totalBytes += info.Size()
		}
	}
	if totalBytes > 800 {
		t.Fatalf("expected cache directory to be pruned <= 800 bytes, got %d", totalBytes)
	}
}

func TestReadPreview_ImageMarkdownTextAndBinary(t *testing.T) {
	tmp := t.TempDir()
	svc := New(filepath.Join(tmp, "cache"), 10*1024*1024)

	// 1. Imagem
	imgPath := filepath.Join(tmp, "banner.png")
	var imgBuf bytes.Buffer
	_ = EncodeSamplePNG(&imgBuf, 160, 90)
	_ = os.WriteFile(imgPath, imgBuf.Bytes(), 0o644)

	imgPrev, err := svc.ReadPreview(imgPath, 4096)
	if err != nil {
		t.Fatalf("ReadPreview image failed: %v", err)
	}
	if imgPrev.Kind != PreviewImage || imgPrev.ImageWidth != 160 || imgPrev.ImageHeight != 90 {
		t.Fatalf("unexpected image preview metadata: %+v", imgPrev)
	}

	// 2. Markdown com truncamento
	mdPath := filepath.Join(tmp, "README.md")
	longMd := "# Título\n\n" + strings.Repeat("Linha de documentação importante.\n", 50)
	_ = os.WriteFile(mdPath, []byte(longMd), 0o644)

	mdPrev, err := svc.ReadPreview(mdPath, 120)
	if err != nil {
		t.Fatalf("ReadPreview markdown failed: %v", err)
	}
	if mdPrev.Kind != PreviewMarkdown || !mdPrev.Truncated || len(mdPrev.TextContent) != 120 {
		t.Fatalf("unexpected markdown preview: kind=%s truncated=%v len=%d", mdPrev.Kind, mdPrev.Truncated, len(mdPrev.TextContent))
	}

	// 3. Binário (contém byte nulo)
	binPath := filepath.Join(tmp, "programa.bin")
	_ = os.WriteFile(binPath, []byte{0x7f, 'E', 'L', 'F', 0x00, 0x01, 0x02}, 0o644)

	binPrev, err := svc.ReadPreview(binPath, 1024)
	if err != nil {
		t.Fatalf("ReadPreview binary failed: %v", err)
	}
	if binPrev.Kind != PreviewBinary {
		t.Fatalf("expected PreviewBinary, got %s", binPrev.Kind)
	}
}

