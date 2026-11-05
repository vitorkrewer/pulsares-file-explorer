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

