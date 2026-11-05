//go:build windows

package local

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"pulsares-file-explorer/internal/vfs"
)

func getAttrs(path string, info os.FileInfo) vfs.Attrs {
	attrs := vfs.Attrs{}
	name := filepath.Base(path)
	if strings.HasPrefix(name, ".") {
		attrs.Hidden = true
	}

	ptr, err := syscall.UTF16PtrFromString(path)
	if err == nil {
		winAttrs, err := syscall.GetFileAttributes(ptr)
		if err == nil && winAttrs != syscall.INVALID_FILE_ATTRIBUTES {
			if winAttrs&syscall.FILE_ATTRIBUTE_HIDDEN != 0 {
				attrs.Hidden = true
			}
			if winAttrs&syscall.FILE_ATTRIBUTE_SYSTEM != 0 {
				attrs.System = true
			}
			if winAttrs&syscall.FILE_ATTRIBUTE_READONLY != 0 {
				attrs.ReadOnly = true
			}
		}
	}
	return attrs
}
