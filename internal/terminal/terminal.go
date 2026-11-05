package terminal

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ShellKind identifica a família de sintaxe do shell para citação segura de caminhos.
type ShellKind string

const (
	ShellPowerShell ShellKind = "powershell"
	ShellCmd        ShellKind = "cmd"
	ShellPosix      ShellKind = "posix"
	ShellFish       ShellKind = "fish"
	ShellWSL        ShellKind = "wsl"
)

// Profile descreve um perfil de shell detectado ou personalizado.
type Profile struct {
	ID   string            `json:"id"`
	Name string            `json:"name"`
	Path string            `json:"path"`
	Args []string          `json:"args"`
	Env  map[string]string `json:"env,omitempty"`
	Kind ShellKind         `json:"kind"`
}

// DataEvent representa um lote de saída do pseudoterminal codificado em base64.
type DataEvent struct {
	ID      string `json:"id"`
	Chunk   string `json:"chunk"`
	RawLen  int    `json:"rawLen"`
	CwdOSC7 string `json:"cwdOsc7,omitempty"`
}

// ExitEvent notifica o encerramento de uma sessão de terminal.
type ExitEvent struct {
	ID       string `json:"id"`
	ExitCode int    `json:"exitCode"`
}

// EventEmitter abstrai o envio de eventos para o frontend.
type EventEmitter func(eventName string, data any)

const (
	batchInterval       = 8 * time.Millisecond
	maxBatchBytes       = 64 * 1024
	maxUnackedThreshold = 1024 * 1024 // 1 MB de contrapressão
)

type session struct {
	id         string
	profile    Profile
	cwd        string
	cols       int
	rows       int
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	cancel     context.CancelFunc
	mu         sync.Mutex
	unacked    int64
	ackCond    *sync.Cond
	closed     bool
	exited     bool
	writtenLog bytes.Buffer // usado apenas em modo de teste se necessário, nunca logado em disco
}

// Service gerencia perfis e sessões de terminal integrado.
type Service struct {
	mu             sync.RWMutex
	sessions       map[string]*session
	customProfiles []Profile
	defaultProfile string
	emit           EventEmitter
	seq            uint64
}

// New cria uma nova instância do gerenciador de terminais.
func New(emit EventEmitter) *Service {
	if emit == nil {
		emit = func(string, any) {}
	}
	return &Service{
		sessions: make(map[string]*session),
		emit:     emit,
	}
}

// SetEmitter atualiza o emissor de eventos (ex.: na inicialização do Wails).
func (s *Service) SetEmitter(emit EventEmitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if emit != nil {
		s.emit = emit
	}
}

// Profiles retorna os perfis detectados no sistema operacional mais os personalizados.
func (s *Service) Profiles(_ context.Context) ([]Profile, error) {
	s.mu.RLock()
	custom := append([]Profile(nil), s.customProfiles...)
	defID := s.defaultProfile
	s.mu.RUnlock()

	detected := detectOSProfiles()
	all := append(detected, custom...)

	if defID != "" && len(all) > 1 {
		for i, p := range all {
			if p.ID == defID && i > 0 {
				all[0], all[i] = all[i], all[0]
				break
			}
		}
	}
	return all, nil
}

// AddCustomProfile adiciona ou atualiza um perfil personalizado de terminal.
func (s *Service) AddCustomProfile(p Profile) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, existing := range s.customProfiles {
		if existing.ID == p.ID {
			s.customProfiles[i] = p
			return
		}
	}
	s.customProfiles = append(s.customProfiles, p)
}

// SetDefaultProfile define o ID do perfil padrão.
func (s *Service) SetDefaultProfile(profileID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.defaultProfile = profileID
}

// Start inicia uma nova sessão de terminal na pasta informada.
func (s *Service) Start(profileID string, cwd string, cols, rows int) (string, error) {
	profiles, err := s.Profiles(context.Background())
	if err != nil || len(profiles) == 0 {
		return "", errors.New("no terminal profiles available")
	}

	var chosen Profile
	found := false
	for _, p := range profiles {
		if p.ID == profileID {
			chosen = p
			found = true
			break
		}
	}
	if !found {
		chosen = profiles[0]
	}

	if strings.TrimSpace(cwd) == "" {
		if home, err := os.UserHomeDir(); err == nil {
			cwd = home
		} else {
			cwd = "."
		}
	}
	if info, err := os.Stat(cwd); err != nil || !info.IsDir() {
		if home, err := os.UserHomeDir(); err == nil {
			cwd = home
		} else {
			cwd = os.TempDir()
		}
	}

	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, chosen.Path, chosen.Args...)
	cmd.Dir = cwd

	env := os.Environ()
	env = append(env,
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"TERM_PROGRAM=PulsaresExplorer",
		fmt.Sprintf("COLUMNS=%d", cols),
		fmt.Sprintf("LINES=%d", rows),
	)
	for k, v := range chosen.Env {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env

	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return "", err
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return "", err
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return "", err
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return "", err
	}

	id := fmt.Sprintf("term-%d", atomic.AddUint64(&s.seq, 1))
	sess := &session{
		id:      id,
		profile: chosen,
		cwd:     cwd,
		cols:    cols,
		rows:    rows,
		cmd:     cmd,
		stdin:   stdinPipe,
		cancel:  cancel,
	}
	sess.ackCond = sync.NewCond(&sess.mu)

	s.mu.Lock()
	s.sessions[id] = sess
	s.mu.Unlock()

	combinedOut := io.MultiReader(stdoutPipe, stderrPipe)
	go s.readOutputLoop(sess, combinedOut)
	go s.waitProcess(sess)

	return id, nil
}

func (s *Service) readOutputLoop(sess *session, r io.Reader) {
	chunkCh := make(chan []byte, 32)
	go func() {
		defer close(chunkCh)
		buf := make([]byte, 16*1024)
		for {
			n, err := r.Read(buf)
			if n > 0 {
				sess.mu.Lock()
				for !sess.closed && sess.unacked >= maxUnackedThreshold {
					sess.ackCond.Wait()
				}
				closed := sess.closed
				sess.mu.Unlock()
				if closed {
					return
				}

				cp := make([]byte, n)
				copy(cp, buf[:n])
				chunkCh <- cp
			}
			if err != nil {
				return
			}
		}
	}()

	ticker := time.NewTicker(batchInterval)
	defer ticker.Stop()

	var pending bytes.Buffer

	flush := func() {
		if pending.Len() == 0 {
			return
		}
		raw := pending.Bytes()
		rawLen := len(raw)
		encoded := base64.StdEncoding.EncodeToString(raw)
		osc7 := ParseOSC7(raw)

		sess.mu.Lock()
		sess.unacked += int64(rawLen)
		if osc7 != "" {
			sess.cwd = osc7
		}
		sess.mu.Unlock()

		pending.Reset()

		s.mu.RLock()
		emit := s.emit
		s.mu.RUnlock()

		emit("terminal:data", DataEvent{
			ID:      sess.id,
			Chunk:   encoded,
			RawLen:  rawLen,
			CwdOSC7: osc7,
		})
	}

	for {
		select {
		case data, ok := <-chunkCh:
			if !ok {
				flush()
				return
			}
			pending.Write(data)
			if pending.Len() >= maxBatchBytes {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (s *Service) waitProcess(sess *session) {
	err := sess.cmd.Wait()
	exitCode := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	sess.mu.Lock()
	sess.exited = true
	sess.closed = true
	sess.ackCond.Broadcast()
	sess.mu.Unlock()

	s.mu.RLock()
	emit := s.emit
	s.mu.RUnlock()

	emit("terminal:exit", ExitEvent{
		ID:       sess.id,
		ExitCode: exitCode,
	})
}

// Write envia bytes de entrada para o pseudoterminal.
func (s *Service) Write(id string, data []byte) error {
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()
	if !ok {
		return errors.New("terminal session not found")
	}

	sess.mu.Lock()
	if sess.closed || sess.stdin == nil {
		sess.mu.Unlock()
		return errors.New("terminal session closed")
	}
	stdin := sess.stdin
	currentCwd := sess.cwd
	sess.mu.Unlock()

	if nextCwd := detectCdTarget(currentCwd, string(data)); nextCwd != "" {
		sess.mu.Lock()
		sess.cwd = nextCwd
		sess.mu.Unlock()
	}

	_, err := stdin.Write(data)
	return err
}

func detectCdTarget(baseCwd string, rawInput string) string {
	line := strings.TrimSpace(rawInput)
	if line == "" || !strings.ContainsAny( rawInput, "\r\n") {
		return ""
	}
	lower := strings.ToLower(line)
	var arg string
	switch {
	case strings.HasPrefix(lower, "cd /d "):
		arg = strings.TrimSpace(line[6:])
	case strings.HasPrefix(lower, "cd -- "):
		arg = strings.TrimSpace(line[6:])
	case strings.HasPrefix(lower, "cd "):
		arg = strings.TrimSpace(line[3:])
	case strings.HasPrefix(lower, "set-location -literalpath "):
		arg = strings.TrimSpace(line[26:])
	case strings.HasPrefix(lower, "set-location "):
		arg = strings.TrimSpace(line[13:])
	case strings.HasPrefix(lower, "sl "):
		arg = strings.TrimSpace(line[3:])
	default:
		return ""
	}
	arg = strings.Trim(arg, `"'`)
	if arg == "" {
		return ""
	}
	if arg == "~" {
		if home, err := os.UserHomeDir(); err == nil {
			return home
		}
	}
	target := arg
	if !filepath.IsAbs(target) && baseCwd != "" {
		target = filepath.Join(baseCwd, target)
	}
	target = filepath.Clean(target)
	if info, err := os.Stat(target); err == nil && info.IsDir() {
		return target
	}
	return ""
}

// Autocomplete sugere complementos de linha de comando (arquivos, pastas e comandos comuns) para o Tab no terminal.
func (s *Service) Autocomplete(id string, cwdFallback string, line string) ([]string, error) {
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()

	cwd := strings.TrimSpace(cwdFallback)
	if ok {
		sess.mu.Lock()
		if strings.TrimSpace(sess.cwd) != "" {
			cwd = sess.cwd
		}
		sess.mu.Unlock()
	}
	if cwd == "" {
		if home, err := os.UserHomeDir(); err == nil {
			cwd = home
		} else {
			cwd = "."
		}
	}

	prefix, token, quoteChar := splitLastToken(line)
	cleanToken := token

	sep := string(os.PathSeparator)
	if strings.Contains(cleanToken, "/") && !strings.Contains(cleanToken, `\`) {
		sep = "/"
	}

	var dirPart, filePrefix string
	lastSlash := strings.LastIndexAny(cleanToken, `/\`)
	if lastSlash >= 0 {
		dirPart = cleanToken[:lastSlash+1]
		filePrefix = cleanToken[lastSlash+1:]
	} else {
		dirPart = ""
		filePrefix = cleanToken
	}

	searchDir := cwd
	if dirPart != "" {
		expandedDir := dirPart
		if strings.HasPrefix(expandedDir, "~") {
			if home, err := os.UserHomeDir(); err == nil {
				expandedDir = filepath.Join(home, expandedDir[1:])
			}
		}
		if filepath.IsAbs(expandedDir) || (runtime.GOOS == "windows" && strings.HasPrefix(expandedDir, `\`)) {
			searchDir = filepath.Clean(expandedDir)
		} else {
			searchDir = filepath.Join(cwd, expandedDir)
		}
	}

	var candidates []string

	trimmedPrefix := strings.TrimSpace(prefix)
	firstWord := ""
	if trimmedPrefix != "" {
		firstWord = strings.ToLower(strings.Fields(trimmedPrefix)[0])
	}
	dirsOnly := firstWord == "cd" || firstWord == "chdir" || firstWord == "sl" ||
		firstWord == "set-location" || firstWord == "pushd" || firstWord == "rmdir"

	// Se estiver no primeiro token e sem separador de diretório, sugere também comandos frequentes do shell
	if trimmedPrefix == "" && dirPart == "" && filePrefix != "" {
		commonCmds := []string{
			"cd", "ls", "dir", "cls", "clear", "pwd", "echo", "cat", "type",
			"mkdir", "rmdir", "rm", "del", "cp", "copy", "mv", "move",
			"git", "go", "npm", "npx", "pnpm", "yarn", "node", "python",
			"pytest", "cargo", "docker", "kubectl", "code", "ssh", "scp", "curl", "tar", "zip",
		}
		lowerPref := strings.ToLower(filePrefix)
		for _, cmdName := range commonCmds {
			if strings.HasPrefix(cmdName, lowerPref) {
				candidates = append(candidates, prefix+cmdName+" ")
			}
		}
	}

	entries, err := os.ReadDir(searchDir)
	if err == nil {
		lowerFilePref := strings.ToLower(filePrefix)
		for _, entry := range entries {
			if dirsOnly && !entry.IsDir() {
				continue
			}
			name := entry.Name()
			if !strings.HasPrefix(strings.ToLower(name), lowerFilePref) {
				continue
			}
			completedPath := dirPart + name
			if entry.IsDir() {
				completedPath += sep
			}
			needsQuotes := strings.Contains(completedPath, " ")
			var formattedToken string
			if quoteChar != 0 {
				formattedToken = string(quoteChar) + completedPath + string(quoteChar)
			} else if needsQuotes {
				formattedToken = `"` + completedPath + `"`
			} else {
				formattedToken = completedPath
			}
			candidates = append(candidates, prefix+formattedToken)
			if len(candidates) >= 60 {
				break
			}
		}
	}

	return candidates, nil
}

func splitLastToken(line string) (prefix string, token string, quoteChar byte) {
	if line == "" {
		return "", "", 0
	}
	inQuote := byte(0)
	tokenStart := 0
	for i := 0; i < len(line); i++ {
		ch := line[i]
		if inQuote != 0 {
			if ch == inQuote {
				inQuote = 0
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			inQuote = ch
			tokenStart = i
			continue
		}
		if ch == ' ' || ch == '\t' {
			tokenStart = i + 1
		}
	}
	prefix = line[:tokenStart]
	rawToken := line[tokenStart:]
	if len(rawToken) > 0 && (rawToken[0] == '"' || rawToken[0] == '\'') {
		quoteChar = rawToken[0]
		rawToken = strings.TrimPrefix(rawToken, string(quoteChar))
		rawToken = strings.TrimSuffix(rawToken, string(quoteChar))
	}
	return prefix, rawToken, quoteChar
}

// Resize atualiza as dimensões lógicas da sessão do terminal.
func (s *Service) Resize(id string, cols, rows int) error {
	if cols <= 0 || rows <= 0 {
		return errors.New("invalid terminal dimensions")
	}
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()
	if !ok {
		return errors.New("terminal session not found")
	}

	sess.mu.Lock()
	sess.cols = cols
	sess.rows = rows
	sess.mu.Unlock()
	return nil
}

// Ack confirma o recebimento de bytes pelo frontend para controle de contrapressão.
func (s *Service) Ack(id string, byteCount int) error {
	if byteCount <= 0 {
		return nil
	}
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()
	if !ok {
		return errors.New("terminal session not found")
	}

	sess.mu.Lock()
	sess.unacked -= int64(byteCount)
	if sess.unacked < 0 {
		sess.unacked = 0
	}
	sess.ackCond.Broadcast()
	sess.mu.Unlock()
	return nil
}

// Kill encerra a sessão de terminal e toda a sua árvore de processos filhos.
func (s *Service) Kill(id string) error {
	s.mu.Lock()
	sess, ok := s.sessions[id]
	if ok {
		delete(s.sessions, id)
	}
	s.mu.Unlock()
	if !ok {
		return nil
	}

	sess.mu.Lock()
	sess.closed = true
	if sess.stdin != nil {
		_ = sess.stdin.Close()
	}
	sess.ackCond.Broadcast()
	sess.mu.Unlock()

	if sess.cmd != nil && sess.cmd.Process != nil {
		killProcessTree(sess.cmd.Process.Pid)
		_ = sess.cmd.Process.Kill()
	}
	sess.cancel()
	return nil
}

// HasRunningChildren verifica se a sessão possui processos filhos em execução.
func (s *Service) HasRunningChildren(id string) (bool, error) {
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()
	if !ok {
		return false, nil
	}

	sess.mu.Lock()
	exited := sess.exited
	var pid int
	if sess.cmd != nil && sess.cmd.Process != nil {
		pid = sess.cmd.Process.Pid
	}
	sess.mu.Unlock()

	if exited || pid <= 0 {
		return false, nil
	}
	return checkChildProcesses(pid), nil
}

// ChangeDir envia o comando de troca de pasta apropriado para o shell da sessão.
func (s *Service) ChangeDir(id string, path string) error {
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()
	if !ok {
		return errors.New("terminal session not found")
	}

	cmdStr := FormatChangeDirCommand(sess.profile.Kind, path)
	if err := s.Write(id, []byte(cmdStr)); err != nil {
		return err
	}

	sess.mu.Lock()
	sess.cwd = path
	sess.mu.Unlock()
	return nil
}

// QuotePathsForSession formata uma lista de caminhos com aspas corretas para o shell da sessão.
func (s *Service) QuotePathsForSession(id string, paths []string) (string, error) {
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()

	kind := ShellPosix
	if runtime.GOOS == "windows" {
		kind = ShellPowerShell
	}
	if ok {
		kind = sess.profile.Kind
	}

	quoted := make([]string, 0, len(paths))
	for _, p := range paths {
		if strings.TrimSpace(p) == "" {
			continue
		}
		quoted = append(quoted, QuotePath(kind, p))
	}
	return strings.Join(quoted, " "), nil
}

// QuotePath cita um caminho de arquivo de forma segura para o ShellKind informado.
func QuotePath(kind ShellKind, path string) string {
	switch kind {
	case ShellPowerShell:
		escaped := strings.ReplaceAll(path, "'", "''")
		return "'" + escaped + "'"
	case ShellCmd:
		escaped := strings.ReplaceAll(path, `"`, `""`)
		escaped = strings.ReplaceAll(escaped, "%", "%%")
		return `"` + escaped + `"`
	case ShellFish:
		escaped := strings.ReplaceAll(path, `\`, `\\`)
		escaped = strings.ReplaceAll(escaped, `'`, `\'`)
		return "'" + escaped + "'"
	case ShellWSL:
		wslPath := toWSLPath(path)
		escaped := strings.ReplaceAll(wslPath, `'`, `'\''`)
		return "'" + escaped + "'"
	case ShellPosix:
		fallthrough
	default:
		escaped := strings.ReplaceAll(path, `'`, `'\''`)
		return "'" + escaped + "'"
	}
}

// FormatChangeDirCommand monta o comando de mudança de diretório seguro para cada shell.
func FormatChangeDirCommand(kind ShellKind, path string) string {
	quoted := QuotePath(kind, path)
	switch kind {
	case ShellPowerShell:
		return "Set-Location -LiteralPath " + quoted + "\r\n"
	case ShellCmd:
		return "cd /d " + quoted + "\r\n"
	case ShellFish, ShellPosix, ShellWSL:
		fallthrough
	default:
		return "cd -- " + quoted + "\n"
	}
}

func toWSLPath(p string) string {
	if len(p) >= 2 && p[1] == ':' {
		drive := strings.ToLower(string(p[0]))
		rest := strings.ReplaceAll(p[2:], `\`, `/`)
		if !strings.HasPrefix(rest, "/") {
			rest = "/" + rest
		}
		return "/mnt/" + drive + rest
	}
	return strings.ReplaceAll(p, `\`, `/`)
}

// ParseOSC7 extrai o diretório atual de sequências ANSI OSC 7 (ESC ] 7 ; file://host/path BEL ou ST).
func ParseOSC7(data []byte) string {
	prefix := []byte("\x1b]7;file://")
	idx := bytes.LastIndex(data, prefix)
	if idx < 0 {
		return ""
	}
	rest := data[idx+len("\x1b]7;"):]
	endIdx := bytes.IndexByte(rest, '\x07')
	stIdx := bytes.Index(rest, []byte("\x1b\\"))
	if endIdx < 0 || (stIdx >= 0 && stIdx < endIdx) {
		endIdx = stIdx
	}
	if endIdx < 0 {
		return ""
	}

	rawURL := string(rest[:endIdx])
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	decoded, err := url.PathUnescape(u.Path)
	if err != nil {
		decoded = u.Path
	}
	// Em Windows, file:///C:/Users/... possui barra inicial antes da letra da unidade
	if len(decoded) >= 3 && decoded[0] == '/' && decoded[2] == ':' {
		decoded = filepath.FromSlash(decoded[1:])
	}
	return decoded
}

func detectOSProfiles() []Profile {
	var profiles []Profile

	if runtime.GOOS == "windows" {
		if pwshPath, err := exec.LookPath("pwsh.exe"); err == nil {
			profiles = append(profiles, Profile{
				ID:   "pwsh",
				Name: "PowerShell 7",
				Path: pwshPath,
				Args: []string{"-NoLogo"},
				Kind: ShellPowerShell,
			})
		}
		if psPath, err := exec.LookPath("powershell.exe"); err == nil {
			profiles = append(profiles, Profile{
				ID:   "powershell",
				Name: "Windows PowerShell",
				Path: psPath,
				Args: []string{"-NoLogo"},
				Kind: ShellPowerShell,
			})
		}
		if cmdPath, err := exec.LookPath("cmd.exe"); err == nil {
			profiles = append(profiles, Profile{
				ID:   "cmd",
				Name: "Prompt de Comando (cmd)",
				Path: cmdPath,
				Args: []string{"/Q"},
				Kind: ShellCmd,
			})
		}
		gitBashCandidates := []string{
			`C:\Program Files\Git\bin\bash.exe`,
			`C:\Program Files (x86)\Git\bin\bash.exe`,
		}
		for _, candidate := range gitBashCandidates {
			if _, err := os.Stat(candidate); err == nil {
				profiles = append(profiles, Profile{
					ID:   "git-bash",
					Name: "Git Bash",
					Path: candidate,
					Args: []string{"--login", "-i"},
					Kind: ShellPosix,
				})
				break
			}
		}
		if wslPath, err := exec.LookPath("wsl.exe"); err == nil {
			profiles = append(profiles, Profile{
				ID:   "wsl",
				Name: "WSL",
				Path: wslPath,
				Args: nil,
				Kind: ShellWSL,
			})
		}
		return profiles
	}

	// Unix (Linux / macOS)
	seen := make(map[string]bool)
	addUnixShell := func(id, name, path string, kind ShellKind) {
		if path == "" || seen[path] {
			return
		}
		if _, err := os.Stat(path); err == nil {
			seen[path] = true
			profiles = append(profiles, Profile{
				ID:   id,
				Name: name,
				Path: path,
				Kind: kind,
			})
		}
	}

	if userShell := os.Getenv("SHELL"); userShell != "" {
		base := filepath.Base(userShell)
		kind := ShellPosix
		if base == "fish" {
			kind = ShellFish
		}
		addUnixShell("default-shell", base+" (Padrão)", userShell, kind)
	}

	if p, err := exec.LookPath("zsh"); err == nil {
		addUnixShell("zsh", "Zsh", p, ShellPosix)
	}
	if p, err := exec.LookPath("bash"); err == nil {
		addUnixShell("bash", "Bash", p, ShellPosix)
	}
	if p, err := exec.LookPath("fish"); err == nil {
		addUnixShell("fish", "Fish", p, ShellFish)
	}
	if p, err := exec.LookPath("sh"); err == nil {
		addUnixShell("sh", "POSIX sh", p, ShellPosix)
	}

	return profiles
}

func killProcessTree(pid int) {
	if pid <= 0 {
		return
	}
	if runtime.GOOS == "windows" {
		_ = exec.Command("taskkill", "/T", "/F", "/PID", fmt.Sprintf("%d", pid)).Run()
		return
	}
	_ = exec.Command("pkill", "-KILL", "-P", fmt.Sprintf("%d", pid)).Run()
}

func checkChildProcesses(pid int) bool {
	if pid <= 0 {
		return false
	}
	if runtime.GOOS == "windows" {
		out, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
			fmt.Sprintf("(Get-CimInstance Win32_Process -Filter 'ParentProcessId = %d').Count", pid),
		).Output()
		if err != nil {
			return false
		}
		trimmed := strings.TrimSpace(string(out))
		return trimmed != "" && trimmed != "0"
	}
	err := exec.Command("pgrep", "-P", fmt.Sprintf("%d", pid)).Run()
	return err == nil
}

