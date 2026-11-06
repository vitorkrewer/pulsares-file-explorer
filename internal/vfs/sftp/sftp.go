package sftp

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"pulsares-file-explorer/internal/storage"
	"pulsares-file-explorer/internal/vfs"
)

// Constantes do protocolo SFTP v3 (draft-ietf-secsh-filexfer-02)
const (
	sshFxpInit          = 1
	sshFxpVersion       = 2
	sshFxpOpen          = 3
	sshFxpClose         = 4
	sshFxpRead          = 5
	sshFxpWrite         = 6
	sshFxpLstat         = 7
	sshFxpSetstat       = 9
	sshFxpOpendir       = 11
	sshFxpReaddir       = 12
	sshFxpRemove        = 13
	sshFxpMkdir         = 14
	sshFxpRmdir         = 15
	sshFxpRealpath      = 16
	sshFxpStat          = 17
	sshFxpRename        = 18
	sshFxpStatus        = 101
	sshFxpHandle        = 102
	sshFxpData          = 103
	sshFxpName          = 104
	sshFxpAttrs         = 105
	sshFxOk             = 0
	sshFxEOF            = 1
	sshFxNoSuchFile     = 2
	sshFxPermissionDeny = 3

	sshFxfRead  = 0x00000001
	sshFxfWrite = 0x00000002
	sshFxfCreat = 0x00000008
	sshFxfTrunc = 0x00000010
	sshFxfExcl  = 0x00000020

	sshFileXferAttrSize        = 0x00000001
	sshFileXferAttrUIDGID      = 0x00000002
	sshFileXferAttrPermissions = 0x00000004
	sshFileXferAttrAcModTime   = 0x00000008
	sshFileXferAttrExtended    = 0x80000000

	sftpProtocolVersion = 3
)

// ConnectRequest descreve os dados para estabelecer ou testar uma conexão SSH/SFTP segura.
type ConnectRequest struct {
	ProfileID  int64  `json:"profileId"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	RemotePath string `json:"remotePath"`
	AuthType   string `json:"authType"`   // "key" | "agent" | "password"
	KeyPath    string `json:"keyPath"`    // Caminho da chave privada SSH
	Passphrase string `json:"passphrase"` // Senha ou passphrase da chave (mantida apenas em memória)
	TrustHost  bool   `json:"trustHost"`  // Se true, aceita e fixa a impressão digital SHA-256 do servidor (TOFU)
}

// ConnectResult informa o resultado da conexão ou alerta de verificação de chave do servidor.
type ConnectResult struct {
	Connected       bool   `json:"connected"`
	ProfileID       int64  `json:"profileId"`
	RootURI         string `json:"rootUri"`
	InitialPath     string `json:"initialPath"`
	HostKeyFP       string `json:"hostKeyFp"`
	HostKeyType     string `json:"hostKeyType"`
	NeedsHostTrust  bool   `json:"needsHostTrust"`
	HostKeyMismatch bool   `json:"hostKeyMismatch"`
	ExpectedHostFP  string `json:"expectedHostFp,omitempty"`
	ServerBanner    string `json:"serverBanner,omitempty"`
	Message         string `json:"message,omitempty"`
}

// LocalSSHKey representa uma chave privada SSH detectada em ~/.ssh para facilitar a escolha do usuário.
type LocalSSHKey struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	PublicKey string `json:"publicKey,omitempty"`
}

// ParseSFTPPath analisa URIs no formato "sftp://<profileId>/caminho/remoto"
func ParseSFTPPath(raw string) (profileID int64, remotePath string, ok bool) {
	trimmed := strings.TrimSpace(raw)
	if !strings.HasPrefix(strings.ToLower(trimmed), "sftp://") {
		return 0, "", false
	}
	rest := trimmed[len("sftp://"):]
	rest = strings.ReplaceAll(rest, `\`, `/`)
	slashIdx := strings.IndexByte(rest, '/')
	var hostPart, pathPart string
	if slashIdx < 0 {
		hostPart = rest
		pathPart = "/"
	} else {
		hostPart = rest[:slashIdx]
		pathPart = rest[slashIdx:]
	}
	id, err := strconv.ParseInt(strings.TrimSpace(hostPart), 10, 64)
	if err != nil || id <= 0 {
		return 0, "", false
	}
	cleanRemote := path.Clean(pathPart)
	if !strings.HasPrefix(cleanRemote, "/") {
		cleanRemote = "/" + cleanRemote
	}
	return id, cleanRemote, true
}

// FormatSFTPPath formata o caminho virtual SFTP canônico.
func FormatSFTPPath(profileID int64, remotePath string) string {
	clean := path.Clean(strings.ReplaceAll(strings.TrimSpace(remotePath), `\`, `/`))
	if clean == "." || clean == "" || !strings.HasPrefix(clean, "/") {
		clean = "/" + strings.TrimPrefix(clean, "/")
	}
	return fmt.Sprintf("sftp://%d%s", profileID, clean)
}

type activeSession struct {
	profileID int64
	profile   storage.RemoteProfile
	sshClient *ssh.Client
	sftpCli   *sftpWireClient
	lastUsed  time.Time
}

// Manager gerencia sessões SFTP seguras em memória e credenciais efêmeras.
type Manager struct {
	mu          sync.Mutex
	db          *storage.DB
	sessions    map[int64]*activeSession
	ephemeralPW map[int64]string // Passphrase/senha mantida apenas em RAM durante a execução do app
}

func NewManager(db *storage.DB) *Manager {
	return &Manager{
		db:          db,
		sessions:    make(map[int64]*activeSession),
		ephemeralPW: make(map[int64]string),
	}
}

// CloseAll encerra todas as conexões SSH ativas com segurança no desligamento do aplicativo.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, sess := range m.sessions {
		if sess.sftpCli != nil {
			_ = sess.sftpCli.Close()
		}
		if sess.sshClient != nil {
			_ = sess.sshClient.Close()
		}
		delete(m.sessions, id)
	}
	for id := range m.ephemeralPW {
		delete(m.ephemeralPW, id)
	}
}

// Disconnect encerra uma sessão SFTP específica.
func (m *Manager) Disconnect(profileID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if sess, ok := m.sessions[profileID]; ok {
		if sess.sftpCli != nil {
			_ = sess.sftpCli.Close()
		}
		if sess.sshClient != nil {
			_ = sess.sshClient.Close()
		}
		delete(m.sessions, profileID)
	}
}

// ActiveProfileIDs retorna a lista de IDs de perfis atualmente conectados.
func (m *Manager) ActiveProfileIDs() []int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]int64, 0, len(m.sessions))
	for id := range m.sessions {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// DetectLocalSSHKeys lista chaves privadas SSH padrão em ~/.ssh sem expor o conteúdo privado.
func DetectLocalSSHKeys() []LocalSSHKey {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return nil
	}
	sshDir := filepath.Join(home, ".ssh")
	entries, err := os.ReadDir(sshDir)
	if err != nil {
		return nil
	}

	candidates := []string{"id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"}
	seen := make(map[string]bool)
	var keys []LocalSSHKey

	addKey := func(fullPath, name string) {
		if seen[fullPath] {
			return
		}
		info, err := os.Stat(fullPath)
		if err != nil || info.IsDir() || info.Size() <= 0 || info.Size() > 64*1024 {
			return
		}
		raw, err := os.ReadFile(fullPath)
		if err != nil {
			return
		}
		header := string(raw)
		if !strings.Contains(header, "PRIVATE KEY") {
			return
		}
		seen[fullPath] = true
		var pubText string
		if pubRaw, err := os.ReadFile(fullPath + ".pub"); err == nil {
			pubText = strings.TrimSpace(string(pubRaw))
		}
		keys = append(keys, LocalSSHKey{
			Name:      name,
			Path:      fullPath,
			PublicKey: pubText,
		})
	}

	for _, c := range candidates {
		addKey(filepath.Join(sshDir, c), c)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		if strings.HasSuffix(n, ".pub") || n == "known_hosts" || n == "config" || n == "authorized_keys" {
			continue
		}
		addKey(filepath.Join(sshDir, n), n)
	}
	return keys
}

// Connect estabelece ou valida uma conexão SSH/SFTP com verificação estrita de Host Key (TOFU).
func (m *Manager) Connect(ctx context.Context, req ConnectRequest) (ConnectResult, error) {
	var prof storage.RemoteProfile
	if req.ProfileID > 0 && m.db != nil {
		if stored, err := m.db.GetRemoteProfile(req.ProfileID); err == nil && stored != nil {
			prof = *stored
		}
	}
	if strings.TrimSpace(req.Host) != "" {
		prof.Host = strings.TrimSpace(req.Host)
	}
	if req.Port > 0 {
		prof.Port = req.Port
	}
	if prof.Port <= 0 {
		prof.Port = 22
	}
	if strings.TrimSpace(req.Username) != "" {
		prof.Username = strings.TrimSpace(req.Username)
	}
	if strings.TrimSpace(req.RemotePath) != "" {
		prof.RemotePath = strings.TrimSpace(req.RemotePath)
	}
	if strings.TrimSpace(req.AuthType) != "" {
		prof.AuthType = strings.ToLower(strings.TrimSpace(req.AuthType))
	}
	if strings.TrimSpace(req.KeyPath) != "" {
		prof.KeyPath = strings.TrimSpace(req.KeyPath)
	}
	if strings.TrimSpace(req.Name) != "" {
		prof.Name = strings.TrimSpace(req.Name)
	}
	prof.Protocol = "sftp"

	if prof.Host == "" {
		return ConnectResult{}, errors.New("informe o endereço do servidor SSH/SFTP")
	}
	if prof.Username == "" {
		return ConnectResult{}, errors.New("informe o nome de usuário SSH")
	}

	secret := req.Passphrase
	if secret == "" && prof.ID > 0 {
		m.mu.Lock()
		secret = m.ephemeralPW[prof.ID]
		m.mu.Unlock()
	}

	authMethods, err := buildSSHAuthMethods(prof.AuthType, prof.KeyPath, secret)
	if err != nil {
		return ConnectResult{}, err
	}

	var presentedFP string
	var presentedKeyType string
	var serverBanner string
	var hostUntrustedErr = errors.New("host key requires trust confirmation")
	var hostMismatchErr = errors.New("host key fingerprint mismatch")

	expectedFP := strings.TrimSpace(prof.HostKeyFP)

	sshCfg := &ssh.ClientConfig{
		User:            prof.Username,
		Auth:            authMethods,
		Timeout:         10 * time.Second,
		BannerCallback:  func(message string) error { serverBanner = strings.TrimSpace(message); return nil },
		HostKeyAlgorithms: []string{
			ssh.KeyAlgoED25519,
			ssh.KeyAlgoECDSA256,
			ssh.KeyAlgoECDSA384,
			ssh.KeyAlgoECDSA521,
			ssh.KeyAlgoRSASHA512,
			ssh.KeyAlgoRSASHA256,
			ssh.KeyAlgoRSA,
		},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			sum := sha256.Sum256(key.Marshal())
			presentedFP = "SHA256:" + strings.TrimRight(base64.StdEncoding.EncodeToString(sum[:]), "=")
			presentedKeyType = key.Type()

			if expectedFP == "" {
				if req.TrustHost {
					expectedFP = presentedFP
					return nil
				}
				return hostUntrustedErr
			}
			if expectedFP != presentedFP {
				if req.TrustHost {
					expectedFP = presentedFP
					return nil
				}
				return hostMismatchErr
			}
			return nil
		},
	}

	addr := net.JoinHostPort(prof.Host, strconv.Itoa(prof.Port))
	dialer := net.Dialer{Timeout: 10 * time.Second}
	netConn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return ConnectResult{}, fmt.Errorf("falha ao conectar a %s: %w", addr, err)
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(netConn, addr, sshCfg)
	if err != nil {
		_ = netConn.Close()
		if errors.Is(err, hostUntrustedErr) {
			return ConnectResult{
				Connected:      false,
				ProfileID:      prof.ID,
				HostKeyFP:      presentedFP,
				HostKeyType:    presentedKeyType,
				NeedsHostTrust: true,
				ServerBanner:   serverBanner,
				Message:        fmt.Sprintf("Primeira conexão com %s. Confirme a impressão digital %s (%s) para continuar com segurança.", addr, presentedFP, presentedKeyType),
			}, nil
		}
		if errors.Is(err, hostMismatchErr) {
			return ConnectResult{
				Connected:       false,
				ProfileID:       prof.ID,
				HostKeyFP:       presentedFP,
				HostKeyType:     presentedKeyType,
				ExpectedHostFP:  prof.HostKeyFP,
				HostKeyMismatch: true,
				ServerBanner:    serverBanner,
				Message:         fmt.Sprintf("ALERTA DE SEGURANÇA: A chave pública do servidor %s mudou! Esperada: %s | Recebida: %s.", addr, prof.HostKeyFP, presentedFP),
			}, nil
		}
		return ConnectResult{}, fmt.Errorf("autenticação SSH falhou: %w", err)
	}

	client := ssh.NewClient(sshConn, chans, reqs)
	sftpCli, err := newSFTPWireClient(client)
	if err != nil {
		_ = client.Close()
		return ConnectResult{}, fmt.Errorf("subsistema SFTP indisponível: %w", err)
	}

	// Salva ou atualiza o perfil com a fingerprint TOFU verificada
	prof.HostKeyFP = expectedFP
	if prof.Name == "" {
		prof.Name = fmt.Sprintf("%s@%s", prof.Username, prof.Host)
	}
	if m.db != nil {
		if savedID, saveErr := m.db.SaveRemoteProfile(prof); saveErr == nil && savedID > 0 {
			prof.ID = savedID
		}
	}
	if prof.ID <= 0 {
		prof.ID = time.Now().Unix()
	}

	// Resolve o caminho inicial no servidor (Realpath)
	startRemote := strings.TrimSpace(prof.RemotePath)
	if startRemote == "" {
		if resolved, rpErr := sftpCli.RealPath("."); rpErr == nil && resolved != "" {
			startRemote = resolved
		} else {
			startRemote = "/"
		}
	}

	m.mu.Lock()
	if prev, exists := m.sessions[prof.ID]; exists {
		if prev.sftpCli != nil {
			_ = prev.sftpCli.Close()
		}
		if prev.sshClient != nil {
			_ = prev.sshClient.Close()
		}
	}
	m.sessions[prof.ID] = &activeSession{
		profileID: prof.ID,
		profile:   prof,
		sshClient: client,
		sftpCli:   sftpCli,
		lastUsed:  time.Now(),
	}
	if secret != "" {
		m.ephemeralPW[prof.ID] = secret
	}
	m.mu.Unlock()

	rootURI := fmt.Sprintf("sftp://%d", prof.ID)
	initialURI := FormatSFTPPath(prof.ID, startRemote)

	return ConnectResult{
		Connected:    true,
		ProfileID:    prof.ID,
		RootURI:      rootURI,
		InitialPath:  initialURI,
		HostKeyFP:    expectedFP,
		HostKeyType:  presentedKeyType,
		ServerBanner: serverBanner,
		Message:      fmt.Sprintf("Conectado com segurança a %s (%s)", prof.Name, expectedFP),
	}, nil
}

func (m *Manager) getOrReconnectSession(ctx context.Context, profileID int64) (*activeSession, error) {
	m.mu.Lock()
	sess, ok := m.sessions[profileID]
	if ok && sess.sftpCli != nil && !sess.sftpCli.isClosed() {
		sess.lastUsed = time.Now()
		m.mu.Unlock()
		return sess, nil
	}
	secret := m.ephemeralPW[profileID]
	m.mu.Unlock()

	if m.db == nil {
		return nil, errors.New("sessão SFTP não iniciada")
	}
	prof, err := m.db.GetRemoteProfile(profileID)
	if err != nil || prof == nil {
		return nil, errors.New("perfil SFTP não encontrado")
	}
	if prof.HostKeyFP == "" {
		return nil, errors.New("conexão SFTP requer confirmação de segurança no gerenciador SSH")
	}

	res, err := m.Connect(ctx, ConnectRequest{
		ProfileID:  prof.ID,
		Name:       prof.Name,
		Host:       prof.Host,
		Port:       prof.Port,
		Username:   prof.Username,
		RemotePath: prof.RemotePath,
		AuthType:   prof.AuthType,
		KeyPath:    prof.KeyPath,
		Passphrase: secret,
	})
	if err != nil {
		return nil, err
	}
	if !res.Connected {
		return nil, errors.New(res.Message)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	sess = m.sessions[profileID]
	if sess == nil {
		return nil, errors.New("sessão SFTP indisponível")
	}
	return sess, nil
}

func buildSSHAuthMethods(authType, keyPath, secret string) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	cleanType := strings.ToLower(strings.TrimSpace(authType))
	if cleanType == "" {
		cleanType = "key"
	}

	// 1. Chave Privada SSH (ED25519, RSA, ECDSA)
	if cleanType == "key" || keyPath != "" {
		resolvedKey := expandHomePath(keyPath)
		if resolvedKey == "" {
			keys := DetectLocalSSHKeys()
			if len(keys) > 0 {
				resolvedKey = keys[0].Path
			}
		}
		if resolvedKey != "" {
			pemBytes, err := os.ReadFile(resolvedKey)
			if err != nil {
				if cleanType == "key" {
					return nil, fmt.Errorf("não foi possível ler a chave privada %s: %w", resolvedKey, err)
				}
			} else {
				var signer ssh.Signer
				var parseErr error
				if secret != "" {
					signer, parseErr = ssh.ParsePrivateKeyWithPassphrase(pemBytes, []byte(secret))
				} else {
					signer, parseErr = ssh.ParsePrivateKey(pemBytes)
				}
				if parseErr != nil {
					if cleanType == "key" {
						return nil, fmt.Errorf("chave privada requer passphrase válida ou formato suportado: %w", parseErr)
					}
				} else {
					methods = append(methods, ssh.PublicKeys(signer))
				}
			}
		}
	}

	// 2. SSH Agent (SSH_AUTH_SOCK no Unix/Windows)
	if cleanType == "agent" || len(methods) == 0 {
		if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
			if conn, err := net.DialTimeout("unix", sock, 2*time.Second); err == nil {
				ag := agent.NewClient(conn)
				if signers, err := ag.Signers(); err == nil && len(signers) > 0 {
					methods = append(methods, ssh.PublicKeys(signers...))
				}
			}
		}
	}

	// 3. Senha ou Keyboard-Interactive (apenas em memória)
	if secret != "" {
		methods = append(methods,
			ssh.Password(secret),
			ssh.KeyboardInteractive(func(user, instruction string, questions []string, echos []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range questions {
					answers[i] = secret
				}
				return answers, nil
			}),
		)
	}

	if len(methods) == 0 {
		return nil, errors.New("nenhum método de autenticação SSH disponível (selecione uma chave em ~/.ssh ou informe a senha)")
	}
	return methods, nil
}

func expandHomePath(p string) string {
	trimmed := strings.TrimSpace(p)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, strings.TrimPrefix(strings.TrimPrefix(trimmed, "~"), "/"))
		}
	}
	return filepath.Clean(trimmed)
}

// ============================================================================
// Implementação de Operações SFTP sobre VFS (ReadDir, Stat, Open, Write, Mkdir, Rename, Remove)
// ============================================================================

func (m *Manager) Stat(ctx context.Context, profileID int64, remotePath string) (vfs.Entry, error) {
	sess, err := m.getOrReconnectSession(ctx, profileID)
	if err != nil {
		return vfs.Entry{}, err
	}
	attr, err := sess.sftpCli.Stat(remotePath)
	if err != nil {
		return vfs.Entry{}, err
	}
	name := path.Base(remotePath)
	if name == "." || name == "/" {
		name = sess.profile.Host
	}
	return attrToVFSEntry(profileID, remotePath, name, attr), nil
}

func (m *Manager) ReadDir(ctx context.Context, profileID int64, remotePath string, batch int) (<-chan []vfs.Entry, <-chan error) {
	outChan := make(chan []vfs.Entry, 4)
	errChan := make(chan error, 1)
	if batch <= 0 {
		batch = 200
	}

	go func() {
		defer close(outChan)
		defer close(errChan)

		sess, err := m.getOrReconnectSession(ctx, profileID)
		if err != nil {
			errChan <- err
			return
		}

		items, err := sess.sftpCli.ReadDir(ctx, remotePath)
		if err != nil {
			errChan <- err
			return
		}

		currentBatch := make([]vfs.Entry, 0, batch)
		for _, item := range items {
			if item.name == "." || item.name == ".." {
				continue
			}
			fullRemote := path.Join(remotePath, item.name)
			currentBatch = append(currentBatch, attrToVFSEntry(profileID, fullRemote, item.name, item.attr))
			if len(currentBatch) >= batch {
				select {
				case <-ctx.Done():
					errChan <- ctx.Err()
					return
				case outChan <- currentBatch:
				}
				currentBatch = make([]vfs.Entry, 0, batch)
			}
		}
		if len(currentBatch) > 0 {
			select {
			case <-ctx.Done():
				errChan <- ctx.Err()
				return
			case outChan <- currentBatch:
			}
		}
	}()

	return outChan, errChan
}

func (m *Manager) ReadBytes(ctx context.Context, profileID int64, remotePath string, maxBytes int64) ([]byte, error) {
	sess, err := m.getOrReconnectSession(ctx, profileID)
	if err != nil {
		return nil, err
	}
	return sess.sftpCli.ReadFile(ctx, remotePath, maxBytes)
}

func (m *Manager) WriteBytes(ctx context.Context, profileID int64, remotePath string, data []byte) error {
	sess, err := m.getOrReconnectSession(ctx, profileID)
	if err != nil {
		return err
	}
	return sess.sftpCli.WriteFile(ctx, remotePath, data)
}

func (m *Manager) CreateFolder(ctx context.Context, profileID int64, parentRemote, name string) (string, error) {
	sess, err := m.getOrReconnectSession(ctx, profileID)
	if err != nil {
		return "", err
	}
	target := path.Join(parentRemote, strings.TrimSpace(name))
	if err := sess.sftpCli.Mkdir(target); err != nil {
		return "", err
	}
	return FormatSFTPPath(profileID, target), nil
}

func (m *Manager) CreateFile(ctx context.Context, profileID int64, parentRemote, name string) (string, error) {
	sess, err := m.getOrReconnectSession(ctx, profileID)
	if err != nil {
		return "", err
	}
	target := path.Join(parentRemote, strings.TrimSpace(name))
	if err := sess.sftpCli.WriteFile(ctx, target, []byte{}); err != nil {
		return "", err
	}
	return FormatSFTPPath(profileID, target), nil
}

func (m *Manager) Rename(ctx context.Context, profileID int64, oldRemote, newName string) (string, error) {
	sess, err := m.getOrReconnectSession(ctx, profileID)
	if err != nil {
		return "", err
	}
	newRemote := path.Join(path.Dir(oldRemote), strings.TrimSpace(newName))
	if err := sess.sftpCli.Rename(oldRemote, newRemote); err != nil {
		return "", err
	}
	return FormatSFTPPath(profileID, newRemote), nil
}

func (m *Manager) RemoveRecursive(ctx context.Context, profileID int64, remotePath string) error {
	sess, err := m.getOrReconnectSession(ctx, profileID)
	if err != nil {
		return err
	}
	return sess.sftpCli.RemoveRecursive(ctx, remotePath)
}

// CompositeFS roteia chamadas VFS entre o sistema de arquivos local e o gerenciador SFTP.
type CompositeFS struct {
	local vfs.FileSystem
	sftp  *Manager
}

func NewCompositeFS(local vfs.FileSystem, sftpMgr *Manager) *CompositeFS {
	return &CompositeFS{
		local: local,
		sftp:  sftpMgr,
	}
}

func (c *CompositeFS) Stat(ctx context.Context, loc vfs.Location) (vfs.Entry, error) {
	if id, remote, ok := ParseSFTPPath(loc.Path); ok && c.sftp != nil {
		return c.sftp.Stat(ctx, id, remote)
	}
	return c.local.Stat(ctx, loc)
}

func (c *CompositeFS) ReadDir(ctx context.Context, loc vfs.Location, batch int) (<-chan []vfs.Entry, <-chan error) {
	if id, remote, ok := ParseSFTPPath(loc.Path); ok && c.sftp != nil {
		return c.sftp.ReadDir(ctx, id, remote, batch)
	}
	return c.local.ReadDir(ctx, loc, batch)
}

func (c *CompositeFS) Open(ctx context.Context, loc vfs.Location) (io.ReadCloser, error) {
	if id, remote, ok := ParseSFTPPath(loc.Path); ok && c.sftp != nil {
		data, err := c.sftp.ReadBytes(ctx, id, remote, 32*1024*1024)
		if err != nil {
			return nil, err
		}
		return io.NopCloser(bytes.NewReader(data)), nil
	}
	return c.local.Open(ctx, loc)
}

func attrToVFSEntry(profileID int64, remotePath, name string, a sftpFileAttr) vfs.Entry {
	kind := vfs.KindFile
	if a.isDir() {
		kind = vfs.KindDir
	} else if a.isSymlink() {
		kind = vfs.KindSymlink
	}
	fullURI := FormatSFTPPath(profileID, remotePath)
	rootURI := fmt.Sprintf("sftp://%d", profileID)
	return vfs.Entry{
		Name: name,
		Location: vfs.Location{
			Provider: "sftp",
			Root:     rootURI,
			Path:     fullURI,
		},
		Kind:    kind,
		Size:    int64(a.size),
		ModTime: time.Unix(int64(a.mtime), 0),
		Attrs: vfs.Attrs{
			Hidden:   strings.HasPrefix(name, "."),
			ReadOnly: (a.permissions & 0222) == 0,
		},
	}
}

// ============================================================================
// Cliente de Protocolo SFTP v3 Nativo sobre golang.org/x/crypto/ssh
// ============================================================================

type sftpFileAttr struct {
	flags       uint32
	size        uint64
	uid         uint32
	gid         uint32
	permissions uint32
	atime       uint32
	mtime       uint32
}

func (a sftpFileAttr) isDir() bool {
	return (a.permissions & 0170000) == 0040000
}

func (a sftpFileAttr) isSymlink() bool {
	return (a.permissions & 0170000) == 0120000
}

type sftpDirEntry struct {
	name string
	attr sftpFileAttr
}

type sftpWireClient struct {
	sess   *ssh.Session
	stdin  io.WriteCloser
	stdout io.Reader
	mu     sync.Mutex
	seq    uint32
	closed int32
}

func newSFTPWireClient(client *ssh.Client) (*sftpWireClient, error) {
	sess, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		_ = sess.Close()
		return nil, err
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		_ = sess.Close()
		return nil, err
	}
	if err := sess.RequestSubsystem("sftp"); err != nil {
		_ = sess.Close()
		return nil, err
	}

	c := &sftpWireClient{
		sess:   sess,
		stdin:  stdin,
		stdout: stdout,
	}
	if err := c.handshake(); err != nil {
		_ = c.Close()
		return nil, err
	}
	return c, nil
}

func (c *sftpWireClient) isClosed() bool {
	return atomic.LoadInt32(&c.closed) != 0
}

func (c *sftpWireClient) Close() error {
	if !atomic.CompareAndSwapInt32(&c.closed, 0, 1) {
		return nil
	}
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.sess != nil {
		return c.sess.Close()
	}
	return nil
}

func (c *sftpWireClient) nextID() uint32 {
	return atomic.AddUint32(&c.seq, 1)
}

func (c *sftpWireClient) handshake() error {
	var body bytes.Buffer
	_ = binary.Write(&body, binary.BigEndian, uint32(sftpProtocolVersion))
	if err := c.writePacket(sshFxpInit, body.Bytes()); err != nil {
		return err
	}
	pktType, _, err := c.readPacket()
	if err != nil {
		return err
	}
	if pktType != sshFxpVersion {
		return fmt.Errorf("resposta SFTP inesperada no handshake: %d", pktType)
	}
	return nil
}

func (c *sftpWireClient) writePacket(pktType byte, payload []byte) error {
	length := uint32(1 + len(payload))
	header := make([]byte, 5)
	binary.BigEndian.PutUint32(header[0:4], length)
	header[4] = pktType
	if _, err := c.stdin.Write(header); err != nil {
		atomic.StoreInt32(&c.closed, 1)
		return err
	}
	if len(payload) > 0 {
		if _, err := c.stdin.Write(payload); err != nil {
			atomic.StoreInt32(&c.closed, 1)
			return err
		}
	}
	return nil
}

func (c *sftpWireClient) readPacket() (byte, []byte, error) {
	header := make([]byte, 5)
	if _, err := io.ReadFull(c.stdout, header); err != nil {
		atomic.StoreInt32(&c.closed, 1)
		return 0, nil, err
	}
	length := binary.BigEndian.Uint32(header[0:4])
	if length < 1 || length > 32*1024*1024 {
		atomic.StoreInt32(&c.closed, 1)
		return 0, nil, errors.New("pacote SFTP inválido")
	}
	pktType := header[4]
	payload := make([]byte, length-1)
	if len(payload) > 0 {
		if _, err := io.ReadFull(c.stdout, payload); err != nil {
			atomic.StoreInt32(&c.closed, 1)
			return 0, nil, err
		}
	}
	return pktType, payload, nil
}

func (c *sftpWireClient) roundTrip(pktType byte, payload []byte) (byte, []byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.writePacket(pktType, payload); err != nil {
		return 0, nil, err
	}
	return c.readPacket()
}

func (c *sftpWireClient) RealPath(p string) (string, error) {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, p)

	respType, resp, err := c.roundTrip(sshFxpRealpath, buf.Bytes())
	if err != nil {
		return "", err
	}
	if respType == sshFxpStatus {
		return "", parseStatusError(resp)
	}
	if respType != sshFxpName {
		return "", errors.New("resposta inválida em RealPath")
	}
	r := bytes.NewReader(resp)
	var respID, count uint32
	_ = binary.Read(r, binary.BigEndian, &respID)
	_ = binary.Read(r, binary.BigEndian, &count)
	if count == 0 {
		return "/", nil
	}
	resolved, err := readString(r)
	if err != nil {
		return "/", err
	}
	return resolved, nil
}

func (c *sftpWireClient) Stat(p string) (sftpFileAttr, error) {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, p)

	respType, resp, err := c.roundTrip(sshFxpStat, buf.Bytes())
	if err != nil {
		return sftpFileAttr{}, err
	}
	if respType == sshFxpStatus {
		return sftpFileAttr{}, parseStatusError(resp)
	}
	if respType != sshFxpAttrs {
		return sftpFileAttr{}, errors.New("resposta inválida em Stat")
	}
	r := bytes.NewReader(resp)
	var respID uint32
	_ = binary.Read(r, binary.BigEndian, &respID)
	return readAttrs(r)
}

func (c *sftpWireClient) ReadDir(ctx context.Context, dirPath string) ([]sftpDirEntry, error) {
	handle, err := c.openDir(dirPath)
	if err != nil {
		return nil, err
	}
	defer c.closeHandle(handle)

	var all []sftpDirEntry
	for {
		if ctx.Err() != nil {
			return all, ctx.Err()
		}
		id := c.nextID()
		var buf bytes.Buffer
		_ = binary.Write(&buf, binary.BigEndian, id)
		writeStringBytes(&buf, handle)

		respType, resp, err := c.roundTrip(sshFxpReaddir, buf.Bytes())
		if err != nil {
			return all, err
		}
		if respType == sshFxpStatus {
			stErr := parseStatusError(resp)
			if errors.Is(stErr, io.EOF) {
				break
			}
			return all, stErr
		}
		if respType != sshFxpName {
			break
		}

		r := bytes.NewReader(resp)
		var respID, count uint32
		_ = binary.Read(r, binary.BigEndian, &respID)
		_ = binary.Read(r, binary.BigEndian, &count)
		for i := uint32(0); i < count; i++ {
			filename, err := readString(r)
			if err != nil {
				break
			}
			_, _ = readString(r) // longname
			attr, err := readAttrs(r)
			if err != nil {
				break
			}
			all = append(all, sftpDirEntry{
				name: filename,
				attr: attr,
			})
		}
	}
	return all, nil
}

func (c *sftpWireClient) ReadFile(ctx context.Context, remotePath string, maxBytes int64) ([]byte, error) {
	handle, err := c.openFile(remotePath, sshFxfRead)
	if err != nil {
		return nil, err
	}
	defer c.closeHandle(handle)

	if maxBytes <= 0 {
		maxBytes = 32 * 1024 * 1024 // 32 MB limite padrão
	}

	var out bytes.Buffer
	var offset uint64
	const chunkSize = 32 * 1024

	for int64(out.Len()) < maxBytes {
		if ctx.Err() != nil {
			return out.Bytes(), ctx.Err()
		}
		id := c.nextID()
		var buf bytes.Buffer
		_ = binary.Write(&buf, binary.BigEndian, id)
		writeStringBytes(&buf, handle)
		_ = binary.Write(&buf, binary.BigEndian, offset)
		_ = binary.Write(&buf, binary.BigEndian, uint32(chunkSize))

		respType, resp, err := c.roundTrip(sshFxpRead, buf.Bytes())
		if err != nil {
			return out.Bytes(), err
		}
		if respType == sshFxpStatus {
			stErr := parseStatusError(resp)
			if errors.Is(stErr, io.EOF) {
				break
			}
			return out.Bytes(), stErr
		}
		if respType != sshFxpData {
			break
		}
		r := bytes.NewReader(resp)
		var respID uint32
		_ = binary.Read(r, binary.BigEndian, &respID)
		chunk, err := readBytesSlice(r)
		if err != nil || len(chunk) == 0 {
			break
		}
		out.Write(chunk)
		offset += uint64(len(chunk))
	}
	return out.Bytes(), nil
}

func (c *sftpWireClient) WriteFile(ctx context.Context, remotePath string, data []byte) error {
	handle, err := c.openFile(remotePath, sshFxfWrite|sshFxfCreat|sshFxfTrunc)
	if err != nil {
		return err
	}
	defer c.closeHandle(handle)

	var offset uint64
	const chunkSize = 32 * 1024
	for offset < uint64(len(data)) {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		end := offset + chunkSize
		if end > uint64(len(data)) {
			end = uint64(len(data))
		}
		chunk := data[offset:end]

		id := c.nextID()
		var buf bytes.Buffer
		_ = binary.Write(&buf, binary.BigEndian, id)
		writeStringBytes(&buf, handle)
		_ = binary.Write(&buf, binary.BigEndian, offset)
		writeStringBytes(&buf, chunk)

		respType, resp, err := c.roundTrip(sshFxpWrite, buf.Bytes())
		if err != nil {
			return err
		}
		if respType == sshFxpStatus {
			if stErr := parseStatusError(resp); stErr != nil {
				return stErr
			}
		}
		offset = end
	}
	return nil
}

func (c *sftpWireClient) Mkdir(remotePath string) error {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, remotePath)
	_ = binary.Write(&buf, binary.BigEndian, uint32(sshFileXferAttrPermissions))
	_ = binary.Write(&buf, binary.BigEndian, uint32(0755))

	respType, resp, err := c.roundTrip(sshFxpMkdir, buf.Bytes())
	if err != nil {
		return err
	}
	if respType == sshFxpStatus {
		return parseStatusError(resp)
	}
	return nil
}

func (c *sftpWireClient) Rename(oldPath, newPath string) error {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, oldPath)
	writeString(&buf, newPath)

	respType, resp, err := c.roundTrip(sshFxpRename, buf.Bytes())
	if err != nil {
		return err
	}
	if respType == sshFxpStatus {
		return parseStatusError(resp)
	}
	return nil
}

func (c *sftpWireClient) RemoveFile(remotePath string) error {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, remotePath)

	respType, resp, err := c.roundTrip(sshFxpRemove, buf.Bytes())
	if err != nil {
		return err
	}
	if respType == sshFxpStatus {
		return parseStatusError(resp)
	}
	return nil
}

func (c *sftpWireClient) RemoveDir(remotePath string) error {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, remotePath)

	respType, resp, err := c.roundTrip(sshFxpRmdir, buf.Bytes())
	if err != nil {
		return err
	}
	if respType == sshFxpStatus {
		return parseStatusError(resp)
	}
	return nil
}

func (c *sftpWireClient) RemoveRecursive(ctx context.Context, remotePath string) error {
	attr, err := c.Stat(remotePath)
	if err != nil {
		return err
	}
	if !attr.isDir() {
		return c.RemoveFile(remotePath)
	}
	children, err := c.ReadDir(ctx, remotePath)
	if err != nil {
		return err
	}
	for _, ch := range children {
		if ch.name == "." || ch.name == ".." {
			continue
		}
		if err := c.RemoveRecursive(ctx, path.Join(remotePath, ch.name)); err != nil {
			return err
		}
	}
	return c.RemoveDir(remotePath)
}

func (c *sftpWireClient) openDir(dirPath string) ([]byte, error) {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, dirPath)

	respType, resp, err := c.roundTrip(sshFxpOpendir, buf.Bytes())
	if err != nil {
		return nil, err
	}
	if respType == sshFxpStatus {
		return nil, parseStatusError(resp)
	}
	if respType != sshFxpHandle {
		return nil, errors.New("resposta inválida ao abrir diretório SFTP")
	}
	r := bytes.NewReader(resp)
	var respID uint32
	_ = binary.Read(r, binary.BigEndian, &respID)
	return readBytesSlice(r)
}

func (c *sftpWireClient) openFile(filePath string, pflags uint32) ([]byte, error) {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeString(&buf, filePath)
	_ = binary.Write(&buf, binary.BigEndian, pflags)
	_ = binary.Write(&buf, binary.BigEndian, uint32(sshFileXferAttrPermissions))
	_ = binary.Write(&buf, binary.BigEndian, uint32(0644))

	respType, resp, err := c.roundTrip(sshFxpOpen, buf.Bytes())
	if err != nil {
		return nil, err
	}
	if respType == sshFxpStatus {
		return nil, parseStatusError(resp)
	}
	if respType != sshFxpHandle {
		return nil, errors.New("resposta inválida ao abrir arquivo SFTP")
	}
	r := bytes.NewReader(resp)
	var respID uint32
	_ = binary.Read(r, binary.BigEndian, &respID)
	return readBytesSlice(r)
}

func (c *sftpWireClient) closeHandle(handle []byte) {
	id := c.nextID()
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.BigEndian, id)
	writeStringBytes(&buf, handle)
	_, _, _ = c.roundTrip(sshFxpClose, buf.Bytes())
}

func writeString(buf *bytes.Buffer, s string) {
	writeStringBytes(buf, []byte(s))
}

func writeStringBytes(buf *bytes.Buffer, b []byte) {
	_ = binary.Write(buf, binary.BigEndian, uint32(len(b)))
	buf.Write(b)
}

func readString(r *bytes.Reader) (string, error) {
	b, err := readBytesSlice(r)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func readBytesSlice(r *bytes.Reader) ([]byte, error) {
	var ln uint32
	if err := binary.Read(r, binary.BigEndian, &ln); err != nil {
		return nil, err
	}
	if ln > 16*1024*1024 {
		return nil, errors.New("string SFTP excede limite")
	}
	b := make([]byte, ln)
	if _, err := io.ReadFull(r, b); err != nil {
		return nil, err
	}
	return b, nil
}

func readAttrs(r *bytes.Reader) (sftpFileAttr, error) {
	var a sftpFileAttr
	if err := binary.Read(r, binary.BigEndian, &a.flags); err != nil {
		return a, err
	}
	if a.flags&sshFileXferAttrSize != 0 {
		_ = binary.Read(r, binary.BigEndian, &a.size)
	}
	if a.flags&sshFileXferAttrUIDGID != 0 {
		_ = binary.Read(r, binary.BigEndian, &a.uid)
		_ = binary.Read(r, binary.BigEndian, &a.gid)
	}
	if a.flags&sshFileXferAttrPermissions != 0 {
		_ = binary.Read(r, binary.BigEndian, &a.permissions)
	}
	if a.flags&sshFileXferAttrAcModTime != 0 {
		_ = binary.Read(r, binary.BigEndian, &a.atime)
		_ = binary.Read(r, binary.BigEndian, &a.mtime)
	}
	if a.flags&sshFileXferAttrExtended != 0 {
		var extCount uint32
		_ = binary.Read(r, binary.BigEndian, &extCount)
		for i := uint32(0); i < extCount; i++ {
			_, _ = readBytesSlice(r)
			_, _ = readBytesSlice(r)
		}
	}
	return a, nil
}

func parseStatusError(resp []byte) error {
	r := bytes.NewReader(resp)
	var id, code uint32
	_ = binary.Read(r, binary.BigEndian, &id)
	if err := binary.Read(r, binary.BigEndian, &code); err != nil {
		return errors.New("erro SFTP desconhecido")
	}
	msg, _ := readString(r)
	switch code {
	case sshFxOk:
		return nil
	case sshFxEOF:
		return io.EOF
	case sshFxNoSuchFile:
		return vfs.ErrNotFound
	case sshFxPermissionDeny:
		return vfs.ErrPermission
	default:
		if msg != "" {
			return errors.New(msg)
		}
		return fmt.Errorf("erro SFTP (código %d)", code)
	}
}
