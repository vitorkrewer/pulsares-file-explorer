//go:build windows

package platform

import (
	_ "embed"
	"os"
	"path/filepath"
	"strconv"
	"strings"
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
	user32Win                     = syscall.NewLazyDLL("user32.dll")
	shell32Win                    = syscall.NewLazyDLL("shell32.dll")
	procFindWindowW               = user32Win.NewProc("FindWindowW")
	procEnumWindows               = user32Win.NewProc("EnumWindows")
	procGetWindowThreadProcessId  = user32Win.NewProc("GetWindowThreadProcessId")
	procIsWindowVisible           = user32Win.NewProc("IsWindowVisible")
	procShowWindow                = user32Win.NewProc("ShowWindow")
	procSetForegroundWindow       = user32Win.NewProc("SetForegroundWindow")
	procSendMessageW              = user32Win.NewProc("SendMessageW")
	procLoadImageW                = user32Win.NewProc("LoadImageW")
	procGetSystemMetrics          = user32Win.NewProc("GetSystemMetrics")
	procSetClassLongPtrW          = user32Win.NewProc("SetClassLongPtrW")
	procGetThreadDesktop          = user32Win.NewProc("GetThreadDesktop")
	procGetUserObjectInformationW = user32Win.NewProc("GetUserObjectInformationW")
	procSetAppUserModelID         = shell32Win.NewProc("SetCurrentProcessExplicitAppUserModelID")
	procGetCurrentThreadId        = kernel32.NewProc("GetCurrentThreadId")
	procGetCommandLineW           = kernel32.NewProc("GetCommandLineW")
	procCreateJobObjectW          = kernel32.NewProc("CreateJobObjectW")
	procSetInformationJobObject   = kernel32.NewProc("SetInformationJobObject")
	procAssignProcessToJobObject  = kernel32.NewProc("AssignProcessToJobObject")
)

type jobObjectBasicLimitInformation struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

type ioCounters struct {
	ReadOperationCount  uint64
	WriteOperationCount uint64
	OtherOperationCount uint64
	ReadTransferCount   uint64
	WriteTransferCount  uint64
	OtherTransferCount  uint64
}

type jobObjectExtendedLimitInformation struct {
	BasicLimitInformation jobObjectBasicLimitInformation
	IoInfo                ioCounters
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

func currentThreadDesktopName() string {
	tid, _, _ := procGetCurrentThreadId.Call()
	if tid == 0 {
		return ""
	}
	hDesk, _, _ := procGetThreadDesktop.Call(tid)
	if hDesk == 0 {
		return ""
	}
	var buf [256]uint16
	var needed uint32
	r, _, _ := procGetUserObjectInformationW.Call(
		hDesk,
		2, // UOI_NAME
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)*2),
		uintptr(unsafe.Pointer(&needed)),
	)
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf[:])
}

// EnsureInteractiveDesktop garante que o processo GUI seja executado no desktop interativo padrão ("WinSta0\Default")
// mesmo quando iniciado a partir de um terminal ou runner em um desktop isolado.
func EnsureInteractiveDesktop() {
	if os.Getenv("PULSARES_DESKTOP_REDIRECTED") == "1" {
		if ppidStr := os.Getenv("PULSARES_PARENT_PID"); ppidStr != "" {
			if ppid, err := strconv.ParseUint(ppidStr, 10, 32); err == nil && ppid > 0 {
				go func(parentPID uint32) {
					const synchronize = 0x00100000
					hParent, err := syscall.OpenProcess(synchronize, false, parentPID)
					if err != nil || hParent == 0 {
						return
					}
					defer syscall.CloseHandle(hParent)
					_, _ = syscall.WaitForSingleObject(hParent, syscall.INFINITE)
					os.Exit(0)
				}(uint32(ppid))
			}
		}
		return
	}
	desk := currentThreadDesktopName()
	if desk == "" || strings.EqualFold(desk, "Default") {
		return
	}

	exePath, err := os.Executable()
	if err != nil {
		return
	}
	_ = os.Setenv("PULSARES_DESKTOP_REDIRECTED", "1")
	_ = os.Setenv("PULSARES_PARENT_PID", strconv.Itoa(os.Getpid()))

	appPtr, err := syscall.UTF16PtrFromString(exePath)
	if err != nil {
		return
	}

	var cmdLine []uint16
	rawCmd, _, _ := procGetCommandLineW.Call()
	if rawCmd != 0 {
		// Copia a command line original para buffer gravável exigido por CreateProcessW
		s := syscall.UTF16ToString((*[32768]uint16)(unsafe.Pointer(rawCmd))[:])
		cmdLine, _ = syscall.UTF16FromString(s)
	}
	var cmdPtr *uint16
	if len(cmdLine) > 0 {
		cmdPtr = &cmdLine[0]
	}

	var workDirPtr *uint16
	if wd, err := os.Getwd(); err == nil && wd != "" {
		workDirPtr, _ = syscall.UTF16PtrFromString(wd)
	}

	desktopPtr, err := syscall.UTF16PtrFromString(`WinSta0\Default`)
	if err != nil {
		return
	}

	var si syscall.StartupInfo
	si.Cb = uint32(unsafe.Sizeof(si))
	si.Desktop = desktopPtr
	si.Flags = syscall.STARTF_USESTDHANDLES | syscall.STARTF_USESHOWWINDOW
	si.ShowWindow = syscall.SW_SHOWNORMAL
	si.StdInput = syscall.Handle(os.Stdin.Fd())
	si.StdOutput = syscall.Handle(os.Stdout.Fd())
	si.StdErr = syscall.Handle(os.Stderr.Fd())

	var pi syscall.ProcessInformation
	if err := syscall.CreateProcess(appPtr, cmdPtr, nil, nil, true, 0, nil, workDirPtr, &si, &pi); err != nil {
		return
	}

	// Vincula a um Job Object com KILL_ON_JOB_CLOSE para que hot-reloads do wails dev encerrem a janela filha
	if hJob, _, _ := procCreateJobObjectW.Call(0, 0); hJob != 0 {
		var extInfo jobObjectExtendedLimitInformation
		extInfo.BasicLimitInformation.LimitFlags = 0x2000 // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
		_, _, _ = procSetInformationJobObject.Call(
			hJob,
			9, // JobObjectExtendedLimitInformation
			uintptr(unsafe.Pointer(&extInfo)),
			unsafe.Sizeof(extInfo),
		)
		_, _, _ = procAssignProcessToJobObject.Call(hJob, uintptr(pi.Process))
	}

	_, _ = syscall.WaitForSingleObject(pi.Process, syscall.INFINITE)
	var exitCode uint32
	_ = syscall.GetExitCodeProcess(pi.Process, &exitCode)
	_ = syscall.CloseHandle(pi.Thread)
	_ = syscall.CloseHandle(pi.Process)
	os.Exit(int(exitCode))
}

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
				time.Sleep(350 * time.Millisecond)
				if vis, _, _ := procIsWindowVisible.Call(hwnd); vis == 0 {
					procShowWindow.Call(hwnd, 5) // SW_SHOW
				}
				procSetForegroundWindow.Call(hwnd)
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
				var pid uint32
				procGetWindowThreadProcessId.Call(r, uintptr(unsafe.Pointer(&pid)))
				if pid == currentPID {
					return r
				}
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
