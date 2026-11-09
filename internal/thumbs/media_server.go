package thumbs

import (
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

var (
	mediaServerOnce sync.Once
	mediaServerBase string
)

// ensureMediaServer inicia (uma única vez) um servidor HTTP local em 127.0.0.1:0 dedicado ao streaming
// de vídeos, áudios, PDFs e projetos web locais via TCP real, contornando o buffer em memória
// do WebResourceRequested (ICoreWebView2WebResourceResponse) do Wails no Windows.
func ensureMediaServer() string {
	mediaServerOnce.Do(func() {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return
		}
		mux := http.NewServeMux()
		mux.HandleFunc("/__localmedia", ServeLocalMediaHTTP)
		mux.HandleFunc("/__project/", ServeLocalMediaHTTP)
		srv := &http.Server{
			Handler: mux,
		}
		mediaServerBase = "http://" + ln.Addr().String()
		go func() {
			_ = srv.Serve(ln)
		}()
	})
	return mediaServerBase
}

// LocalMediaURL retorna a URL de streaming HTTP Range Request para o arquivo local informado.
func LocalMediaURL(path string) string {
	escaped := url.QueryEscape(path)
	if base := ensureMediaServer(); base != "" {
		return base + "/__localmedia?path=" + escaped
	}
	return "/__localmedia?path=" + escaped
}

// LocalProjectURL retorna a URL de servidor web local para um arquivo HTML e seus recursos irmãos (CSS, JS, imagens).
func LocalProjectURL(filePath string) string {
	clean := filepath.Clean(filePath)
	dir := filepath.Dir(clean)
	baseName := filepath.Base(clean)
	b64Dir := base64.RawURLEncoding.EncodeToString([]byte(dir))
	relEscaped := url.PathEscape(baseName)
	if base := ensureMediaServer(); base != "" {
		return base + "/__project/" + b64Dir + "/" + relEscaped
	}
	return "/__project/" + b64Dir + "/" + relEscaped
}

// ServeLocalMediaHTTP serve arquivos locais de mídia, PDF e ativos de projetos web (/ __project /).
// Funciona tanto no servidor TCP de loopback (127.0.0.1) quanto como fallback no AssetServer do Wails.
func ServeLocalMediaHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Range, Content-Type, Accept")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/__project/") {
		serveLocalProjectAsset(w, r)
		return
	}

	if !strings.HasPrefix(r.URL.Path, "/__localmedia") {
		http.NotFound(w, r)
		return
	}

	targetPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if targetPath == "" {
		http.Error(w, "missing path", http.StatusBadRequest)
		return
	}

	cleanPath := filepath.Clean(targetPath)
	info, err := os.Stat(cleanPath)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	f, err := os.Open(cleanPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(cleanPath), "."))
	if mimeType := mediaOrDocMime(ext); mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-store")

	// Caso a requisição passe pelo AssetServer do Wails (que não implementa http.Hijacker e usa bytes.Buffer),
	// limitamos ranges abertos ("bytes=X-") a blocos de 4 MB para evitar alocar vídeos grandes inteiros na RAM.
	if _, isRealTCP := w.(http.Hijacker); !isRealTCP && info.Size() > 4*1024*1024 {
		clampOpenRangeHeader(r, info.Size(), 4*1024*1024)
	}

	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func serveLocalProjectAsset(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/__project/")
	slashIdx := strings.IndexByte(trimmed, '/')
	if slashIdx <= 0 {
		http.NotFound(w, r)
		return
	}
	b64Dir := trimmed[:slashIdx]
	relPart := trimmed[slashIdx+1:]

	decodedDir, err := base64.RawURLEncoding.DecodeString(b64Dir)
	if err != nil {
		decodedDir, err = base64.StdEncoding.DecodeString(b64Dir)
		if err != nil {
			http.Error(w, "invalid project dir encoding", http.StatusBadRequest)
			return
		}
	}

	if unescaped, err := url.PathUnescape(relPart); err == nil {
		relPart = unescaped
	}

	baseDir := filepath.Clean(string(decodedDir))
	if relPart == "" || relPart == "/" {
		relPart = "index.html"
	}
	targetPath := filepath.Clean(filepath.Join(baseDir, filepath.FromSlash(relPart)))

	info, err := os.Stat(targetPath)
	if err == nil && info.IsDir() {
		targetPath = filepath.Join(targetPath, "index.html")
		info, err = os.Stat(targetPath)
	}
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	f, err := os.Open(targetPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(targetPath), "."))
	if mimeType := webAssetMime(ext); mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}
	w.Header().Set("Cache-Control", "no-store")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func webAssetMime(ext string) string {
	switch ext {
	case "html", "htm":
		return "text/html; charset=utf-8"
	case "css":
		return "text/css; charset=utf-8"
	case "js", "mjs", "cjs":
		return "application/javascript; charset=utf-8"
	case "json", "map":
		return "application/json; charset=utf-8"
	case "svg":
		return "image/svg+xml"
	case "wasm":
		return "application/wasm"
	case "woff2":
		return "font/woff2"
	case "woff":
		return "font/woff"
	case "ttf":
		return "font/ttf"
	case "otf":
		return "font/otf"
	case "ico":
		return "image/x-icon"
	}
	return mediaOrDocMime(ext)
}

func clampOpenRangeHeader(r *http.Request, fileSize int64, maxChunk int64) {
	rangeHdr := strings.TrimSpace(r.Header.Get("Range"))
	if rangeHdr == "" {
		r.Header.Set("Range", fmt.Sprintf("bytes=0-%d", maxChunk-1))
		return
	}
	if !strings.HasPrefix(rangeHdr, "bytes=") {
		return
	}
	spec := strings.TrimPrefix(rangeHdr, "bytes=")
	if strings.Contains(spec, ",") {
		return
	}
	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 || parts[0] == "" {
		return
	}
	start, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || start < 0 || start >= fileSize {
		return
	}
	var end int64
	if parts[1] == "" {
		end = start + maxChunk - 1
	} else {
		parsedEnd, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil {
			return
		}
		end = parsedEnd
		if end-start+1 > maxChunk {
			end = start + maxChunk - 1
		}
	}
	if end >= fileSize {
		end = fileSize - 1
	}
	r.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))
}

func mediaOrDocMime(ext string) string {
	if ext == "pdf" {
		return "application/pdf"
	}
	if isMediaExt(ext) {
		return mediaMime(ext)
	}
	if isImageExt(ext) {
		return imageMime(ext)
	}
	return ""
}

