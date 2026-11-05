package ops

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/storage"
)

func setupTestOpsManager(t *testing.T) (*Manager, chan JobSnapshot) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "ops_test.db")
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { sqlDB.Close() })

	db := &storage.DB{DB: sqlDB}
	_, err = db.Exec(`
		CREATE TABLE op_journal (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			op_type TEXT NOT NULL,
			src_path TEXT NOT NULL,
			dst_path TEXT NOT NULL,
			undone INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create op_journal: %v", err)
	}

	updates := make(chan JobSnapshot, 128)
	mgr := NewManager(db, func(eventName string, data interface{}) {
		if eventName == "ops:update" {
			updates <- data.(JobSnapshot)
		}
	})
	mgr.SetTrashStagingDir(filepath.Join(t.TempDir(), "trash-staging"))
	return mgr, updates
}

func waitForJobStatus(t *testing.T, updates <-chan JobSnapshot, jobID string, target JobStatus) JobSnapshot {
	t.Helper()
	timeout := time.After(5 * time.Second)
	for {
		select {
		case snap := <-updates:
			if snap.ID == jobID && snap.Status == target {
				return snap
			}
		case <-timeout:
			t.Fatalf("timeout waiting for job %s to reach status %s", jobID, target)
		}
	}
}

func TestValidateFileName_ReservedAndInvalid(t *testing.T) {
	invalid := []string{"", ".", "..", "CON", "nul", "NUL.txt", "com1", "lpt9.doc", "a/b", `a\b`, "a:b", "a*b"}
	for _, name := range invalid {
		if err := ValidateFileName(name); err == nil {
			t.Errorf("expected ValidateFileName(%q) to fail", name)
		}
	}
	valid := []string{"relatorio.pdf", "CONSOLE.txt", "arquivo (1).txt", ".gitignore"}
	for _, name := range valid {
		if err := ValidateFileName(name); err != nil {
			t.Errorf("expected ValidateFileName(%q) to succeed, got %v", name, err)
		}
	}
}

func TestCreateRenameTrashAndUndoRedo(t *testing.T) {
	mgr, updates := setupTestOpsManager(t)
	root := t.TempDir()

	// 1. Criar pasta e desfazer/refazer
	folderPath, err := mgr.CreateFolder(root, "Projetos")
	if err != nil {
		t.Fatalf("CreateFolder failed: %v", err)
	}
	if _, err := os.Stat(folderPath); err != nil {
		t.Fatalf("folder should exist: %v", err)
	}

	if _, err := mgr.Undo(); err != nil {
		t.Fatalf("Undo mkdir failed: %v", err)
	}
	if _, err := os.Stat(folderPath); !os.IsNotExist(err) {
		t.Fatalf("folder should be removed after Undo")
	}

	if _, err := mgr.Redo(); err != nil {
		t.Fatalf("Redo mkdir failed: %v", err)
	}
	if _, err := os.Stat(folderPath); err != nil {
		t.Fatalf("folder should exist after Redo: %v", err)
	}

	// 2. Criar arquivo e renomear
	filePath, err := mgr.CreateFile(folderPath, "notas.txt")
	if err != nil {
		t.Fatalf("CreateFile failed: %v", err)
	}
	renamedPath, err := mgr.Rename(filePath, "notas-v2.txt")
	if err != nil {
		t.Fatalf("Rename failed: %v", err)
	}
	if _, err := os.Stat(renamedPath); err != nil {
		t.Fatalf("renamed file should exist: %v", err)
	}

	// Desfazer rename
	if _, err := mgr.Undo(); err != nil {
		t.Fatalf("Undo rename failed: %v", err)
	}
	if _, err := os.Stat(filePath); err != nil {
		t.Fatalf("original file name should be restored after Undo: %v", err)
	}

	// 3. Enviar para lixeira e desfazer (restaurar da lixeira)
	jobID := mgr.Enqueue(JobTrash, []string{filePath}, "", PolicyOverwrite, false)
	waitForJobStatus(t, updates, jobID, StatusCompleted)

	if _, err := os.Stat(filePath); !os.IsNotExist(err) {
		t.Fatalf("trashed file should not exist in original location")
	}

	if _, err := mgr.Undo(); err != nil {
		t.Fatalf("Undo trash failed: %v", err)
	}
	if _, err := os.Stat(filePath); err != nil {
		t.Fatalf("trashed file should be restored after Undo: %v", err)
	}
}

func TestCopyConflictPoliciesAndVerifyHash(t *testing.T) {
	mgr, updates := setupTestOpsManager(t)
	srcDir := t.TempDir()
	dstDir := t.TempDir()

	srcFile := filepath.Join(srcDir, "dados.txt")
	if err := os.WriteFile(srcFile, []byte("conteudo novo"), 0644); err != nil {
		t.Fatalf("write src: %v", err)
	}

	dstFile := filepath.Join(dstDir, "dados.txt")
	if err := os.WriteFile(dstFile, []byte("antigo"), 0644); err != nil {
		t.Fatalf("write dst: %v", err)
	}

	// 1. PolicyAsk -> aguarda resolução interativa (PolicyRename)
	jobID := mgr.Enqueue(JobCopy, []string{srcFile}, dstDir, PolicyAsk, true)
	waitForJobStatus(t, updates, jobID, StatusConflict)
	mgr.ResolveConflict(jobID, PolicyRename, true)
	waitForJobStatus(t, updates, jobID, StatusCompleted)

	renamedCopy := filepath.Join(dstDir, "dados (1).txt")
	gotBytes, err := os.ReadFile(renamedCopy)
	if err != nil {
		t.Fatalf("expected renamed copy %s to exist: %v", renamedCopy, err)
	}
	if string(gotBytes) != "conteudo novo" {
		t.Errorf("expected 'conteudo novo', got %q", string(gotBytes))
	}
}

func TestCancelLeavesNoPartialFile(t *testing.T) {
	mgr, updates := setupTestOpsManager(t)
	srcDir := t.TempDir()
	dstDir := t.TempDir()

	// Arquivo grande (4 MB) para pausar/cancelar no meio
	srcFile := filepath.Join(srcDir, "grande.bin")
	payload := bytes.Repeat([]byte("A"), 4*1024*1024)
	if err := os.WriteFile(srcFile, payload, 0644); err != nil {
		t.Fatalf("write large file: %v", err)
	}

	jobID := mgr.Enqueue(JobCopy, []string{srcFile}, dstDir, PolicyOverwrite, false)
	mgr.CancelJob(jobID)
	waitForJobStatus(t, updates, jobID, StatusCanceled)

	entries, err := os.ReadDir(dstDir)
	if err != nil {
		t.Fatalf("readdir dst: %v", err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".pulsares-part") {
			t.Fatalf("found leftover partial file after cancel: %s", e.Name())
		}
	}
}

func TestSimulatedDiskFullCleansUpPartialFile(t *testing.T) {
	mgr, updates := setupTestOpsManager(t)
	mgr.MaxWritableBytes = 32 * 1024 // Limitar a 32 KB para simular disco cheio

	srcDir := t.TempDir()
	dstDir := t.TempDir()

	srcFile := filepath.Join(srcDir, "video.bin")
	if err := os.WriteFile(srcFile, bytes.Repeat([]byte("X"), 256*1024), 0644); err != nil {
		t.Fatalf("write src: %v", err)
	}

	jobID := mgr.Enqueue(JobCopy, []string{srcFile}, dstDir, PolicyOverwrite, false)
	waitForJobStatus(t, updates, jobID, StatusFailed)

	entries, err := os.ReadDir(dstDir)
	if err != nil {
		t.Fatalf("readdir dst: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected 0 files in dst after disk full failure, got %d", len(entries))
	}
}

func TestLongPathSupport(t *testing.T) {
	mgr, updates := setupTestOpsManager(t)
	srcRoot := t.TempDir()
	dstRoot := t.TempDir()

	// Construir caminho longo (> 245 caracteres)
	deep := srcRoot
	for i := 0; i < 6; i++ {
		deep = filepath.Join(deep, "subpasta_com_nome_bem_extenso_para_teste_de_limite")
	}
	if err := os.MkdirAll(platform.NormalizeLongPath(deep), 0755); err != nil {
		t.Fatalf("mkdir deep failed: %v", err)
	}
	longFile := filepath.Join(deep, "arquivo_no_caminho_longo.txt")
	if err := os.WriteFile(platform.NormalizeLongPath(longFile), []byte("ok-long-path"), 0644); err != nil {
		t.Fatalf("write long file: %v", err)
	}

	jobID := mgr.Enqueue(JobMove, []string{longFile}, dstRoot, PolicyOverwrite, true)
	waitForJobStatus(t, updates, jobID, StatusCompleted)

	movedFile := filepath.Join(dstRoot, "arquivo_no_caminho_longo.txt")
	data, err := os.ReadFile(movedFile)
	if err != nil {
		t.Fatalf("read moved long file: %v", err)
	}
	if string(data) != "ok-long-path" {
		t.Errorf("unexpected content %q", string(data))
	}
}
