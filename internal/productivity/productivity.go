package productivity

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"pulsares-file-explorer/internal/storage"
)

type BatchRenameOptions struct {
	Find         string `json:"find"`
	Replace      string `json:"replace"`
	UseRegex     bool   `json:"useRegex"`
	Prefix       string `json:"prefix"`
	Suffix       string `json:"suffix"`
	CaseMode     string `json:"caseMode"` // "none" | "lower" | "upper" | "title"
	StartNumber  int    `json:"startNumber"`
	StepNumber   int    `json:"stepNumber"`
	NumberDigits int    `json:"numberDigits"`
}

type BatchRenamePreviewItem struct {
	OriginalPath string `json:"originalPath"`
	OriginalName string `json:"originalName"`
	NewName      string `json:"newName"`
	NewPath      string `json:"newPath"`
	Changed      bool   `json:"changed"`
	HasConflict  bool   `json:"hasConflict"`
}

type FolderDiffItem struct {
	Name         string `json:"name"`
	Status       string `json:"status"` // "onlyLeft" | "onlyRight" | "different" | "identical"
	IsDir        bool   `json:"isDir"`
	LeftPath     string `json:"leftPath,omitempty"`
	RightPath    string `json:"rightPath,omitempty"`
	LeftSize     int64  `json:"leftSize"`
	RightSize    int64  `json:"rightSize"`
	LeftModTime  int64  `json:"leftModTime"`
	RightModTime int64  `json:"rightModTime"`
}

type FileHashes struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	MD5    string `json:"md5"`
	SHA1   string `json:"sha1"`
	SHA256 string `json:"sha256"`
}

// PreviewBatchRename gera a prévia determinística de renomeação em lote com detecção de conflitos.
func PreviewBatchRename(paths []string, opts BatchRenameOptions) ([]BatchRenamePreviewItem, error) {
	var re *regexp.Regexp
	var err error
	if opts.UseRegex && opts.Find != "" {
		re, err = regexp.Compile(opts.Find)
		if err != nil {
			return nil, fmt.Errorf("invalid regex: %w", err)
		}
	}

	step := opts.StepNumber
	if step == 0 {
		step = 1
	}
	start := opts.StartNumber
	if start <= 0 {
		start = 1
	}
	digits := opts.NumberDigits
	if digits < 0 {
		digits = 0
	}

	seenNewPaths := make(map[string]int, len(paths))
	items := make([]BatchRenamePreviewItem, 0, len(paths))

	for idx, rawPath := range paths {
		clean := filepath.Clean(rawPath)
		dir := filepath.Dir(clean)
		origName := filepath.Base(clean)
		ext := filepath.Ext(origName)
		stem := strings.TrimSuffix(origName, ext)

		if opts.Find != "" {
			if re != nil {
				stem = re.ReplaceAllString(stem, opts.Replace)
			} else {
				stem = strings.ReplaceAll(stem, opts.Find, opts.Replace)
			}
		}

		switch opts.CaseMode {
		case "lower":
			stem = strings.ToLower(stem)
		case "upper":
			stem = strings.ToUpper(stem)
		case "title":
			stem = toTitleCase(stem)
		}

		numVal := start + idx*step
		numFmt := fmt.Sprintf("%0*d", maxInt(digits, 1), numVal)

		prefix := strings.ReplaceAll(opts.Prefix, "{n}", numFmt)
		suffix := strings.ReplaceAll(opts.Suffix, "{n}", numFmt)
		stem = strings.ReplaceAll(stem, "{n}", numFmt)

		if digits > 0 && !strings.Contains(opts.Prefix, "{n}") && !strings.Contains(opts.Suffix, "{n}") && !strings.Contains(opts.Replace, "{n}") {
			suffix = suffix + "_" + numFmt
		}

		newName := strings.TrimSpace(prefix + stem + suffix + ext)
		if newName == "" || newName == ext {
			newName = origName
		}

		newPath := filepath.Join(dir, newName)
		normNew := strings.ToLower(newPath)
		seenNewPaths[normNew]++

		items = append(items, BatchRenamePreviewItem{
			OriginalPath: clean,
			OriginalName: origName,
			NewName:      newName,
			NewPath:      newPath,
			Changed:      newName != origName,
		})
	}

	for i := range items {
		normNew := strings.ToLower(items[i].NewPath)
		if seenNewPaths[normNew] > 1 {
			items[i].HasConflict = true
			continue
		}
		if items[i].Changed && !strings.EqualFold(items[i].OriginalPath, items[i].NewPath) {
			if _, err := os.Lstat(items[i].NewPath); err == nil {
				items[i].HasConflict = true
			}
		}
	}

	return items, nil
}

// ExecuteBatchRename aplica a renomeação em lote validada e registra no diário de operações (Undo/Redo).
func ExecuteBatchRename(db *storage.DB, paths []string, opts BatchRenameOptions) (int, error) {
	preview, err := PreviewBatchRename(paths, opts)
	if err != nil {
		return 0, err
	}
	for _, it := range preview {
		if it.HasConflict {
			return 0, fmt.Errorf("conflict detected for %s", it.NewName)
		}
	}

	renamed := 0
	for _, it := range preview {
		if !it.Changed {
			continue
		}
		if err := os.Rename(it.OriginalPath, it.NewPath); err != nil {
			return renamed, err
		}
		if db != nil {
			_, _ = db.RecordJournal("rename", it.OriginalPath, it.NewPath)
		}
		renamed++
	}
	return renamed, nil
}

// CompareDirectories compara os itens imediatos de duas pastas e classifica diferenças de existência, tamanho e data.
func CompareDirectories(leftDir, rightDir string) ([]FolderDiffItem, error) {
	cleanLeft := filepath.Clean(leftDir)
	cleanRight := filepath.Clean(rightDir)

	leftEntries, err := os.ReadDir(cleanLeft)
	if err != nil {
		return nil, err
	}
	rightEntries, err := os.ReadDir(cleanRight)
	if err != nil {
		return nil, err
	}

	type meta struct {
		name    string
		path    string
		isDir   bool
		size    int64
		modTime int64
	}

	leftMap := make(map[string]meta, len(leftEntries))
	for _, e := range leftEntries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		key := strings.ToLower(e.Name())
		leftMap[key] = meta{
			name:    e.Name(),
			path:    filepath.Join(cleanLeft, e.Name()),
			isDir:   e.IsDir(),
			size:    info.Size(),
			modTime: info.ModTime().UnixMilli(),
		}
	}

	rightMap := make(map[string]meta, len(rightEntries))
	for _, e := range rightEntries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		key := strings.ToLower(e.Name())
		rightMap[key] = meta{
			name:    e.Name(),
			path:    filepath.Join(cleanRight, e.Name()),
			isDir:   e.IsDir(),
			size:    info.Size(),
			modTime: info.ModTime().UnixMilli(),
		}
	}

	seen := make(map[string]bool)
	var out []FolderDiffItem

	for key, l := range leftMap {
		seen[key] = true
		r, ok := rightMap[key]
		if !ok {
			out = append(out, FolderDiffItem{
				Name:        l.name,
				Status:      "onlyLeft",
				IsDir:       l.isDir,
				LeftPath:    l.path,
				LeftSize:    l.size,
				LeftModTime: l.modTime,
			})
			continue
		}

		status := "identical"
		if l.isDir != r.isDir || (!l.isDir && l.size != r.size) {
			status = "different"
		}
		out = append(out, FolderDiffItem{
			Name:         l.name,
			Status:       status,
			IsDir:        l.isDir,
			LeftPath:     l.path,
			RightPath:    r.path,
			LeftSize:     l.size,
			RightSize:    r.size,
			LeftModTime:  l.modTime,
			RightModTime: r.modTime,
		})
	}

	for key, r := range rightMap {
		if seen[key] {
			continue
		}
		out = append(out, FolderDiffItem{
			Name:         r.name,
			Status:       "onlyRight",
			IsDir:        r.isDir,
			RightPath:    r.path,
			RightSize:    r.size,
			RightModTime: r.modTime,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})

	return out, nil
}

// ComputeHashes calcula MD5, SHA-1 e SHA-256 em uma única passagem sobre o arquivo.
func ComputeHashes(filePath string) (FileHashes, error) {
	clean := filepath.Clean(filePath)
	info, err := os.Stat(clean)
	if err != nil {
		return FileHashes{}, err
	}
	if info.IsDir() {
		return FileHashes{}, fmt.Errorf("cannot hash directory")
	}

	f, err := os.Open(clean)
	if err != nil {
		return FileHashes{}, err
	}
	defer f.Close()

	hMD5 := md5.New()
	hSHA1 := sha1.New()
	hSHA256 := sha256.New()

	mw := io.MultiWriter(hMD5, hSHA1, hSHA256)
	if _, err := io.Copy(mw, f); err != nil {
		return FileHashes{}, err
	}

	return FileHashes{
		Path:   clean,
		Size:   info.Size(),
		MD5:    hex.EncodeToString(hMD5.Sum(nil)),
		SHA1:   hex.EncodeToString(hSHA1.Sum(nil)),
		SHA256: hex.EncodeToString(hSHA256.Sum(nil)),
	}, nil
}

func toTitleCase(s string) string {
	var b strings.Builder
	capNext := true
	for _, r := range s {
		if unicode.IsSpace(r) || r == '_' || r == '-' {
			b.WriteRune(r)
			capNext = true
			continue
		}
		if capNext {
			b.WriteRune(unicode.ToTitle(r))
			capNext = false
		} else {
			b.WriteRune(unicode.ToLower(r))
		}
	}
	return b.String()
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
