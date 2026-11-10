import React, { useEffect, useRef } from 'react';
import {
  FolderOpen,
  FileCode2,
  Eye,
  ExternalLink,
  Star,
  TerminalSquare,
  FolderSearch,
  Copy,
  Scissors,
  ClipboardPaste,
  Link2,
  Edit3,
  Archive,
  Hash,
  Trash2,
  Info,
  FolderPlus,
  FilePlus,
  RefreshCw,
  CheckSquare,
  Database,
} from 'lucide-react';
import {
  Entry,
  openPath,
  openWithDialog,
  openExternalTerminal,
  revealInSystemExplorer,
} from '../../lib/wails';
import { useBrowserStore, getTabLabel } from '../browser/store';
import { useOperationsStore } from '../operations/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { useTerminalStore } from '../terminal/store';
import { usePreviewStore } from '../preview/store';
import { useProductivityStore } from '../productivity/store';
import { useEditorStore, isEditableTextFile } from '../editor/store';
import { useDBStudioStore, isDatabaseFile } from '../db-studio/store';
import { useDBCreatorStore, isConvertibleToDB } from '../db-creator/store';

export interface ContextMenuTarget {
  x: number;
  y: number;
  entry: Entry | null;
}

interface Props {
  target: ContextMenuTarget | null;
  onClose: () => void;
}

export const FileContextMenu: React.FC<Props> = ({ target, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    currentPath,
    selectedPaths,
    navigateTo,
    newTab,
    refresh,
    selectAll,
  } = useBrowserStore();

  const {
    clipboard,
    copySelection,
    cutSelection,
    pasteIntoCurrent,
    trashSelection,
    requestPermanentDelete,
    requestRenameSelection,
    openPrompt,
    openProperties,
  } = useOperationsStore();

  const { favorites, toggleFavorite } = useFolderTreeStore();
  const {
    setPanelVisible,
    createSession,
    activeTabId: activeTermId,
    changeDirectoryInSession,
  } = useTerminalStore();
  const { toggleQuickLook } = usePreviewStore();
  const { openBatchRename, openArchiveModal, openHashModal } = useProductivityStore();
  const { openFileInEditor, openFolderInEditor } = useEditorStore();

  useEffect(() => {
    if (!target) return;
    void useOperationsStore.getState().syncClipboardFromOS();
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [target, onClose]);

  if (!target) return null;

  const { entry } = target;
  const menuWidth = 276;
  const menuHeight = entry ? 450 : 310;
  const clampedX =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(target.x, window.innerWidth - menuWidth - 10))
      : target.x;
  const clampedY =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(target.y, window.innerHeight - menuHeight - 10))
      : target.y;

  const isDir = entry?.kind === 'dir';
  const entryExt =
    entry && !isDir && entry.name.includes('.')
      ? entry.name.split('.').pop() || ''
      : '';
  const isEditable =
    entry && entry.kind !== 'dir'
      ? isEditableTextFile(entry.name, entryExt)
      : false;
  const isDbFile =
    entry && entry.kind !== 'dir'
      ? isDatabaseFile(entry.name)
      : false;
  const isConvertible =
    entry && entry.kind !== 'dir'
      ? isConvertibleToDB(entry.name)
      : false;
  const isFavorite = entry ? favorites.some((f) => f.path === entry.location.path) : false;
  const targetDir = entry
    ? isDir
      ? entry.location.path
      : currentPath
    : currentPath;

  const runAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  const handleOpenInIntegratedTerminal = (dirPath: string) => {
    setPanelVisible(true);
    if (activeTermId) {
      void changeDirectoryInSession(activeTermId, dirPath);
    } else {
      void createSession(dirPath);
    }
  };

  const handleCopyPath = (pathToCopy: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(pathToCopy);
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Menu de contexto do Pulsares Explorer"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: 'fixed',
        left: `${clampedX}px`,
        top: `${clampedY}px`,
        width: `${menuWidth}px`,
        zIndex: 9800,
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 14px 36px rgba(0, 0, 0, 0.42)',
        padding: '5px',
        userSelect: 'none',
        fontSize: '12px',
        color: 'var(--text-primary)',
      }}
    >
      {entry ? (
        <>
          {/* Cabeçalho identificando o item clicado */}
          <div
            style={{
              padding: '5px 8px 6px',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: '11px',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={entry.name}
            >
              {selectedPaths.size > 1
                ? `${selectedPaths.size} itens selecionados`
                : entry.name}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              {isDir ? 'Pasta' : entryExt || 'Arquivo'}
            </span>
          </div>

          <MenuItem
            icon={<FolderOpen size={14} />}
            label={isDir ? 'Abrir pasta' : 'Abrir'}
            shortcut="Enter"
            onClick={() =>
              runAndClose(() => {
                if (isDir) {
                  navigateTo(entry.location.path);
                } else if (isDbFile) {
                  void useDBStudioStore.getState().openDatabase(entry.location.path);
                } else if (isEditable) {
                  void openFileInEditor(entry.location.path);
                } else {
                  void openPath(entry.location.path);
                }
              })
            }
          />

          {isDir && (
            <MenuItem
              icon={<FolderPlus size={14} />}
              label="Abrir em nova aba"
              shortcut="Ctrl+T"
              onClick={() => runAndClose(() => newTab(entry.location.path))}
            />
          )}

          {!isDir && isDbFile && (
            <MenuItem
              icon={<Database size={14} />}
              label="Abrir no Pulsares DB Studio"
              badge="SQLite"
              onClick={() =>
                runAndClose(() => {
                  void useDBStudioStore.getState().openDatabase(entry.location.path);
                })
              }
            />
          )}

          {!isDir && isConvertible && (
            <MenuItem
              icon={<Database size={14} style={{ color: 'var(--accent)' }} />}
              label="Criar Banco de Dados SQLite..."
              badge={entryExt ? entryExt.toUpperCase() : 'DB'}
              onClick={() =>
                runAndClose(() => {
                  void useDBCreatorStore.getState().openCreator(entry.location.path);
                })
              }
            />
          )}

          {isDir ? (
            <MenuItem
              icon={<FileCode2 size={14} />}
              label="Abrir pasta no Pulsares Studio Editor"
              badge="Studio"
              onClick={() =>
                runAndClose(() => {
                  void openFolderInEditor(entry.location.path);
                })
              }
            />
          ) : (
            <MenuItem
              icon={<FileCode2 size={14} />}
              label="Editar no Pulsares Studio"
              badge={isEditable ? 'Studio' : undefined}
              onClick={() =>
                runAndClose(() => {
                  void openFileInEditor(entry.location.path);
                })
              }
            />
          )}

          <MenuItem
            icon={<Eye size={14} />}
            label="Prévia rápida (Quick Look)"
            shortcut="Espaço"
            onClick={() => runAndClose(() => toggleQuickLook())}
          />

          {!isDir && (
            <MenuItem
              icon={<ExternalLink size={14} />}
              label="Abrir no aplicativo padrão / Com…"
              onClick={() =>
                runAndClose(() => {
                  void openWithDialog(entry.location.path);
                })
              }
            />
          )}

          {isDir && (
            <MenuItem
              icon={<Star size={14} />}
              label={isFavorite ? 'Remover dos Favoritos' : 'Fixar nos Favoritos'}
              onClick={() =>
                runAndClose(() =>
                  toggleFavorite(entry.location.path, getTabLabel(entry.location.path))
                )
              }
            />
          )}

          <Divider />

          <MenuItem
            icon={<TerminalSquare size={14} />}
            label="Abrir no Terminal Integrado"
            shortcut="Ctrl+`"
            onClick={() =>
              runAndClose(() => handleOpenInIntegratedTerminal(targetDir))
            }
          />

          <MenuItem
            icon={<TerminalSquare size={14} />}
            label="Abrir no Terminal Externo"
            onClick={() =>
              runAndClose(() => {
                void openExternalTerminal(targetDir);
              })
            }
          />

          <MenuItem
            icon={<FolderSearch size={14} />}
            label="Mostrar no Explorador do Sistema"
            onClick={() =>
              runAndClose(() => {
                void revealInSystemExplorer(entry.location.path);
              })
            }
          />

          <Divider />

          <MenuItem
            icon={<Copy size={14} />}
            label="Copiar"
            shortcut="Ctrl+C"
            onClick={() => runAndClose(() => copySelection())}
          />

          <MenuItem
            icon={<Scissors size={14} />}
            label="Recortar"
            shortcut="Ctrl+X"
            onClick={() => runAndClose(() => cutSelection())}
          />

          {clipboard && clipboard.paths.length > 0 && (
            <MenuItem
              icon={<ClipboardPaste size={14} />}
              label="Colar"
              shortcut="Ctrl+V"
              onClick={() => runAndClose(() => pasteIntoCurrent())}
            />
          )}

          <MenuItem
            icon={<Link2 size={14} />}
            label="Copiar caminho completo"
            onClick={() => runAndClose(() => handleCopyPath(entry.location.path))}
          />

          <MenuItem
            icon={<Edit3 size={14} />}
            label={selectedPaths.size > 1 ? 'Renomear em lote…' : 'Renomear'}
            shortcut="F2"
            onClick={() =>
              runAndClose(() => {
                if (selectedPaths.size > 1) {
                  void openBatchRename(Array.from(selectedPaths));
                } else {
                  requestRenameSelection();
                }
              })
            }
          />

          <MenuItem
            icon={<Archive size={14} />}
            label="Compactar / Extrair arquivo…"
            onClick={() =>
              runAndClose(() => {
                void openArchiveModal(entry.location.path);
              })
            }
          />

          {!isDir && (
            <MenuItem
              icon={<Hash size={14} />}
              label="Calcular Hashes (MD5 / SHA-256)…"
              onClick={() =>
                runAndClose(() => {
                  void openHashModal(entry.location.path);
                })
              }
            />
          )}

          <Divider />

          <MenuItem
            icon={<Trash2 size={14} />}
            label="Mover para a Lixeira"
            shortcut="Del"
            danger
            onClick={() => runAndClose(() => trashSelection())}
          />

          <MenuItem
            icon={<Trash2 size={14} />}
            label="Excluir permanentemente"
            shortcut="Shift+Del"
            danger
            onClick={() => runAndClose(() => requestPermanentDelete())}
          />

          <Divider />

          <MenuItem
            icon={<Info size={14} />}
            label="Propriedades"
            shortcut="Alt+Enter"
            onClick={() =>
              runAndClose(() => {
                void openProperties(entry.location.path);
              })
            }
          />
        </>
      ) : (
        <>
          {/* Menu de contexto da pasta atual (clique na área vazia) */}
          <div
            style={{
              padding: '5px 8px 6px',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '4px',
              fontWeight: 600,
              fontSize: '11px',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FolderOpen size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>{getTabLabel(currentPath)}</span>
          </div>

          <MenuItem
            icon={<FolderPlus size={14} />}
            label="Nova pasta"
            shortcut="Ctrl+Shift+N"
            onClick={() => runAndClose(() => openPrompt('newFolder'))}
          />

          <MenuItem
            icon={<FilePlus size={14} />}
            label="Novo arquivo"
            onClick={() => runAndClose(() => openPrompt('newFile'))}
          />

          <MenuItem
            icon={<FileCode2 size={14} />}
            label="Abrir Pulsares Studio Editor"
            badge="Dev"
            onClick={() => runAndClose(() => void openFolderInEditor(currentPath))}
          />

          {clipboard && clipboard.paths.length > 0 && (
            <MenuItem
              icon={<ClipboardPaste size={14} />}
              label={`Colar (${clipboard.paths.length})`}
              shortcut="Ctrl+V"
              onClick={() => runAndClose(() => pasteIntoCurrent())}
            />
          )}

          <Divider />

          <MenuItem
            icon={<RefreshCw size={14} />}
            label="Atualizar pasta"
            shortcut="F5"
            onClick={() => runAndClose(() => refresh())}
          />

          <MenuItem
            icon={<CheckSquare size={14} />}
            label="Selecionar tudo"
            shortcut="Ctrl+A"
            onClick={() => runAndClose(() => selectAll())}
          />

          <Divider />

          <MenuItem
            icon={<TerminalSquare size={14} />}
            label="Abrir pasta no Terminal Integrado"
            shortcut="Ctrl+`"
            onClick={() => runAndClose(() => handleOpenInIntegratedTerminal(currentPath))}
          />

          <MenuItem
            icon={<TerminalSquare size={14} />}
            label="Abrir pasta no Terminal Externo"
            onClick={() =>
              runAndClose(() => {
                void openExternalTerminal(currentPath);
              })
            }
          />

          <MenuItem
            icon={<FolderSearch size={14} />}
            label="Mostrar no Explorador do Sistema"
            onClick={() =>
              runAndClose(() => {
                void revealInSystemExplorer(currentPath);
              })
            }
          />

          <Divider />

          <MenuItem
            icon={<Info size={14} />}
            label="Propriedades da pasta"
            shortcut="Alt+Enter"
            onClick={() =>
              runAndClose(() => {
                void openProperties(currentPath);
              })
            }
          />
        </>
      )}
    </div>
  );
};

const Divider: React.FC = () => (
  <div
    style={{
      height: '1px',
      backgroundColor: 'var(--border-subtle)',
      margin: '4px 2px',
    }}
  />
);

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  badge?: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, shortcut, badge, danger, onClick }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        backgroundColor: hovered ? 'var(--bg-surface-hover)' : 'transparent',
        color: danger ? 'var(--status-danger)' : 'var(--text-primary)',
        cursor: 'default',
        textAlign: 'left',
        fontSize: '12px',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span
          style={{
            color: danger ? 'var(--status-danger)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {icon}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {badge && (
          <span
            style={{
              fontSize: '10px',
              padding: '1px 5px',
              borderRadius: '999px',
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent-text)',
              fontWeight: 600,
            }}
          >
            {badge}
          </span>
        )}
        {shortcut && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{shortcut}</span>
        )}
      </span>
    </button>
  );
};
