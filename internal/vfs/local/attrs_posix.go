//go:build !windows

package local

import (
	"os"
	"path/filepath"
	"strings"

	"pulsares-file-explorer/internal/vfs"
)

func getAttrs(path string, info os.FileInfo) vfs.Attrs {
	attrs := vfs.Attrs{}
	name := filepath.Base(path)
	if strings.HasPrefix(name, ".") {
		attrs.Hidden = true
	}
	return attrs
}

