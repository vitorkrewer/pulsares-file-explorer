package thumbs

import (
	"archive/zip"
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
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

func TestReadPreview_PresentationPPTXAndODP(t *testing.T) {
	tmp := t.TempDir()
	svc := New(filepath.Join(tmp, "cache"), 10*1024*1024)

	// 1. Sintetiza um arquivo PowerPoint (.pptx) com 2 slides e notas do apresentador
	pptxPath := filepath.Join(tmp, "roadmap.pptx")
	{
		f, err := os.Create(pptxPath)
		if err != nil {
			t.Fatalf("create pptx failed: %v", err)
		}
		zw := zip.NewWriter(f)

		slide1 := `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Pulsares Explorer 2026</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="subTitle"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Arquitetura e Roadmap</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
		w1, _ := zw.Create("ppt/slides/slide1.xml")
		_, _ = w1.Write([]byte(slide1))

		slide2 := `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Novos Recursos</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
      <p:txBody>
        <a:p><a:r><a:t>Visualizador nativo de PPTX e ODP</a:t></a:r></a:p>
        <a:p><a:r><a:t>Pulsares DB Studio integrado</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
		w2, _ := zw.Create("ppt/slides/slide2.xml")
		_, _ = w2.Write([]byte(slide2))

		notes1 := `<?xml version="1.0" encoding="UTF-8"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Destacar performance em Go e Wails.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:notes>`
		wn1, _ := zw.Create("ppt/notesSlides/notesSlide1.xml")
		_, _ = wn1.Write([]byte(notes1))

		_ = zw.Close()
		_ = f.Close()
	}

	pptxPrev, err := svc.ReadPreview(pptxPath, 4096)
	if err != nil {
		t.Fatalf("ReadPreview pptx failed: %v", err)
	}
	if pptxPrev.Kind != PreviewPresentation || pptxPrev.SlideCount != 2 || len(pptxPrev.Slides) != 2 {
		t.Fatalf("unexpected pptx preview: kind=%s count=%d", pptxPrev.Kind, pptxPrev.SlideCount)
	}
	if pptxPrev.Slides[0].Title != "Pulsares Explorer 2026" || pptxPrev.Slides[0].Subtitle != "Arquitetura e Roadmap" {
		t.Fatalf("unexpected slide 1 content: %+v", pptxPrev.Slides[0])
	}
	if !strings.Contains(pptxPrev.Slides[0].Notes, "Destacar performance") {
		t.Fatalf("expected speaker notes on slide 1, got %q", pptxPrev.Slides[0].Notes)
	}
	if len(pptxPrev.Slides[1].Bullets) != 2 {
		t.Fatalf("expected 2 bullets on slide 2, got %+v", pptxPrev.Slides[1].Bullets)
	}

	// 2. Sintetiza um arquivo LibreOffice Impress (.odp)
	odpPath := filepath.Join(tmp, "apresentacao_open_source.odp")
	{
		f, err := os.Create(odpPath)
		if err != nil {
			t.Fatalf("create odp failed: %v", err)
		}
		zw := zip.NewWriter(f)
		contentXML := `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:presentation>
    <draw:page draw:name="Intro">
      <draw:frame presentation:class="title">
        <draw:text-box><text:p>Ecossistema Open Source</text:p></draw:text-box>
      </draw:frame>
      <draw:frame presentation:class="outline">
        <draw:text-box>
          <text:p>Suporte completo ao LibreOffice Impress (.odp)</text:p>
          <text:p>Leitura instantânea sem dependências externas</text:p>
        </draw:text-box>
      </draw:frame>
      <presentation:notes>
        <draw:frame presentation:class="notes">
          <draw:text-box><text:p>Lembrar de demonstrar o atalho Espaço (Quick Look).</text:p></draw:text-box>
        </draw:frame>
      </presentation:notes>
    </draw:page>
  </office:presentation></office:body>
</office:document-content>`
		wContent, _ := zw.Create("content.xml")
		_, _ = wContent.Write([]byte(contentXML))
		_ = zw.Close()
		_ = f.Close()
	}

	odpPrev, err := svc.ReadPreview(odpPath, 4096)
	if err != nil {
		t.Fatalf("ReadPreview odp failed: %v", err)
	}
	if odpPrev.Kind != PreviewPresentation || odpPrev.SlideCount != 1 {
		t.Fatalf("unexpected odp preview: kind=%s count=%d", odpPrev.Kind, odpPrev.SlideCount)
	}
	if odpPrev.Slides[0].Title != "Ecossistema Open Source" || len(odpPrev.Slides[0].Bullets) != 2 {
		t.Fatalf("unexpected odp slide content: %+v", odpPrev.Slides[0])
	}
	if !strings.Contains(odpPrev.Slides[0].Notes, "Quick Look") {
		t.Fatalf("expected odp speaker notes, got %q", odpPrev.Slides[0].Notes)
	}
}

func TestLargeVideoStreaming_LoopbackAndClampedRange(t *testing.T) {
	tmp := t.TempDir()
	svc := New(filepath.Join(tmp, "cache"), 10*1024*1024)

	// Cria um arquivo de vídeo grande sintético (6 MB)
	videoPath := filepath.Join(tmp, "filme_grande.mp4")
	largeData := bytes.Repeat([]byte("MP4VIDEO"), (6*1024*1024)/8)
	if err := os.WriteFile(videoPath, largeData, 0o644); err != nil {
		t.Fatalf("write large video failed: %v", err)
	}

	prev, err := svc.ReadPreview(videoPath, 4096)
	if err != nil {
		t.Fatalf("ReadPreview large video failed: %v", err)
	}
	if prev.Kind != PreviewMedia || prev.MimeType != "video/mp4" {
		t.Fatalf("unexpected media preview: %+v", prev)
	}
	if !strings.Contains(prev.DataURI, "/__localmedia?path=") {
		t.Fatalf("expected streaming URL for large video, got %s", prev.DataURI)
	}

	// Simula requisição Range aberta ("bytes=0-") passando pelo fallback não-TCP (AssetServer ResponseRecorder)
	req := httptest.NewRequest(http.MethodGet, "/__localmedia?path="+url.QueryEscape(videoPath), nil)
	req.Header.Set("Range", "bytes=0-")
	rec := httptest.NewRecorder()
	ServeLocalMediaHTTP(rec, req)

	if rec.Code != http.StatusPartialContent {
		t.Fatalf("expected 206 Partial Content, got %d", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "video/mp4" {
		t.Fatalf("expected Content-Type video/mp4, got %s", rec.Header().Get("Content-Type"))
	}
	if rec.Body.Len() != 4*1024*1024 {
		t.Fatalf("expected open range to be clamped to 4MB in non-TCP buffer mode, got %d bytes", rec.Body.Len())
	}
}



