package local

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"pulsares-file-explorer/internal/vfs"
)

type LocalFS struct{}

func New() *LocalFS {
	return &LocalFS{}
}

func (fs *LocalFS) Stat(ctx context.Context, loc vfs.Location) (vfs.Entry, error) {
	fullPath := filepath.Clean(loc.Path)
	info, err := os.Lstat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return vfs.Entry{}, vfs.ErrNotFound
		}
		if os.IsPermission(err) {
			return vfs.Entry{}, vfs.ErrPermission
		}
		return vfs.Entry{}, err
	}

	return fs.toEntry(loc, fullPath, info), nil
}

func (fs *LocalFS) Open(ctx context.Context, loc vfs.Location) (io.ReadCloser, error) {
	fullPath := filepath.Clean(loc.Path)
	return os.Open(fullPath)
}

func (fs *LocalFS) ReadDir(ctx context.Context, loc vfs.Location, batch int) (<-chan []vfs.Entry, <-chan error) {
	outChan := make(chan []vfs.Entry, 4)
	errChan := make(chan error, 1)

	if batch <= 0 {
		batch = 500
	}

	go func() {
		defer close(outChan)
		defer close(errChan)

		fullPath := filepath.Clean(loc.Path)
		dir, err := os.Open(fullPath)
		if err != nil {
			if os.IsNotExist(err) {
				errChan <- vfs.ErrNotFound
			} else if os.IsPermission(err) {
				errChan <- vfs.ErrPermission
			} else {
				errChan <- err
			}
			return
		}
		defer dir.Close()

		currentBatch := make([]vfs.Entry, 0, batch)

		for {
			select {
			case <-ctx.Done():
				errChan <- ctx.Err()
				return
			default:
			}

			// Read batch entries directly
			infos, readErr := dir.Readdir(batch)
			if len(infos) > 0 {
				for _, info := range infos {
					entryPath := filepath.Join(fullPath, info.Name())
					entryLoc := vfs.Location{
						Provider: "local",
						Root:     loc.Root,
						Path:     entryPath,
					}
					currentBatch = append(currentBatch, fs.toEntry(entryLoc, entryPath, info))
				}

				select {
				case <-ctx.Done():
					errChan <- ctx.Err()
					return
				case outChan <- currentBatch:
				}
				currentBatch = make([]vfs.Entry, 0, batch)
			}

			if readErr != nil {
				if readErr != io.EOF {
					errChan <- fmt.Errorf("read directory: %w", readErr)
				}
				return
			}
		}
	}()

	return outChan, errChan
}

func (fs *LocalFS) toEntry(loc vfs.Location, path string, info os.FileInfo) vfs.Entry {
	kind := vfs.KindFile
	mode := info.Mode()

	if mode.IsDir() {
		kind = vfs.KindDir
	} else if mode&os.ModeSymlink != 0 {
		kind = vfs.KindSymlink
	}

	attrs := getAttrs(path, info)

	var target *vfs.Location
	if kind == vfs.KindSymlink {
		if linkTarget, err := os.Readlink(path); err == nil {
			target = &vfs.Location{
				Provider: "local",
				Root:     loc.Root,
				Path:     linkTarget,
			}
		}
	}

	return vfs.Entry{
		Name:     info.Name(),
		Location: loc,
		Kind:     kind,
		Size:     info.Size(),
		ModTime:  info.ModTime(),
		Attrs:    attrs,
		Target:   target,
	}
}

