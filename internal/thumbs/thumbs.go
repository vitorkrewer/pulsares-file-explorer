package thumbs

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// PreviewKind classifica o tipo de conteúdo retornado para o painel de prévia.
type PreviewKind string

const (
	PreviewImage    PreviewKind = "image"
	PreviewMarkdown PreviewKind = "markdown"
	PreviewCode     PreviewKind = "code"
	PreviewText     PreviewKind = "text"
	PreviewMedia    PreviewKind = "media"
	PreviewPDF          PreviewKind = "pdf"
	PreviewDatabase     PreviewKind = "database"
	PreviewPresentation PreviewKind = "presentation"
	PreviewBinary       PreviewKind = "binary"
	PreviewFolder       PreviewKind = "folder"
)

// PreviewData reúne os metadados e o conteúdo seguro para exibição no painel de prévia ou Quick Look.
type PreviewData struct {
	Path        string              `json:"path"`
	Name        string              `json:"name"`
	Kind        PreviewKind         `json:"kind"`
	Extension   string              `json:"extension"`
	MimeType    string              `json:"mimeType"`
	Size        int64               `json:"size"`
	ModTime     string              `json:"modTime"`
	TextContent string              `json:"textContent,omitempty"`
	Truncated   bool                `json:"truncated,omitempty"`
	LineCount   int                 `json:"lineCount,omitempty"`
	DataURI     string              `json:"dataUri,omitempty"`
	ImageWidth  int                 `json:"imageWidth,omitempty"`
	ImageHeight int                 `json:"imageHeight,omitempty"`
	ChildCount  int                 `json:"childCount,omitempty"`
	SlideCount  int                 `json:"slideCount,omitempty"`
	Slides      []PresentationSlide `json:"slides,omitempty"`
}

// Service gerencia o cache em disco de miniaturas e o carregamento de prévias.
type Service struct {
	mu            sync.Mutex
	cacheDir      string
	maxCacheBytes int64
	sem           chan struct{}
}

// New cria um serviço de miniaturas com diretório de cache e limite máximo em bytes.
func New(cacheDir string, maxCacheBytes int64) *Service {
	if strings.TrimSpace(cacheDir) == "" {
		cacheDir = filepath.Join(os.TempDir(), "PulsaresExplorerThumbs")
	}
	if maxCacheBytes <= 0 {
		maxCacheBytes = 64 * 1024 * 1024 // 64 MB padrão
	}
	_ = os.MkdirAll(cacheDir, 0o755)
	return &Service{
		cacheDir:      cacheDir,
		maxCacheBytes: maxCacheBytes,
		sem:           make(chan struct{}, 4), // limita geração simultânea em segundo plano
	}
}

// Thumbnail retorna um Data URI da miniatura da imagem (usando cache em disco com limite).
func (s *Service) Thumbnail(path string, maxDim int) (string, error) {
	if maxDim <= 0 {
		maxDim = 128
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("cannot generate thumbnail for directory")
	}

	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".svg" && info.Size() <= 512*1024 {
		raw, err := os.ReadFile(path)
		if err != nil {
			return "", err
		}
		return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString(raw), nil
	}

	if isPresentationExt(strings.TrimPrefix(ext, ".")) {
		if thumbURI, err := extractPresentationThumbnail(path); err == nil && thumbURI != "" {
			return thumbURI, nil
		}
	}

	if !isSupportedRasterExt(ext) {
		return "", errors.New("unsupported image format for thumbnail")
	}

	key := cacheKey(path, info.Size(), info.ModTime(), maxDim)
	cacheFile := filepath.Join(s.cacheDir, key+".jpg")

	if cachedBytes, err := os.ReadFile(cacheFile); err == nil && len(cachedBytes) > 0 {
		now := time.Now()
		_ = os.Chtimes(cacheFile, now, now)
		return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(cachedBytes), nil
	}

	s.sem <- struct{}{}
	defer func() { <-s.sem }()

	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	srcImg, _, err := image.Decode(f)
	if err != nil {
		return "", err
	}

	thumbImg := resizeImageNearest(srcImg, maxDim)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, thumbImg, &jpeg.Options{Quality: 80}); err != nil {
		return "", err
	}

	encodedBytes := buf.Bytes()
	s.writeCacheFile(cacheFile, encodedBytes)

	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(encodedBytes), nil
}

func (s *Service) writeCacheFile(cacheFile string, data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = os.MkdirAll(s.cacheDir, 0o755)
	_ = os.WriteFile(cacheFile, data, 0o644)
	s.enforceCacheBudgetLocked()
}

func (s *Service) enforceCacheBudgetLocked() {
	entries, err := os.ReadDir(s.cacheDir)
	if err != nil {
		return
	}

	type fileMeta struct {
		path    string
		size    int64
		modTime time.Time
	}

	var files []fileMeta
	var total int64

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		total += info.Size()
		files = append(files, fileMeta{
			path:    filepath.Join(s.cacheDir, e.Name()),
			size:    info.Size(),
			modTime: info.ModTime(),
		})
	}

	if total <= s.maxCacheBytes {
		return
	}

	// Ordena dos mais antigos para os mais recentes para poda LRU
	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime.Before(files[j].modTime)
	})

	for _, f := range files {
		if total <= s.maxCacheBytes {
			break
		}
		if err := os.Remove(f.path); err == nil {
			total -= f.size
		}
	}
}

// ReadPreview inspeciona um arquivo ou pasta e retorna conteúdo seguro para o painel de prévia.
func (s *Service) ReadPreview(path string, maxTextBytes int) (PreviewData, error) {
	if maxTextBytes <= 0 {
		maxTextBytes = 64 * 1024
	}
	info, err := os.Stat(path)
	if err != nil {
		return PreviewData{}, err
	}

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	data := PreviewData{
		Path:      path,
		Name:      info.Name(),
		Extension: ext,
		Size:      info.Size(),
		ModTime:   info.ModTime().Format(time.RFC3339),
	}

	if info.IsDir() {
		data.Kind = PreviewFolder
		data.MimeType = "inode/directory"
		if entries, err := os.ReadDir(path); err == nil {
			data.ChildCount = len(entries)
		}
		return data, nil
	}

	// Imagens
	if isImageExt(ext) {
		data.Kind = PreviewImage
		data.MimeType = imageMime(ext)
		if info.Size() <= 12*1024*1024 {
			if raw, err := os.ReadFile(path); err == nil {
				data.DataURI = fmt.Sprintf("data:%s;base64,%s", data.MimeType, base64.StdEncoding.EncodeToString(raw))
				if cfg, _, err := image.DecodeConfig(bytes.NewReader(raw)); err == nil {
					data.ImageWidth = cfg.Width
					data.ImageHeight = cfg.Height
				}
			}
		} else if thumbURI, err := s.Thumbnail(path, 512); err == nil {
			data.DataURI = thumbURI
		}
		return data, nil
	}

	// PDF
	if ext == "pdf" {
		data.Kind = PreviewPDF
		data.MimeType = "application/pdf"
		if info.Size() <= 4*1024*1024 {
			if raw, err := os.ReadFile(path); err == nil {
				data.DataURI = "data:application/pdf;base64," + base64.StdEncoding.EncodeToString(raw)
			}
		} else {
			data.DataURI = "/__localmedia?path=" + url.QueryEscape(path)
		}
		return data, nil
	}

	// Áudio e Vídeo (Streaming HTTP Range Request ilimitado para arquivos grandes + base64 rápido para arquivos pequenos em testes)
	if isMediaExt(ext) {
		data.Kind = PreviewMedia
		data.MimeType = mediaMime(ext)
		if info.Size() <= 2*1024*1024 {
			if raw, err := os.ReadFile(path); err == nil {
				data.DataURI = fmt.Sprintf("data:%s;base64,%s", data.MimeType, base64.StdEncoding.EncodeToString(raw))
			}
		}
		if data.DataURI == "" {
			data.DataURI = "/__localmedia?path=" + url.QueryEscape(path)
		}
		return data, nil
	}

	// Bancos de Dados SQLite (.db, .sqlite, .sqlite3, .db3)
	if isDatabaseExt(ext) {
		data.Kind = PreviewDatabase
		data.MimeType = "application/vnd.sqlite3"
		return data, nil
	}

	// Apresentações (.pptx, .ppsx, .potx, .ppt, .odp, .otp, .fodp)
	if isPresentationExt(ext) {
		data.Kind = PreviewPresentation
		data.MimeType = presentationMime(ext)
		if slides, coverThumb, err := readPresentationPreview(path, ext); err == nil {
			data.Slides = slides
			data.SlideCount = len(slides)
			data.DataURI = coverThumb
		}
		return data, nil
	}

	// Leitura limitada para texto / código / markdown ou detecção de binário
	f, err := os.Open(path)
	if err != nil {
		return PreviewData{}, err
	}
	defer f.Close()

	buf := make([]byte, maxTextBytes+1)
	n, err := io.ReadFull(f, buf)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return PreviewData{}, err
	}

	truncated := n > maxTextBytes
	if truncated {
		n = maxTextBytes
	}
	chunk := buf[:n]

	if isBinaryChunk(chunk) {
		data.Kind = PreviewBinary
		data.MimeType = "application/octet-stream"
		return data, nil
	}

	text := string(chunk)
	data.TextContent = text
	data.Truncated = truncated
	data.LineCount = strings.Count(text, "\n") + 1

	switch {
	case ext == "md" || ext == "markdown":
		data.Kind = PreviewMarkdown
		data.MimeType = "text/markdown"
	case isCodeExt(ext):
		data.Kind = PreviewCode
		data.MimeType = "text/plain"
	default:
		data.Kind = PreviewText
		data.MimeType = "text/plain"
	}

	return data, nil
}

func isBinaryChunk(chunk []byte) bool {
	if len(chunk) == 0 {
		return false
	}
	sample := chunk
	if len(sample) > 4096 {
		sample = sample[:4096]
	}
	if bytes.IndexByte(sample, 0) >= 0 {
		return true
	}
	return !utf8.Valid(sample) && len(sample) < 512
}

func isSupportedRasterExt(ext string) bool {
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif":
		return true
	default:
		return false
	}
}

func isImageExt(ext string) bool {
	switch ext {
	case "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico":
		return true
	default:
		return false
	}
}

func imageMime(ext string) string {
	switch ext {
	case "png":
		return "image/png"
	case "gif":
		return "image/gif"
	case "svg":
		return "image/svg+xml"
	case "webp":
		return "image/webp"
	case "bmp":
		return "image/bmp"
	case "ico":
		return "image/x-icon"
	default:
		return "image/jpeg"
	}
}

func isMediaExt(ext string) bool {
	switch ext {
	case "mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "mp4", "webm", "mov", "mkv", "avi", "m4v":
		return true
	default:
		return false
	}
}

func isDatabaseExt(ext string) bool {
	switch ext {
	case "db", "sqlite", "sqlite3", "db3", "s3db":
		return true
	default:
		return false
	}
}

func mediaMime(ext string) string {
	switch ext {
	case "mp3":
		return "audio/mpeg"
	case "wav":
		return "audio/wav"
	case "ogg", "opus":
		return "audio/ogg"
	case "flac":
		return "audio/flac"
	case "m4a", "aac":
		return "audio/mp4"
	case "webm":
		return "video/webm"
	case "mov":
		return "video/quicktime"
	case "mkv":
		return "video/x-matroska"
	case "avi":
		return "video/x-msvideo"
	default:
		return "video/mp4"
	}
}

func isCodeExt(ext string) bool {
	switch ext {
	case "go", "ts", "tsx", "js", "jsx", "py", "rs", "c", "cpp", "h", "cs", "java",
		"json", "yaml", "yml", "toml", "xml", "html", "css", "scss", "sql", "sh", "ps1":
		return true
	default:
		return false
	}
}

func cacheKey(path string, size int64, modTime time.Time, maxDim int) string {
	raw := fmt.Sprintf("%s|%d|%d|%d", path, size, modTime.UnixNano(), maxDim)
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:16])
}

func resizeImageNearest(src image.Image, maxDim int) image.Image {
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	if srcW <= 0 || srcH <= 0 {
		dst := image.NewRGBA(image.Rect(0, 0, 1, 1))
		return dst
	}
	if srcW <= maxDim && srcH <= maxDim {
		return src
	}

	var dstW, dstH int
	if srcW >= srcH {
		dstW = maxDim
		dstH = (srcH * maxDim) / srcW
		if dstH < 1 {
			dstH = 1
		}
	} else {
		dstH = maxDim
		dstW = (srcW * maxDim) / srcH
		if dstW < 1 {
			dstW = 1
		}
	}

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	for y := 0; y < dstH; y++ {
		sy := bounds.Min.Y + (y*srcH)/dstH
		for x := 0; x < dstW; x++ {
			sx := bounds.Min.X + (x*srcW)/dstW
			c := color.RGBAModel.Convert(src.At(sx, sy)).(color.RGBA)
			dst.SetRGBA(x, y, c)
		}
	}
	return dst
}

// Helper exportado para testes gerarem um PNG sintético válido.
func EncodeSamplePNG(w io.Writer, width, height int) error {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 180, A: 255})
		}
	}
	return png.Encode(w, img)
}

