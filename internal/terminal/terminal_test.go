package terminal

import (
	"bytes"
	"context"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestQuotePath_AllShellsWithSpacesAccentsAndQuotes(t *testing.T) {
	winPath := `C:\Usuários\João\Projetos & Arquivos\relatório '2026'.txt`
	unixPath := `/home/joão/Projetos & Arquivos/relatório '2026'.txt`

	// PowerShell
	psQuoted := QuotePath(ShellPowerShell, winPath)
	expectedPS := `'C:\Usuários\João\Projetos & Arquivos\relatório ''2026''.txt'`
	if psQuoted != expectedPS {
		t.Fatalf("PowerShell quote mismatch: got %s, want %s", psQuoted, expectedPS)
	}

	// Cmd
	cmdQuoted := QuotePath(ShellCmd, `C:\Pasta 100% "Especial"\arquivo.txt`)
	expectedCmd := `"C:\Pasta 100%% ""Especial""\arquivo.txt"`
	if cmdQuoted != expectedCmd {
		t.Fatalf("Cmd quote mismatch: got %s, want %s", cmdQuoted, expectedCmd)
	}

	// Posix (bash / zsh)
	posixQuoted := QuotePath(ShellPosix, unixPath)
	expectedPosix := `'/home/joão/Projetos & Arquivos/relatório '\''2026'\''.txt'`
	if posixQuoted != expectedPosix {
		t.Fatalf("Posix quote mismatch: got %s, want %s", posixQuoted, expectedPosix)
	}

	// Fish
	fishQuoted := QuotePath(ShellFish, `/home/joão/pasta\teste'1`)
	expectedFish := `'/home/joão/pasta\\teste\'1'`
	if fishQuoted != expectedFish {
		t.Fatalf("Fish quote mismatch: got %s, want %s", fishQuoted, expectedFish)
	}

	// WSL
	wslQuoted := QuotePath(ShellWSL, `C:\Users\Vitor\Meus Projetos`)
	expectedWSL := `'/mnt/c/Users/Vitor/Meus Projetos'`
	if wslQuoted != expectedWSL {
		t.Fatalf("WSL quote mismatch: got %s, want %s", wslQuoted, expectedWSL)
	}
}

func TestFormatChangeDirCommand(t *testing.T) {
	psCmd := FormatChangeDirCommand(ShellPowerShell, `D:\Projetos\api`)
	if !strings.HasPrefix(psCmd, "Set-Location -LiteralPath 'D:\\Projetos\\api'") {
		t.Fatalf("unexpected PowerShell cd command: %q", psCmd)
	}

	cmdCmd := FormatChangeDirCommand(ShellCmd, `D:\Projetos\api`)
	if !strings.HasPrefix(cmdCmd, `cd /d "D:\Projetos\api"`) {
		t.Fatalf("unexpected Cmd cd command: %q", cmdCmd)
	}

	bashCmd := FormatChangeDirCommand(ShellPosix, `/var/log/app`)
	if bashCmd != "cd -- '/var/log/app'\n" {
		t.Fatalf("unexpected Posix cd command: %q", bashCmd)
	}
}

func TestParseOSC7(t *testing.T) {
	rawUnix := []byte("alguma saída\x1b]7;file://localhost/home/vitor/Projetos%20Go/api\x07prompt$ ")
	gotUnix := ParseOSC7(rawUnix)
	if gotUnix != "/home/vitor/Projetos Go/api" {
		t.Fatalf("expected '/home/vitor/Projetos Go/api', got %q", gotUnix)
	}

	rawWin := []byte("\x1b]7;file://HOSTNAME/C:/Users/Vitor/ Documentos%20%C3%9Ateis\x1b\\")
	gotWin := ParseOSC7(rawWin)
	if !strings.Contains(gotWin, "C:") || !strings.Contains(gotWin, "Documentos Úteis") {
		t.Fatalf("expected Windows path with accents, got %q", gotWin)
	}
}

func TestTerminalService_LifecycleResizeAndUTF8Output(t *testing.T) {
	var mu sync.Mutex
	var received bytes.Buffer
	exitedCh := make(chan int, 2)

	svc := New(func(eventName string, data any) {
		switch ev := data.(type) {
		case DataEvent:
			decoded, err := base64.StdEncoding.DecodeString(ev.Chunk)
			if err == nil {
				mu.Lock()
				received.Write(decoded)
				mu.Unlock()
			}
		case ExitEvent:
			if eventName == "terminal:exit" {
				exitedCh <- ev.ExitCode
			}
		}
	})

	profiles, err := svc.Profiles(context.Background())
	if err != nil || len(profiles) == 0 {
		t.Fatalf("expected at least one detected shell profile, err=%v", err)
	}

	tmpDir := t.TempDir()
	sessID, err := svc.Start(profiles[0].ID, tmpDir, 100, 30)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer func() {
		_ = svc.Kill(sessID)
	}()

	// Testa redimensionamento
	if err := svc.Resize(sessID, 120, 40); err != nil {
		t.Fatalf("Resize failed: %v", err)
	}
	if err := svc.Resize(sessID, 0, -1); err == nil {
		t.Fatalf("expected error on invalid Resize dimensions")
	}

	// Testa citação de caminhos para a sessão ativa
	quoted, err := svc.QuotePathsForSession(sessID, []string{`C:\Pasta Com Espaços\ação.txt`})
	if err != nil || quoted == "" {
		t.Fatalf("QuotePathsForSession failed: %v", err)
	}

	// Envia comando echo com acentos e emoji
	testToken := "Pulsares_Ação_🚀_OK"
	if err := svc.Write(sessID, []byte("echo "+testToken+"\r\n")); err != nil {
		t.Fatalf("Write failed: %v", err)
	}

	deadline := time.Now().Add(4 * time.Second)
	found := false
	for time.Now().Before(deadline) {
		mu.Lock()
		out := received.String()
		mu.Unlock()
		if strings.Contains(out, "Pulsares_") {
			found = true
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	if !found {
		mu.Lock()
		out := received.String()
		mu.Unlock()
		t.Fatalf("expected output containing token, got: %q", out)
	}

	// Testa Ack de contrapressão e encerramento da árvore de processos
	if err := svc.Ack(sessID, 4096); err != nil {
		t.Fatalf("Ack failed: %v", err)
	}
	if err := svc.Kill(sessID); err != nil {
		t.Fatalf("Kill failed: %v", err)
	}
}

func TestAutocomplete_FilesDirsAndCommands(t *testing.T) {
	tmp := t.TempDir()
	_ = os.MkdirAll(filepath.Join(tmp, "docs-api"), 0o755)
	_ = os.MkdirAll(filepath.Join(tmp, "pasta com espacos"), 0o755)
	_ = os.WriteFile(filepath.Join(tmp, "readme.md"), []byte("# Readme"), 0o644)

	svc := New(nil)
	matches, err := svc.Autocomplete("unknown-session", tmp, "cd doc")
	if err != nil {
		t.Fatalf("Autocomplete failed: %v", err)
	}
	if len(matches) != 1 || !strings.HasPrefix(matches[0], "cd docs-api") {
		t.Fatalf("unexpected matches for 'cd doc': %+v", matches)
	}

	spacedMatches, err := svc.Autocomplete("unknown-session", tmp, "cd pas")
	if err != nil {
		t.Fatalf("Autocomplete spaced failed: %v", err)
	}
	if len(spacedMatches) != 1 || !strings.Contains(spacedMatches[0], `"pasta com espacos`) {
		t.Fatalf("expected quoted spaced path, got: %+v", spacedMatches)
	}
}
