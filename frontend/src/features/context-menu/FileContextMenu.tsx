import React, { useEffect, useRef, useState } from 'react';
import {
  FolderOpen,
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
  ChevronRight,
  Globe,
  FileText,
  Image as ImageIcon,
  Play,
  Table,
  AppWindow,
  Cloud,
  CloudDownload,
  CloudOff,
  CheckCircle2,
  Share2,
  History,
} from 'lucide-react';
import {
  Entry,
  OpenWithApp,
  CloudItemStatus,
  openPath,
  openWithDialog,
  listOpenWithApps,
  openFileWithApp,
  getCloudItemStatus,
  executeCloudAction,
  showOpenFileDialog,
  openExternalTerminal,
  revealInSystemExplorer,
} from '../../lib/wails';
import { useBrowserStore, getTabLabel } from '../browser/store';
import { useOperationsStore } from '../operations/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { useTerminalStore } from '../terminal/store';
import { usePreviewStore } from '../preview/store';
import { useProductivityStore } from '../productivity/store';
import {
  useEditorStore,
  isEditableTextFile,
  isStudioPdfFile,
  isStudioImageFile,
} from '../editor/store';
import { useDBStudioStore, isDatabaseFile } from '../db-studio/store';
import { useDBCreatorStore, isConvertibleToDB } from '../db-creator/store';
import { SuiteAppIcon } from '../../ui/SuiteAppIcon';

export interface ContextMenuTarget {
  x: number;
  y: number;
  entry: Entry | null;
}

interface Props {
  target: ContextMenuTarget | null;
  onClose: () => void;
}

function getSystemAppIcon(appIdOrExe: string): React.ReactNode {
  const lower = (appIdOrExe || '').toLowerCase();
  if (
    lower.includes('edge') ||
    lower.includes('chrome') ||
    lower.includes('firefox') ||
    lower.includes('brave') ||
    lower.includes('opera') ||
    lower.includes('safari')
  ) {
    return <Globe size={14} style={{ color: '#0284c7' }} />;
  }
  if (
    lower.includes('paint') ||
    lower.includes('gimp') ||
    lower.includes('inkscape') ||
    lower.includes('photo')
  ) {
    return <ImageIcon size={14} style={{ color: '#9333ea' }} />;
  }
  if (
    lower.includes('wmplayer') ||
    lower.includes('vlc') ||
    lower.includes('mpc') ||
    lower.includes('media')
  ) {
    return <Play size={14} style={{ color: '#ea580c' }} />;
  }
  if (lower.includes('excel') || lower.includes('scalc')) {
    return <Table size={14} style={{ color: '#16a34a' }} />;
  }
  if (lower.includes('7z') || lower.includes('winrar') || lower.includes('zip')) {
    return <Archive size={14} style={{ color: '#ca8a04' }} />;
  }
  if (
    lower.includes('notepad') ||
    lower.includes('write') ||
    lower.includes('word') ||
    lower.includes('swriter') ||
    lower.includes('acro') ||
    lower.includes('sumatra') ||
    lower.includes('subl')
  ) {
    return <FileText size={14} style={{ color: 'var(--accent)' }} />;
  }
  return <AppWindow size={14} style={{ color: 'var(--text-secondary)' }} />;
}

function getCloudProviderColor(providerId: string): string {
  switch ((providerId || '').toLowerCase()) {
    case 'onedrive':
      return '#0078d4';
    case 'gdrive':
      return '#1a73e8';
    case 'dropbox':
      return '#0061fe';
    case 'icloud':
      return '#0284c7';
    case 'mega':
      return '#d9272e';
    default:
      return 'var(--accent)';
  }
}

export const FileContextMenu: React.FC<Props> = ({ target, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([]);
  const [loadingOpenWith, setLoadingOpenWith] = useState(false);
  const [openWithSubmenuOpen, setOpenWithSubmenuOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudItemStatus | null>(null);
  const [cloudSubmenuOpen, setCloudSubmenuOpen] = useState(false);
  const closeSubmenuTimerRef = useRef<number | null>(null);
  const closeCloudTimerRef = useRef<number | null>(null);

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
    if (!target) {
      setOpenWithSubmenuOpen(false);
      setCloudSubmenuOpen(false);
      setOpenWithApps([]);
      setCloudStatus(null);
      return;
    }
    setOpenWithSubmenuOpen(false);
    setCloudSubmenuOpen(false);
    void useOperationsStore.getState().syncClipboardFromOS();

    let cancelled = false;
    const inspectedPath = target.entry ? target.entry.location.path : currentPath;
    if (inspectedPath) {
      void getCloudItemStatus(inspectedPath)
        .then((st) => {
          if (!cancelled) {
            setCloudStatus(st && st.isInCloud ? st : null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCloudStatus(null);
          }
        });
    } else {
      setCloudStatus(null);
    }

    if (target.entry && target.entry.kind !== 'dir') {
      setLoadingOpenWith(true);
      void listOpenWithApps(target.entry.location.path)
        .then((apps) => {
          if (!cancelled) {
            setOpenWithApps(apps || []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOpenWithApps([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingOpenWith(false);
          }
        });
    } else {
      setOpenWithApps([]);
      setLoadingOpenWith(false);
    }

    return () => {
      cancelled = true;
    };
  }, [target, currentPath]);

  useEffect(() => {
    if (!target) return;
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
  const menuHeight = entry ? 480 : 340;
  const clampedX =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(target.x, window.innerWidth - menuWidth - 10))
      : target.x;
  const clampedY =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(target.y, window.innerHeight - menuHeight - 10))
      : target.y;

  const submenuOpensLeft =
    typeof window !== 'undefined' && clampedX + menuWidth + 305 > window.innerWidth;

  const isDir = entry?.kind === 'dir';
  const entryExt =
    entry && !isDir && entry.name.includes('.')
      ? entry.name.split('.').pop() || ''
      : '';
  const isEditable =
    entry && entry.kind !== 'dir'
      ? isEditableTextFile(entry.name, entryExt)
      : false;
  const isStudioMedia =
    entry && entry.kind !== 'dir'
      ? isStudioPdfFile(entry.name, entryExt) || isStudioImageFile(entry.name, entryExt)
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

  const handleBrowseCustomProgram = async (filePath: string) => {
    onClose();
    const chosenExe = await showOpenFileDialog({
      title: 'Escolher programa para abrir o arquivo',
      filterDisplayName: 'Aplicativos e Scripts (*.exe;*.bat;*.cmd)',
      filterPattern: '*.exe;*.bat;*.cmd',
    });
    if (chosenExe) {
      await openFileWithApp(filePath, chosenExe);
    }
  };

  const handleEnterOpenWith = () => {
    if (closeSubmenuTimerRef.current) {
      window.clearTimeout(closeSubmenuTimerRef.current);
      closeSubmenuTimerRef.current = null;
    }
    setCloudSubmenuOpen(false);
    setOpenWithSubmenuOpen(true);
  };

  const handleLeaveOpenWith = () => {
    if (closeSubmenuTimerRef.current) {
      window.clearTimeout(closeSubmenuTimerRef.current);
    }
    closeSubmenuTimerRef.current = window.setTimeout(() => {
      setOpenWithSubmenuOpen(false);
    }, 150);
  };

  const handleEnterCloudSubmenu = () => {
    if (closeCloudTimerRef.current) {
      window.clearTimeout(closeCloudTimerRef.current);
      closeCloudTimerRef.current = null;
    }
    setOpenWithSubmenuOpen(false);
    setCloudSubmenuOpen(true);
  };

  const handleLeaveCloudSubmenu = () => {
    if (closeCloudTimerRef.current) {
      window.clearTimeout(closeCloudTimerRef.current);
    }
    closeCloudTimerRef.current = window.setTimeout(() => {
      setCloudSubmenuOpen(false);
    }, 150);
  };

  const renderCloudMenuRow = (cloudTargetPath: string) => {
    if (!cloudStatus || !cloudStatus.isInCloud) return null;
    const providerColor = getCloudProviderColor(cloudStatus.providerId);
    const pinBadgeLabel =
      cloudStatus.pinState === 'pinned'
        ? 'Fixado no PC'
        : cloudStatus.pinState === 'online_only'
          ? 'Na Nuvem'
          : 'No PC';

    return (
      <div
        style={{ position: 'relative' }}
        onMouseEnter={handleEnterCloudSubmenu}
        onMouseLeave={handleLeaveCloudSubmenu}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={cloudSubmenuOpen}
          className="pulsares-dropdown-item"
          onClick={() => setCloudSubmenuOpen((prev) => !prev)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '6px 9px',
            border: 'none',
            backgroundColor: cloudSubmenuOpen ? 'var(--bg-surface-hover)' : 'transparent',
            color: 'var(--text-primary)',
            cursor: 'default',
            textAlign: 'left',
            fontSize: '12px',
            borderRadius: '6px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ color: providerColor, display: 'flex', alignItems: 'center' }}>
              <Cloud size={14} />
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 500,
              }}
            >
              {cloudStatus.provider}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '999px',
                backgroundColor:
                  cloudStatus.pinState === 'pinned'
                    ? 'rgba(22, 163, 74, 0.14)'
                    : cloudStatus.pinState === 'online_only'
                      ? 'rgba(2, 132, 199, 0.14)'
                      : 'var(--accent-subtle)',
                color:
                  cloudStatus.pinState === 'pinned'
                    ? '#16a34a'
                    : cloudStatus.pinState === 'online_only'
                      ? '#0284c7'
                      : 'var(--accent-text)',
                fontWeight: 600,
              }}
            >
              {pinBadgeLabel}
            </span>
            <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          </span>
        </button>

        {cloudSubmenuOpen && (
          <div
            role="menu"
            aria-label={`Opções de nuvem (${cloudStatus.displayName})`}
            className="pulsares-dropdown-menu"
            style={{
              position: 'absolute',
              top: '-6px',
              left: submenuOpensLeft ? undefined : 'calc(100% + 2px)',
              right: submenuOpensLeft ? 'calc(100% + 2px)' : undefined,
              width: '302px',
              zIndex: 9860,
              backgroundColor: 'var(--bg-surface)',
              padding: '6px',
              borderRadius: '10px',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Cabeçalho do Provedor de Nuvem */}
            <div
              style={{
                padding: '5px 8px 6px',
                borderBottom: '1px solid var(--border-subtle)',
                marginBottom: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: providerColor,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Cloud size={13} />
                  <span>{cloudStatus.displayName}</span>
                </span>
              </div>
              <span
                style={{
                  fontSize: '10.5px',
                  color: 'var(--text-muted)',
                }}
              >
                Status: {cloudStatus.pinLabel}
              </span>
            </div>

            {cloudStatus.canPin && (
              <>
                <MenuItem
                  icon={
                    <CheckCircle2
                      size={14}
                      style={{
                        color:
                          cloudStatus.pinState === 'pinned'
                            ? '#16a34a'
                            : 'var(--text-secondary)',
                      }}
                    />
                  }
                  label="Sempre manter neste dispositivo"
                  badge={cloudStatus.pinState === 'pinned' ? 'Ativo' : undefined}
                  onClick={() =>
                    runAndClose(() => {
                      void executeCloudAction(cloudTargetPath, 'pin').then(() => refresh());
                    })
                  }
                />

                <MenuItem
                  icon={<CloudOff size={14} style={{ color: '#0284c7' }} />}
                  label="Liberar espaço (Apenas online)"
                  badge={cloudStatus.pinState === 'online_only' ? 'Ativo' : undefined}
                  onClick={() =>
                    runAndClose(() => {
                      void executeCloudAction(cloudTargetPath, 'unpin').then(() => refresh());
                    })
                  }
                />

                {cloudStatus.pinState === 'online_only' && (
                  <MenuItem
                    icon={<CloudDownload size={14} style={{ color: providerColor }} />}
                    label="Baixar / Sincronizar agora"
                    onClick={() =>
                      runAndClose(() => {
                        void executeCloudAction(cloudTargetPath, 'hydrate').then(() => refresh());
                      })
                    }
                  />
                )}

                <Divider />
              </>
            )}

            <MenuItem
              icon={<Share2 size={14} />}
              label={`Compartilhar no ${cloudStatus.provider}…`}
              onClick={() =>
                runAndClose(() => {
                  void executeCloudAction(cloudTargetPath, 'share');
                })
              }
            />

            <MenuItem
              icon={<History size={14} />}
              label="Histórico de versões na nuvem…"
              onClick={() =>
                runAndClose(() => {
                  void executeCloudAction(cloudTargetPath, 'version_history');
                })
              }
            />

            {cloudStatus.webUrl && (
              <MenuItem
                icon={<Globe size={14} style={{ color: providerColor }} />}
                label={`Ver online no ${cloudStatus.provider} Web`}
                onClick={() =>
                  runAndClose(() => {
                    void executeCloudAction(cloudTargetPath, 'view_online');
                  })
                }
              />
            )}

            {cloudStatus.rootPath &&
              cloudStatus.rootPath.toLowerCase() !== currentPath.toLowerCase() && (
                <>
                  <Divider />
                  <MenuItem
                    icon={<FolderOpen size={14} />}
                    label={`Ir para raiz (${cloudStatus.displayName})`}
                    onClick={() =>
                      runAndClose(() => {
                        navigateTo(cloudStatus.rootPath);
                      })
                    }
                  />
                </>
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="pulsares-dropdown-menu"
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
        padding: '6px',
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
              icon={<SuiteAppIcon variant="dbstudio" size={15} />}
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
              icon={<SuiteAppIcon variant="studio" size={15} />}
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
              icon={<SuiteAppIcon variant="studio" size={15} />}
              label={isStudioMedia ? 'Abrir no Pulsares Studio' : 'Editar no Pulsares Studio'}
              badge={isEditable || isStudioMedia ? 'Studio' : undefined}
              onClick={() =>
                runAndClose(() => {
                  void openFileInEditor(entry.location.path);
                })
              }
            />
          )}

          {!isDir && (
            <div
              style={{ position: 'relative' }}
              onMouseEnter={handleEnterOpenWith}
              onMouseLeave={handleLeaveOpenWith}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={openWithSubmenuOpen}
                className="pulsares-dropdown-item"
                onClick={() => setOpenWithSubmenuOpen((prev) => !prev)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '6px 9px',
                  border: 'none',
                  backgroundColor: openWithSubmenuOpen ? 'var(--bg-surface-hover)' : 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'default',
                  textAlign: 'left',
                  fontSize: '12px',
                  borderRadius: '6px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                    <ExternalLink size={14} />
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Abrir com
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {openWithApps.length > 0 && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '0px 5px',
                        borderRadius: '999px',
                        backgroundColor: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {openWithApps.length}
                    </span>
                  )}
                  <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
                </span>
              </button>

              {openWithSubmenuOpen && (
                <div
                  role="menu"
                  aria-label="Programas disponíveis para abrir o arquivo"
                  className="pulsares-dropdown-menu"
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    left: submenuOpensLeft ? undefined : 'calc(100% + 2px)',
                    right: submenuOpensLeft ? 'calc(100% + 2px)' : undefined,
                    width: '292px',
                    maxHeight: '380px',
                    overflowY: 'auto',
                    zIndex: 9850,
                    backgroundColor: 'var(--bg-surface)',
                    padding: '6px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-default)',
                    boxShadow: 'var(--shadow-lg)',
                  }}
                >
                  {/* Seção 1: Aplicativos Integrados Pulsares */}
                  <div
                    style={{
                      padding: '3px 8px 4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Suíte Pulsares
                  </div>

                  <MenuItem
                    icon={<SuiteAppIcon variant="studio" size={14} />}
                    label="Pulsares Studio Editor"
                    badge="Integrado"
                    onClick={() =>
                      runAndClose(() => {
                        void openFileInEditor(entry.location.path);
                      })
                    }
                  />

                  {isDbFile && (
                    <MenuItem
                      icon={<SuiteAppIcon variant="dbstudio" size={14} />}
                      label="Pulsares DB Studio"
                      badge="SQLite"
                      onClick={() =>
                        runAndClose(() => {
                          void useDBStudioStore.getState().openDatabase(entry.location.path);
                        })
                      }
                    />
                  )}

                  <Divider />

                  {/* Seção 2: Programas do Sistema para esta extensão */}
                  <div
                    style={{
                      padding: '3px 8px 4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      Programas do Sistema {entryExt ? `(.${entryExt.toLowerCase()})` : ''}
                    </span>
                  </div>

                  {loadingOpenWith ? (
                    <div
                      style={{
                        padding: '8px 10px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Buscando programas instalados…
                    </div>
                  ) : openWithApps.length > 0 ? (
                    openWithApps.map((app) => (
                      <MenuItem
                        key={app.exePath || app.id}
                        icon={getSystemAppIcon(app.id || app.exePath)}
                        label={app.name}
                        badge={app.isDefault ? 'Padrão' : undefined}
                        shortcut={!app.isDefault ? app.id : undefined}
                        onClick={() =>
                          runAndClose(() => {
                            void openFileWithApp(
                              entry.location.path,
                              app.command || app.exePath
                            );
                          })
                        }
                      />
                    ))
                  ) : (
                    <div
                      style={{
                        padding: '6px 10px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Nenhum programa específico registrado para esta extensão.
                    </div>
                  )}

                  <Divider />

                  {/* Seção 3: Outras opções do sistema */}
                  <MenuItem
                    icon={<ExternalLink size={14} />}
                    label="Abrir no aplicativo padrão do sistema"
                    onClick={() =>
                      runAndClose(() => {
                        void openPath(entry.location.path);
                      })
                    }
                  />

                  <MenuItem
                    icon={<FolderSearch size={14} />}
                    label="Procurar outro programa no PC (.exe)…"
                    onClick={() => {
                      void handleBrowseCustomProgram(entry.location.path);
                    }}
                  />

                  <MenuItem
                    icon={<AppWindow size={14} />}
                    label="Mais aplicativos (Diálogo do Sistema)…"
                    onClick={() =>
                      runAndClose(() => {
                        void openWithDialog(entry.location.path);
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}

          {renderCloudMenuRow(entry.location.path)}

          <MenuItem
            icon={<Eye size={14} />}
            label="Prévia rápida (Quick Look)"
            shortcut="Espaço"
            onClick={() => runAndClose(() => toggleQuickLook())}
          />

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
            icon={<SuiteAppIcon variant="studio" size={15} />}
            label="Abrir Pulsares Studio Editor"
            badge="Dev"
            onClick={() => runAndClose(() => void openFolderInEditor(currentPath))}
          />

          {renderCloudMenuRow(currentPath)}

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
      className="pulsares-dropdown-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 9px',
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
