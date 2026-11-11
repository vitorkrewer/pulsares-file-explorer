//go:build windows

package platform

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	modVersion                  = syscall.NewLazyDLL("version.dll")
	modAdvapi32                 = syscall.NewLazyDLL("advapi32.dll")
	procGetFileVersionInfoSizeW = modVersion.NewProc("GetFileVersionInfoSizeW")
	procGetFileVersionInfoW     = modVersion.NewProc("GetFileVersionInfoW")
	procVerQueryValueW          = modVersion.NewProc("VerQueryValueW")
	procRegEnumValueW           = modAdvapi32.NewProc("RegEnumValueW")
)

var knownFriendlyNames = map[string]string{
	"notepad.exe":      "Bloco de Notas (Notepad)",
	"notepad++.exe":    "Notepad++",
	"write.exe":        "WordPad",
	"wordpad.exe":      "WordPad",
	"mspaint.exe":      "Paint",
	"msedge.exe":       "Microsoft Edge",
	"chrome.exe":       "Google Chrome",
	"firefox.exe":      "Mozilla Firefox",
	"brave.exe":        "Brave Browser",
	"opera.exe":        "Opera Browser",
	"wmplayer.exe":     "Windows Media Player",
	"vlc.exe":          "VLC Media Player",
	"mpc-hc64.exe":     "Media Player Classic",
	"7zfm.exe":         "7-Zip File Manager",
	"winrar.exe":       "WinRAR",
	"excel.exe":        "Microsoft Excel",
	"winword.exe":      "Microsoft Word",
	"powerpnt.exe":     "Microsoft PowerPoint",
	"scalc.exe":        "LibreOffice Calc",
	"swriter.exe":      "LibreOffice Writer",
	"simpress.exe":     "LibreOffice Impress",
	"soffice.exe":      "LibreOffice",
	"acrord32.exe":     "Adobe Acrobat Reader",
	"acrobat.exe":      "Adobe Acrobat",
	"sumatrapdf.exe":   "SumatraPDF",
	"gimp-2.10.exe":    "GIMP",
	"inkscape.exe":     "Inkscape",
	"subl.exe":         "Sublime Text",
	"sublime_text.exe": "Sublime Text",
	"devenv.exe":       "Visual Studio",
}

var ignoredWrapperExes = map[string]bool{
	"rundll32.exe":             true,
	"dllhost.exe":              true,
	"openwith.exe":             true,
	"launchwinapp.exe":         true,
	"applicationframehost.exe": true,
	"searchprotocolhost.exe":   true,
	"conhost.exe":              true,
	"cmd.exe":                  true,
	"powershell.exe":           true,
	"pwsh.exe":                 true,
	"wscript.exe":              true,
	"cscript.exe":              true,
	"explorer.exe":             true,
}

func regOpenKey(root syscall.Handle, subKey string, access uint32) (syscall.Handle, error) {
	subKeyPtr, err := syscall.UTF16PtrFromString(subKey)
	if err != nil {
		return 0, err
	}
	var h syscall.Handle
	if err := syscall.RegOpenKeyEx(root, subKeyPtr, 0, access, &h); err != nil {
		return 0, err
	}
	return h, nil
}

func regGetStringValue(h syscall.Handle, valueName string) (string, error) {
	var namePtr *uint16
	if valueName != "" {
		var err error
		namePtr, err = syscall.UTF16PtrFromString(valueName)
		if err != nil {
			return "", err
		}
	}
	var valType uint32
	var bufLen uint32
	if err := syscall.RegQueryValueEx(h, namePtr, nil, &valType, nil, &bufLen); err != nil {
		return "", err
	}
	if bufLen == 0 || (valType != syscall.REG_SZ && valType != syscall.REG_EXPAND_SZ) {
		return "", fmt.Errorf("not a string value")
	}
	buf := make([]uint16, bufLen/2+1)
	if err := syscall.RegQueryValueEx(h, namePtr, nil, &valType, (*byte)(unsafe.Pointer(&buf[0])), &bufLen); err != nil {
		return "", err
	}
	return syscall.UTF16ToString(buf), nil
}

func regReadValueNames(h syscall.Handle) []string {
	var out []string
	buf := make([]uint16, 512)
	for index := uint32(0); index < 256; index++ {
		nameLen := uint32(len(buf))
		r0, _, _ := procRegEnumValueW.Call(
			uintptr(h),
			uintptr(index),
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(unsafe.Pointer(&nameLen)),
			0,
			0,
			0,
			0,
		)
		if r0 != 0 {
			break
		}
		name := syscall.UTF16ToString(buf[:nameLen])
		if name != "" {
			out = append(out, name)
		}
	}
	return out
}

func regReadSubKeyNames(h syscall.Handle) []string {
	var out []string
	buf := make([]uint16, 512)
	for index := uint32(0); index < 256; index++ {
		nameLen := uint32(len(buf))
		err := syscall.RegEnumKeyEx(h, index, &buf[0], &nameLen, nil, nil, nil, nil)
		if err != nil {
			break
		}
		name := syscall.UTF16ToString(buf[:nameLen])
		if name != "" {
			out = append(out, name)
		}
	}
	return out
}

// ListOpenWithApps descobre os aplicativos instalados no Windows capazes de abrir o arquivo informado.
func ListOpenWithApps(targetPath string) ([]OpenWithApp, error) {
	clean := strings.TrimSpace(targetPath)
	if clean == "" {
		return nil, fmt.Errorf("empty target path")
	}

	ext := strings.ToLower(filepath.Ext(clean))
	if ext == "" {
		base := strings.ToLower(filepath.Base(clean))
		if base == "dockerfile" || base == "makefile" || base == "readme" || base == "license" || strings.HasPrefix(base, ".env") || strings.HasPrefix(base, ".git") {
			ext = ".txt"
		}
	}

	var results []OpenWithApp
	seenExes := make(map[string]int) // lower(clean(exePath)) -> index in results

	addCandidate := func(exePath string, command string, isDefault bool, progIDHint string) {
		exePath = strings.TrimSpace(exePath)
		if exePath == "" {
			return
		}
		resolvedExe := resolveExecutablePath(exePath)
		if resolvedExe == "" {
			return
		}
		baseLower := strings.ToLower(filepath.Base(resolvedExe))
		if ignoredWrapperExes[baseLower] {
			return
		}
		if strings.Contains(baseLower, "pulsares") || baseLower == "code.exe" || baseLower == "codium.exe" {
			return
		}

		key := strings.ToLower(filepath.Clean(resolvedExe))
		if idx, exists := seenExes[key]; exists {
			if isDefault && !results[idx].IsDefault {
				results[idx].IsDefault = true
			}
			if results[idx].Command == "" && command != "" {
				results[idx].Command = command
			}
			return
		}

		name := resolveFriendlyAppName(resolvedExe, progIDHint)
		if name == "" {
			name = strings.TrimSuffix(filepath.Base(resolvedExe), filepath.Ext(resolvedExe))
		}
		if command == "" {
			command = fmt.Sprintf(`"%s" "%%1"`, resolvedExe)
		}

		seenExes[key] = len(results)
		results = append(results, OpenWithApp{
			ID:        baseLower,
			Name:      name,
			ExePath:   resolvedExe,
			Command:   command,
			IsDefault: isDefault,
		})
	}

	addFromProgID := func(progID string, isDefault bool) {
		progID = strings.TrimSpace(progID)
		if progID == "" {
			return
		}
		cmdStr := queryProgIDCommand(progID)
		if cmdStr == "" {
			return
		}
		exePath := extractExeFromCommand(cmdStr)
		if exePath == "" {
			return
		}
		addCandidate(exePath, cmdStr, isDefault, progID)
	}

	addFromExeName := func(exeName string, isDefault bool) {
		exeName = strings.TrimSpace(exeName)
		if exeName == "" {
			return
		}
		if cmdStr := queryApplicationCommand(exeName); cmdStr != "" {
			if exePath := extractExeFromCommand(cmdStr); exePath != "" {
				addCandidate(exePath, cmdStr, isDefault, "")
				return
			}
		}
		if appPath := queryAppPaths(exeName); appPath != "" {
			addCandidate(appPath, "", isDefault, "")
			return
		}
		addCandidate(exeName, "", isDefault, "")
	}

	if ext != "" {
		// 1. Default ProgID via UserChoice e HKCR\.ext
		defaultProgID := queryUserChoiceProgID(ext)
		if defaultProgID != "" {
			addFromProgID(defaultProgID, true)
		}
		if hkcrDefault := queryHKCRDefaultProgID(ext); hkcrDefault != "" {
			isDef := defaultProgID == "" || strings.EqualFold(hkcrDefault, defaultProgID)
			addFromProgID(hkcrDefault, isDef)
		}

		// 2. OpenWithProgids em HKCU, HKCR e SystemFileAssociations
		for _, progID := range queryOpenWithProgIDs(ext) {
			addFromProgID(progID, strings.EqualFold(progID, defaultProgID))
		}

		// 3. OpenWithList em HKCU, HKCR e SystemFileAssociations
		for _, exeName := range queryOpenWithList(ext) {
			addFromExeName(exeName, false)
		}
	}

	// 4. Candidatos conhecidos instalados no sistema de acordo com a categoria da extensão
	for _, candExe := range categoryCandidateExes(ext) {
		addFromExeName(candExe, false)
	}

	// Ordena garantindo que o aplicativo padrão fique no topo da lista
	if len(results) > 1 {
		var defaults []OpenWithApp
		var others []OpenWithApp
		for _, item := range results {
			if item.IsDefault {
				defaults = append(defaults, item)
			} else {
				others = append(others, item)
			}
		}
		results = append(defaults, others...)
	}

	return results, nil
}

// OpenFileWithApp abre o arquivo informado utilizando o executável ou template de comando escolhido.
func OpenFileWithApp(targetPath string, appExeOrCommand string) error {
	cleanTarget := filepath.Clean(strings.TrimSpace(targetPath))
	if cleanTarget == "" {
		return fmt.Errorf("empty target path")
	}
	spec := strings.TrimSpace(appExeOrCommand)
	if spec == "" {
		return fmt.Errorf("empty application command or path")
	}

	if info, err := os.Stat(spec); err == nil && !info.IsDir() {
		cmd := exec.Command(spec, cleanTarget)
		return cmd.Start()
	}

	expanded := expandWindowsEnvVars(spec)
	if info, err := os.Stat(expanded); err == nil && !info.IsDir() {
		cmd := exec.Command(expanded, cleanTarget)
		return cmd.Start()
	}

	tokens := splitCommandLine(expanded)
	if len(tokens) == 0 {
		return fmt.Errorf("invalid application command: %s", spec)
	}

	exePath := resolveExecutablePath(tokens[0])
	if exePath == "" {
		exePath = tokens[0]
	}

	var args []string
	replacedTarget := false
	for _, tok := range tokens[1:] {
		upper := strings.ToUpper(tok)
		if upper == "%*" || upper == "%2" || upper == "%3" || upper == "%4" {
			continue
		}
		if strings.Contains(tok, "%1") || strings.Contains(upper, "%L") || strings.Contains(upper, "%V") {
			replaced := tok
			replaced = strings.ReplaceAll(replaced, "%1", cleanTarget)
			replaced = strings.ReplaceAll(replaced, "%L", cleanTarget)
			replaced = strings.ReplaceAll(replaced, "%l", cleanTarget)
			replaced = strings.ReplaceAll(replaced, "%V", cleanTarget)
			replaced = strings.ReplaceAll(replaced, "%v", cleanTarget)
			replaced = strings.Trim(replaced, `"`)
			args = append(args, replaced)
			replacedTarget = true
		} else if strings.HasPrefix(upper, "/DDE") || strings.HasPrefix(upper, "-DDE") {
			continue
		} else {
			args = append(args, tok)
		}
	}
	if !replacedTarget {
		args = append(args, cleanTarget)
	}

	cmd := exec.Command(exePath, args...)
	return cmd.Start()
}

func queryUserChoiceProgID(ext string) string {
	keyPath := `Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\` + ext + `\UserChoice`
	k, err := regOpenKey(syscall.HKEY_CURRENT_USER, keyPath, syscall.KEY_QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer syscall.RegCloseKey(k)
	val, err := regGetStringValue(k, "ProgId")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(val)
}

func queryHKCRDefaultProgID(ext string) string {
	k, err := regOpenKey(syscall.HKEY_CLASSES_ROOT, ext, syscall.KEY_QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer syscall.RegCloseKey(k)
	val, err := regGetStringValue(k, "")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(val)
}

func queryPerceivedType(ext string) string {
	k, err := regOpenKey(syscall.HKEY_CLASSES_ROOT, ext, syscall.KEY_QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer syscall.RegCloseKey(k)
	val, err := regGetStringValue(k, "PerceivedType")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.ToLower(val))
}

func queryOpenWithProgIDs(ext string) []string {
	var out []string
	seen := make(map[string]bool)
	add := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" {
			return
		}
		low := strings.ToLower(v)
		if !seen[low] {
			seen[low] = true
			out = append(out, v)
		}
	}

	readKeyProgIDs := func(root syscall.Handle, path string) {
		k, err := regOpenKey(root, path, syscall.KEY_QUERY_VALUE)
		if err != nil {
			return
		}
		defer syscall.RegCloseKey(k)
		for _, name := range regReadValueNames(k) {
			add(name)
		}
	}

	readKeyProgIDs(syscall.HKEY_CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\`+ext+`\OpenWithProgids`)
	readKeyProgIDs(syscall.HKEY_CLASSES_ROOT, ext+`\OpenWithProgids`)
	readKeyProgIDs(syscall.HKEY_CLASSES_ROOT, `SystemFileAssociations\`+ext+`\OpenWithProgids`)

	if perceived := queryPerceivedType(ext); perceived != "" {
		readKeyProgIDs(syscall.HKEY_CLASSES_ROOT, `SystemFileAssociations\`+perceived+`\OpenWithProgids`)
	}

	return out
}

func queryOpenWithList(ext string) []string {
	var out []string
	seen := make(map[string]bool)
	add := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" || len(v) <= 2 || !strings.HasSuffix(strings.ToLower(v), ".exe") {
			return
		}
		low := strings.ToLower(v)
		if !seen[low] {
			seen[low] = true
			out = append(out, v)
		}
	}

	if k, err := regOpenKey(syscall.HKEY_CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\`+ext+`\OpenWithList`, syscall.KEY_QUERY_VALUE); err == nil {
		mru, _ := regGetStringValue(k, "MRUList")
		for _, ch := range mru {
			if exeName, err := regGetStringValue(k, string(ch)); err == nil {
				add(exeName)
			}
		}
		for _, name := range regReadValueNames(k) {
			if strings.EqualFold(name, "MRUList") {
				continue
			}
			if exeName, err := regGetStringValue(k, name); err == nil {
				add(exeName)
			}
		}
		syscall.RegCloseKey(k)
	}

	readSubkeys := func(root syscall.Handle, path string) {
		k, err := regOpenKey(root, path, syscall.KEY_ENUMERATE_SUB_KEYS)
		if err != nil {
			return
		}
		defer syscall.RegCloseKey(k)
		for _, sk := range regReadSubKeyNames(k) {
			add(sk)
		}
	}

	readSubkeys(syscall.HKEY_CLASSES_ROOT, ext+`\OpenWithList`)
	readSubkeys(syscall.HKEY_CLASSES_ROOT, `SystemFileAssociations\`+ext+`\OpenWithList`)
	if perceived := queryPerceivedType(ext); perceived != "" {
		readSubkeys(syscall.HKEY_CLASSES_ROOT, `SystemFileAssociations\`+perceived+`\OpenWithList`)
	}

	return out
}

func queryProgIDCommand(progID string) string {
	verbs := []string{"open", "edit", "play", "print"}
	roots := []struct {
		key    syscall.Handle
		prefix string
	}{
		{syscall.HKEY_CURRENT_USER, `Software\Classes\` + progID + `\shell\`},
		{syscall.HKEY_CLASSES_ROOT, progID + `\shell\`},
	}

	for _, r := range roots {
		for _, verb := range verbs {
			k, err := regOpenKey(r.key, r.prefix+verb+`\command`, syscall.KEY_QUERY_VALUE)
			if err != nil {
				continue
			}
			val, err := regGetStringValue(k, "")
			syscall.RegCloseKey(k)
			if err == nil && strings.TrimSpace(val) != "" {
				return strings.TrimSpace(val)
			}
		}
	}
	return ""
}

func queryApplicationCommand(exeName string) string {
	verbs := []string{"open", "edit", "play"}
	roots := []struct {
		key    syscall.Handle
		prefix string
	}{
		{syscall.HKEY_CURRENT_USER, `Software\Classes\Applications\` + exeName + `\shell\`},
		{syscall.HKEY_CLASSES_ROOT, `Applications\` + exeName + `\shell\`},
	}
	for _, r := range roots {
		for _, verb := range verbs {
			k, err := regOpenKey(r.key, r.prefix+verb+`\command`, syscall.KEY_QUERY_VALUE)
			if err != nil {
				continue
			}
			val, err := regGetStringValue(k, "")
			syscall.RegCloseKey(k)
			if err == nil && strings.TrimSpace(val) != "" {
				return strings.TrimSpace(val)
			}
		}
	}
	return ""
}

func queryAppPaths(exeName string) string {
	for _, root := range []syscall.Handle{syscall.HKEY_CURRENT_USER, syscall.HKEY_LOCAL_MACHINE} {
		k, err := regOpenKey(root, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\`+exeName, syscall.KEY_QUERY_VALUE)
		if err != nil {
			continue
		}
		val, err := regGetStringValue(k, "")
		syscall.RegCloseKey(k)
		if err == nil && strings.TrimSpace(val) != "" {
			clean := strings.Trim(expandWindowsEnvVars(strings.TrimSpace(val)), `"`)
			if info, err := os.Stat(clean); err == nil && !info.IsDir() {
				return clean
			}
		}
	}
	return ""
}

func expandWindowsEnvVars(input string) string {
	if !strings.Contains(input, "%") {
		return input
	}
	out := input
	for {
		start := strings.IndexByte(out, '%')
		if start == -1 {
			break
		}
		end := strings.IndexByte(out[start+1:], '%')
		if end == -1 {
			break
		}
		end += start + 1
		varName := out[start+1 : end]
		if varName == "" || varName == "1" || varName == "*" || strings.EqualFold(varName, "L") || strings.EqualFold(varName, "V") {
			prefix := out[:end+1]
			rest := expandWindowsEnvVars(out[end+1:])
			return prefix + rest
		}
		if envVal := os.Getenv(varName); envVal != "" {
			out = out[:start] + envVal + out[end+1:]
		} else {
			break
		}
	}
	return out
}

func splitCommandLine(cmdLine string) []string {
	var args []string
	var current strings.Builder
	inQuotes := false

	for i := 0; i < len(cmdLine); i++ {
		ch := cmdLine[i]
		switch ch {
		case '"':
			inQuotes = !inQuotes
		case ' ', '\t':
			if inQuotes {
				current.WriteByte(ch)
			} else if current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
			}
		default:
			current.WriteByte(ch)
		}
	}
	if current.Len() > 0 {
		args = append(args, current.String())
	}
	return args
}

func extractExeFromCommand(cmdStr string) string {
	expanded := expandWindowsEnvVars(strings.TrimSpace(cmdStr))
	if expanded == "" {
		return ""
	}
	tokens := splitCommandLine(expanded)
	if len(tokens) == 0 {
		return ""
	}
	first := strings.Trim(tokens[0], `"`)
	if resolved := resolveExecutablePath(first); resolved != "" {
		return resolved
	}
	lower := strings.ToLower(expanded)
	if idx := strings.Index(lower, ".exe"); idx != -1 {
		candidate := strings.Trim(expanded[:idx+4], `" `)
		if resolved := resolveExecutablePath(candidate); resolved != "" {
			return resolved
		}
	}
	return ""
}

func resolveExecutablePath(exeOrPath string) string {
	clean := strings.Trim(expandWindowsEnvVars(strings.TrimSpace(exeOrPath)), `"`)
	if clean == "" {
		return ""
	}
	if filepath.IsAbs(clean) {
		if info, err := os.Stat(clean); err == nil && !info.IsDir() {
			return filepath.Clean(clean)
		}
		return ""
	}
	if appPath := queryAppPaths(clean); appPath != "" {
		return filepath.Clean(appPath)
	}
	if looked, err := exec.LookPath(clean); err == nil && looked != "" {
		if info, err := os.Stat(looked); err == nil && !info.IsDir() {
			return filepath.Clean(looked)
		}
	}
	sysRoot := os.Getenv("SystemRoot")
	if sysRoot == "" {
		sysRoot = `C:\Windows`
	}
	for _, dir := range []string{
		filepath.Join(sysRoot, "System32"),
		sysRoot,
		filepath.Join(os.Getenv("ProgramFiles"), "Windows NT", "Accessories"),
		filepath.Join(os.Getenv("ProgramFiles"), "Windows Media Player"),
	} {
		if dir == "" {
			continue
		}
		cand := filepath.Join(dir, clean)
		if info, err := os.Stat(cand); err == nil && !info.IsDir() {
			return filepath.Clean(cand)
		}
	}
	return ""
}

func resolveFriendlyAppName(exePath string, progIDHint string) string {
	baseLower := strings.ToLower(filepath.Base(exePath))
	if known, ok := knownFriendlyNames[baseLower]; ok {
		return known
	}

	for _, root := range []syscall.Handle{syscall.HKEY_CURRENT_USER, syscall.HKEY_CLASSES_ROOT} {
		prefix := `Applications\` + filepath.Base(exePath)
		if root == syscall.HKEY_CURRENT_USER {
			prefix = `Software\Classes\` + prefix
		}
		if k, err := regOpenKey(root, prefix, syscall.KEY_QUERY_VALUE); err == nil {
			val, err := regGetStringValue(k, "FriendlyAppName")
			syscall.RegCloseKey(k)
			if err == nil && strings.TrimSpace(val) != "" && !strings.HasPrefix(strings.TrimSpace(val), "@") {
				return strings.TrimSpace(val)
			}
		}
	}

	if desc := queryExeVersionDescription(exePath); desc != "" {
		return desc
	}

	if progIDHint != "" {
		if k, err := regOpenKey(syscall.HKEY_CLASSES_ROOT, progIDHint, syscall.KEY_QUERY_VALUE); err == nil {
			val, err := regGetStringValue(k, "FriendlyTypeName")
			syscall.RegCloseKey(k)
			if err == nil && strings.TrimSpace(val) != "" && !strings.HasPrefix(strings.TrimSpace(val), "@") {
				return strings.TrimSpace(val)
			}
		}
	}

	return strings.TrimSuffix(filepath.Base(exePath), filepath.Ext(exePath))
}

func queryExeVersionDescription(exePath string) string {
	pathPtr, err := syscall.UTF16PtrFromString(exePath)
	if err != nil {
		return ""
	}
	var handle uint32
	size, _, _ := procGetFileVersionInfoSizeW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&handle)),
	)
	if size == 0 || size > 4*1024*1024 {
		return ""
	}

	buf := make([]byte, size)
	ret, _, _ := procGetFileVersionInfoW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		0,
		size,
		uintptr(unsafe.Pointer(&buf[0])),
	)
	if ret == 0 {
		return ""
	}

	var transPtr uintptr
	var transLen uint32
	subBlockTrans, _ := syscall.UTF16PtrFromString(`\VarFileInfo\Translation`)
	r, _, _ := procVerQueryValueW.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(subBlockTrans)),
		uintptr(unsafe.Pointer(&transPtr)),
		uintptr(unsafe.Pointer(&transLen)),
	)

	var langCodePages []string
	if r != 0 && transPtr != 0 && transLen >= 4 {
		b := unsafe.Slice((*byte)(unsafe.Pointer(transPtr)), 4)
		lang := binary.LittleEndian.Uint16(b[0:2])
		cp := binary.LittleEndian.Uint16(b[2:4])
		langCodePages = append(langCodePages, fmt.Sprintf("%04x%04x", lang, cp))
	}
	langCodePages = append(langCodePages, "040904b0", "040904e4", "041604b0", "000004b0")

	for _, lcp := range langCodePages {
		for _, field := range []string{"FileDescription", "ProductName"} {
			queryStr := fmt.Sprintf(`\StringFileInfo\%s\%s`, lcp, field)
			qPtr, err := syscall.UTF16PtrFromString(queryStr)
			if err != nil {
				continue
			}
			var valPtr uintptr
			var valLen uint32
			ok, _, _ := procVerQueryValueW.Call(
				uintptr(unsafe.Pointer(&buf[0])),
				uintptr(unsafe.Pointer(qPtr)),
				uintptr(unsafe.Pointer(&valPtr)),
				uintptr(unsafe.Pointer(&valLen)),
			)
			if ok != 0 && valPtr != 0 && valLen > 0 {
				u16 := unsafe.Slice((*uint16)(unsafe.Pointer(valPtr)), valLen)
				str := strings.TrimSpace(syscall.UTF16ToString(u16))
				if str != "" {
					return str
				}
			}
		}
	}
	return ""
}

func categoryCandidateExes(ext string) []string {
	ext = strings.ToLower(strings.TrimSpace(ext))
	switch ext {
	case ".txt", ".md", ".markdown", ".mdx", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env", ".log", ".sql",
		".go", ".py", ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".less", ".xml", ".sh", ".bat", ".cmd", ".ps1",
		".c", ".cpp", ".h", ".hpp", ".rs", ".java", ".kt", ".cs", ".php", ".rb", ".lua":
		return []string{"notepad.exe", "notepad++.exe", "subl.exe", "write.exe"}
	case ".html", ".htm", ".xhtml":
		return []string{"msedge.exe", "chrome.exe", "firefox.exe", "brave.exe", "notepad.exe", "notepad++.exe"}
	case ".svg":
		return []string{"msedge.exe", "chrome.exe", "firefox.exe", "brave.exe", "inkscape.exe", "notepad.exe"}
	case ".pdf":
		return []string{"msedge.exe", "chrome.exe", "firefox.exe", "brave.exe", "Acrobat.exe", "AcroRd32.exe", "SumatraPDF.exe"}
	case ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".tif", ".tiff":
		return []string{"mspaint.exe", "msedge.exe", "chrome.exe", "firefox.exe"}
	case ".csv", ".tsv":
		return []string{"EXCEL.EXE", "scalc.exe", "notepad.exe", "notepad++.exe"}
	case ".xls", ".xlsx", ".ods":
		return []string{"EXCEL.EXE", "scalc.exe"}
	case ".doc", ".docx", ".odt", ".rtf":
		return []string{"WINWORD.EXE", "swriter.exe", "write.exe"}
	case ".ppt", ".pptx", ".odp":
		return []string{"POWERPNT.EXE", "simpress.exe"}
	case ".mp4", ".mkv", ".avi", ".mov", ".webm", ".wmv", ".m4v", ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac":
		return []string{"wmplayer.exe", "vlc.exe", "mpc-hc64.exe"}
	case ".zip", ".7z", ".rar", ".tar", ".gz", ".tgz", ".bz2", ".xz":
		return []string{"7zFM.exe", "WinRAR.exe"}
	default:
		return []string{"notepad.exe"}
	}
}
