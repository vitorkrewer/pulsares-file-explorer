//go:build windows

package platform

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/png"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	clipMu sync.Mutex

	kernel32Clip                   = syscall.NewLazyDLL("kernel32.dll")
	procOpenClipboard              = user32Win.NewProc("OpenClipboard")
	procCloseClipboard             = user32Win.NewProc("CloseClipboard")
	procGetOpenClipboardWindow     = user32Win.NewProc("GetOpenClipboardWindow")
	procEmptyClipboard             = user32Win.NewProc("EmptyClipboard")
	procGetClipboardData           = user32Win.NewProc("GetClipboardData")
	procSetClipboardData           = user32Win.NewProc("SetClipboardData")
	procIsClipboardFormatAvailable = user32Win.NewProc("IsClipboardFormatAvailable")
	procRegisterClipboardFormatW   = user32Win.NewProc("RegisterClipboardFormatW")
	procGetClipboardSequenceNumber = user32Win.NewProc("GetClipboardSequenceNumber")
	procGetAsyncKeyState           = user32Win.NewProc("GetAsyncKeyState")

	procGlobalAlloc  = kernel32Clip.NewProc("GlobalAlloc")
	procGlobalFree   = kernel32Clip.NewProc("GlobalFree")
	procGlobalLock   = kernel32Clip.NewProc("GlobalLock")
	procGlobalUnlock = kernel32Clip.NewProc("GlobalUnlock")
	procGlobalSize   = kernel32Clip.NewProc("GlobalSize")
	procRtlMoveMem   = kernel32Clip.NewProc("RtlMoveMemory")

	procDragQueryFileW = shell32Win.NewProc("DragQueryFileW")
)

const (
	cfDIB         = 8
	cfUnicodeText = 13
	cfHDrop       = 15

	gmemMoveable = 0x0002
	gmemZeroInit = 0x0040
	ghnd         = gmemMoveable | gmemZeroInit

	dropEffectCopy = 1
	dropEffectMove = 2

	vkLButton  = 0x01
	vkSnapshot = 0x2C
)

// isClipboardOrCaptureBusy detecta se outra janela detém o clipboard aberto no momento
// ou se o usuário está no meio de uma captura de tela interativa (PrtScr / arrasto de região como no Lightshot).
func isClipboardOrCaptureBusy() bool {
	owner, _, _ := procGetOpenClipboardWindow.Call()
	if owner != 0 {
		return true
	}
	snapState, _, _ := procGetAsyncKeyState.Call(uintptr(vkSnapshot))
	if (snapState & 0x8000) != 0 {
		return true
	}
	mouseState, _, _ := procGetAsyncKeyState.Call(uintptr(vkLButton))
	if (mouseState & 0x8000) != 0 {
		return true
	}
	return false
}

// withLockedWin32Clipboard garante afinidade estrita de thread OS (LockOSThread) entre
// OpenClipboard e CloseClipboard e serializa o acesso interno para evitar deadlocks
// ou vazamento de lock global no Windows (que congelaria ferramentas como Lightshot).
func withLockedWin32Clipboard(passive bool, fn func() error) (busy bool, err error) {
	clipMu.Lock()
	defer clipMu.Unlock()

	if passive && isClipboardOrCaptureBusy() {
		return true, nil
	}

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	opened := false
	if passive {
		for i := 0; i < 2; i++ {
			if isClipboardOrCaptureBusy() {
				return true, nil
			}
			r, _, _ := procOpenClipboard.Call(0)
			if r != 0 {
				opened = true
				break
			}
			if i == 0 {
				time.Sleep(12 * time.Millisecond)
			}
		}
		if !opened {
			return true, nil
		}
	} else {
		for i := 0; i < 6; i++ {
			r, _, _ := procOpenClipboard.Call(0)
			if r != 0 {
				opened = true
				break
			}
			time.Sleep(15 * time.Millisecond)
		}
		if !opened {
			return false, errors.New("não foi possível abrir a área de transferência do Windows")
		}
	}

	defer procCloseClipboard.Call()
	return false, fn()
}

func registerWin32ClipboardFormat(name string) uint32 {
	ptr, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0
	}
	id, _, _ := procRegisterClipboardFormatW.Call(uintptr(unsafe.Pointer(ptr)))
	return uint32(id)
}

func isFormatAvailable(format uint32) bool {
	if format == 0 {
		return false
	}
	r, _, _ := procIsClipboardFormatAvailable.Call(uintptr(format))
	return r != 0
}

func allocGlobalBytes(data []byte) (uintptr, error) {
	if len(data) == 0 {
		return 0, errors.New("empty clipboard buffer")
	}
	hMem, _, _ := procGlobalAlloc.Call(uintptr(ghnd), uintptr(len(data)))
	if hMem == 0 {
		return 0, errors.New("GlobalAlloc failed")
	}
	ptr, _, _ := procGlobalLock.Call(hMem)
	if ptr == 0 {
		procGlobalFree.Call(hMem)
		return 0, errors.New("GlobalLock failed")
	}
	procRtlMoveMem.Call(ptr, uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)))
	procGlobalUnlock.Call(hMem)
	return hMem, nil
}

func readGlobalBytes(hMem uintptr) []byte {
	if hMem == 0 {
		return nil
	}
	size, _, _ := procGlobalSize.Call(hMem)
	if size == 0 || size > 128*1024*1024 {
		return nil
	}
	ptr, _, _ := procGlobalLock.Call(hMem)
	if ptr == 0 {
		return nil
	}
	defer procGlobalUnlock.Call(hMem)

	buf := make([]byte, int(size))
	procRtlMoveMem.Call(uintptr(unsafe.Pointer(&buf[0])), ptr, size)
	return buf
}

// GetClipboardSequence retorna o contador de sequência nativo do clipboard no Windows.
func GetClipboardSequence() uint64 {
	seq, _, _ := procGetClipboardSequenceNumber.Call()
	return uint64(seq)
}

// SetSystemClipboardFiles escreve arquivos/pastas reais no clipboard do Windows (CF_HDROP + Preferred DropEffect)
// permitindo colar diretamente no Windows Explorer, Área de Trabalho, VS Code, navegadores, etc.
func SetSystemClipboardFiles(paths []string, cut bool) error {
	var cleanPaths []string
	for _, p := range paths {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" || strings.HasPrefix(trimmed, "sftp://") {
			continue
		}
		cleanPaths = append(cleanPaths, filepath.Clean(trimmed))
	}
	if len(cleanPaths) == 0 {
		return nil
	}

	// Montar lista UTF-16LE separada por \0 e encerrada com \0 extra (double-null terminated)
	var u16All []uint16
	for _, cp := range cleanPaths {
		u16, err := syscall.UTF16FromString(cp)
		if err != nil {
			continue
		}
		u16All = append(u16All, u16...)
	}
	u16All = append(u16All, 0) // terminador duplo final

	// DROPFILES struct (20 bytes):
	// pFiles (DWORD = 20), pt.x (LONG = 0), pt.y (LONG = 0), fNC (BOOL = 0), fWide (BOOL = 1)
	dropBytes := make([]byte, 20+len(u16All)*2)
	binary.LittleEndian.PutUint32(dropBytes[0:4], 20)
	binary.LittleEndian.PutUint32(dropBytes[16:20], 1) // fWide = TRUE (UTF-16)
	for i, v := range u16All {
		binary.LittleEndian.PutUint16(dropBytes[20+i*2:20+i*2+2], v)
	}

	effectBuf := make([]byte, 4)
	if cut {
		binary.LittleEndian.PutUint32(effectBuf, dropEffectMove)
	} else {
		binary.LittleEndian.PutUint32(effectBuf, dropEffectCopy)
	}

	fmtEffect := registerWin32ClipboardFormat("Preferred DropEffect")

	_, err := withLockedWin32Clipboard(false, func() error {
		hDrop, errAlloc := allocGlobalBytes(dropBytes)
		if errAlloc != nil {
			return errAlloc
		}
		hEffect, errEff := allocGlobalBytes(effectBuf)
		if errEff != nil {
			procGlobalFree.Call(hDrop)
			return errEff
		}

		procEmptyClipboard.Call()

		rDrop, _, _ := procSetClipboardData.Call(uintptr(cfHDrop), hDrop)
		if rDrop == 0 {
			procGlobalFree.Call(hDrop)
			procGlobalFree.Call(hEffect)
			return errors.New("SetClipboardData(CF_HDROP) falhou")
		}

		if fmtEffect != 0 {
			rEff, _, _ := procSetClipboardData.Call(uintptr(fmtEffect), hEffect)
			if rEff == 0 {
				procGlobalFree.Call(hEffect)
			}
		} else {
			procGlobalFree.Call(hEffect)
		}
		return nil
	})
	return err
}

func extractHDropLocked(fmtEffect uint32) ([]string, bool) {
	hDrop, _, _ := procGetClipboardData.Call(uintptr(cfHDrop))
	if hDrop == 0 {
		return nil, false
	}
	count, _, _ := procDragQueryFileW.Call(hDrop, 0xFFFFFFFF, 0, 0)
	if count == 0 {
		return nil, false
	}

	paths := make([]string, 0, int(count))
	for i := uintptr(0); i < count; i++ {
		charLen, _, _ := procDragQueryFileW.Call(hDrop, i, 0, 0)
		if charLen == 0 {
			continue
		}
		buf := make([]uint16, int(charLen)+1)
		procDragQueryFileW.Call(hDrop, i, uintptr(unsafe.Pointer(&buf[0])), charLen+1)
		p := syscall.UTF16ToString(buf)
		if p != "" {
			paths = append(paths, filepath.Clean(p))
		}
	}

	isCut := false
	if fmtEffect != 0 && isFormatAvailable(fmtEffect) {
		hEff, _, _ := procGetClipboardData.Call(uintptr(fmtEffect))
		rawEff := readGlobalBytes(hEff)
		if len(rawEff) >= 4 {
			val := binary.LittleEndian.Uint32(rawEff[:4])
			if (val & dropEffectMove) != 0 {
				isCut = true
			}
		}
	}
	return paths, isCut
}

// GetSystemClipboardFiles lê arquivos copiados/recortados no Windows Explorer (CF_HDROP).
func GetSystemClipboardFiles() ([]string, bool, error) {
	if !isFormatAvailable(cfHDrop) {
		return nil, false, nil
	}
	fmtEffect := registerWin32ClipboardFormat("Preferred DropEffect")

	var paths []string
	var isCut bool
	_, err := withLockedWin32Clipboard(false, func() error {
		if !isFormatAvailable(cfHDrop) {
			return nil
		}
		paths, isCut = extractHDropLocked(fmtEffect)
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return paths, isCut, nil
}

func dibToPNG(dib []byte) ([]byte, int, int, error) {
	if len(dib) < 40 {
		return nil, 0, 0, errors.New("DIB header too small")
	}
	biSize := binary.LittleEndian.Uint32(dib[0:4])
	if biSize < 40 || int(biSize) > len(dib) {
		return nil, 0, 0, errors.New("invalid BITMAPINFOHEADER size")
	}
	width := int(int32(binary.LittleEndian.Uint32(dib[4:8])))
	rawHeight := int(int32(binary.LittleEndian.Uint32(dib[8:12])))
	bitCount := binary.LittleEndian.Uint16(dib[14:16])
	compression := binary.LittleEndian.Uint32(dib[16:20])
	clrUsed := binary.LittleEndian.Uint32(dib[32:36])

	topDown := false
	height := rawHeight
	if rawHeight < 0 {
		topDown = true
		height = -rawHeight
	}
	if width <= 0 || height <= 0 || width > 16384 || height > 16384 {
		return nil, 0, 0, errors.New("unsupported DIB dimensions")
	}
	if bitCount != 24 && bitCount != 32 {
		return nil, 0, 0, errors.New("unsupported DIB bit depth")
	}

	pixelOffset := int(biSize)
	// BI_BITFIELDS (3) ou BI_ALPHABITFIELDS (6) com header clássico de 40 bytes adiciona máscaras DWORD
	if biSize == 40 {
		if compression == 3 {
			pixelOffset += 12
		} else if compression == 6 {
			pixelOffset += 16
		}
	}
	if clrUsed > 0 && clrUsed <= 256 {
		pixelOffset += int(clrUsed) * 4
	}
	if pixelOffset >= len(dib) {
		return nil, 0, 0, errors.New("DIB pixel offset out of range")
	}

	bytesPerPixel := int(bitCount / 8)
	stride := ((width*bytesPerPixel + 3) / 4) * 4
	if pixelOffset+stride*height > len(dib) {
		return nil, 0, 0, errors.New("DIB truncated pixel buffer")
	}

	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	// Verificar se canal alpha no 32-bit é totalmente zero (comum em capturas GDI/Lightshot via CF_BITMAP)
	hasNonZeroAlpha := false
	if bitCount == 32 {
		for y := 0; y < height && !hasNonZeroAlpha; y++ {
			rowStart := pixelOffset + y*stride
			for x := 0; x < width; x++ {
				if dib[rowStart+x*4+3] != 0 {
					hasNonZeroAlpha = true
					break
				}
			}
		}
	}

	for y := 0; y < height; y++ {
		srcY := height - 1 - y
		if topDown {
			srcY = y
		}
		rowStart := pixelOffset + srcY*stride
		dstRow := y * img.Stride
		for x := 0; x < width; x++ {
			px := rowStart + x*bytesPerPixel
			b := dib[px]
			g := dib[px+1]
			r := dib[px+2]
			a := byte(255)
			if bitCount == 32 && hasNonZeroAlpha {
				a = dib[px+3]
			}
			di := dstRow + x*4
			img.Pix[di] = r
			img.Pix[di+1] = g
			img.Pix[di+2] = b
			img.Pix[di+3] = a
		}
	}

	var out bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(&out, img); err != nil {
		return nil, 0, 0, err
	}
	return out.Bytes(), width, height, nil
}

func imageToDIB(img image.Image) []byte {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	if w <= 0 || h <= 0 {
		return nil
	}
	stride := w * 4
	buf := make([]byte, 40+stride*h)
	binary.LittleEndian.PutUint32(buf[0:4], 40) // biSize
	binary.LittleEndian.PutUint32(buf[4:8], uint32(int32(w)))
	binary.LittleEndian.PutUint32(buf[8:12], uint32(int32(h))) // bottom-up
	binary.LittleEndian.PutUint16(buf[12:14], 1)               // biPlanes
	binary.LittleEndian.PutUint16(buf[14:16], 32)              // biBitCount = 32
	binary.LittleEndian.PutUint32(buf[16:20], 0)               // BI_RGB
	binary.LittleEndian.PutUint32(buf[20:24], uint32(stride*h))

	for y := 0; y < h; y++ {
		dstY := h - 1 - y
		rowOff := 40 + dstY*stride
		for x := 0; x < w; x++ {
			c := color.NRGBAModel.Convert(img.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA)
			px := rowOff + x*4
			buf[px] = c.B
			buf[px+1] = c.G
			buf[px+2] = c.R
			buf[px+3] = c.A
		}
	}
	return buf
}

// SetSystemClipboardImagePNG grava uma imagem PNG no clipboard nativo do Windows (formatos PNG + CF_DIB).
func SetSystemClipboardImagePNG(pngBytes []byte) error {
	if len(pngBytes) == 0 {
		return errors.New("empty PNG data")
	}
	img, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		return err
	}
	dibBytes := imageToDIB(img)
	if len(dibBytes) == 0 {
		return errors.New("failed to convert PNG to DIB")
	}

	fmtPNG := registerWin32ClipboardFormat("PNG")

	_, err = withLockedWin32Clipboard(false, func() error {
		hDIB, errAlloc := allocGlobalBytes(dibBytes)
		if errAlloc != nil {
			return errAlloc
		}
		hPNG, errPNG := allocGlobalBytes(pngBytes)

		procEmptyClipboard.Call()

		rDIB, _, _ := procSetClipboardData.Call(uintptr(cfDIB), hDIB)
		if rDIB == 0 {
			procGlobalFree.Call(hDIB)
		}

		if fmtPNG != 0 && errPNG == nil && hPNG != 0 {
			rPNG, _, _ := procSetClipboardData.Call(uintptr(fmtPNG), hPNG)
			if rPNG == 0 {
				procGlobalFree.Call(hPNG)
			}
		} else if errPNG == nil && hPNG != 0 {
			procGlobalFree.Call(hPNG)
		}
		return nil
	})
	return err
}

// ReadSystemClipboardSnapshot inspeciona o clipboard nativo do Windows (arquivos CF_HDROP, imagens PNG/DIB ou texto Unicode)
// mantendo o lock Win32 aberto apenas durante a cópia bruta em memória (< 1ms) e processando PNG/DIB fora do lock.
func ReadSystemClipboardSnapshot() (*SystemClipboardSnapshot, error) {
	seq := GetClipboardSequence()
	snap := &SystemClipboardSnapshot{Sequence: seq}

	if isClipboardOrCaptureBusy() {
		snap.Busy = true
		return snap, nil
	}

	fmtPNG := registerWin32ClipboardFormat("PNG")
	fmtEffect := registerWin32ClipboardFormat("Preferred DropEffect")

	hasHDrop := isFormatAvailable(cfHDrop)
	hasPNG := fmtPNG != 0 && isFormatAvailable(fmtPNG)
	hasDIB := isFormatAvailable(cfDIB)
	hasText := isFormatAvailable(cfUnicodeText)

	if !hasHDrop && !hasPNG && !hasDIB && !hasText {
		return snap, nil
	}

	var (
		paths   []string
		isCut   bool
		rawPNG  []byte
		rawDIB  []byte
		rawText []byte
	)

	busy, err := withLockedWin32Clipboard(true, func() error {
		if isFormatAvailable(cfHDrop) {
			paths, isCut = extractHDropLocked(fmtEffect)
			if len(paths) > 0 {
				return nil
			}
		}
		if fmtPNG != 0 && isFormatAvailable(fmtPNG) {
			hPNG, _, _ := procGetClipboardData.Call(uintptr(fmtPNG))
			rawPNG = readGlobalBytes(hPNG)
		}
		if len(rawPNG) == 0 && isFormatAvailable(cfDIB) {
			hDIB, _, _ := procGetClipboardData.Call(uintptr(cfDIB))
			rawDIB = readGlobalBytes(hDIB)
		}
		if len(rawPNG) == 0 && len(rawDIB) == 0 && isFormatAvailable(cfUnicodeText) {
			hTxt, _, _ := procGetClipboardData.Call(uintptr(cfUnicodeText))
			rawText = readGlobalBytes(hTxt)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if busy {
		snap.Busy = true
		return snap, nil
	}

	// Processamento pesado (PNG/DIB/UTF-16/Base64) ocorre 100% FORA do OpenClipboard e FORA de LockOSThread!
	if len(paths) > 0 {
		snap.Kind = "files"
		snap.Paths = paths
		snap.Cut = isCut
		return snap, nil
	}

	if len(rawPNG) > 0 {
		if cfg, errCfg := png.DecodeConfig(bytes.NewReader(rawPNG)); errCfg == nil {
			snap.Kind = "image"
			snap.ImageB64 = "data:image/png;base64," + base64.StdEncoding.EncodeToString(rawPNG)
			snap.Width = cfg.Width
			snap.Height = cfg.Height
			return snap, nil
		}
	}

	if len(rawDIB) > 0 {
		if encoded, dw, dh, errDIB := dibToPNG(rawDIB); errDIB == nil && len(encoded) > 0 {
			snap.Kind = "image"
			snap.ImageB64 = "data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded)
			snap.Width = dw
			snap.Height = dh
			return snap, nil
		}
	}

	if len(rawText) >= 2 {
		u16 := make([]uint16, len(rawText)/2)
		for i := 0; i < len(u16); i++ {
			u16[i] = binary.LittleEndian.Uint16(rawText[i*2 : i*2+2])
		}
		txt := syscall.UTF16ToString(u16)
		if strings.TrimSpace(txt) != "" {
			snap.Kind = "text"
			snap.Text = txt
			return snap, nil
		}
	}

	return snap, nil
}
