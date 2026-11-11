package platform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExpandPath_TildeAndEnvVars(t *testing.T) {
	home := GetHomeDir()
	if got := ExpandPath("~"); got != filepath.Clean(home) {
		t.Errorf("ExpandPath('~') = %q, want %q", got, filepath.Clean(home))
	}

	sub := ExpandPath("~/Documents")
	wantSub := filepath.Join(home, "Documents")
	if sub != wantSub {
		t.Errorf("ExpandPath('~/Documents') = %q, want %q", sub, wantSub)
	}

	t.Setenv("PULSARES_TEST_DIR", filepath.Join(home, "CustomDir"))

	gotWin := ExpandPath("%PULSARES_TEST_DIR%/sub")
	wantWin := filepath.Join(home, "CustomDir", "sub")
	if gotWin != wantWin {
		t.Errorf("ExpandPath with %%VAR%% = %q, want %q", gotWin, wantWin)
	}

	gotPosix := ExpandPath("$PULSARES_TEST_DIR/sub")
	if gotPosix != wantWin {
		t.Errorf("ExpandPath with $VAR = %q, want %q", gotPosix, wantWin)
	}
}

func TestAutocompleteDirs(t *testing.T) {
	tmp := t.TempDir()
	_ = os.MkdirAll(filepath.Join(tmp, "projetos"), 0755)
	_ = os.MkdirAll(filepath.Join(tmp, "produtos"), 0755)
	_ = os.MkdirAll(filepath.Join(tmp, "documentos"), 0755)
	_ = os.WriteFile(filepath.Join(tmp, "planilha.xlsx"), []byte("x"), 0644)

	matches := AutocompleteDirs(filepath.Join(tmp, "pro"), false, 10)
	if len(matches) != 2 {
		t.Fatalf("expected 2 directory matches for 'pro', got %d (%v)", len(matches), matches)
	}
	for _, m := range matches {
		base := strings.ToLower(filepath.Base(m))
		if !strings.HasPrefix(base, "pro") {
			t.Errorf("unexpected suggestion %q", m)
		}
	}
}

func TestParseNetworkAddressAndExpandUNC(t *testing.T) {
	proto, host, share, sub := ParseNetworkAddress(`\\192.168.10.195\`)
	if proto != "smb" || host != "192.168.10.195" || share != "" || sub != "" {
		t.Fatalf("unexpected ParseNetworkAddress for bare UNC: proto=%q host=%q share=%q sub=%q", proto, host, share, sub)
	}

	proto, host, share, sub = ParseNetworkAddress(`smb://192.168.10.195/Publico/Docs`)
	if proto != "smb" || host != "192.168.10.195" || share != "Publico" || sub != "Docs" {
		t.Fatalf("unexpected ParseNetworkAddress for smb URL: proto=%q host=%q share=%q sub=%q", proto, host, share, sub)
	}

	if gotHost, ok := IsNetworkServerRoot(`\\192.168.10.195\`); !ok || gotHost != "192.168.10.195" {
		t.Fatalf("expected IsNetworkServerRoot true for \\\\192.168.10.195\\, got ok=%v host=%q", ok, gotHost)
	}
	if _, ok := IsNetworkServerRoot(`\\192.168.10.195\Publico`); ok {
		t.Fatalf("expected IsNetworkServerRoot false when share is present")
	}

	// AFP URL
	proto, host, share, sub = ParseNetworkAddress(`afp://192.168.10.195/TimeMachine/Backups`)
	if proto != "afp" || host != "192.168.10.195" || share != "TimeMachine" || sub != "Backups" {
		t.Fatalf("unexpected ParseNetworkAddress for afp URL: proto=%q host=%q share=%q sub=%q", proto, host, share, sub)
	}

	// NFS URL com exportação multi-nível
	proto, host, share, sub = ParseNetworkAddress(`nfs://192.168.10.195/volume1/media`)
	if proto != "nfs" || host != "192.168.10.195" || share != "volume1/media" || sub != "" {
		t.Fatalf("unexpected ParseNetworkAddress for nfs URL: proto=%q host=%q share=%q sub=%q", proto, host, share, sub)
	}

	// Sintaxe clássica NFS host:/export/path
	proto, host, share, sub = ParseNetworkAddress(`192.168.10.195:/srv/nfs/publico`)
	if proto != "nfs" || host != "192.168.10.195" || share != "srv/nfs/publico" || sub != "" {
		t.Fatalf("unexpected ParseNetworkAddress for classic NFS: proto=%q host=%q share=%q sub=%q", proto, host, share, sub)
	}

	// Protocolo explícito informado no modal sem esquema na URL
	proto, host, share, sub = ParseNetworkAddressWithProtocol(`192.168.10.195/MacFiles/Fotos`, "afp")
	if proto != "afp" || host != "192.168.10.195" || share != "MacFiles" || sub != "Fotos" {
		t.Fatalf("unexpected ParseNetworkAddressWithProtocol(afp): proto=%q host=%q share=%q sub=%q", proto, host, share, sub)
	}

	proto, host, share, sub = ParseNetworkAddressWithProtocol(`192.168.10.195/mnt/pool/dados`, "nfs")
	if proto != "nfs" || host != "192.168.10.195" || share != "mnt/pool/dados" || sub != "" {
		t.Fatalf("unexpected ParseNetworkAddressWithProtocol(nfs): proto=%q host=%q share=%q sub=%q", proto, host, share, sub)
	}

	// Raiz de servidor NFS e AFP
	if gotHost, ok := IsNetworkServerRoot(`nfs://192.168.10.195`); !ok || gotHost != "192.168.10.195" {
		t.Fatalf("expected IsNetworkServerRoot true for nfs://192.168.10.195, got ok=%v host=%q", ok, gotHost)
	}
	if gotHost, ok := IsNetworkServerRoot(`afp://192.168.10.195`); !ok || gotHost != "192.168.10.195" {
		t.Fatalf("expected IsNetworkServerRoot true for afp://192.168.10.195, got ok=%v host=%q", ok, gotHost)
	}

	// ParseShowmountExports
	sampleShowmount := "Export list for 192.168.10.195:\n/srv/nfs/publico *\n/volume1/media 192.168.10.0/24\n"
	exports := ParseShowmountExports(sampleShowmount, "192.168.10.195", false)
	if len(exports) != 2 || exports[0].Path != "nfs://192.168.10.195/srv/nfs/publico" || exports[1].Name != "volume1/media" {
		t.Fatalf("unexpected ParseShowmountExports unix output: %+v", exports)
	}
	exportsWin := ParseShowmountExports(sampleShowmount, "192.168.10.195", true)
	if len(exportsWin) != 2 || exportsWin[0].Path != `\\192.168.10.195\srv\nfs\publico` {
		t.Fatalf("unexpected ParseShowmountExports windows output: %+v", exportsWin)
	}
}

