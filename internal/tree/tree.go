package tree

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/vfs"
)

type Tri string

const (
	TriYes     Tri = "yes"
	TriNo      Tri = "no"
	TriUnknown Tri = "unknown"
)

type Node struct {
	Name        string       `json:"name"`
	Location    vfs.Location `json:"location"`
	HasChildren Tri          `json:"hasChildren"`
	IsLink      bool         `json:"isLink"`
	Hidden      bool         `json:"hidden"`
}

type Service struct {
	fs           vfs.FileSystem
	probeTimeout time.Duration
}

func NewService(fs vfs.FileSystem) *Service {
	return &Service{
		fs:           fs,
		probeTimeout: 120 * time.Millisecond,
	}
}

// Roots retorna as raízes de navegação do sistema operacional (pasta pessoal e volumes/unidades).
func (s *Service) Roots(ctx context.Context) ([]Node, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	var roots []Node
	seen := make(map[string]bool)

	home := platform.GetHomeDir()
	if home != "" {
		cleanHome := filepath.Clean(home)
		seen[cleanHome] = true
		roots = append(roots, Node{
			Name: filepath.Base(cleanHome),
			Location: vfs.Location{
				Provider: "local",
				Root:     cleanHome,
				Path:     cleanHome,
			},
			HasChildren: TriYes,
		})
	}

	drives := platform.GetDrives()
	for _, d := range drives {
		cleanPath := filepath.Clean(d.Path)
		if seen[cleanPath] {
			continue
		}
		seen[cleanPath] = true
		label := d.Label
		if label == "" {
			label = d.Path
		}
		roots = append(roots, Node{
			Name: label,
			Location: vfs.Location{
				Provider: "local",
				Root:     d.Path,
				Path:     cleanPath,
			},
			HasChildren: TriYes,
		})
	}

	return roots, nil
}

// Children retorna apenas os subdiretórios diretos de loc, sondando HasChildren com timeout curto.
func (s *Service) Children(ctx context.Context, loc vfs.Location, showHidden bool) ([]Node, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	entriesChan, errChan := s.fs.ReadDir(ctx, loc, 500)
	var dirs []vfs.Entry

	for entriesChan != nil || errChan != nil {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case batch, ok := <-entriesChan:
			if !ok {
				entriesChan = nil
				continue
			}
			for _, e := range batch {
				if !showHidden && e.Attrs.Hidden {
					continue
				}
				if e.Kind == vfs.KindDir || e.Kind == vfs.KindSymlink {
					// Para symlink, verificar se aponta para diretório sem expandir recursivamente
					if e.Kind == vfs.KindSymlink {
						if !isSymlinkDir(e.Location.Path) {
							continue
						}
					}
					dirs = append(dirs, e)
				}
			}
		case err, ok := <-errChan:
			if !ok {
				errChan = nil
				continue
			}
			if err != nil {
				return nil, err
			}
		}
	}

	nodes := make([]Node, len(dirs))
	sem := make(chan struct{}, 8) // paralelismo limitado para sondagem
	var wg sync.WaitGroup

	for i, d := range dirs {
		isLink := d.Kind == vfs.KindSymlink
		nodes[i] = Node{
			Name:        d.Name,
			Location:    d.Location,
			HasChildren: TriNo,
			IsLink:      isLink,
			Hidden:      d.Attrs.Hidden,
		}

		// Symlinks/junctions ou provedores remotos (SFTP) não são sondados recursivamente no disco local
		if isLink || d.Location.Provider == "sftp" {
			nodes[i].HasChildren = TriUnknown
			continue
		}

		wg.Add(1)
		go func(idx int, dirPath string) {
			defer wg.Done()
			select {
			case <-ctx.Done():
				return
			case sem <- struct{}{}:
				defer func() { <-sem }()
			}
			nodes[idx].HasChildren = probeHasSubdir(ctx, dirPath, s.probeTimeout)
		}(i, d.Location.Path)
	}

	wg.Wait()
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	return nodes, nil
}

func isSymlinkDir(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// probeHasSubdir para no primeiro subdiretório encontrado ou retorna TriUnknown em caso de timeout.
func probeHasSubdir(parentCtx context.Context, dirPath string, timeout time.Duration) Tri {
	ctx, cancel := context.WithTimeout(parentCtx, timeout)
	defer cancel()

	resCh := make(chan Tri, 1)
	go func() {
		f, err := os.Open(dirPath)
		if err != nil {
			if os.IsPermission(err) {
				resCh <- TriNo
				return
			}
			resCh <- TriUnknown
			return
		}
		defer f.Close()

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			entries, err := f.ReadDir(64)
			for _, entry := range entries {
				if entry.IsDir() {
					resCh <- TriYes
					return
				}
			}
			if err != nil {
				if err == io.EOF {
					resCh <- TriNo
				} else {
					resCh <- TriUnknown
				}
				return
			}
		}
	}()

	select {
	case <-ctx.Done():
		return TriUnknown
	case res := <-resCh:
		return res
	}
}

