package archive

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ExtractResult descreve o resultado de uma extração com destino configurável.
type ExtractResult struct {
	DestDir        string `json:"destDir"`        // Pasta final onde o conteúdo foi extraído
	ExtractedFiles int    `json:"extractedFiles"` // Quantidade de arquivos gravados
	CreatedFolder  bool   `json:"createdFolder"`  // true quando uma subpasta com o nome do compactado foi criada
	Flattened      bool   `json:"flattened"`      // true quando uma pasta raiz duplicada (nome/nome) foi achatada
}

var archiveSuffixes = []string{".tar.gz", ".tgz", ".zip", ".tar"}

// IsSupportedArchive informa se o caminho possui uma extensão de compactado suportada.
func IsSupportedArchive(archivePath string) bool {
	lower := strings.ToLower(archivePath)
	for _, suf := range archiveSuffixes {
		if strings.HasSuffix(lower, suf) {
			return true
		}
	}
	return false
}

// ArchiveFolderName retorna o nome do compactado sem a extensão (ex.: "projeto.tar.gz" -> "projeto").
func ArchiveFolderName(archivePath string) string {
	base := filepath.Base(filepath.Clean(archivePath))
	lower := strings.ToLower(base)
	for _, suf := range archiveSuffixes {
		if strings.HasSuffix(lower, suf) && len(base) > len(suf) {
			base = base[:len(base)-len(suf)]
			break
		}
	}
	base = strings.TrimRight(strings.TrimSpace(base), ". ")
	if base == "" {
		base = "extraido"
	}
	return base
}

// UniqueDirPath devolve um caminho de pasta inexistente, acrescentando " (2)", " (3)"... quando necessário.
func UniqueDirPath(candidate string) string {
	if _, err := os.Stat(candidate); os.IsNotExist(err) {
		return candidate
	}
	for i := 2; i < 10000; i++ {
		next := fmt.Sprintf("%s (%d)", candidate, i)
		if _, err := os.Stat(next); os.IsNotExist(err) {
			return next
		}
	}
	return candidate
}

// ExtractArchiveTo extrai o compactado para parentDir. Quando createSubfolder é true,
// cria (sem sobrescrever) uma pasta com o nome do compactado e, se o conteúdo tiver uma
// única pasta raiz com o mesmo nome, achata a estrutura para evitar "nome/nome/".
func ExtractArchiveTo(archivePath string, parentDir string, createSubfolder bool) (ExtractResult, error) {
	cleanArchive := filepath.Clean(strings.TrimSpace(archivePath))
	if !IsSupportedArchive(cleanArchive) {
		return ExtractResult{}, fmt.Errorf("unsupported archive format: %s", filepath.Base(cleanArchive))
	}

	cleanParent := strings.TrimSpace(parentDir)
	if cleanParent == "" {
		cleanParent = filepath.Dir(cleanArchive)
	}
	cleanParent = filepath.Clean(cleanParent)

	dest := cleanParent
	if createSubfolder {
		dest = UniqueDirPath(filepath.Join(cleanParent, ArchiveFolderName(cleanArchive)))
	}

	count, err := ExtractArchive(cleanArchive, dest)
	res := ExtractResult{DestDir: dest, ExtractedFiles: count, CreatedFolder: createSubfolder}
	if err != nil {
		return res, err
	}

	if createSubfolder {
		if flattened, ferr := flattenSingleRootDir(dest); ferr == nil {
			res.Flattened = flattened
		}
	}
	return res, nil
}

// flattenSingleRootDir move o conteúdo de dest/<única pasta>/ para dest/ quando dest contém
// somente essa pasta (padrão comum em compactados como "projeto.zip" -> "projeto/...").
func flattenSingleRootDir(dest string) (bool, error) {
	entries, err := os.ReadDir(dest)
	if err != nil || len(entries) != 1 || !entries[0].IsDir() {
		return false, err
	}
	inner := filepath.Join(dest, entries[0].Name())
	if !strings.EqualFold(entries[0].Name(), filepath.Base(dest)) &&
		!strings.EqualFold(entries[0].Name(), stripCopySuffix(filepath.Base(dest))) {
		return false, nil
	}

	children, err := os.ReadDir(inner)
	if err != nil {
		return false, err
	}
	// Evita colisão quando um filho tem o mesmo nome da própria pasta interna
	tmpInner := inner + ".__pulsares_flatten__"
	if err := os.Rename(inner, tmpInner); err != nil {
		return false, err
	}
	for _, child := range children {
		if err := os.Rename(filepath.Join(tmpInner, child.Name()), filepath.Join(dest, child.Name())); err != nil {
			return false, err
		}
	}
	_ = os.Remove(tmpInner)
	return true, nil
}

func stripCopySuffix(name string) string {
	if idx := strings.LastIndex(name, " ("); idx > 0 && strings.HasSuffix(name, ")") {
		return name[:idx]
	}
	return name
}

