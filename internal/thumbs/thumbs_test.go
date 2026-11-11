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

func TestLocalProjectWebServer_HTMLAndAssets(t *testing.T) {
	tmp := t.TempDir()
	svc := New(filepath.Join(tmp, "cache"), 10*1024*1024)

	indexPath := filepath.Join(tmp, "index.html")
	cssPath := filepath.Join(tmp, "style.css")
	jsPath := filepath.Join(tmp, "matrizes.js")

	if err := os.WriteFile(indexPath, []byte("<!DOCTYPE html><html><head><link rel=\"stylesheet\" href=\"style.css\"></head><body><h1>Focus</h1><script src=\"matrizes.js\"></script></body></html>"), 0o644); err != nil {
		t.Fatalf("write index.html failed: %v", err)
	}
	if err := os.WriteFile(cssPath, []byte("body { background: #0f172a; color: #f8fafc; }"), 0o644); err != nil {
		t.Fatalf("write style.css failed: %v", err)
	}
	if err := os.WriteFile(jsPath, []byte("console.log('matrizes loaded');"), 0o644); err != nil {
		t.Fatalf("write matrizes.js failed: %v", err)
	}

	prev, err := svc.ReadPreview(indexPath, 4096)
	if err != nil {
		t.Fatalf("ReadPreview index.html failed: %v", err)
	}
	if prev.Kind != PreviewCode || !strings.Contains(prev.DataURI, "/__project/") {
		t.Fatalf("expected PreviewCode with /__project/ DataURI, got kind=%s dataURI=%s", prev.Kind, prev.DataURI)
	}

	// Extrai o caminho /__project/<b64>/index.html para testar a resolução de style.css e matrizes.js
	u, err := url.Parse(prev.DataURI)
	if err != nil {
		t.Fatalf("url.Parse failed: %v", err)
	}
	baseProjectPrefix := strings.TrimSuffix(u.Path, "index.html")

	// Testa carregamento de style.css via ServeLocalMediaHTTP
	reqCSS := httptest.NewRequest(http.MethodGet, baseProjectPrefix+"style.css", nil)
	recCSS := httptest.NewRecorder()
	ServeLocalMediaHTTP(recCSS, reqCSS)
	if recCSS.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for style.css, got %d", recCSS.Code)
	}
	if !strings.Contains(recCSS.Header().Get("Content-Type"), "text/css") {
		t.Fatalf("expected text/css content-type, got %s", recCSS.Header().Get("Content-Type"))
	}
	if !strings.Contains(recCSS.Body.String(), "#0f172a") {
		t.Fatalf("unexpected CSS body: %s", recCSS.Body.String())
	}

	// Testa carregamento de matrizes.js via ServeLocalMediaHTTP
	reqJS := httptest.NewRequest(http.MethodGet, baseProjectPrefix+"matrizes.js", nil)
	recJS := httptest.NewRecorder()
	ServeLocalMediaHTTP(recJS, reqJS)
	if recJS.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for matrizes.js, got %d", recJS.Code)
	}
	if !strings.Contains(recJS.Header().Get("Content-Type"), "application/javascript") {
		t.Fatalf("expected application/javascript content-type, got %s", recJS.Header().Get("Content-Type"))
	}
	if !strings.Contains(recJS.Body.String(), "matrizes loaded") {
		t.Fatalf("unexpected JS body: %s", recJS.Body.String())
	}
}

func TestReadPreview_PDFStreamingAndSVGDimensions(t *testing.T) {
	tmp := t.TempDir()
	svc := New(filepath.Join(tmp, "cache"), 10*1024*1024)

	pdfPath := filepath.Join(tmp, "manual.pdf")
	syntheticPDF := "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n4 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF\n"
	if err := os.WriteFile(pdfPath, []byte(syntheticPDF), 0o644); err != nil {
		t.Fatalf("write pdf failed: %v", err)
	}

	pdfPrev, err := svc.ReadPreview(pdfPath, 4096)
	if err != nil {
		t.Fatalf("ReadPreview pdf failed: %v", err)
	}
	if pdfPrev.Kind != PreviewPDF || pdfPrev.PageCount != 2 {
		t.Fatalf("expected PreviewPDF with PageCount=2, got kind=%s pages=%d", pdfPrev.Kind, pdfPrev.PageCount)
	}
	if !strings.Contains(pdfPrev.DataURI, "/__localmedia?path=") {
		t.Fatalf("expected local streaming URL for PDF, got %s", pdfPrev.DataURI)
	}

	reqPDF := httptest.NewRequest(http.MethodGet, "/__localmedia?path="+url.QueryEscape(pdfPath), nil)
	recPDF := httptest.NewRecorder()
	ServeLocalMediaHTTP(recPDF, reqPDF)
	if recPDF.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for PDF, got %d", recPDF.Code)
	}
	if recPDF.Header().Get("Content-Type") != "application/pdf" {
		t.Fatalf("expected application/pdf, got %s", recPDF.Header().Get("Content-Type"))
	}
	if recPDF.Header().Get("Content-Disposition") != "inline" {
		t.Fatalf("expected Content-Disposition inline, got %s", recPDF.Header().Get("Content-Disposition"))
	}

	svgPath := filepath.Join(tmp, "icone.svg")
	svgRaw := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect width="240" height="120" fill="#2563eb"/></svg>`
	if err := os.WriteFile(svgPath, []byte(svgRaw), 0o644); err != nil {
		t.Fatalf("write svg failed: %v", err)
	}
	svgPrev, err := svc.ReadPreview(svgPath, 4096)
	if err != nil {
		t.Fatalf("ReadPreview svg failed: %v", err)
	}
	if svgPrev.Kind != PreviewImage || svgPrev.ImageWidth != 240 || svgPrev.ImageHeight != 120 {
		t.Fatalf("expected SVG dimensions 240x120, got %+v", svgPrev)
	}
}

func TestStudioLivePreview_NestedSubfoldersAndInMemoryOverlay(t *testing.T) {
	// Simula caminho longo com espaços e acentos (estilo projetos SCORM / OneDrive)
	baseRoot := filepath.Join(t.TempDir(), "Pós-Graduação em Direito - Ênfase Exame - 42 aulas", "scorm-curso-01")
	cssDir := filepath.Join(baseRoot, "css")
	imgDir := filepath.Join(baseRoot, "assets", "img")
	jsDir := filepath.Join(baseRoot, "js")
	for _, d := range []string{cssDir, imgDir, jsDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatalf("mkdir %s failed: %v", d, err)
		}
	}

	indexPath := filepath.Join(baseRoot, "index.html")
	cssPath := filepath.Join(cssDir, "styles.css")
	logoPath := filepath.Join(imgDir, "logo.png")
	appJsPath := filepath.Join(jsDir, "app.js")

	_ = os.WriteFile(indexPath, []byte(`<!DOCTYPE html><html><head><link rel="stylesheet" href="css/styles.css"></head><body><img src="assets/img/logo.png"><script src="js/app.js"></script></body></html>`), 0o644)
	_ = os.WriteFile(cssPath, []byte(`body { color: #111827; background: url('../assets/img/logo.png'); }`), 0o644)
	var pngBuf bytes.Buffer
	_ = EncodeSamplePNG(&pngBuf, 120, 40)
	_ = os.WriteFile(logoPath, pngBuf.Bytes(), 0o644)
	_ = os.WriteFile(appJsPath, []byte(`window.__loaded = true;`), 0o644)

	previewURL := ResolveStudioProjectPreviewURL(baseRoot, "index.html", "")
	if !strings.Contains(previewURL, "/__project/p_") {
		t.Fatalf("expected compact token URL, got %s", previewURL)
	}
	u, err := url.Parse(previewURL)
	if err != nil {
		t.Fatalf("url.Parse failed: %v", err)
	}
	prefix := strings.TrimSuffix(u.Path, "index.html")

	// 1. Verifica carregamento de subpastas css/styles.css e assets/img/logo.png a partir do disco
	reqCSS := httptest.NewRequest(http.MethodGet, prefix+"css/styles.css", nil)
	recCSS := httptest.NewRecorder()
	ServeLocalMediaHTTP(recCSS, reqCSS)
	if recCSS.Code != http.StatusOK || !strings.Contains(recCSS.Body.String(), "#111827") {
		t.Fatalf("expected disk CSS 200 OK, got code=%d body=%s", recCSS.Code, recCSS.Body.String())
	}

	reqLogo := httptest.NewRequest(http.MethodGet, prefix+"assets/img/logo.png", nil)
	recLogo := httptest.NewRecorder()
	ServeLocalMediaHTTP(recLogo, reqLogo)
	if recLogo.Code != http.StatusOK || recLogo.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("expected PNG 200 OK, got code=%d mime=%s", recLogo.Code, recLogo.Header().Get("Content-Type"))
	}

	// 2. Verifica overlay ao vivo em memória (edição em tempo real sem salvar no disco)
	ReplaceStudioLiveBuffers(map[string]string{
		cssPath: "body { color: #2563eb; font-weight: 700; }",
	})
	defer ReplaceStudioLiveBuffers(nil)

	recLiveCSS := httptest.NewRecorder()
	ServeLocalMediaHTTP(recLiveCSS, httptest.NewRequest(http.MethodGet, prefix+"css/styles.css", nil))
	if recLiveCSS.Code != http.StatusOK || !strings.Contains(recLiveCSS.Body.String(), "#2563eb") {
		t.Fatalf("expected live overlay CSS #2563eb, got code=%d body=%s", recLiveCSS.Code, recLiveCSS.Body.String())
	}
}






