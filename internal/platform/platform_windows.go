//go:build windows

package platform

import (
	"os/exec"
	"syscall"
	"unsafe"
)

var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	procGetUserDefaultLocale = kernel32.NewProc("GetUserDefaultLocaleName")
)

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
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getLogicalDrives := kernel32.NewProc("GetLogicalDrives")

	r, _, _ := getLogicalDrives.Call()
	bitmask := uint32(r)

	for i := 0; i < 26; i++ {
		if bitmask&(1<<i) != 0 {
			driveLetter := string(rune('A'+i)) + ":\\"
			drives = append(drives, DriveInfo{
				Path:  driveLetter,
				Label: driveLetter,
			})
		}
	}
	return drives
}

