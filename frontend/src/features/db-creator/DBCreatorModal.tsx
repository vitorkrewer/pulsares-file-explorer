import React, { useEffect, useRef } from 'react';
import {
  Database,
  Sparkles,
  Code,
  X,
  FolderOpen,
  Play,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import { useDBCreatorStore } from './store';
import { useDBStudioStore } from '../db-studio/store';
import { revealInSystemExplorer } from '../../lib/wails';

export const DBCreatorModal: React.FC = () => {
  const {
    isOpen,
    sourcePath,
    viewMode,
    step,
    loadingInspection,
    inspection,
    errorMessage,
    destinationPath,
    tableName,
    columns,
    addAutoId,
    delimiter,
    hasHeader,
    batchSize,
    enableWal,
    customDdl,
    progress,
    logs,
    result,
    closeCreator,
    setViewMode,
    setDestinationPath,
    browseDestination,
    setTableName,
    setAddAutoId,
    setDelimiter,
    setHasHeader,
    setBatchSize,
    setEnableWal,
    setCustomDdl,
    updateColumn,
    startCreation,
  } = useDBCreatorStore();

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step === 'importing' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, step]);

  if (!isOpen) return null;

  const fileName = sourcePath.split(/[/\\]/).pop() || sourcePath;
  const isJSON = sourcePath.toLowerCase().endsWith('.json') || sourcePath.toLowerCase().endsWith('.jsonl') || sourcePath.toLowerCase().endsWith('.ndjson');

  const handleOpenInDBStudio = (dbPath: string) => {
    closeCreator();
    void useDBStudioStore.getState().openDatabase(dbPath);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Cabeçalho */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.iconBadge}>
              <Database size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={styles.headerTitle}>Criar Banco de Dados SQLite</div>
              <div style={styles.headerSubtitle}>
                A partir de <strong>{fileName}</strong>
              </div>
            </div>
          </div>

          <div style={styles.headerRight}>
            {step === 'config' && (
              <div style={styles.modeSwitch}>
                <button
                  type="button"
                  onClick={() => setViewMode('simple')}
                  style={{
                    ...styles.modeButton,
                    ...(viewMode === 'simple' ? styles.modeButtonActive : {}),
                  }}
                  title="Modo amigável e direto"
                >
                  <Sparkles size={13} />
                  <span>Simples</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('developer')}
                  style={{
                    ...styles.modeButton,
                    ...(viewMode === 'developer' ? styles.modeButtonActive : {}),
                  }}
                  title="Modo detalhado com controle de DDL e tipos"
                >
                  <Code size={13} />
                  <span>Desenvolvedor</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={closeCreator}
              style={styles.closeButton}
              title="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Corpo do Modal */}
        <div style={styles.body}>
          {loadingInspection && (
            <div style={styles.centerLoading}>
              <RefreshCw size={24} className="spin-animation" style={{ color: 'var(--accent)', marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 500 }}>Analisando estrutura e inferindo colunas...</div>
            </div>
          )}

          {!loadingInspection && errorMessage && step !== 'completed' && (
            <div style={styles.errorAlert}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* PASSO 1: CONFIGURAÇÃO */}
          {!loadingInspection && step === 'config' && (
            <div style={styles.scrollArea}>
              {/* Seção Geral: Destino e Tabela */}
              <div style={styles.sectionCard}>
                <div style={styles.cardHeader}>Destino do Banco de Dados</div>
                <div style={styles.formRow}>
                  <label style={styles.label}>Local de Salvamento (.db):</label>
                  <div style={styles.inputWithButton}>
                    <input
                      type="text"
                      value={destinationPath}
                      onChange={(e) => setDestinationPath(e.target.value)}
                      style={styles.input}
                      placeholder="C:\caminho\para\meu_banco.db"
                    />
                    <button
                      type="button"
                      onClick={() => void browseDestination()}
                      style={styles.secondaryBtn}
                      title="Procurar local no computador"
                    >
                      <FolderOpen size={14} /> Alterar...
                    </button>
                  </div>
                </div>

                <div style={styles.formGrid2}>
                  <div>
                    <label style={styles.label}>Nome da Tabela:</label>
                    <input
                      type="text"
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      style={styles.input}
                      placeholder="nome_da_tabela"
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={addAutoId}
                        onChange={(e) => setAddAutoId(e.target.checked)}
                      />
                      <span>Adicionar chave primária automática (id INTEGER)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* MODO SIMPLES */}
              {viewMode === 'simple' && inspection && (
                <div style={styles.sectionCard}>
                  <div style={styles.cardHeaderFlex}>
                    <span>Pré-visualização dos Dados Inferidos</span>
                    <span style={styles.badgeInfo}>
                      {inspection.columns.length} colunas · ~{inspection.estimatedRows.toLocaleString()} registros estimados
                    </span>
                  </div>

                  {/* Badges de colunas e tipos */}
                  <div style={styles.tagsContainer}>
                    {columns.map((col) => (
                      <span key={col.name} style={styles.typeBadge}>
                        <strong>{col.name}</strong>: <span style={styles.typeTag}>{col.dataType}</span>
                      </span>
                    ))}
                  </div>

                  {/* Amostra tabular */}
                  {inspection.sampleRows.length > 0 && (
                    <div style={styles.tableScroll}>
                      <table style={styles.previewTable}>
                        <thead>
                          <tr>
                            {addAutoId && <th style={styles.th}>id</th>}
                            {columns.map((c) => (
                              <th key={c.name} style={styles.th}>{c.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inspection.sampleRows.slice(0, 5).map((row, rIdx) => (
                            <tr key={rIdx}>
                              {addAutoId && <td style={styles.tdMuted}>{rIdx + 1}</td>}
                              {columns.map((_, cIdx) => (
                                <td key={cIdx} style={styles.td}>
                                  {row[cIdx] || <span style={styles.tdMuted}>NULL</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* MODO DESENVOLVEDOR */}
              {viewMode === 'developer' && (
                <>
                  {/* Opções de Parser */}
                  <div style={styles.sectionCard}>
                    <div style={styles.cardHeader}>Opções do Importador e SQLite</div>
                    <div style={styles.formGrid3}>
                      {!isJSON && (
                        <>
                          <div>
                            <label style={styles.label}>Delimitador:</label>
                            <input
                              type="text"
                              value={delimiter}
                              onChange={(e) => setDelimiter(e.target.value)}
                              style={{ ...styles.input, width: 60, textAlign: 'center' }}
                              maxLength={2}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 16 }}>
                            <label style={styles.checkboxLabel}>
                              <input
                                type="checkbox"
                                checked={hasHeader}
                                onChange={(e) => setHasHeader(e.target.checked)}
                              />
                              <span>Primeira linha é cabeçalho</span>
                            </label>
                          </div>
                        </>
                      )}

                      <div>
                        <label style={styles.label}>Tamanho do Lote (Batch):</label>
                        <select
                          value={batchSize}
                          onChange={(e) => setBatchSize(Number(e.target.value))}
                          style={styles.select}
                        >
                          <option value={1000}>1.000 linhas / transação</option>
                          <option value={2500}>2.500 linhas / transação (Recomendado)</option>
                          <option value={5000}>5.000 linhas / transação</option>
                          <option value={10000}>10.000 linhas / transação</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', paddingTop: 16 }}>
                        <label style={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={enableWal}
                            onChange={(e) => setEnableWal(e.target.checked)}
                          />
                          <span>Modo WAL (Write-Ahead Logging)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Schema / Editor de Colunas */}
                  <div style={styles.sectionCard}>
                    <div style={styles.cardHeader}>Esquema de Colunas (Tipos e Restrições)</div>
                    <div style={styles.tableScroll}>
                      <table style={styles.previewTable}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Nome da Coluna</th>
                            <th style={styles.th}>Tipo SQLite</th>
                            <th style={{ ...styles.th, width: 80, textAlign: 'center' }}>Não Nulo</th>
                            <th style={{ ...styles.th, width: 80, textAlign: 'center' }}>PK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {columns.map((col, idx) => (
                            <tr key={idx}>
                              <td style={styles.td}>
                                <input
                                  type="text"
                                  value={col.name}
                                  onChange={(e) => updateColumn(idx, { name: e.target.value })}
                                  style={styles.cellInput}
                                />
                              </td>
                              <td style={styles.td}>
                                <select
                                  value={col.dataType}
                                  onChange={(e) => updateColumn(idx, { dataType: e.target.value })}
                                  style={styles.cellSelect}
                                >
                                  <option value="TEXT">TEXT</option>
                                  <option value="INTEGER">INTEGER</option>
                                  <option value="REAL">REAL (Float)</option>
                                  <option value="BOOLEAN">BOOLEAN</option>
                                  <option value="DATETIME">DATETIME</option>
                                  <option value="BLOB">BLOB</option>
                                </select>
                              </td>
                              <td style={{ ...styles.td, textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!col.notNull}
                                  onChange={(e) => updateColumn(idx, { notNull: e.target.checked })}
                                />
                              </td>
                              <td style={{ ...styles.td, textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!col.isPrimaryKey}
                                  disabled={addAutoId}
                                  onChange={(e) => updateColumn(idx, { isPrimaryKey: e.target.checked })}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* DDL SQL em tempo real */}
                  <div style={styles.sectionCard}>
                    <div style={styles.cardHeaderFlex}>
                      <span>DDL SQL Gerado (CREATE TABLE)</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Editável</span>
                    </div>
                    <textarea
                      value={customDdl}
                      onChange={(e) => setCustomDdl(e.target.value)}
                      style={styles.ddlTextarea}
                      rows={5}
                      spellCheck={false}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* PASSO 2: IMPORTAÇÃO E PROGRESSO EM TEMPO REAL */}
          {step === 'importing' && (
            <div style={styles.progressContainer}>
              <div style={styles.progressCard}>
                <div style={styles.progressTop}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={18} className="spin-animation" style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      Injetando registros no banco de dados SQLite...
                    </span>
                  </div>
                  <span style={styles.percentageBadge}>
                    {(progress?.percentage || 0).toFixed(1)}%
                  </span>
                </div>

                {/* Barra de Progresso */}
                <div style={styles.progressBarTrack}>
                  <div
                    style={{
                      ...styles.progressBarFill,
                      width: `${Math.min(100, Math.max(0, progress?.percentage || 0))}%`,
                    }}
                  />
                </div>

                {/* Métricas */}
                <div style={styles.metricsGrid}>
                  <div style={styles.metricItem}>
                    <span style={styles.metricLabel}>Registros Injetados</span>
                    <span style={styles.metricVal}>
                      {(progress?.processedRows || 0).toLocaleString()}
                    </span>
                  </div>
                  <div style={styles.metricItem}>
                    <span style={styles.metricLabel}>Velocidade</span>
                    <span style={styles.metricVal}>
                      {(progress?.speedRowsSec || 0).toLocaleString()} lin/s
                    </span>
                  </div>
                  <div style={styles.metricItem}>
                    <span style={styles.metricLabel}>Tempo Decorrido</span>
                    <span style={styles.metricVal}>
                      {((progress?.elapsedMs || 0) / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Console de Logs em Tempo Real (Modo Desenvolvedor ou Simples) */}
              <div style={styles.consoleCard}>
                <div style={styles.consoleHeader}>
                  <Terminal size={14} />
                  <span>Console de Execução e Transações SQLite</span>
                </div>
                <div style={styles.consoleBody}>
                  {logs.map((line, idx) => (
                    <div key={idx} style={styles.logLine}>
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          )}

          {/* PASSO 3: CONCLUÍDO */}
          {step === 'completed' && result && (
            <div style={styles.completedContainer}>
              <div style={styles.successIconCircle}>
                <CheckCircle2 size={42} color="#10b981" />
              </div>
              <div style={styles.successTitle}>Banco de Dados Criado com Sucesso!</div>
              <div style={styles.successSubtitle}>
                A tabela <strong>"{result.tableName}"</strong> foi criada e populada no SQLite com alta integridade.
              </div>

              <div style={styles.resultDetailsBox}>
                <div style={styles.resultRow}>
                  <span>Destino:</span>
                  <strong>{result.destinationPath}</strong>
                </div>
                <div style={styles.resultRow}>
                  <span>Total de Registros Injetados:</span>
                  <strong>{result.totalRows.toLocaleString()} linhas</strong>
                </div>
                <div style={styles.resultRow}>
                  <span>Tempo Total de Execução:</span>
                  <strong>{(result.totalDurationMs / 1000).toFixed(2)} segundos</strong>
                </div>
                <div style={styles.resultRow}>
                  <span>Tamanho do Arquivo SQLite:</span>
                  <strong>{(result.finalFileSizeBytes / 1024).toFixed(1)} KB</strong>
                </div>
              </div>

              <div style={styles.actionButtonsRow}>
                <button
                  type="button"
                  onClick={() => handleOpenInDBStudio(result.destinationPath)}
                  style={styles.primaryActionButton}
                >
                  <Database size={16} /> Abrir no Pulse DB Studio
                </button>
                <button
                  type="button"
                  onClick={() => void revealInSystemExplorer(result.destinationPath)}
                  style={styles.secondaryActionButton}
                >
                  <FolderOpen size={15} /> Ver na Pasta
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        {step === 'config' && !loadingInspection && (
          <div style={styles.footer}>
            <button
              type="button"
              onClick={closeCreator}
              style={styles.secondaryBtn}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void startCreation()}
              style={styles.primaryBtn}
            >
              <Play size={14} /> Criar Banco de Dados
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    width: '92%',
    maxWidth: 760,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-lg, 10px)',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.55)',
    overflow: 'hidden',
    color: 'var(--text-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-canvas, rgba(0, 0, 0, 0.1))',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'var(--accent-subtle, rgba(56, 189, 248, 0.15))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  modeSwitch: {
    display: 'flex',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    padding: 2,
    gap: 2,
  },
  modeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    fontSize: 11.5,
    fontWeight: 500,
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  modeButtonActive: {
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 4,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 340,
  },
  scrollArea: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionCard: {
    backgroundColor: 'var(--bg-canvas, rgba(255, 255, 255, 0.02))',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: 14,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-secondary)',
    marginBottom: 10,
  },
  cardHeaderFlex: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-secondary)',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeInfo: {
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'none',
    color: 'var(--accent)',
  },
  formRow: {
    marginBottom: 10,
  },
  formGrid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  formGrid3: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr 1fr 1fr',
    gap: 12,
  },
  label: {
    display: 'block',
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '7px 10px',
    fontSize: 12.5,
    borderRadius: 6,
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  inputWithButton: {
    display: 'flex',
    gap: 8,
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  checkboxLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  typeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 7px',
    borderRadius: 4,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    fontSize: 11,
    color: 'var(--text-primary)',
  },
  typeTag: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--accent)',
    textTransform: 'uppercase',
  },
  tableScroll: {
    overflowX: 'auto',
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    textAlign: 'left',
    padding: '6px 10px',
    backgroundColor: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)',
    fontWeight: 600,
    fontSize: 11,
  },
  td: {
    padding: '6px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  },
  tdMuted: {
    padding: '6px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  cellInput: {
    width: '100%',
    padding: '3px 6px',
    fontSize: 11.5,
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
  },
  cellSelect: {
    width: '100%',
    padding: '3px 6px',
    fontSize: 11.5,
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
  },
  ddlTextarea: {
    width: '100%',
    fontFamily: 'monospace',
    fontSize: 11.5,
    padding: 8,
    borderRadius: 6,
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
  },
  progressContainer: {
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  progressCard: {
    backgroundColor: 'var(--bg-canvas, rgba(255, 255, 255, 0.02))',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: 16,
  },
  progressTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  percentageBadge: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--accent)',
    fontFamily: 'monospace',
  },
  progressBarTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: 'var(--border-subtle)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'var(--accent)',
    transition: 'width 0.2s ease',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },
  metricItem: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-surface)',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
  },
  metricLabel: {
    fontSize: 10.5,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  consoleCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    border: '1px solid #1e293b',
    overflow: 'hidden',
  },
  consoleHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    backgroundColor: '#1e293b',
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
  },
  consoleBody: {
    maxHeight: 180,
    overflowY: 'auto',
    padding: 10,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 1.5,
    color: '#cbd5e1',
  },
  logLine: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  completedContainer: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 12.5,
    color: 'var(--text-secondary)',
    marginBottom: 16,
    maxWidth: 480,
  },
  resultDetailsBox: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: 'var(--bg-canvas, rgba(255, 255, 255, 0.02))',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    textAlign: 'left',
    fontSize: 12,
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: 6,
  },
  actionButtonsRow: {
    display: 'flex',
    gap: 12,
  },
  primaryActionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  },
  secondaryActionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    color: 'var(--text-primary)',
    borderRadius: 6,
    fontWeight: 500,
    fontSize: 12.5,
    cursor: 'pointer',
  },
  footer: {
    padding: '12px 18px',
    borderTop: '1px solid var(--border-subtle)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    backgroundColor: 'var(--bg-canvas, rgba(0, 0, 0, 0.05))',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 12.5,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    color: 'var(--text-primary)',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  },
  centerLoading: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    color: 'var(--text-muted)',
  },
  errorAlert: {
    margin: '12px 16px 0',
    padding: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#ef4444',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
};
