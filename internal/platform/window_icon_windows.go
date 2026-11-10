//go:build windows

package platform

import (
	_ "embed"
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

//go:embed icons/icon-explorer.ico
var iconExplorerICO []byte

//go:embed icons/icon-dbstudio.ico
var iconDBStudioICO []byte

//go:embed icons/icon-studio.ico
var iconStudioICO []byte

var (
	user32Win                    = syscall.NewLazyDLL("user32.dll")
	shell32Win                   = syscall.NewLazyDLL("shell32.dll")
	procFindWindowW              = user32Win.NewProc("FindWindowW")
	procEnumWindows              = user32Win.NewProc("EnumWindows")
	procGetWindowThreadProcessId = user32Win.NewProc("GetWindowThreadProcessId")
	procIsWindowVisible          = user32Win.NewProc("IsWindowVisible")
	procSendMessageW             = user32Win.NewProc("SendMessageW")
	procLoadImageW               = user32Win.NewProc("LoadImageW")
	procGetSystemMetrics         = user32Win.NewProc("GetSystemMetrics")
	procSetClassLongPtrW         = user32Win.NewProc("SetClassLongPtrW")
	procSetAppUserModelID        = shell32Win.NewProc("SetCurrentProcessExplicitAppUserModelID")
)

// SetWindowsAppID define o AppUserModelID explícito do processo no Windows.
func SetWindowsAppID(appID string) {
	if procSetAppUserModelID.Find() == nil {
		ptr, err := syscall.UTF16PtrFromString(appID)
		if err == nil {
			_, _, _ = procSetAppUserModelID.Call(uintptr(unsafe.Pointer(ptr)))
		}
	}
}

const (
	imageIcon      = 1
	lrLoadFromFile = 0x0010
	wmSetIcon      = 0x0080
	iconSmall      = 0
	iconBig        = 1
	smCxIcon       = 11
	smCyIcon       = 12
	smCxSmIcon     = 49
	smCySmIcon     = 50
)

var (
	gclpHicon   = ^uintptr(13) // -14 em complemento de dois
	gclpHiconSm = ^uintptr(33) // -34 em complemento de dois
)

// ApplyWindowIcon aplica o ícone do módulo correspondente na janela Win32.
// Executa em goroutine para aguardar a criação assíncrona da janela pelo Wails.
func ApplyWindowIcon(windowClass string, iconType string) {
	var icoBytes []byte
	switch iconType {
	case "dbstudio":
		icoBytes = iconDBStudioICO
	case "studio":
		icoBytes = iconStudioICO
	default:
		icoBytes = iconExplorerICO
	}

	if len(icoBytes) == 0 {
		return
	}

	go func() {
		// 1. Grava o arquivo ICO em cache temporário local
		tempPath := filepath.Join(os.TempDir(), "pulsares_"+iconType+".ico")
		_ = os.WriteFile(tempPath, icoBytes, 0644)

		u16Path, err := syscall.UTF16PtrFromString(tempPath)
		if err != nil {
			return
		}

		// Obtém dimensões nativas do sistema (respeita High DPI / escala do Windows)
		cxBig, _, _ := procGetSystemMetrics.Call(uintptr(smCxIcon))
		cyBig, _, _ := procGetSystemMetrics.Call(uintptr(smCyIcon))
		if cxBig == 0 || cyBig == 0 {
			cxBig, cyBig = 32, 32
		}

		cxSmall, _, _ := procGetSystemMetrics.Call(uintptr(smCxSmIcon))
		cySmall, _, _ := procGetSystemMetrics.Call(uintptr(smCySmIcon))
		if cxSmall == 0 || cySmall == 0 {
			cxSmall, cySmall = 16, 16
		}

		// Carrega HICONs nativos para tamanho grande e pequeno
		hBig, _, _ := procLoadImageW.Call(
			0,
			uintptr(unsafe.Pointer(u16Path)),
			uintptr(imageIcon),
			cxBig,
			cyBig,
			uintptr(lrLoadFromFile),
		)

		hSmall, _, _ := procLoadImageW.Call(
			0,
			uintptr(unsafe.Pointer(u16Path)),
			uintptr(imageIcon),
			cxSmall,
			cySmall,
			uintptr(lrLoadFromFile),
		)

		// 2. Aguarda até a janela ser criada e obter seu HWND (até 5 segundos)
		currentPID := uint32(os.Getpid())
		deadline := time.Now().Add(5 * time.Second)

		for time.Now().Before(deadline) {
			hwnd := findWindowByClassOrPID(windowClass, currentPID)
			if hwnd != 0 {
				if hBig != 0 {
					procSendMessageW.Call(hwnd, uintptr(wmSetIcon), uintptr(iconBig), hBig)
					if procSetClassLongPtrW.Find() == nil {
						procSetClassLongPtrW.Call(hwnd, uintptr(gclpHicon), hBig)
					}
				}
				if hSmall != 0 {
					procSendMessageW.Call(hwnd, uintptr(wmSetIcon), uintptr(iconSmall), hSmall)
					if procSetClassLongPtrW.Find() == nil {
						procSetClassLongPtrW.Call(hwnd, uintptr(gclpHiconSm), hSmall)
					}
				}
				return
			}
			time.Sleep(60 * time.Millisecond)
		}
	}()
}

func findWindowByClassOrPID(windowClass string, currentPID uint32) uintptr {
	if windowClass != "" {
		u16Class, err := syscall.UTF16PtrFromString(windowClass)
		if err == nil {
			r, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(u16Class)), 0)
			if r != 0 {
				return r
			}
		}
	}

	// Fallback por enumeração de janelas visíveis pertencentes ao processo atual
	var foundHWND uintptr
	cb := syscall.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		var pid uint32
		procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		if pid == currentPID {
			vis, _, _ := procIsWindowVisible.Call(hwnd)
			if vis != 0 {
				foundHWND = hwnd
				return 0 // Interrompe enumeração
			}
		}
		return 1 // Continua
	})

	procEnumWindows.Call(cb, 0)
	return foundHWND
}
