# Roteiro por etapas

Cada etapa é registrada no [`CHANGELOG.md`](../CHANGELOG.md). A ordem reflete a evolução do projeto e cada entrega é validada por testes e builds de release.

| Versão | Etapa | Situação |
| --- | --- | --- |
| 0.1.0 | Fundação, navegação básica e internacionalização (pt-BR, en, es) | Concluída |
| 0.2.0 | Abas, sessão e painel lateral com árvore de pastas | Concluída |
| 0.3.0 | Operações de arquivo e fila de jobs | Concluída |
| 0.4.0 | Painel duplo, barra lateral e arrastar e soltar interno | Concluída |
| 0.5.0 | Terminal integrado (painel inferior) | Concluída |
| 0.6.0 | Modos de visualização, miniaturas e prévia | Concluída |
| 0.7.0 | Busca e filtros | Concluída |
| 0.8.0 | Integração com o sistema operacional | Concluída |
| 0.9.0 | Produtividade (paleta, atalhos, renomeação em lote, comparação, hashes) | Concluída |
| 0.10.0 | Arquivos compactados e perfis remotos | Concluída |
| 1.0.0 | Estabilização e distribuição | Concluída |
| 1.1.0 | Conexões SSH/SFTP (TOFU), DB Studio, Studio Editor, streaming HTTP 206 e slides | Concluída |
| 1.1.1 | Mapa ER, Criador SQLite, Live Web Preview, Terminal Follow-up, Activity Bar e 10 idiomas | Concluída |
| 1.2.0 | Unidades de Rede (`\\IP\`, `smb://`), Histórico do Clipboard (`Alt+V`) e Clipboard Nativo com o SO | Concluída |

---

## 0.1.0 — Fundação e navegação básica

**Objetivo:** app abre em < 1 s e navega em pastas locais grandes sem travar.

- Projeto Wails v2 na raiz, frontend React/TS estrito/Vite, Vitest/testes JS, `go vet`, testes Go.
- Tokens de design (claro/escuro), shell da janela (barra de título, barra de ferramentas, área de conteúdo, barra de status).
- `vfs` + `vfs/local` (`Stat`, `ReadDir` em lotes, `Open`), erros de domínio.
- `listing` com streaming por eventos, cancelamento por `requestId`.
- Modo detalhes virtualizado: nome, tamanho, tipo, data de modificação; ordenação natural; pastas primeiro.
- Navegação: voltar, avançar, subir, atualizar; breadcrumbs + edição de caminho.
- Abrir arquivo com o app padrão; mostrar/ocultar ocultos.
- `storage` com SQLite (`modernc.org/sqlite`) e migrações; `settings` básico.
- Internacionalização com i18next (catálogos `pt-BR`/`en`/`es`), detecção de idioma do SO, formatadores `Intl`, `npm run i18n:check` e pseudo-localidade.
- `release.yml` manual gerando executáveis para Windows, Linux e macOS.

## 0.2.0 — Abas, sessão e painel lateral com árvore de pastas

- Store de sessão (janela → painel → abas) e histórico por aba.
- Nova, fechar, duplicar, fixar, fechar outras/à direita, reabrir fechada, reordenar arrastando.
- Abrir em nova aba (clique do meio, `Ctrl+Enter`), atalhos `Ctrl+T`, `Ctrl+W`, `Ctrl+Shift+T`, `Ctrl+Tab`, `Ctrl+1..9`.
- Estado por aba (modo, ordenação, filtro, rolagem, seleção) e cache LRU de abas inativas.
- Painel lateral esquerdo recolhível (`Ctrl+B` / `Cmd+B`) e redimensionável.
- `internal/tree` + árvore de pastas virtualizada com raízes por SO, carregamento preguiçoso e sincronização com a aba ativa.

## 0.3.0 — Operações de arquivo e fila de jobs

- Seleção múltipla (clique, `Shift`, `Ctrl`, `Ctrl+A`, retângulo).
- Copiar/recortar/colar, renomear (`F2`), nova pasta/arquivo, lixeira nativa, exclusão permanente.
- `internal/ops`: planejamento, escrita atômica (`.pulsares-part` + rename), pausa/retomada/cancelamento, resolução de conflitos, verificação opcional por SHA-256.
- Painel de operações com progresso, velocidade e ETA; diário (`op_journal`) para Desfazer (`Ctrl+Z`) e Refazer (`Ctrl+Y`).

## 0.4.0 — Painel duplo, barra lateral e arrastar e soltar interno

- Layout único / dividido horizontal / vertical; cada painel com suas abas.
- Ações "copiar/mover para o outro painel" (`F5`/`F6`).
- Arrastar e soltar entre painéis e sobre nós da árvore (expansão automática ao pairar).
- Seções do painel lateral: favoritos, unidades/volumes com espaço livre, recentes e menu de contexto nos nós da árvore.

## 0.5.0 — Terminal integrado (painel inferior)

- `internal/terminal`: sessões de pseudoterminal (ConPTY no Windows, PTY no Linux/macOS), fluxo em lotes base64 (~8 ms ou 64 KB) com contrapressão (`Ack`), citação segura por shell e encerramento completo da árvore de processos.
- Detecção de perfis de shell por SO (`pwsh`, PowerShell, `cmd`, Git Bash, WSL, `bash`, `zsh`, `fish`, `sh`).
- Frontend com xterm.js: painel inferior recolhível (`` Ctrl+` ``), redimensionável e maximizável, abas, divisão lado a lado, busca na saída e suporte a `OSC 7`.

## 0.6.0 — Modos de visualização, miniaturas e prévia

- Modos lista compacta, grade de miniaturas e colunas (Miller); agrupamento e densidade.
- `internal/thumbs`: geração assíncrona limitada, cache em disco LRU e prévia segura (64 KB para texto/código).
- Painel de prévia e Prévia Rápida em tela cheia (`Espaço`).

## 0.7.0 — Busca e filtros

- Filtro instantâneo na pasta (`Ctrl+F`).
- `internal/search`: busca recursiva em streaming (`search:batch` e `search:done`) com glob/Regex, extensão, tamanho, datas e conteúdo de texto com snippets.
- Índice local opcional no SQLite (`index_roots` e `index_entries`).

## 0.8.0 — Integração com o sistema operacional

- `internal/watch`: monitoramento de diretórios com debounce (`watch:changed`).
- `internal/platform`: propriedades recursivas + checksum, "Abrir com…", terminal externo, mostrar no explorador nativo e ejeção segura de unidades.
- Seletor rápido de extensões no modal de novo arquivo.

## 0.9.0 — Produtividade

- `internal/productivity`: renomeação em lote com prévia e Regex (`F2`), comparação de diretórios e calculadora de hashes (`MD5`, `SHA-1`, `SHA-256`).
- Paleta de comandos (`Ctrl+Shift+P`), atalhos configuráveis com detecção de conflitos, etiquetas/cores (`item_tags`) e buscas salvas (`saved_searches`).

## 0.10.0 — Arquivos compactados e base de perfis remotos

- `internal/vfs/archive`: listagem, criação e extração segura (anti-Zip-Slip) de `.zip`, `.tar`, `.tar.gz` e `.tgz`.
- Tabela `remote_profiles` no SQLite e modais integrados à paleta de comandos para pacotes e conexões remotas.

## 1.0.0 — Estabilização e distribuição

- Testes de migração idempotente desde `0.1.0` até `1.0.0` e validação completa dos pacotes Go e paridade i18n inicial.

## 1.1.0 — SSH/SFTP v3, Studio Editor, DB Studio e Multimídia

- **Cliente SSH / SFTP v3 (`internal/vfs/sftp`)**: verificação de chave pública **TOFU (SHA-256 Pinning)**, autenticação por chave privada, SSH Agent e senha volátil em RAM, navegação transparente `sftp://<id>/...` via `CompositeFS` e atalho para terminal SSH.
- **Streaming HTTP 206 (`internal/thumbs/media_server.go`)**: reprodução contínua e seek instantâneo para vídeos pesados.
- **Visualizador de apresentações**: leitura estruturada de `.pptx` e `.odp` (`internal/thumbs/presentation.go`).
- **Pulsares Studio Editor**: editor de código e texto embutido (`Ctrl+E`) com formatação automática, quebra de linha (`Alt+Z`) e edição local/SFTP.
- **Pulsares DB Studio**: visualizador e console SQL interativo para bancos SQLite e DuckDB.
- Busca por conteúdo otimizada com streaming progressivo e ícones especializados por linguagem/formato.

## 1.1.1 — Suíte Autônoma, Mapa ER, Criador SQLite, Live Web Preview e 10 Idiomas

- **Janelas independentes e identidade nativa**: processos autônomos (`--studio` e `--dbstudio`) com ícones próprios, `WindowClassName` dedicado e `AppUserModelID` no Win32 (`internal/platform/window_icon_windows.go`).
- **Pulsares DB Studio & Criador SQLite (`internal/dbcreator`)**:
  - **Mapa ER (Diagrama Interativo)**: inspeção via `PRAGMA foreign_key_list`, nós arrastáveis, badges `PK`/`FK`, curvas Bézier, auto-layout topológico, MiniMap e exportação para `.svg`.
  - **Criador SQLite (CSV/TSV/JSON/JSONL → `.db`)**: inferência automática de delimitadores e tipos, modos Simples e Desenvolvedor (DDL customizável, WAL, batch) e importação em massa com progresso.
  - Otimizações de PRAGMAs (`mmap_size`, `cache_size`, leitura O(1) via `sqlite_sequence`) e diálogo nativo de salvamento na exportação CSV/JSON.
- **Pulsares Studio Editor & Prévia Web Conectada**:
  - Servidor local `/__project/<base64_dir>/<relPath>` conectando `index.html` ao conteúdo vivo das abas `.css`, `.js` e assets locais, tanto no Studio quanto no `PreviewPanel`.
  - Abertura direta de pastas de projeto sem rascunhos vazios e menu de contexto completo em **ARQUIVOS DO PROJETO**.
- **Terminal Follow-up & Activity Bar**: botão *Follow-up* sincronizando `cd` (cliente + backend) com a aba ativa e barra lateral retrátil com Activity Bar + Flyout auto-ocultável.
- **Drag & Drop granular** sem congelamentos, spinners de carregamento e expansão para **10 idiomas** (`pt-BR`, `en`, `es`, `de`, `fr`, `it`, `ja`, `zh-CN`, `tr`, `sv`).
- **Distribuição Portátil**: modo portátil em `./data/explorer.db` (`getPortableDataDir`) com novos pacotes `Windows-x64-Portable.zip` e `Multiverse-Portable.zip`.

## 1.2.0 — Unidades de Rede Multiplataforma, Histórico do Clipboard (`Alt + V`) e Interação Nativa com o SO

- **Conexão de Unidades e Compartilhamentos de Rede (`internal/platform/netdrive_*.go`, `NetworkDriveModal.tsx` e `Sidebar.tsx`)**: botão `+` em **Unidades e Volumes** e navegação direta na barra de endereço (`\\192.168.10.195\`, `smb://...`, `nfs://...`), listagem de pastas compartilhadas na raiz do servidor (`NetShareEnum` / `smbclient` / `smbutil`), autenticação opcional sem salvar senhas em texto puro, mapeamento de letra de unidade no Windows (`WNetAddConnection2W`), montagem nativa no Linux (GVFS `/proc/mounts`) e macOS (`/Volumes`), desconexão rápida e atalhos salvos em SQLite (`saved_network_drives`).

- **Clipboard Nativo Bidirecional com o SO (`internal/platform/clipboard_windows.go` e `clipboard_unix.go`)**: cópia e recorte reais de arquivos (`CF_HDROP` + `Preferred DropEffect` no Windows, `x-special/gnome-copied-files` no Linux e `POSIX file` no macOS) permitindo copiar/colar livremente entre o Pulsares Explorer e o Explorador do Sistema, além de leitura/escrita nativa de imagens (`CF_DIB` / `PNG`).
- **Painel lateral direito de Histórico do Clipboard (`ClipboardHistoryDrawer.tsx`)**: acionado pelo botão na `AddressBar` (ao lado do alternador de tema) ou pelos atalhos `Alt + V` e `Ctrl + Shift + V`.
- **Persistência SQLite (`internal/storage/clipboard.go`)**: armazenamento dos últimos **20 itens não fixados** + itens **fixados ("Manter no histórico")** com deduplicação por hash SHA-256.
- **Textos, Imagens (`PNG`) e Lotes de Arquivos (`Ctrl+C`/`Ctrl+X`)**: prévia visual de prints e textos, restauração rápida para o clipboard do sistema, colagem direta de lotes de arquivos e salvamento atômico de imagens (`.png`) e snippets (`.txt`) diretamente na pasta aberta no explorador.
- **Privacidade e Filtros**: pausa de captura com 1 clique, busca instantânea, filtros por categoria e tradução completa nos 10 idiomas.

## Pendências sem etapa definida

- Provedor VFS `WebDAV` e `SMB` nativo.
- Arrastar arquivos para fora do app (para outros programas do SO) e menu de contexto nativo do Windows.
- Leitura de MFT/USN Journal no Windows para índice instantâneo.
- Assinatura de código (Windows), notarização (macOS) e instalador NSIS opcional.
- Sistema de plugins/extensões e opção de definir como explorador padrão do Windows.
