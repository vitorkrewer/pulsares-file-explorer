//go:build windows

package platform

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	shell32                  = syscall.NewLazyDLL("shell32.dll")
	procGetUserDefaultLocale = kernel32.NewProc("GetUserDefaultLocaleName")
	procGetDiskFreeSpaceExW  = kernel32.NewProc("GetDiskFreeSpaceExW")
	procGetDriveTypeW        = kernel32.NewProc("GetDriveTypeW")
	procSHFileOperationW     = shell32.NewProc("SHFileOperationW")
)

const (
	driveRemovable    = 2
	foDelete          = 0x0003
	fofSilent         = 0x0004
	fofNoConfirmation = 0x0010
	fofAllowUndo      = 0x0040
	fofNoErrorUI      = 0x0400
)

type shFileOpStructW struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

func GetSystemLanguage() string {
	buf := make([]uint16, 85)
	r, _, _ := procGetUserDefaultLocale.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
	)
	if r != 0 {
		return syscall.UTF16ToString(buf)
	}
	return "en"
}

func OpenPath(path string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", path)
	return cmd.Start()
}

func GetDrives() []DriveInfo {
	var drives []DriveInfo
	getLogicalDrives := kernel32.NewProc("GetLogicalDrives")

	r, _, _ := getLogicalDrives.Call()
	bitmask := uint32(r)

	for i := 0; i < 26; i++ {
		if bitmask&(1<<i) != 0 {
			driveLetter := string(rune('A'+i)) + ":\\"
			u16, err := syscall.UTF16PtrFromString(driveLetter)
			var freeBytes, totalBytes uint64
			isRemovable := false

			if err == nil {
				_, _, _ = procGetDiskFreeSpaceExW.Call(
					uintptr(unsafe.Pointer(u16)),
					uintptr(unsafe.Pointer(&freeBytes)),
					uintptr(unsafe.Pointer(&totalBytes)),
					0,
				)
				dt, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(u16)))
				isRemovable = dt == driveRemovable
			}

			drives = append(drives, DriveInfo{
				Path:        driveLetter,
				Label:       driveLetter,
				FreeBytes:   freeBytes,
				TotalBytes:  totalBytes,
				IsRemovable: isRemovable,
			})
		}
	}
	return drives
}

// MoveToSystemTrash envia o caminho especificado para a Lixeira do Windows via SHFileOperationW.
func MoveToSystemTrash(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	// SHFileOperationW exige string terminada com duplo NUL (\0\0)
	u16, err := syscall.UTF16FromString(abs)
	if err != nil {
		return err
	}
	u16 = append(u16, 0)

	op := shFileOpStructW{
		wFunc:  foDelete,
		pFrom:  &u16[0],
		fFlags: fofAllowUndo | fofNoConfirmation | fofNoErrorUI | fofSilent,
	}

	ret, _, _ := procSHFileOperationW.Call(uintptr(unsafe.Pointer(&op)))
	if ret != 0 {
		return fmt.Errorf("SHFileOperationW failed with code %d", ret)
	}
	if op.fAnyOperationsAborted != 0 {
		return fmt.Errorf("trash operation aborted")
	}
	return nil
}

// NormalizeLongPath adiciona o prefixo \\?\ em caminhos absolutos longos no Windows (>= 240 chars).
func NormalizeLongPath(path string) string {
	if strings.HasPrefix(path, `\\?\`) {
		return path
	}
	if len(path) < 240 {
		return path
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	if strings.HasPrefix(abs, `\\`) {
		return `\\?\UNC\` + strings.TrimPrefix(abs, `\\`)
	}
	return `\\?\` + abs
}
