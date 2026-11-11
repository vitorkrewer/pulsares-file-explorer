package thumbs

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	mediaServerOnce    sync.Once
	mediaServerBase    string
	projectDirRegistry sync.Map // token ("p_<hex16>") -> cleanDirPath (string)

	studioLiveMu      sync.RWMutex
	studioLiveBuffers = make(map[string][]byte)
)

func normalizeLiveLookupKey(p string) string {
	clean := filepath.Clean(strings.TrimSpace(p))
	slash := filepath.ToSlash(clean)
	return strings.ToLower(strings.TrimRight(slash, "/"))
}

func encodeSlashRelPath(rel string) string {
	slash := filepath.ToSlash(strings.TrimSpace(rel))
	parts := strings.Split(slash, "/")
	encoded := make([]string, 0, len(parts))
	for _, seg := range parts {
		if seg == "" || seg == "." {
			continue
		}
		encoded = append(encoded, url.PathEscape(seg))
	}
	return strings.Join(encoded, "/")
}

// RegisterProjectDir registra um diretório local no servidor de loopback usando um token curto e seguro
// (evitando limites de tamanho de URL em caminhos longos) e retorna o prefixo HTTP completo com barra final.
func RegisterProjectDir(dirPath string) string {
	cleanDir := filepath.Clean(strings.TrimSpace(dirPath))
	if cleanDir == "" || cleanDir == "." {
		cleanDir = os.TempDir()
	}
	sum := sha256.Sum256([]byte(normalizeLiveLookupKey(cleanDir)))
	token := "p_" + hex.EncodeToString(sum[:8])
	projectDirRegistry.Store(token, cleanDir)
	if base := ensureMediaServer(); base != "" {
		return base + "/__project/" + token + "/"
	}
	return "/__project/" + token + "/"
}

// ReplaceStudioLiveBuffers atualiza os buffers em memória das abas abertas no Pulsares Studio,
// permitindo prévia web em tempo real mesmo antes de salvar no disco, sem quebrar caminhos relativos.
func ReplaceStudioLiveBuffers(files map[string]string) {
	next := make(map[string][]byte, len(files))
	for k, v := range files {
		trimmed := strings.TrimSpace(k)
		if trimmed == "" {
			continue
		}
		next[normalizeLiveLookupKey(trimmed)] = []byte(v)
	}
	studioLiveMu.Lock()
	studioLiveBuffers = next
	studioLiveMu.Unlock()
}

// ResolveStudioProjectPreviewURL registra a pasta raiz do projeto e retorna a URL HTTP real de loopback
// para carregar o arquivo HTML (ou buffer sem título) com suporte total a subpastas, imagens, CSS, JS e localStorage.
func ResolveStudioProjectPreviewURL(dirPath string, entryRelPath string, untitledHTML string) string {
	cleanDir := filepath.Clean(strings.TrimSpace(dirPath))
	if cleanDir == "" || cleanDir == "." || cleanDir == string(filepath.Separator) {
		cleanDir = os.TempDir()
	}
	prefix := RegisterProjectDir(cleanDir)
	if untitledHTML != "" {
		virtualName := "__studio_untitled__.html"
		virtualPath := filepath.Join(cleanDir, virtualName)
		studioLiveMu.Lock()
		studioLiveBuffers[normalizeLiveLookupKey(virtualPath)] = []byte(untitledHTML)
		studioLiveMu.Unlock()
		return prefix + virtualName
	}
	escapedRel := encodeSlashRelPath(entryRelPath)
	if escapedRel == "" {
		escapedRel = "index.html"
	}
	return prefix + escapedRel
}

func getStudioLiveBuffer(targetPath string) ([]byte, bool) {
	key := normalizeLiveLookupKey(targetPath)
	studioLiveMu.RLock()
	data, ok := studioLiveBuffers[key]
	studioLiveMu.RUnlock()
	return data, ok
}

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
	return RegisterProjectDir(dir) + url.PathEscape(baseName)
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
	if ext == "pdf" || isImageExt(ext) {
		w.Header().Set("Content-Disposition", "inline")
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
	dirToken := trimmed[:slashIdx]
	relPart := trimmed[slashIdx+1:]

	var baseDir string
	if strings.HasPrefix(dirToken, "p_") {
		val, ok := projectDirRegistry.Load(dirToken)
		if !ok {
			http.NotFound(w, r)
			return
		}
		baseDir = filepath.Clean(val.(string))
	} else {
		decodedDir, err := base64.RawURLEncoding.DecodeString(dirToken)
		if err != nil {
			decodedDir, err = base64.StdEncoding.DecodeString(dirToken)
			if err != nil {
				http.Error(w, "invalid project dir encoding", http.StatusBadRequest)
				return
			}
		}
		baseDir = filepath.Clean(string(decodedDir))
	}

	if strings.Contains(relPart, "%") {
		if unescaped, err := url.PathUnescape(relPart); err == nil {
			relPart = unescaped
		}
	}

	if relPart == "" || relPart == "/" {
		relPart = "index.html"
	}
	targetPath := filepath.Clean(filepath.Join(baseDir, filepath.FromSlash(relPart)))

	relCheck, relErr := filepath.Rel(baseDir, targetPath)
	if relErr != nil || relCheck == ".." || strings.HasPrefix(relCheck, ".."+string(filepath.Separator)) {
		http.Error(w, "forbidden path", http.StatusForbidden)
		return
	}

	// 1. Verifica buffer ao vivo do Pulsares Studio em memória (edições em tempo real antes de salvar)
	if liveData, ok := getStudioLiveBuffer(targetPath); ok {
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(targetPath), "."))
		if mimeType := webAssetMime(ext); mimeType != "" {
			w.Header().Set("Content-Type", mimeType)
		}
		w.Header().Set("Content-Disposition", "inline")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		http.ServeContent(w, r, filepath.Base(targetPath), time.Now(), bytes.NewReader(liveData))
		return
	}

	info, err := os.Stat(targetPath)
	if err == nil && info.IsDir() {
		indexCandidate := filepath.Join(targetPath, "index.html")
		if liveIndex, ok := getStudioLiveBuffer(indexCandidate); ok {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Content-Disposition", "inline")
			w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
			http.ServeContent(w, r, "index.html", time.Now(), bytes.NewReader(liveIndex))
			return
		}
		targetPath = indexCandidate
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
	if ext == "pdf" || isImageExt(ext) {
		w.Header().Set("Content-Disposition", "inline")
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
	case "xml":
		return "application/xml; charset=utf-8"
	case "txt", "md", "csv":
		return "text/plain; charset=utf-8"
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

