package search

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode/utf16"
)

const (
	maxPlainTextContentBytes = 16 * 1024 * 1024 // 16 MB teto seguro para arquivos de texto/código
	maxOfficeArchiveBytes    = 25 * 1024 * 1024 // 25 MB teto seguro para pacotes ZIP (DOCX/XLSX/PPTX/ODF)
	maxXMLMemberBytes        = 12 * 1024 * 1024 // 12 MB proteção contra Zip Bomb por entrada XML
)

var scannerBufPool = sync.Pool{
	New: func() any {
		b := make([]byte, 64*1024)
		return &b
	},
}

// skipDirNames lista diretórios pesados de build/cache/sistema que não devem ter seu conteúdo varrido
// recursivamente a menos que o usuário inicie a busca diretamente dentro deles.
var skipDirNames = map[string]bool{
	".git":                      true,
	".hg":                       true,
	".svn":                      true,
	"node_modules":              true,
	"bower_components":          true,
	".pnpm-store":               true,
	".next":                     true,
	".nuxt":                     true,
	".svelte-kit":               true,
	"target":                    true,
	"vendor":                    true,
	".venv":                     true,
	"venv":                      true,
	"__pycache__":               true,
	".pytest_cache":             true,
	".mypy_cache":               true,
	".gradle":                   true,
	".idea":                     true,
	".vs":                       true,
	"$recycle.bin":              true,
	"system volume information": true,
	".spotlight-v100":           true,
	".trashes":                  true,
	".fseventsd":                true,
	".temporaryitems":           true,
}

// skipUnixVirtualPaths evita travamentos em sistemas de arquivos virtuais do Linux/macOS (/proc, /sys, /dev).
var skipUnixVirtualPaths = map[string]bool{
	"/proc":    true,
	"/sys":     true,
	"/dev":     true,
	"/run":     true,
	"/var/run": true,
}

// binaryOrMediaExts descarta instantaneamente extensões binárias/mídia sem precisar abrir o arquivo (os.Open).
var binaryOrMediaExts = map[string]bool{
	// Vídeo & Áudio
	"mp4": true, "mkv": true, "avi": true, "mov": true, "webm": true, "wmv": true,
	"flv": true, "m4v": true, "mpg": true, "mpeg": true, "3gp": true,
	"mp3": true, "wav": true, "flac": true, "ogg": true, "aac": true, "m4a": true, "opus": true, "wma": true,
	// Imagens & Design Binário
	"png": true, "jpg": true, "jpeg": true, "gif": true, "webp": true, "bmp": true,
	"ico": true, "tiff": true, "tif": true, "psd": true, "ai": true, "heic": true, "raw": true,
	// Executáveis, Bibliotecas & Imagens de Disco
	"exe": true, "dll": true, "so": true, "dylib": true, "sys": true, "syso": true,
	"msi": true, "msix": true, "apk": true, "deb": true, "rpm": true, "dmg": true,
	"iso": true, "img": true, "vhd": true, "vhdx": true, "vmdk": true,
	"bin": true, "dat": true, "o": true, "obj": true, "a": true, "lib": true,
	"pyc": true, "pyo": true, "class": true, "pdb": true, "wasm": true,
	// Compactados puros
	"zip": true, "rar": true, "7z": true, "tar": true, "gz": true, "tgz": true,
	"bz2": true, "xz": true, "zst": true, "cab": true,
	// Fontes
	"woff": true, "woff2": true, "ttf": true, "otf": true, "eot": true,
	// Bancos de dados binários
	"db": true, "sqlite": true, "sqlite3": true, "db3": true, "s3db": true, "mdb": true, "accdb": true,
}

// officeOrODFExts identifica documentos estruturados baseados em ZIP+XML que suportam extração nativa de texto.
var officeOrODFExts = map[string]bool{
	"docx": true,
	"xlsx": true,
	"pptx": true,
	"ppsx": true,
	"potx": true,
	"odt":  true,
	"ods":  true,
	"odp":  true,
	"otp":  true,
}

// shouldSkipContentDir verifica se um diretório deve ser pulado durante a busca por conteúdo para proteger
// o desempenho e evitar pseudo-sistemas de arquivos no Linux/macOS/Windows.
func shouldSkipContentDir(fullPath string, dirName string) bool {
	normalizedPath := filepath.ToSlash(strings.ToLower(fullPath))
	if skipUnixVirtualPaths[normalizedPath] {
		return true
	}
	return skipDirNames[strings.ToLower(dirName)]
}

// isSkippedBinaryExt retorna true se a extensão for reconhecidamente binária/mídia e não suportar busca textual.
func isSkippedBinaryExt(ext string) bool {
	return binaryOrMediaExts[strings.ToLower(ext)]
}

// contentMatcher encapsula o critério de busca dentro do conteúdo (substring case-insensitive ou regex).
type contentMatcher struct {
	needleLower string
	rx          *regexp.Regexp
}

func newContentMatcher(query string, useRegex bool) (*contentMatcher, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return nil, nil
	}
	if useRegex {
		compiled, err := regexp.Compile("(?i)" + q)
		if err != nil {
			return nil, err
		}
		return &contentMatcher{
			needleLower: strings.ToLower(q),
			rx:          compiled,
		}, nil
	}
	return &contentMatcher{
		needleLower: strings.ToLower(q),
	}, nil
}

func (m *contentMatcher) matches(line string) (bool, int) {
	if m == nil || line == "" {
		return false, -1
	}
	if m.rx != nil {
		loc := m.rx.FindStringIndex(line)
		if loc == nil {
			return false, -1
		}
		return true, loc[0]
	}
	idx := strings.Index(strings.ToLower(line), m.needleLower)
	if idx < 0 {
		return false, -1
	}
	return true, idx
}

// matchFileContentAdvanced inspeciona o conteúdo de um arquivo de forma segura e em streaming.
// Suporta código/texto puro (UTF-8, ASCII, UTF-16LE/BE) e documentos Office/LibreOffice (DOCX, XLSX, PPTX, ODT, ODS, ODP).
func matchFileContentAdvanced(ctx context.Context, path string, ext string, size int64, matcher *contentMatcher) (bool, string, int) {
	if matcher == nil || size <= 0 {
		return false, "", 0
	}
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	if isSkippedBinaryExt(ext) {
		return false, "", 0
	}

	// 1. Documentos Office OpenXML (.docx, .xlsx, .pptx) e LibreOffice OpenDocument (.odt, .ods, .odp)
	if officeOrODFExts[ext] {
		if size > maxOfficeArchiveBytes {
			return false, "", 0
		}
		return matchOfficeOrODFZip(ctx, path, ext, matcher)
	}

	// 2. Arquivos de texto, código, configurações, CSV, Markdown, Flat XML (.fodp), etc.
	if size > maxPlainTextContentBytes {
		return false, "", 0
	}
	return matchPlainTextStream(ctx, path, matcher)
}

func matchPlainTextStream(ctx context.Context, path string, matcher *contentMatcher) (bool, string, int) {
	f, err := os.Open(path)
	if err != nil {
		return false, "", 0
	}
	defer f.Close()

	var head [512]byte
	n, _ := f.Read(head[:])
	if n == 0 {
		return false, "", 0
	}
	sample := head[:n]

	// Detecta UTF-16 BOM (muito comum em scripts/logs do Windows)
	if n >= 2 && ((sample[0] == 0xFF && sample[1] == 0xFE) || (sample[0] == 0xFE && sample[1] == 0xFF)) {
		littleEndian := sample[0] == 0xFF && sample[1] == 0xFE
		if _, err := f.Seek(2, io.SeekStart); err != nil {
			return false, "", 0
		}
		return matchUTF16Stream(ctx, f, littleEndian, matcher)
	}

	// Se contiver byte nulo nos primeiros 512 bytes (e não for UTF-16 com BOM), trata como binário e aborta na hora
	if bytes.IndexByte(sample, 0) >= 0 {
		return false, "", 0
	}

	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return false, "", 0
	}

	bufPtr := scannerBufPool.Get().(*[]byte)
	defer scannerBufPool.Put(bufPtr)

	scanner := bufio.NewScanner(f)
	scanner.Buffer(*bufPtr, 256*1024)

	lineNum := 0
	for scanner.Scan() {
		if lineNum&0x3F == 0 && ctx.Err() != nil {
			return false, "", 0
		}
		lineNum++
		line := scanner.Text()
		if ok, matchPos := matcher.matches(line); ok {
			return true, buildContextSnippet(line, matchPos), lineNum
		}
	}
	return false, "", 0
}

func matchUTF16Stream(ctx context.Context, r io.Reader, littleEndian bool, matcher *contentMatcher) (bool, string, int) {
	raw, err := io.ReadAll(io.LimitReader(r, 4*1024*1024))
	if err != nil || len(raw) < 2 {
		return false, "", 0
	}
	u16 := make([]uint16, len(raw)/2)
	for i := 0; i < len(u16); i++ {
		if littleEndian {
			u16[i] = uint16(raw[i*2]) | uint16(raw[i*2+1])<<8
		} else {
			u16[i] = uint16(raw[i*2])<<8 | uint16(raw[i*2+1])
		}
	}
	text := string(utf16.Decode(u16))
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		if i&0x3F == 0 && ctx.Err() != nil {
			return false, "", 0
		}
		if ok, matchPos := matcher.matches(line); ok {
			return true, buildContextSnippet(line, matchPos), i + 1
		}
	}
	return false, "", 0
}

func matchOfficeOrODFZip(ctx context.Context, path string, ext string, matcher *contentMatcher) (bool, string, int) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return false, "", 0
	}
	defer zr.Close()

	blockNum := 0
	for _, zf := range zr.File {
		if ctx.Err() != nil {
			return false, "", 0
		}
		nameLower := strings.ToLower(filepath.ToSlash(zf.Name))
		if !isRelevantDocumentXML(ext, nameLower) {
			continue
		}
		if zf.UncompressedSize64 > maxXMLMemberBytes {
			continue
		}

		rc, err := zf.Open()
		if err != nil {
			continue
		}
		matched, snippet, foundNum := scanXMLTextTokens(ctx, io.LimitReader(rc, maxXMLMemberBytes), matcher, &blockNum)
		_ = rc.Close()
		if matched {
			return true, snippet, foundNum
		}
	}

	return false, "", 0
}

func isRelevantDocumentXML(ext string, zipEntryLower string) bool {
	switch ext {
	case "docx":
		return zipEntryLower == "word/document.xml" ||
			strings.HasPrefix(zipEntryLower, "word/header") ||
			strings.HasPrefix(zipEntryLower, "word/footer")
	case "xlsx":
		return zipEntryLower == "xl/sharedstrings.xml" ||
			strings.HasPrefix(zipEntryLower, "xl/worksheets/sheet")
	case "pptx", "ppsx", "potx":
		return strings.HasPrefix(zipEntryLower, "ppt/slides/slide") ||
			strings.HasPrefix(zipEntryLower, "ppt/notesslides/notesslide")
	case "odt", "ods", "odp", "otp":
		return zipEntryLower == "content.xml"
	default:
		return strings.HasSuffix(zipEntryLower, ".xml")
	}
}

func scanXMLTextTokens(ctx context.Context, r io.Reader, matcher *contentMatcher, blockNum *int) (bool, string, int) {
	dec := xml.NewDecoder(r)
	dec.Strict = false

	var paraBuf strings.Builder
	flushPara := func() (bool, string, int) {
		if paraBuf.Len() == 0 {
			return false, "", 0
		}
		text := strings.TrimSpace(paraBuf.String())
		paraBuf.Reset()
		if text == "" {
			return false, "", 0
		}
		*blockNum++
		if ok, matchPos := matcher.matches(text); ok {
			return true, buildContextSnippet(text, matchPos), *blockNum
		}
		return false, "", 0
	}

	step := 0
	for {
		step++
		if step&0x7F == 0 && ctx.Err() != nil {
			return false, "", 0
		}
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.CharData:
			chunk := strings.TrimSpace(string(t))
			if chunk != "" {
				if paraBuf.Len() > 0 {
					paraBuf.WriteByte(' ')
				}
				paraBuf.WriteString(chunk)
				if paraBuf.Len() >= 512 {
					if ok, snip, ln := flushPara(); ok {
						return true, snip, ln
					}
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "p", "r", "si", "row", "page", "frame", "sld":
				if ok, snip, ln := flushPara(); ok {
					return true, snip, ln
				}
			}
		}
	}

	if ok, snip, ln := flushPara(); ok {
		return true, snip, ln
	}
	return false, "", 0
}

// buildContextSnippet extrai uma janela legível ao redor da posição onde o termo foi encontrado.
func buildContextSnippet(line string, matchPos int) string {
	cleaned := strings.Join(strings.Fields(line), " ")
	if len(cleaned) <= 150 {
		return cleaned
	}
	start := 0
	if matchPos > 45 {
		start = matchPos - 45
		if start >= len(cleaned) {
			start = 0
		}
	}
	end := start + 150
	if end > len(cleaned) {
		end = len(cleaned)
	}
	snippet := cleaned[start:end]
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(cleaned) {
		snippet = snippet + "…"
	}
	return snippet
}

