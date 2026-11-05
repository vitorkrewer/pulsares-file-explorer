package archive

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type ArchiveEntry struct {
	Name           string `json:"name"`
	Path           string `json:"path"`
	IsDir          bool   `json:"isDir"`
	Size           int64  `json:"size"`
	CompressedSize int64  `json:"compressedSize"`
	ModTime        int64  `json:"modTime"`
}

// ListArchive lista o conteúdo de um arquivo .zip, .tar, .tar.gz ou .tgz sem extraí-lo.
func ListArchive(archivePath string) ([]ArchiveEntry, error) {
	clean := filepath.Clean(archivePath)
	lower := strings.ToLower(clean)

	switch {
	case strings.HasSuffix(lower, ".zip"):
		return listZip(clean)
	case strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz"):
		return listTar(clean, true)
	case strings.HasSuffix(lower, ".tar"):
		return listTar(clean, false)
	default:
		return nil, fmt.Errorf("unsupported archive format: %s", filepath.Base(clean))
	}
}

func listZip(zipPath string) ([]ArchiveEntry, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	out := make([]ArchiveEntry, 0, len(r.File))
	for _, f := range r.File {
		norm := strings.TrimSuffix(strings.ReplaceAll(f.Name, `\`, "/"), "/")
		out = append(out, ArchiveEntry{
			Name:           path.Base(norm),
			Path:           norm,
			IsDir:          f.FileInfo().IsDir(),
			Size:           int64(f.UncompressedSize64),
			CompressedSize: int64(f.CompressedSize64),
			ModTime:        f.Modified.UnixMilli(),
		})
	}
	sortEntries(out)
	return out, nil
}

func listTar(tarPath string, gzipped bool) ([]ArchiveEntry, error) {
	f, err := os.Open(tarPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var reader io.Reader = f
	if gzipped {
		gz, err := gzip.NewReader(f)
		if err != nil {
			return nil, err
		}
		defer gz.Close()
		reader = gz
	}

	tr := tar.NewReader(reader)
	var out []ArchiveEntry
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		norm := strings.TrimSuffix(strings.ReplaceAll(hdr.Name, `\`, "/"), "/")
		out = append(out, ArchiveEntry{
			Name:           path.Base(norm),
			Path:           norm,
			IsDir:          hdr.Typeflag == tar.TypeDir,
			Size:           hdr.Size,
			CompressedSize: hdr.Size,
			ModTime:        hdr.ModTime.UnixMilli(),
		})
	}
	sortEntries(out)
	return out, nil
}

func sortEntries(entries []ArchiveEntry) {
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Path) < strings.ToLower(entries[j].Path)
	})
}

// CreateArchive compacta os caminhos de origem informados em um arquivo .zip ou .tar.gz.
func CreateArchive(sources []string, destArchivePath string) error {
	cleanDest := filepath.Clean(destArchivePath)
	lower := strings.ToLower(cleanDest)
	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") {
		return createTarGz(sources, cleanDest)
	}
	if !strings.HasSuffix(lower, ".zip") {
		cleanDest += ".zip"
	}
	return createZip(sources, cleanDest)
}

func createZip(sources []string, destZipPath string) error {
	outFile, err := os.Create(destZipPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	zw := zip.NewWriter(outFile)
	defer zw.Close()

	for _, src := range sources {
		cleanSrc := filepath.Clean(src)
		baseDir := filepath.Dir(cleanSrc)

		err := filepath.WalkDir(cleanSrc, func(currPath string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if filepath.Clean(currPath) == filepath.Clean(destZipPath) {
				return nil
			}
			rel, err := filepath.Rel(baseDir, currPath)
			if err != nil {
				return err
			}
			zipRel := strings.ReplaceAll(rel, `\`, "/")
			info, err := d.Info()
			if err != nil {
				return err
			}

			hdr, err := zip.FileInfoHeader(info)
			if err != nil {
				return err
			}
			hdr.Name = zipRel
			if d.IsDir() {
				hdr.Name += "/"
			} else {
				hdr.Method = zip.Deflate
			}

			w, err := zw.CreateHeader(hdr)
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}

			f, err := os.Open(currPath)
			if err != nil {
				return err
			}
			defer f.Close()
			_, err = io.Copy(w, f)
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func createTarGz(sources []string, destTarGzPath string) error {
	outFile, err := os.Create(destTarGzPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	gz := gzip.NewWriter(outFile)
	defer gz.Close()

	tw := tar.NewWriter(gz)
	defer tw.Close()

	for _, src := range sources {
		cleanSrc := filepath.Clean(src)
		baseDir := filepath.Dir(cleanSrc)

		err := filepath.WalkDir(cleanSrc, func(currPath string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if filepath.Clean(currPath) == filepath.Clean(destTarGzPath) {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return err
			}
			rel, err := filepath.Rel(baseDir, currPath)
			if err != nil {
				return err
			}
			hdr, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			hdr.Name = strings.ReplaceAll(rel, `\`, "/")
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			f, err := os.Open(currPath)
			if err != nil {
				return err
			}
			defer f.Close()
			_, err = io.Copy(tw, f)
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// ExtractArchive extrai um arquivo .zip, .tar, .tar.gz ou .tgz para destDir com proteção estrita contra Zip-Slip.
func ExtractArchive(archivePath string, destDir string) (int, error) {
	cleanArchive := filepath.Clean(archivePath)
	cleanDest := filepath.Clean(destDir)
	if err := os.MkdirAll(cleanDest, 0o755); err != nil {
		return 0, err
	}

	lower := strings.ToLower(cleanArchive)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		return extractZip(cleanArchive, cleanDest)
	case strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz"):
		return extractTar(cleanArchive, cleanDest, true)
	case strings.HasSuffix(lower, ".tar"):
		return extractTar(cleanArchive, cleanDest, false)
	default:
		return 0, fmt.Errorf("unsupported archive format: %s", filepath.Base(cleanArchive))
	}
}

func safeJoinDest(destRoot, entryName string) (string, error) {
	cleanedEntry := filepath.FromSlash(strings.ReplaceAll(entryName, `\`, "/"))
	if strings.HasPrefix(cleanedEntry, "/") || strings.HasPrefix(cleanedEntry, `\`) {
		return "", fmt.Errorf("zip-slip blocked: absolute path %q", entryName)
	}
	target := filepath.Join(destRoot, cleanedEntry)
	rel, err := filepath.Rel(destRoot, target)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." {
		return "", fmt.Errorf("zip-slip blocked: path traversal %q", entryName)
	}
	return target, nil
}

func extractZip(zipPath, destRoot string) (int, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return 0, err
	}
	defer r.Close()

	extracted := 0
	for _, f := range r.File {
		target, err := safeJoinDest(destRoot, f.Name)
		if err != nil {
			return extracted, err
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return extracted, err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return extracted, err
		}
		rc, err := f.Open()
		if err != nil {
			return extracted, err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			rc.Close()
			return extracted, err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return extracted, copyErr
		}
		extracted++
	}
	return extracted, nil
}

func extractTar(tarPath, destRoot string, gzipped bool) (int, error) {
	f, err := os.Open(tarPath)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	var reader io.Reader = f
	if gzipped {
		gz, err := gzip.NewReader(f)
		if err != nil {
			return 0, err
		}
		defer gz.Close()
		reader = gz
	}

	tr := tar.NewReader(reader)
	extracted := 0
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return extracted, err
		}
		target, err := safeJoinDest(destRoot, hdr.Name)
		if err != nil {
			return extracted, err
		}
		if hdr.Typeflag == tar.TypeDir {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return extracted, err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return extracted, err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			return extracted, err
		}
		_, copyErr := io.Copy(out, tr)
		out.Close()
		if copyErr != nil {
			return extracted, copyErr
		}
		extracted++
	}
	return extracted, nil
}

