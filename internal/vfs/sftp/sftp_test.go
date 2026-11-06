package sftp

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"encoding/pem"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"pulsares-file-explorer/internal/storage"
)

type memSFTPServer struct {
	mu      sync.Mutex
	files   map[string][]byte
	dirs    map[string]bool
	listener net.Listener
	hostKey ssh.Signer
	clientPub ssh.PublicKey
}

func startTestSFTPServer(t *testing.T) (*memSFTPServer, string, int, string) {
	t.Helper()

	// Gera par de chaves do servidor (HostKey) e do cliente (UserKey)
	_, hostPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey host: %v", err)
	}
	hostSigner, err := ssh.NewSignerFromKey(hostPriv)
	if err != nil {
		t.Fatalf("NewSignerFromKey: %v", err)
	}

	clientPubRaw, clientPrivRaw, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey client: %v", err)
	}
	clientPub, err := ssh.NewPublicKey(clientPubRaw)
	if err != nil {
		t.Fatalf("NewPublicKey: %v", err)
	}
	pemBlock, err := ssh.MarshalPrivateKey(clientPrivRaw, "")
	if err != nil {
		t.Fatalf("MarshalPrivateKey: %v", err)
	}
	keyPath := filepath.Join(t.TempDir(), "id_ed25519_test")
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(pemBlock), 0o600); err != nil {
		t.Fatalf("WriteFile key: %v", err)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen: %v", err)
	}

	srv := &memSFTPServer{
		files: map[string][]byte{
			"/etc/nginx.conf": []byte("worker_processes auto;\n"),
		},
		dirs: map[string]bool{
			"/":    true,
			"/etc": true,
		},
		listener:  ln,
		hostKey:   hostSigner,
		clientPub: clientPub,
	}

	sshCfg := &ssh.ServerConfig{
		PublicKeyCallback: func(conn ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if string(key.Marshal()) == string(srv.clientPub.Marshal()) {
				return &ssh.Permissions{}, nil
			}
			return nil, os.ErrPermission
		},
	}
	sshCfg.AddHostKey(hostSigner)

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go srv.handleConn(conn, sshCfg)
		}
	}()

	t.Cleanup(func() {
		_ = ln.Close()
	})

	tcpAddr := ln.Addr().(*net.TCPAddr)
	return srv, "127.0.0.1", tcpAddr.Port, keyPath
}

func (s *memSFTPServer) handleConn(netConn net.Conn, cfg *ssh.ServerConfig) {
	_, chans, reqs, err := ssh.NewServerConn(netConn, cfg)
	if err != nil {
		_ = netConn.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	for newChan := range chans {
		if newChan.ChannelType() != "session" {
			_ = newChan.Reject(ssh.UnknownChannelType, "unsupported")
			continue
		}
		ch, requests, err := newChan.Accept()
		if err != nil {
			continue
		}
		go func() {
			for req := range requests {
				if req.Type == "subsystem" && len(req.Payload) >= 4 && string(req.Payload[4:]) == "sftp" {
					_ = req.Reply(true, nil)
					s.serveSFTPChannel(ch)
					return
				}
				_ = req.Reply(false, nil)
			}
		}()
	}
}

func (s *memSFTPServer) serveSFTPChannel(ch ssh.Channel) {
	defer ch.Close()
	dirReadDone := make(map[string]bool)

	for {
		header := make([]byte, 5)
		if _, err := io.ReadFull(ch, header); err != nil {
			return
		}
		length := binary.BigEndian.Uint32(header[0:4])
		pktType := header[4]
		payload := make([]byte, length-1)
		if len(payload) > 0 {
			if _, err := io.ReadFull(ch, payload); err != nil {
				return
			}
		}

		switch pktType {
		case sshFxpInit:
			resp := make([]byte, 4)
			binary.BigEndian.PutUint32(resp, sftpProtocolVersion)
			_ = sendPkt(ch, sshFxpVersion, resp)

		case sshFxpRealpath:
			id := binary.BigEndian.Uint32(payload[0:4])
			var b [64]byte
			buf := b[:0]
			buf = appendUint32(buf, id)
			buf = appendUint32(buf, 1)
			buf = appendStr(buf, "/etc")
			buf = appendStr(buf, "drwxr-xr-x 1 root root 0 Jan 1 00:00 /etc")
			buf = appendUint32(buf, 0)
			_ = sendPkt(ch, sshFxpName, buf)

		case sshFxpStat, sshFxpLstat:
			id := binary.BigEndian.Uint32(payload[0:4])
			p := readStrFromSlice(payload[4:])
			s.mu.Lock()
			isDir := s.dirs[p]
			data, isFile := s.files[p]
			s.mu.Unlock()
			if !isDir && !isFile {
				_ = sendStatus(ch, id, sshFxNoSuchFile, "not found")
				continue
			}
			var buf []byte
			buf = appendUint32(buf, id)
			buf = appendUint32(buf, sshFileXferAttrSize|sshFileXferAttrPermissions|sshFileXferAttrAcModTime)
			buf = appendUint64(buf, uint64(len(data)))
			perm := uint32(0100644)
			if isDir {
				perm = 0040755
			}
			buf = appendUint32(buf, perm)
			now := uint32(time.Now().Unix())
			buf = appendUint32(buf, now)
			buf = appendUint32(buf, now)
			_ = sendPkt(ch, sshFxpAttrs, buf)

		case sshFxpOpendir:
			id := binary.BigEndian.Uint32(payload[0:4])
			p := readStrFromSlice(payload[4:])
			dirReadDone[p] = false
			var buf []byte
			buf = appendUint32(buf, id)
			buf = appendStr(buf, p)
			_ = sendPkt(ch, sshFxpHandle, buf)

		case sshFxpReaddir:
			id := binary.BigEndian.Uint32(payload[0:4])
			h := readStrFromSlice(payload[4:])
			if dirReadDone[h] {
				_ = sendStatus(ch, id, sshFxEOF, "eof")
				continue
			}
			dirReadDone[h] = true
			var buf []byte
			buf = appendUint32(buf, id)
			buf = appendUint32(buf, 1)
			buf = appendStr(buf, "nginx.conf")
			buf = appendStr(buf, "-rw-r--r-- 1 root root 23 Jan 1 00:00 nginx.conf")
			buf = appendUint32(buf, sshFileXferAttrSize|sshFileXferAttrPermissions|sshFileXferAttrAcModTime)
			buf = appendUint64(buf, 23)
			buf = appendUint32(buf, 0100644)
			now := uint32(time.Now().Unix())
			buf = appendUint32(buf, now)
			buf = appendUint32(buf, now)
			_ = sendPkt(ch, sshFxpName, buf)

		case sshFxpOpen:
			id := binary.BigEndian.Uint32(payload[0:4])
			p := readStrFromSlice(payload[4:])
			var buf []byte
			buf = appendUint32(buf, id)
			buf = appendStr(buf, p)
			_ = sendPkt(ch, sshFxpHandle, buf)

		case sshFxpRead:
			id := binary.BigEndian.Uint32(payload[0:4])
			hLen := binary.BigEndian.Uint32(payload[4:8])
			h := string(payload[8 : 8+hLen])
			offset := binary.BigEndian.Uint64(payload[8+hLen : 16+hLen])
			s.mu.Lock()
			data := s.files[h]
			s.mu.Unlock()
			if offset >= uint64(len(data)) {
				_ = sendStatus(ch, id, sshFxEOF, "eof")
				continue
			}
			var buf []byte
			buf = appendUint32(buf, id)
			buf = appendStr(buf, string(data[offset:]))
			_ = sendPkt(ch, sshFxpData, buf)

		case sshFxpWrite:
			id := binary.BigEndian.Uint32(payload[0:4])
			hLen := binary.BigEndian.Uint32(payload[4:8])
			h := string(payload[8 : 8+hLen])
			dataOff := 16 + hLen
			dLen := binary.BigEndian.Uint32(payload[dataOff : dataOff+4])
			chunk := append([]byte(nil), payload[dataOff+4:dataOff+4+dLen]...)
			s.mu.Lock()
			s.files[h] = chunk
			s.mu.Unlock()
			_ = sendStatus(ch, id, sshFxOk, "ok")

		case sshFxpClose:
			id := binary.BigEndian.Uint32(payload[0:4])
			_ = sendStatus(ch, id, sshFxOk, "ok")
		}
	}
}

func sendPkt(w io.Writer, pktType byte, payload []byte) error {
	hdr := make([]byte, 5)
	binary.BigEndian.PutUint32(hdr[0:4], uint32(1+len(payload)))
	hdr[4] = pktType
	_, _ = w.Write(hdr)
	_, err := w.Write(payload)
	return err
}

func sendStatus(w io.Writer, id, code uint32, msg string) error {
	var buf []byte
	buf = appendUint32(buf, id)
	buf = appendUint32(buf, code)
	buf = appendStr(buf, msg)
	buf = appendStr(buf, "en")
	return sendPkt(w, sshFxpStatus, buf)
}

func appendUint32(b []byte, v uint32) []byte {
	var tmp [4]byte
	binary.BigEndian.PutUint32(tmp[:], v)
	return append(b, tmp[:]...)
}

func appendUint64(b []byte, v uint64) []byte {
	var tmp [8]byte
	binary.BigEndian.PutUint64(tmp[:], v)
	return append(b, tmp[:]...)
}

func appendStr(b []byte, s string) []byte {
	b = appendUint32(b, uint32(len(s)))
	return append(b, s...)
}

func readStrFromSlice(b []byte) string {
	if len(b) < 4 {
		return ""
	}
	ln := binary.BigEndian.Uint32(b[0:4])
	if int(4+ln) > len(b) {
		return ""
	}
	return string(b[4 : 4+ln])
}

func TestSFTP_TOFUHostKeyVerificationAndFileOperations(t *testing.T) {
	_, host, port, keyPath := startTestSFTPServer(t)

	db, err := storage.OpenPath(filepath.Join(t.TempDir(), "sftp_test.db"))
	if err != nil {
		t.Fatalf("OpenPath: %v", err)
	}
	defer db.Close()

	mgr := NewManager(db)
	defer mgr.CloseAll()

	// 1. Primeira tentativa sem TrustHost deve exigir confirmação TOFU da chave pública SHA-256
	res1, err := mgr.Connect(context.Background(), ConnectRequest{
		Name:       "Servidor Intranet",
		Host:       host,
		Port:       port,
		Username:   "admin",
		RemotePath: "/etc",
		AuthType:   "key",
		KeyPath:    keyPath,
		TrustHost:  false,
	})
	if err != nil {
		t.Fatalf("Connect step 1 err: %v", err)
	}
	if res1.Connected || !res1.NeedsHostTrust || res1.HostKeyFP == "" {
		t.Fatalf("expected NeedsHostTrust with SHA256 fingerprint, got %+v", res1)
	}

	// 2. Segunda tentativa com TrustHost=true fixa a fingerprint no SQLite e conecta com sucesso
	res2, err := mgr.Connect(context.Background(), ConnectRequest{
		Name:       "Servidor Intranet",
		Host:       host,
		Port:       port,
		Username:   "admin",
		RemotePath: "/etc",
		AuthType:   "key",
		KeyPath:    keyPath,
		TrustHost:  true,
	})
	if err != nil || !res2.Connected || res2.ProfileID <= 0 {
		t.Fatalf("expected successful SFTP connection after TrustHost, got %+v (err=%v)", res2, err)
	}

	// 3. Listagem de diretório via SFTP v3
	batchCh, errCh := mgr.ReadDir(context.Background(), res2.ProfileID, "/etc", 50)
	var entriesCount int
	for batch := range batchCh {
		entriesCount += len(batch)
	}
	if rErr := <-errCh; rErr != nil {
		t.Fatalf("ReadDir SFTP failed: %v", rErr)
	}
	if entriesCount != 1 {
		t.Fatalf("expected 1 remote entry in /etc, got %d", entriesCount)
	}

	// 4. Leitura e escrita segura de arquivo remoto
	content, err := mgr.ReadBytes(context.Background(), res2.ProfileID, "/etc/nginx.conf", 4096)
	if err != nil || string(content) != "worker_processes auto;\n" {
		t.Fatalf("ReadBytes SFTP unexpected: %q (err=%v)", string(content), err)
	}

	if err := mgr.WriteBytes(context.Background(), res2.ProfileID, "/etc/nginx.conf", []byte("worker_processes 4;\n")); err != nil {
		t.Fatalf("WriteBytes SFTP failed: %v", err)
	}
	updated, err := mgr.ReadBytes(context.Background(), res2.ProfileID, "/etc/nginx.conf", 4096)
	if err != nil || string(updated) != "worker_processes 4;\n" {
		t.Fatalf("ReadBytes after write unexpected: %q (err=%v)", string(updated), err)
	}
}

