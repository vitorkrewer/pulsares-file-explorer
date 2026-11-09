import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Plus,
  Columns2,
  Trash2,
  Search,
  FolderSync,
  ArrowLeftRight,
  Maximize2,
  Minimize2,
  X,
  Eraser,
  ExternalLink,
  Folder,
  Pencil,
} from 'lucide-react';
import { useTerminalStore, TerminalTabSession } from './store';
import { useBrowserStore } from '../browser/store';
import {
  subscribeEvent,
  TerminalDataEvent,
  TerminalExitEvent,
  openPath,
  terminalAutocomplete,
} from '../../lib/wails';

interface PaneViewProps {
  session: TerminalTabSession;
  fontSize: number;
  searchQuery: string;
  onNavigatePath: (path: string) => void;
}

const TerminalViewport: React.FC<PaneViewProps> = ({
  session,
  fontSize,
  searchQuery,
  onNavigatePath,
}) => {
  const { t } = useTranslation();
  const {
    sendInput,
    setInputDraft,
    appendQuotedPathsToDraft,
    clearOutput,
    resizeSession,
  } = useTerminalStore();

  const outputRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cycleRef = useRef<{ matches: string[]; idx: number; lastApplied: string }>({
    matches: [],
    idx: -1,
    lastApplied: '',
  });
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isDragOver, setIsDragOver] = useState(false);
  const [completionMatches, setCompletionMatches] = useState<string[]>([]);
  const [completionIdx, setCompletionIdx] = useState<number>(-1);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [session.output]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const cols = Math.max(40, Math.floor(rect.width / (fontSize * 0.62)));
        const rows = Math.max(8, Math.floor(rect.height / (fontSize * 1.45)));
        void resizeSession(session.id, cols, rows);
      }, 120);
    });
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [session.id, fontSize, resizeSession]);

  const applyCompletionValue = (val: string, idx: number, matches: string[]) => {
    cycleRef.current = { matches, idx, lastApplied: val };
    setCompletionMatches(matches);
    setCompletionIdx(idx);
    setInputDraft(session.id, val);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(val.length, val.length);
      }
    });
  };

  const resetCompletions = () => {
    cycleRef.current = { matches: [], idx: -1, lastApplied: '' };
    setCompletionMatches([]);
    setCompletionIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();

      const cyc = cycleRef.current;
      if (
        cyc.matches.length > 0 &&
        cyc.idx >= 0 &&
        session.inputDraft === cyc.lastApplied
      ) {
        const nextIdx = e.shiftKey
          ? (cyc.idx - 1 + cyc.matches.length) % cyc.matches.length
          : (cyc.idx + 1) % cyc.matches.length;
        applyCompletionValue(cyc.matches[nextIdx], nextIdx, cyc.matches);
        return;
      }

      const browserCwd = useBrowserStore.getState().currentPath;
      const effectiveCwd =
        session.cwd && session.cwd !== '/' ? session.cwd : browserCwd || session.cwd;

      void (async () => {
        const matches = await terminalAutocomplete(
          session.backendId,
          effectiveCwd,
          session.inputDraft
        );
        if (matches && matches.length > 0) {
          applyCompletionValue(matches[0], 0, matches);
        }
      })();
      return;
    }

    if (e.key === 'Escape' && completionMatches.length > 0) {
      e.preventDefault();
      resetCompletions();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = session.inputDraft;
      if (cmd.trim()) {
        setCmdHistory((prev) => [...prev.slice(-49), cmd]);
      }
      setHistoryIdx(-1);
      resetCompletions();
      setInputDraft(session.id, '');
      void sendInput(session.id, `${cmd}\r\n`);
      return;
    }

    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
      const sel = window.getSelection()?.toString();
      if (!sel) {
        e.preventDefault();
        void sendInput(session.id, '\x03');
      }
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clearOutput(session.id);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const nextIdx = historyIdx < 0 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInputDraft(session.id, cmdHistory[nextIdx]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < 0) return;
      const nextIdx = historyIdx + 1;
      if (nextIdx >= cmdHistory.length) {
        setHistoryIdx(-1);
        setInputDraft(session.id, '');
      } else {
        setHistoryIdx(nextIdx);
        setInputDraft(session.id, cmdHistory[nextIdx]);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const raw = e.dataTransfer.getData('application/x-pulsares-paths');
    if (!raw) return;
    try {
      const paths = JSON.parse(raw) as string[];
      if (Array.isArray(paths) && paths.length > 0) {
        void appendQuotedPathsToDraft(session.id, paths);
      }
    } catch {
      // Ignora payload inválido
    }
  };

  const renderLineWithLinksAndSearch = (line: string, idx: number) => {
    const trimmed = line.trim();
    const urlMatch = trimmed.match(/(https?:\/\/[^\s"'<>]+)/);
    const winPathMatch = trimmed.match(/([A-Za-z]:\\[^\s"'<>|*?\r\n]+)/);

    const matchesSearch =
      searchQuery.trim().length > 0 &&
      line.toLowerCase().includes(searchQuery.trim().toLowerCase());

    return (
      <div
        key={idx}
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          backgroundColor: matchesSearch ? 'rgba(234, 179, 8, 0.25)' : 'transparent',
          lineHeight: 1.45,
        }}
      >
        <span>{line}</span>
        {urlMatch && (
          <button
            type="button"
            onClick={() => void openPath(urlMatch[1])}
            style={{
              marginLeft: '8px',
              fontSize: '11px',
              color: 'var(--accent-primary)',
              background: 'none',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <ExternalLink size={12} />
          </button>
        )}
        {winPathMatch && (
          <button
            type="button"
            onClick={() => onNavigatePath(winPathMatch[1])}
            title={winPathMatch[1]}
            style={{
              marginLeft: '8px',
              fontSize: '11px',
              color: 'var(--accent-primary)',
              background: 'none',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Folder size={12} />
          </button>
        )}
      </div>
    );
  };

  const lines = session.output ? session.output.split('\n') : [];

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-pulsares-paths')) {
          e.preventDefault();
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        backgroundColor: 'var(--bg-primary)',
        outline: isDragOver ? '2px dashed var(--accent-primary)' : 'none',
        outlineOffset: '-2px',
        fontFamily: 'var(--font-mono)',
        fontSize: `${fontSize}px`,
      }}
    >
      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          userSelect: 'text',
        }}
      >
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '11px',
            marginBottom: '6px',
          }}
        >
          {session.cwd}
        </div>
        {lines.map((line, idx) => renderLineWithLinksAndSearch(line, idx))}
        {session.exited && (
          <div style={{ color: 'var(--warning)', marginTop: '6px', fontSize: '12px' }}>
            {t('terminal.processExited', { code: session.exitCode ?? 0 })}
          </div>
        )}
      </div>

      {completionMatches.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-subtle)',
            overflowX: 'auto',
            fontSize: '11px',
          }}
        >
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            Tab ({completionIdx + 1}/{completionMatches.length}):
          </span>
          {completionMatches.slice(0, 18).map((cand, idx) => {
            const label = cand.trim().split(/\s+/).pop() || cand;
            const active = idx === completionIdx;
            return (
              <button
                key={`${cand}-${idx}`}
                type="button"
                onClick={() => {
                  applyCompletionValue(cand, idx, completionMatches);
                }}
                style={{
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-sm)',
                  border: active
                    ? '1px solid var(--accent-primary)'
                    : '1px solid var(--border-subtle)',
                  backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          value={session.inputDraft}
          disabled={session.exited}
          onChange={(e) => {
            resetCompletions();
            setInputDraft(session.id, e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('terminal.inputPlaceholder')}
          aria-label={t('terminal.inputPlaceholder')}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: `${fontSize}px`,
          }}
        />
      </div>
    </div>
  );
};

export const TerminalPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    visible,
    height,
    maximized,
    profiles,
    defaultProfileId,
    sessions,
    activeTabId,
    splitTabId,
    followOsc7,
    fontSize,
    searchOpen,
    searchQuery,
    confirmCloseTabId,
    initTerminalStore,
    setPanelVisible,
    setPanelHeight,
    toggleMaximized,
    setDefaultProfile,
    setFollowOsc7,
    setFontSize,
    setSearchOpen,
    setSearchQuery,
    createSession,
    setActiveTab,
    toggleSplitWithTab,
    renameTab,
    requestCloseTab,
    closeAllSessions,
    cancelCloseTab,
    changeDirectoryInSession,
    clearOutput,
    handleBackendData,
    handleBackendExit,
  } = useTerminalStore();

  const { currentPath, navigateTo } = useBrowserStore();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const isResizingRef = useRef(false);
  const initCalledRef = useRef(false);

  useEffect(() => {
    if (initCalledRef.current) return;
    initCalledRef.current = true;
    void initTerminalStore(useBrowserStore.getState().currentPath || '/');
  }, [initTerminalStore]);

  useEffect(() => {
    const unsubData = subscribeEvent<TerminalDataEvent>('terminal:data', (ev) => {
      handleBackendData(ev.id, ev.chunk, ev.rawLen, ev.cwdOsc7);
      if (ev.cwdOsc7 && useTerminalStore.getState().followOsc7) {
        void navigateTo(ev.cwdOsc7);
      }
    });
    const unsubExit = subscribeEvent<TerminalExitEvent>('terminal:exit', (ev) => {
      handleBackendExit(ev.id, ev.exitCode);
    });
    return () => {
      unsubData();
      unsubExit();
    };
  }, [handleBackendData, handleBackendExit, navigateTo]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newHeight = window.innerHeight - e.clientY - 26;
      setPanelHeight(newHeight);
    };
    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [setPanelHeight]);

  const activeSession =
    sessions.find((s) => s.id === activeTabId) || sessions[0] || null;
  const splitSession =
    splitTabId && splitTabId !== activeSession?.id
      ? sessions.find((s) => s.id === splitTabId) || null
      : null;

  useEffect(() => {
    if (!followOsc7 || !activeSession?.cwd) return;
    const targetCwd = activeSession.cwd.trim();
    if (!targetCwd || targetCwd === '/') return;
    const browserCur = useBrowserStore.getState().currentPath || '';
    const normTerm = targetCwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const normBrowser = browserCur.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (normTerm && normTerm !== normBrowser) {
      navigateTo(targetCwd);
    }
  }, [followOsc7, activeSession?.id, activeSession?.cwd, navigateTo]);

  if (!visible) return null;

  return (
    <section
      aria-label={t('terminal.title')}
      style={{
        height: maximized ? 'calc(100vh - 120px)' : `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Divisor superior redimensionável */}
      <div
        role="separator"
        aria-orientation="horizontal"
        onMouseDown={(e) => {
          e.preventDefault();
          isResizingRef.current = true;
          document.body.style.cursor = 'row-resize';
        }}
        onDoubleClick={() => setPanelHeight(260)}
        style={{
          height: '4px',
          cursor: 'row-resize',
          backgroundColor: 'transparent',
          width: '100%',
        }}
      />

      {/* Barra de cabeçalho limpa em linha única (estilo VS Code) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '34px',
          padding: '0 10px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-subtle)',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        {/* Esquerda: Título do Painel + Badge da Sessão Ativa */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Terminal size={14} style={{ color: 'var(--accent)' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-primary)',
              }}
            >
              {t('terminal.title')}
            </span>
          </div>

          {activeSession && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                padding: '1px 7px',
                borderRadius: '999px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                maxWidth: '280px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={activeSession.cwd}
            >
              {activeSession.title} • {activeSession.cwd}
            </span>
          )}
        </div>

        {/* Direita: Controles de criação, perfil e ações em linha única */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => void createSession(currentPath || '/', defaultProfileId)}
            title={t('terminal.newTab')}
            style={termActionBtnStyle}
          >
            <Plus size={13} />
          </button>

          <select
            value={defaultProfileId}
            onChange={(e) => setDefaultProfile(e.target.value)}
            aria-label={t('terminal.selectProfile')}
            title={t('terminal.selectProfile')}
            style={{
              height: '24px',
              fontSize: '11px',
              padding: '0 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div
            style={{
              width: '1px',
              height: '14px',
              backgroundColor: 'var(--border-subtle)',
              margin: '0 2px',
            }}
          />

          {activeSession && (
            <button
              type="button"
              onClick={() =>
                void changeDirectoryInSession(activeSession.id, currentPath || '/')
              }
              title={t('terminal.cdCurrentFolder')}
              style={termActionBtnStyle}
            >
              <FolderSync size={13} />
              <span>{t('terminal.cdCurrentFolder')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const nextState = !followOsc7;
              setFollowOsc7(nextState);
              if (nextState && activeSession?.cwd && activeSession.cwd !== '/') {
                const browserCur = useBrowserStore.getState().currentPath || '';
                const normTerm = activeSession.cwd
                  .replace(/\\/g, '/')
                  .replace(/\/+$/, '')
                  .toLowerCase();
                const normBrowser = browserCur
                  .replace(/\\/g, '/')
                  .replace(/\/+$/, '')
                  .toLowerCase();
                if (normTerm && normTerm !== normBrowser) {
                  navigateTo(activeSession.cwd);
                }
              }
            }}
            title={`${t('terminal.followOsc7')} — ${
              followOsc7 ? 'Ativo (Aba ativa acompanha o terminal)' : 'Inativo'
            }`}
            aria-pressed={followOsc7}
            style={{
              ...termActionBtnStyle,
              borderColor: followOsc7 ? 'var(--accent-primary)' : 'var(--border-subtle)',
              backgroundColor: followOsc7 ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: followOsc7 ? 'var(--accent-text)' : 'var(--text-secondary)',
              fontWeight: followOsc7 ? 600 : 400,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '999px',
                backgroundColor: followOsc7 ? '#22c55e' : 'var(--text-muted)',
                display: 'inline-block',
              }}
            />
            <ArrowLeftRight size={12} />
            <span>Follow-up</span>
          </button>

          {sessions.length > 1 && (
            <button
              type="button"
              onClick={() => toggleSplitWithTab()}
              title={t('terminal.splitTerminal')}
              style={{
                ...termActionBtnStyle,
                borderColor: splitSession ? 'var(--accent-primary)' : 'var(--border-subtle)',
                color: splitSession ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Columns2 size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            title={t('terminal.searchPlaceholder')}
            style={{
              ...termActionBtnStyle,
              borderColor: searchOpen ? 'var(--accent-primary)' : 'var(--border-subtle)',
              color: searchOpen ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            <Search size={13} />
          </button>

          <button
            type="button"
            onClick={() => setFontSize(fontSize - 1)}
            title="Diminuir fonte (A-)"
            style={termActionBtnStyle}
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => setFontSize(fontSize + 1)}
            title="Aumentar fonte (A+)"
            style={termActionBtnStyle}
          >
            A+
          </button>

          {activeSession && (
            <button
              type="button"
              onClick={() => clearOutput(activeSession.id)}
              title={t('terminal.clearOutput')}
              style={termActionBtnStyle}
            >
              <Eraser size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={toggleMaximized}
            title={maximized ? t('terminal.restorePanel') : t('terminal.maximizePanel')}
            style={termActionBtnStyle}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            type="button"
            onClick={() => setPanelVisible(false)}
            title={t('terminal.hidePanel')}
            style={termActionBtnStyle}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Barra de busca na saída */}
      {searchOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-tertiary)',
          }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            autoFocus
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('terminal.searchPlaceholder')}
            style={{
              flex: 1,
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '12px',
            }}
          />
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSearchOpen(false);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Corpo principal: Viewport do Terminal à esquerda + Lista Lateral de Sessões (estilo VS Code) à direita */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Área das sessões (única ou dividida lado a lado) */}
        <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          {activeSession ? (
            <>
              <TerminalViewport
                session={activeSession}
                fontSize={fontSize}
                searchQuery={searchQuery}
                onNavigatePath={(p) => void navigateTo(p)}
              />
              {splitSession && (
                <>
                  <div
                    style={{
                      width: '1px',
                      backgroundColor: 'var(--border-subtle)',
                      flexShrink: 0,
                    }}
                  />
                  <TerminalViewport
                    session={splitSession}
                    fontSize={fontSize}
                    searchQuery={searchQuery}
                    onNavigatePath={(p) => void navigateTo(p)}
                  />
                </>
              )}
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: '12px',
              }}
            >
              {t('terminal.emptyState')}
            </div>
          )}
        </div>

        {/* Barra lateral direita de instâncias de terminais (padrão VS Code) */}
        <aside
          aria-label="Sessões do Terminal"
          style={{
            width: '215px',
            flexShrink: 0,
            borderLeft: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            userSelect: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 10px',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            <span>Sessões ({sessions.length})</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {sessions.length > 1 && (
                <button
                  type="button"
                  onClick={() => void closeAllSessions()}
                  title="Encerrar todas as sessões de terminal"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px',
                    borderRadius: '4px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => void createSession(currentPath || '/', defaultProfileId)}
                title={t('terminal.newTab')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {sessions.map((sess, idx) => {
              const isActive = sess.id === activeSession?.id;
              const isSplit = sess.id === splitSession?.id;
              const folderLabel =
                sess.cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || sess.cwd;

              return (
                <div
                  key={sess.id}
                  onClick={() => setActiveTab(sess.id)}
                  onDoubleClick={() => {
                    setEditingTabId(sess.id);
                    setEditingTitle(sess.title);
                  }}
                  title={`${sess.title} — ${sess.cwd}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '5px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: isActive
                      ? 'var(--bg-selected)'
                      : isSplit
                      ? 'var(--bg-surface)'
                      : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderLeft: isActive
                      ? '2px solid var(--accent-primary)'
                      : isSplit
                      ? '2px solid var(--accent)'
                      : '2px solid transparent',
                  }}
                >
                  <Terminal
                    size={13}
                    style={{
                      color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  />

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {editingTabId === sess.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        autoFocus
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => {
                          renameTab(sess.id, editingTitle);
                          setEditingTabId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            renameTab(sess.id, editingTitle);
                            setEditingTabId(null);
                          } else if (e.key === 'Escape') {
                            setEditingTabId(null);
                          }
                        }}
                        style={{
                          width: '100%',
                          fontSize: '11px',
                          padding: '1px 4px',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--accent-primary)',
                          borderRadius: '3px',
                        }}
                      />
                    ) : (
                      <>
                        <span
                          style={{
                            fontWeight: isActive ? 600 : 400,
                            fontSize: '12px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {idx + 1}: {sess.title}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {folderLabel}
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTabId(sess.id);
                        setEditingTitle(sess.title);
                      }}
                      title="Renomear sessão"
                      style={sideItemIconBtnStyle}
                    >
                      <Pencil size={11} />
                    </button>
                    {sessions.length > 1 && ! isActive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSplitWithTab(sess.id);
                        }}
                        title={t('terminal.splitTerminal')}
                        style={{
                          ...sideItemIconBtnStyle,
                          color: isSplit ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >
                        <Columns2 size={11} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void requestCloseTab(sess.id);
                      }}
                      title={t('terminal.closeTab')}
                      style={sideItemIconBtnStyle}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Modal de confirmação ao fechar aba com processos filhos ativos */}
      {confirmCloseTabId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 250,
          }}
        >
          <div
            style={{
              width: '400px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <strong style={{ fontSize: '14px' }}>{t('terminal.confirmActiveProcessTitle')}</strong>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
              {t('terminal.confirmActiveProcessMessage')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={cancelCloseTab}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                {t('ops.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void requestCloseTab(confirmCloseTabId, true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: 'var(--danger)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {t('terminal.confirmKillProcess')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const termActionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: '24px',
  padding: '0 7px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  cursor: 'pointer',
};

const sideItemIconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px',
  borderRadius: '4px',
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};


