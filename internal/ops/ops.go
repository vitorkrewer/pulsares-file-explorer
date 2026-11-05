package ops

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/storage"
	"pulsares-file-explorer/internal/vfs"
)

var (
	ErrReservedName = errors.New("reserved file name")
	ErrDiskFull     = errors.New("not enough space on disk")
)

type JobKind string

const (
	JobCopy   JobKind = "copy"
	JobMove   JobKind = "move"
	JobTrash  JobKind = "trash"
	JobDelete JobKind = "delete"
)

type JobStatus string

const (
	StatusQueued    JobStatus = "queued"
	StatusPlanning  JobStatus = "planning"
	StatusRunning   JobStatus = "running"
	StatusPaused    JobStatus = "paused"
	StatusConflict  JobStatus = "conflict"
	StatusVerifying JobStatus = "verifying"
	StatusCompleted JobStatus = "completed"
	StatusFailed    JobStatus = "failed"
	StatusCanceled  JobStatus = "canceled"
)

type ConflictPolicy string

const (
	PolicyAsk       ConflictPolicy = "ask"
	PolicyOverwrite ConflictPolicy = "overwrite"
	PolicySkip      ConflictPolicy = "skip"
	PolicyRename    ConflictPolicy = "rename"
	PolicyKeepNewer ConflictPolicy = "keepNewer"
)

type ConflictInfo struct {
	SrcPath    string    `json:"srcPath"`
	DstPath    string    `json:"dstPath"`
	SrcSize    int64     `json:"srcSize"`
	DstSize    int64     `json:"dstSize"`
	SrcModTime time.Time `json:"srcModTime"`
	DstModTime time.Time `json:"dstModTime"`
}

type JobSnapshot struct {
	ID          string          `json:"id"`
	Kind        JobKind         `json:"kind"`
	Sources     []string        `json:"sources"`
	Destination string          `json:"destination"`
	Status      JobStatus       `json:"status"`
	Policy      ConflictPolicy  `json:"policy"`
	VerifyHash  bool            `json:"verifyHash"`
	TotalBytes  int64           `json:"totalBytes"`
	DoneBytes   int64           `json:"doneBytes"`
	TotalItems  int             `json:"totalItems"`
	DoneItems   int             `json:"doneItems"`
	CurrentItem string          `json:"currentItem"`
	SpeedBps    int64           `json:"speedBps"`
	EtaSeconds  int             `json:"etaSeconds"`
	Error       string          `json:"error,omitempty"`
	Conflict    *ConflictInfo   `json:"conflict,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
}

type EventEmitter func(eventName string, data interface{})

type conflictDecision struct {
	policy     ConflictPolicy
	applyToAll bool
}

type runningJob struct {
	mu           sync.Mutex
	snapshot     JobSnapshot
	ctx          context.Context
	cancel       context.CancelFunc
	pauseCh      chan struct{}
	paused       bool
	conflictCh   chan conflictDecision
	startedAt    time.Time
}

type Manager struct {
	mu               sync.Mutex
	db               *storage.DB
	emit             EventEmitter
	jobs             map[string]*runningJob
	jobOrder         []string
	trashStagingDir  string
	MaxWritableBytes int64 // Apenas para testes de disco cheio simulado (0 = ilimitado)
	UseSystemTrash   bool  // Quando true, além do staging tenta enviar à lixeira do SO
}

func NewManager(db *storage.DB, emit EventEmitter) *Manager {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.TempDir()
	}
	staging := filepath.Join(configDir, "PulsaresExplorer", "TrashStaging")
	_ = os.MkdirAll(staging, 0700)

	return &Manager{
		db:              db,
		emit:            emit,
		jobs:            make(map[string]*runningJob),
		trashStagingDir: staging,
	}
}

func (m *Manager) SetTrashStagingDir(dir string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.trashStagingDir = dir
	_ = os.MkdirAll(dir, 0700)
}

var reservedWindowsNames = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true,
	"COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true,
	"LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
}

// ValidateFileName verifica nomes vazios, separadores inválidos e nomes reservados do Windows.
func ValidateFileName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || trimmed == "." || trimmed == ".." {
		return vfs.ErrInvalidPath
	}
	if strings.ContainsAny(trimmed, `/\<>:"|?*`) {
		return vfs.ErrInvalidPath
	}
	stem := trimmed
	if dot := strings.IndexByte(trimmed, '.'); dot >= 0 {
		stem = trimmed[:dot]
	}
	if reservedWindowsNames[strings.ToUpper(stem)] {
		return ErrReservedName
	}
	return nil
}

// CreateFolder cria uma nova pasta imediatamente e registra no diário.
func (m *Manager) CreateFolder(parentDir, name string) (string, error) {
	if err := ValidateFileName(name); err != nil {
		return "", err
	}
	target := filepath.Join(filepath.Clean(parentDir), strings.TrimSpace(name))
	longTarget := platform.NormalizeLongPath(target)

	if _, err := os.Lstat(longTarget); err == nil {
		return "", vfs.ErrExists
	}
	if err := os.Mkdir(longTarget, 0755); err != nil {
		if os.IsPermission(err) {
			return "", vfs.ErrPermission
		}
		return "", err
	}
	m.recordJournal("mkdir", "", target)
	return target, nil
}

// CreateFile cria um arquivo vazio imediatamente e registra no diário.
func (m *Manager) CreateFile(parentDir, name string) (string, error) {
	if err := ValidateFileName(name); err != nil {
		return "", err
	}
	target := filepath.Join(filepath.Clean(parentDir), strings.TrimSpace(name))
	longTarget := platform.NormalizeLongPath(target)

	f, err := os.OpenFile(longTarget, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		if os.IsExist(err) {
			return "", vfs.ErrExists
		}
		if os.IsPermission(err) {
			return "", vfs.ErrPermission
		}
		return "", err
	}
	_ = f.Close()
	m.recordJournal("create", "", target)
	return target, nil
}

// Rename renomeia um arquivo ou diretório tratando mudança apenas de caixa (case-only) e registrando no diário.
func (m *Manager) Rename(oldPath, newName string) (string, error) {
	if err := ValidateFileName(newName); err != nil {
		return "", err
	}
	cleanOld := filepath.Clean(oldPath)
	parent := filepath.Dir(cleanOld)
	newPath := filepath.Join(parent, strings.TrimSpace(newName))

	if cleanOld == newPath {
		return cleanOld, nil
	}

	caseOnly := strings.EqualFold(cleanOld, newPath)
	if !caseOnly {
		if _, err := os.Lstat(platform.NormalizeLongPath(newPath)); err == nil {
			return "", vfs.ErrExists
		}
	}

	if err := os.Rename(platform.NormalizeLongPath(cleanOld), platform.NormalizeLongPath(newPath)); err != nil {
		if os.IsPermission(err) {
			return "", vfs.ErrPermission
		}
		if os.IsNotExist(err) {
			return "", vfs.ErrNotFound
		}
		return "", err
	}

	m.recordJournal("rename", cleanOld, newPath)
	return newPath, nil
}

func (m *Manager) Enqueue(kind JobKind, sources []string, destination string, policy ConflictPolicy, verifyHash bool) string {
	if policy == "" {
		policy = PolicyAsk
	}
	jobID := fmt.Sprintf("job-%d", time.Now().UnixNano())
	ctx, cancel := context.WithCancel(context.Background())

	rj := &runningJob{
		snapshot: JobSnapshot{
			ID:          jobID,
			Kind:        kind,
			Sources:     sources,
			Destination: destination,
			Status:      StatusQueued,
			Policy:      policy,
			VerifyHash:  verifyHash,
			CreatedAt:   time.Now(),
		},
		ctx:        ctx,
		cancel:     cancel,
		conflictCh: make(chan conflictDecision, 1),
	}

	m.mu.Lock()
	m.jobs[jobID] = rj
	m.jobOrder = append([]string{jobID}, m.jobOrder...)
	m.mu.Unlock()

	m.emitJobUpdate(rj)
	go m.runJob(rj)
	return jobID
}

func (m *Manager) ListJobs() []JobSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]JobSnapshot, 0, len(m.jobOrder))
	for _, id := range m.jobOrder {
		if j, ok := m.jobs[id]; ok {
			j.mu.Lock()
			out = append(out, j.snapshot)
			j.mu.Unlock()
		}
	}
	return out
}

func (m *Manager) PauseJob(jobID string) {
	m.mu.Lock()
	rj, ok := m.jobs[jobID]
	m.mu.Unlock()
	if !ok {
		return
	}
	rj.mu.Lock()
	if rj.snapshot.Status == StatusRunning && !rj.paused {
		rj.paused = true
		rj.pauseCh = make(chan struct{})
		rj.snapshot.Status = StatusPaused
	}
	rj.mu.Unlock()
	m.emitJobUpdate(rj)
}

func (m *Manager) ResumeJob(jobID string) {
	m.mu.Lock()
	rj, ok := m.jobs[jobID]
	m.mu.Unlock()
	if !ok {
		return
	}
	rj.mu.Lock()
	if rj.paused {
		rj.paused = false
		if rj.pauseCh != nil {
			close(rj.pauseCh)
			rj.pauseCh = nil
		}
		rj.snapshot.Status = StatusRunning
	}
	rj.mu.Unlock()
	m.emitJobUpdate(rj)
}

func (m *Manager) CancelJob(jobID string) {
	m.mu.Lock()
	rj, ok := m.jobs[jobID]
	m.mu.Unlock()
	if !ok {
		return
	}
	rj.mu.Lock()
	if rj.paused && rj.pauseCh != nil {
		close(rj.pauseCh)
		rj.pauseCh = nil
		rj.paused = false
	}
	rj.cancel()
	rj.mu.Unlock()
}

func (m *Manager) ResolveConflict(jobID string, policy ConflictPolicy, applyToAll bool) {
	m.mu.Lock()
	rj, ok := m.jobs[jobID]
	m.mu.Unlock()
	if !ok {
		return
	}
	select {
	case rj.conflictCh <- conflictDecision{policy: policy, applyToAll: applyToAll}:
	default:
	}
}

type plannedItem struct {
	srcPath string
	relPath string
	info    os.FileInfo
	isDir   bool
	isLink  bool
}

func (m *Manager) runJob(rj *runningJob) {
	rj.mu.Lock()
	rj.snapshot.Status = StatusPlanning
	rj.startedAt = time.Now()
	rj.mu.Unlock()
	m.emitJobUpdate(rj)

	items, totalBytes, err := m.planItems(rj.ctx, rj.snapshot.Sources)
	if err != nil {
		m.finishJob(rj, err)
		return
	}

	rj.mu.Lock()
	rj.snapshot.TotalItems = len(items)
	rj.snapshot.TotalBytes = totalBytes
	rj.snapshot.Status = StatusRunning
	rj.mu.Unlock()
	m.emitJobUpdate(rj)

	switch rj.snapshot.Kind {
	case JobTrash:
		err = m.executeTrash(rj)
	case JobDelete:
		err = m.executeDelete(rj)
	case JobCopy:
		err = m.executeCopyOrMove(rj, items, false)
	case JobMove:
		err = m.executeCopyOrMove(rj, items, true)
	}

	m.finishJob(rj, err)
}

func (m *Manager) finishJob(rj *runningJob, err error) {
	rj.mu.Lock()
	if errors.Is(err, context.Canceled) || rj.ctx.Err() != nil {
		rj.snapshot.Status = StatusCanceled
		rj.snapshot.Error = ""
	} else if err != nil {
		rj.snapshot.Status = StatusFailed
		rj.snapshot.Error = vfs.ErrorCode(err)
	} else {
		rj.snapshot.Status = StatusCompleted
	}
	rj.snapshot.Conflict = nil
	rj.mu.Unlock()
	m.emitJobUpdate(rj)
}

func (m *Manager) planItems(ctx context.Context, sources []string) ([]plannedItem, int64, error) {
	var items []plannedItem
	var totalBytes int64

	for _, src := range sources {
		if err := ctx.Err(); err != nil {
			return nil, 0, err
		}
		cleanSrc := filepath.Clean(src)
		info, err := os.Lstat(platform.NormalizeLongPath(cleanSrc))
		if err != nil {
			if os.IsNotExist(err) {
				return nil, 0, vfs.ErrNotFound
			}
			if os.IsPermission(err) {
				return nil, 0, vfs.ErrPermission
			}
			return nil, 0, err
		}

		baseName := filepath.Base(cleanSrc)
		isLink := info.Mode()&os.ModeSymlink != 0
		if isLink || !info.IsDir() {
			items = append(items, plannedItem{
				srcPath: cleanSrc,
				relPath: baseName,
				info:    info,
				isDir:   false,
				isLink:  isLink,
			})
			if !isLink {
				totalBytes += info.Size()
			}
			continue
		}

		// Caminhar diretório sem seguir symlinks recursivamente
		err = walkNoFollowSymlinks(ctx, cleanSrc, baseName, &items, &totalBytes)
		if err != nil {
			return nil, 0, err
		}
	}

	return items, totalBytes, nil
}

func walkNoFollowSymlinks(ctx context.Context, currentPath, relPath string, items *[]plannedItem, totalBytes *int64) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	info, err := os.Lstat(platform.NormalizeLongPath(currentPath))
	if err != nil {
		return err
	}
	isLink := info.Mode()&os.ModeSymlink != 0
	if isLink {
		*items = append(*items, plannedItem{
			srcPath: currentPath,
			relPath: relPath,
			info:    info,
			isDir:   false,
			isLink:  true,
		})
		return nil
	}
	if !info.IsDir() {
		*items = append(*items, plannedItem{
			srcPath: currentPath,
			relPath: relPath,
			info:    info,
			isDir:   false,
		})
		*totalBytes += info.Size()
		return nil
	}

	*items = append(*items, plannedItem{
		srcPath: currentPath,
		relPath: relPath,
		info:    info,
		isDir:   true,
	})

	entries, err := os.ReadDir(platform.NormalizeLongPath(currentPath))
	if err != nil {
		if os.IsPermission(err) {
			return vfs.ErrPermission
		}
		return err
	}
	for _, entry := range entries {
		childSrc := filepath.Join(currentPath, entry.Name())
		childRel := filepath.Join(relPath, entry.Name())
		if err := walkNoFollowSymlinks(ctx, childSrc, childRel, items, totalBytes); err != nil {
			return err
		}
	}
	return nil
}

func (m *Manager) executeTrash(rj *runningJob) error {
	for _, src := range rj.snapshot.Sources {
		if err := m.waitIfPausedOrCanceled(rj); err != nil {
			return err
		}
		cleanSrc := filepath.Clean(src)
		rj.mu.Lock()
		rj.snapshot.CurrentItem = filepath.Base(cleanSrc)
		rj.mu.Unlock()
		m.emitJobUpdate(rj)

		// Mover para área de lixeira reversível para suportar Desfazer (Undo) de forma determinística
		stagedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(cleanSrc))
		stagedPath := filepath.Join(m.trashStagingDir, stagedName)
		if err := m.moveSingle(rj, cleanSrc, stagedPath); err != nil {
			// Fallback para lixeira nativa do SO se não puder usar staging
			if m.UseSystemTrash {
				if sysErr := platform.MoveToSystemTrash(cleanSrc); sysErr != nil {
					return sysErr
				}
			} else {
				return err
			}
		} else {
			m.recordJournal("trash", cleanSrc, stagedPath)
		}

		rj.mu.Lock()
		rj.snapshot.DoneItems++
		rj.mu.Unlock()
		m.emitJobUpdate(rj)
	}
	return nil
}

func (m *Manager) executeDelete(rj *runningJob) error {
	for _, src := range rj.snapshot.Sources {
		if err := m.waitIfPausedOrCanceled(rj); err != nil {
			return err
		}
		cleanSrc := filepath.Clean(src)
		rj.mu.Lock()
		rj.snapshot.CurrentItem = filepath.Base(cleanSrc)
		rj.mu.Unlock()
		m.emitJobUpdate(rj)

		// Exclusão recursiva segura que nunca segue symlinks fora do escopo
		if err := removeSafeNoFollow(rj.ctx, cleanSrc); err != nil {
			return err
		}

		rj.mu.Lock()
		rj.snapshot.DoneItems++
		rj.mu.Unlock()
		m.emitJobUpdate(rj)
	}
	return nil
}

// removeSafeNoFollow remove arquivos e diretórios sem nunca seguir symlinks recursivamente.
func removeSafeNoFollow(ctx context.Context, target string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	longPath := platform.NormalizeLongPath(target)
	info, err := os.Lstat(longPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		if os.IsPermission(err) {
			return vfs.ErrPermission
		}
		return err
	}

	// Se for symlink ou arquivo regular, remover diretamente a entrada sem seguir o alvo
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return os.Remove(longPath)
	}

	entries, err := os.ReadDir(longPath)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		child := filepath.Join(target, entry.Name())
		if err := removeSafeNoFollow(ctx, child); err != nil {
			return err
		}
	}
	return os.Remove(longPath)
}

func (m *Manager) executeCopyOrMove(rj *runningJob, items []plannedItem, isMove bool) error {
	destRoot := filepath.Clean(rj.snapshot.Destination)
	topCreated := make(map[string]string) // topSrc -> topDst para o op_journal

	for _, item := range items {
		if err := m.waitIfPausedOrCanceled(rj); err != nil {
			return err
		}

		dstPath := filepath.Join(destRoot, item.relPath)
		rj.mu.Lock()
		rj.snapshot.CurrentItem = item.relPath
		rj.mu.Unlock()

		if item.isDir {
			if err := os.MkdirAll(platform.NormalizeLongPath(dstPath), item.info.Mode().Perm()); err != nil {
				if os.IsPermission(err) {
					return vfs.ErrPermission
				}
				return err
			}
			if !strings.Contains(item.relPath, string(filepath.Separator)) {
				topCreated[item.srcPath] = dstPath
			}
			rj.mu.Lock()
			rj.snapshot.DoneItems++
			rj.mu.Unlock()
			m.emitJobUpdate(rj)
			continue
		}

		// Verificar conflito em arquivo de destino
		finalDst := dstPath
		if dstInfo, err := os.Lstat(platform.NormalizeLongPath(finalDst)); err == nil {
			pol, err := m.resolveFileConflict(rj, item.srcPath, finalDst, item.info, dstInfo)
			if err != nil {
				return err
			}
			switch pol {
			case PolicySkip:
				rj.mu.Lock()
				rj.snapshot.DoneItems++
				rj.mu.Unlock()
				m.emitJobUpdate(rj)
				continue
			case PolicyKeepNewer:
				if !item.info.ModTime().After(dstInfo.ModTime()) {
					rj.mu.Lock()
					rj.snapshot.DoneItems++
					rj.mu.Unlock()
					m.emitJobUpdate(rj)
					continue
				}
			case PolicyRename:
				finalDst = uniquePath(finalDst)
			case PolicyOverwrite:
				// Segue com escrita atômica e substituição
			}
		}

		if item.isLink {
			target, err := os.Readlink(item.srcPath)
			if err == nil {
				_ = os.Remove(platform.NormalizeLongPath(finalDst))
				_ = os.Symlink(target, platform.NormalizeLongPath(finalDst))
			}
		} else {
			if err := m.copyFileSafe(rj, item.srcPath, finalDst, item.info); err != nil {
				return err
			}
		}

		if !strings.Contains(item.relPath, string(filepath.Separator)) {
			topCreated[item.srcPath] = finalDst
		}

		rj.mu.Lock()
		rj.snapshot.DoneItems++
		rj.mu.Unlock()
		m.emitJobUpdate(rj)
	}

	if isMove {
		// Mover entre volumes / seguro: somente após todos os arquivos terem sido copiados e verificados,
		// remover a origem!
		for _, src := range rj.snapshot.Sources {
			cleanSrc := filepath.Clean(src)
			if err := removeSafeNoFollow(rj.ctx, cleanSrc); err != nil {
				return err
			}
			if dst, ok := topCreated[cleanSrc]; ok {
				m.recordJournal("move", cleanSrc, dst)
			}
		}
	} else {
		for _, src := range rj.snapshot.Sources {
			cleanSrc := filepath.Clean(src)
			if dst, ok := topCreated[cleanSrc]; ok {
				m.recordJournal("copy", cleanSrc, dst)
			}
		}
	}

	return nil
}

func (m *Manager) resolveFileConflict(rj *runningJob, srcPath, dstPath string, srcInfo, dstInfo os.FileInfo) (ConflictPolicy, error) {
	rj.mu.Lock()
	pol := rj.snapshot.Policy
	rj.mu.Unlock()

	if pol != PolicyAsk {
		return pol, nil
	}

	rj.mu.Lock()
	rj.snapshot.Status = StatusConflict
	rj.snapshot.Conflict = &ConflictInfo{
		SrcPath:    srcPath,
		DstPath:    dstPath,
		SrcSize:    srcInfo.Size(),
		DstSize:    dstInfo.Size(),
		SrcModTime: srcInfo.ModTime(),
		DstModTime: dstInfo.ModTime(),
	}
	rj.mu.Unlock()
	m.emitJobUpdate(rj)

	select {
	case <-rj.ctx.Done():
		return "", rj.ctx.Err()
	case dec := <-rj.conflictCh:
		rj.mu.Lock()
		rj.snapshot.Status = StatusRunning
		rj.snapshot.Conflict = nil
		if dec.applyToAll {
			rj.snapshot.Policy = dec.policy
		}
		rj.mu.Unlock()
		m.emitJobUpdate(rj)
		return dec.policy, nil
	}
}

func uniquePath(target string) string {
	dir := filepath.Dir(target)
	base := filepath.Base(target)
	ext := filepath.Ext(base)
	stem := base[:len(base)-len(ext)]

	for i := 1; ; i++ {
		cand := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", stem, i, ext))
		if _, err := os.Lstat(platform.NormalizeLongPath(cand)); os.IsNotExist(err) {
			return cand
		}
	}
}

// copyFileSafe copia usando arquivo temporário (.nome.pulsares-part), fsync, verificação opcional por hash
// e rename atômico, removendo o arquivo parcial em caso de erro ou cancelamento.
func (m *Manager) copyFileSafe(rj *runningJob, srcPath, dstPath string, srcInfo os.FileInfo) error {
	if err := os.MkdirAll(platform.NormalizeLongPath(filepath.Dir(dstPath)), 0755); err != nil {
		return err
	}

	partPath := filepath.Join(filepath.Dir(dstPath), fmt.Sprintf(".%s.pulsares-part", filepath.Base(dstPath)))
	longSrc := platform.NormalizeLongPath(srcPath)
	longPart := platform.NormalizeLongPath(partPath)
	longDst := platform.NormalizeLongPath(dstPath)

	cleanupPart := func() {
		_ = os.Remove(longPart)
	}

	inFile, err := os.Open(longSrc)
	if err != nil {
		if os.IsPermission(err) {
			return vfs.ErrPermission
		}
		return err
	}
	defer inFile.Close()

	outFile, err := os.OpenFile(longPart, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, srcInfo.Mode().Perm())
	if err != nil {
		if os.IsPermission(err) {
			return vfs.ErrPermission
		}
		return err
	}

	buf := make([]byte, 64*1024)
	srcHasher := sha256.New()

	for {
		if err := m.waitIfPausedOrCanceled(rj); err != nil {
			_ = outFile.Close()
			cleanupPart()
			return err
		}

		n, readErr := inFile.Read(buf)
		if n > 0 {
			m.mu.Lock()
			maxBytes := m.MaxWritableBytes
			m.mu.Unlock()

			rj.mu.Lock()
			if maxBytes > 0 && rj.snapshot.DoneBytes+int64(n) > maxBytes {
				rj.mu.Unlock()
				_ = outFile.Close()
				cleanupPart()
				return ErrDiskFull
			}
			rj.mu.Unlock()

			if rj.snapshot.VerifyHash {
				_, _ = srcHasher.Write(buf[:n])
			}

			if _, writeErr := outFile.Write(buf[:n]); writeErr != nil {
				_ = outFile.Close()
				cleanupPart()
				return writeErr
			}

			rj.mu.Lock()
			rj.snapshot.DoneBytes += int64(n)
			elapsed := time.Since(rj.startedAt).Seconds()
			if elapsed > 0.05 {
				rj.snapshot.SpeedBps = int64(float64(rj.snapshot.DoneBytes) / elapsed)
				if rj.snapshot.SpeedBps > 0 && rj.snapshot.TotalBytes > rj.snapshot.DoneBytes {
					rem := rj.snapshot.TotalBytes - rj.snapshot.DoneBytes
					rj.snapshot.EtaSeconds = int(rem / rj.snapshot.SpeedBps)
				} else {
					rj.snapshot.EtaSeconds = 0
				}
			}
			rj.mu.Unlock()
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			_ = outFile.Close()
			cleanupPart()
			return readErr
		}
	}

	if err := outFile.Sync(); err != nil {
		_ = outFile.Close()
		cleanupPart()
		return err
	}
	if err := outFile.Close(); err != nil {
		cleanupPart()
		return err
	}

	// Verificação opcional por hash pós-escrita
	if rj.snapshot.VerifyHash {
		rj.mu.Lock()
		rj.snapshot.Status = StatusVerifying
		rj.mu.Unlock()
		m.emitJobUpdate(rj)

		expectedSum := hex.EncodeToString(srcHasher.Sum(nil))
		actualSum, err := hashFile(longPart)
		if err != nil || expectedSum != actualSum {
			cleanupPart()
			return fmt.Errorf("hash verification failed for %s", dstPath)
		}

		rj.mu.Lock()
		rj.snapshot.Status = StatusRunning
		rj.mu.Unlock()
	}

	_ = os.Chtimes(longPart, time.Now(), srcInfo.ModTime())

	// No Windows, os.Rename falha se o destino existir e for somente leitura ou diretório; remover antes se existir arquivo
	if existing, err := os.Lstat(longDst); err == nil && !existing.IsDir() {
		_ = os.Chmod(longDst, 0666)
		_ = os.Remove(longDst)
	}

	if err := os.Rename(longPart, longDst); err != nil {
		cleanupPart()
		return err
	}

	return nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (m *Manager) moveSingle(rj *runningJob, src, dst string) error {
	if err := os.Rename(platform.NormalizeLongPath(src), platform.NormalizeLongPath(dst)); err == nil {
		return nil
	}
	info, err := os.Lstat(platform.NormalizeLongPath(src))
	if err != nil {
		return err
	}
	if !info.IsDir() {
		if err := m.copyFileSafe(rj, src, dst, info); err != nil {
			return err
		}
		return os.Remove(platform.NormalizeLongPath(src))
	}
	items, _, err := m.planItems(rj.ctx, []string{src})
	if err != nil {
		return err
	}
	parentDst := filepath.Dir(dst)
	for _, it := range items {
		target := filepath.Join(parentDst, strings.Replace(it.relPath, filepath.Base(src), filepath.Base(dst), 1))
		if it.isDir {
			if err := os.MkdirAll(platform.NormalizeLongPath(target), it.info.Mode().Perm()); err != nil {
				return err
			}
		} else {
			if err := m.copyFileSafe(rj, it.srcPath, target, it.info); err != nil {
				return err
			}
		}
	}
	return removeSafeNoFollow(rj.ctx, src)
}

func (m *Manager) waitIfPausedOrCanceled(rj *runningJob) error {
	select {
	case <-rj.ctx.Done():
		return rj.ctx.Err()
	default:
	}

	rj.mu.Lock()
	paused := rj.paused
	pauseCh := rj.pauseCh
	rj.mu.Unlock()

	if paused && pauseCh != nil {
		select {
		case <-rj.ctx.Done():
			return rj.ctx.Err()
		case <-pauseCh:
		}
	}
	return rj.ctx.Err()
}

func (m *Manager) recordJournal(opType, srcPath, dstPath string) {
	if m.db == nil {
		return
	}
	_, _ = m.db.RecordJournal(opType, srcPath, dstPath)
	if m.emit != nil {
		entries, _ := m.db.ListJournal(20)
		m.emit("ops:journal", entries)
	}
}

// Undo desfaz a última operação reversível registrada no op_journal.
func (m *Manager) Undo() (*storage.JournalEntry, error) {
	if m.db == nil {
		return nil, nil
	}
	entry, err := m.db.LastUndoableJournal()
	if err != nil || entry == nil {
		return nil, err
	}

	switch entry.OpType {
	case "mkdir", "create", "copy":
		if err := removeSafeNoFollow(context.Background(), entry.DstPath); err != nil {
			return nil, err
		}
	case "rename", "move", "trash":
		if err := os.Rename(platform.NormalizeLongPath(entry.DstPath), platform.NormalizeLongPath(entry.SrcPath)); err != nil {
			return nil, err
		}
	}

	if err := m.db.MarkJournalUndone(entry.ID, true); err != nil {
		return nil, err
	}
	entry.Undone = true
	if m.emit != nil {
		entries, _ := m.db.ListJournal(20)
		m.emit("ops:journal", entries)
	}
	return entry, nil
}

// Redo refaz a última operação desfeita no op_journal.
func (m *Manager) Redo() (*storage.JournalEntry, error) {
	if m.db == nil {
		return nil, nil
	}
	entry, err := m.db.LastRedoableJournal()
	if err != nil || entry == nil {
		return nil, err
	}

	switch entry.OpType {
	case "mkdir":
		if err := os.MkdirAll(platform.NormalizeLongPath(entry.DstPath), 0755); err != nil {
			return nil, err
		}
	case "create":
		f, err := os.OpenFile(platform.NormalizeLongPath(entry.DstPath), os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return nil, err
		}
		_ = f.Close()
	case "rename", "move", "trash":
		if err := os.Rename(platform.NormalizeLongPath(entry.SrcPath), platform.NormalizeLongPath(entry.DstPath)); err != nil {
			return nil, err
		}
	}

	if err := m.db.MarkJournalUndone(entry.ID, false); err != nil {
		return nil, err
	}
	entry.Undone = false
	if m.emit != nil {
		entries, _ := m.db.ListJournal(20)
		m.emit("ops:journal", entries)
	}
	return entry, nil
}

func (m *Manager) emitJobUpdate(rj *runningJob) {
	if m.emit == nil {
		return
	}
	rj.mu.Lock()
	snap := rj.snapshot
	rj.mu.Unlock()
	m.emit("ops:update", snap)
}

