# Changelog

Todas as mudanças visíveis são registradas aqui, agrupadas pela etapa (versão *minor*) em andamento. Ver [docs/roadmap.md](docs/roadmap.md).

## [1.1.1] - 2026-11-09

### Adicionado

- **Janelas Independentes e Autônomas para o Pulse DB Studio e Pulsares Studio Editor**:
  - Restauração e reforço estrito da arquitetura desacoplada: tanto o **Pulse DB Studio** quanto o **Pulsares Studio Editor** operam exclusivamente como janelas independentes do sistema operacional, nunca acoplados ou sobrepostos aos arquivos do Pulsares Explorer.
  - O store de ambos os módulos mantém `preferSeparateWindow: true` por padrão, acionando as APIs nativas (`OpenDBStudioWindow` e `OpenStudioWindow`) que invocam os processos frameless autônomos (`--dbstudio` e `--studio`) com controles nativos de janela (minimizar, maximizar e fechar).
  - Correção da inicialização de instâncias independentes mesmo quando nenhum arquivo prévio estiver selecionado, apresentando imediatamente a tela nativa dedicada de boas-vindas e seleção de arquivos.
- **Correção da Opacidade, Camadas de Fundo e Bug de Paginação no Pulse DB Studio**:
  - Correção das cores de fundo e tokens do design system (`--bg-surface`, `--bg-subtle`, `--border-subtle`, `--text-primary`), eliminando qualquer transparência e impedindo o vazamento visual de elementos e pastas situados em segundo plano.
  - Correção do cálculo e exibição de paginação da grade (`1-NaN de undefined`): serialização unificada de `totalRows` e `totalCount` no backend Go e tratamento seguro de paginação no frontend com formatação numérica localizada em pt-BR.
- **Otimização Extrema de Performance para Abertura e Leitura de Bancos de Dados SQLite Grandes**:
  - Injeção de PRAGMAs de alta velocidade no SQLite (`cache_size = -64000`, `mmap_size = 268435456`, `temp_store = MEMORY`, `read_uncommitted = ON`), acelerando consultas e paginação através de memory-mapped I/O.
  - Inspeção instantânea do esquema sem congelamentos: leitura O(1) de contagem via `sqlite_sequence` para tabelas autoincrement, timeout preventivo de 150ms por tabela para `SELECT COUNT(*)`, e contagem sob demanda para Views, garantindo abertura em milissegundos mesmo em bases com dezenas de tabelas e milhões de linhas.
  - Otimização inteligente da primeira página de registros: quando o número retornado for inferior ao limite da página, o total é inferido imediatamente sem necessidade de varredura completa da tabela.
- **Spinners e Indicadores de Carregamento Visuais em Todo o Explorer**:
- **Criação Rápida de Banco de Dados SQLite a partir de Arquivos (CSV, TSV, JSON, JSONL)**:
  - Nova ação integrada no menu de contexto do navegador de arquivos para arquivos tabulares e semiestruturados (`.csv`, `.tsv`, `.tab`, `.json`, `.jsonl`, `.ndjson`): **"Criar Banco de Dados SQLite..."**.
  - **Mecanismo de Análise e Inferência Automática (`dbcreator`)**: detecção inteligente de delimitador (vírgula, ponto-e-vírgula, tabulação), cabeçalhos e inferência dinâmica de tipos (`INTEGER`, `REAL`, `BOOLEAN`, `TEXT`, `DATETIME`) a partir da amostragem dos dados.
  - **Experiência Híbrida (Simples vs Desenvolvedor)**:
    - **Modo Simples**: pré-visualização tabular limpa dos dados, contagem estimada de registros, geração automática de chave primária (`id INTEGER PRIMARY KEY AUTOINCREMENT`) e seleção direta do local de salvamento via diálogo nativo (`.db`).
    - **Modo Desenvolvedor**: controle minucioso do esquema de colunas (edição de tipos, renomeação de campos, restrições `NOT NULL` e `PK`), visualização e customização do DDL SQL (`CREATE TABLE ...`) em tempo real, ajuste de transações em lote (*batch size* de 1.000 a 10.000 linhas) e ativação do modo WAL (*Write-Ahead Logging*).
  - **Injeção de Alta Performance com Streaming de Progresso**:
    - Transações SQLite em massa com otimização de PRAGMAs (`synchronous=OFF`, `journal_mode=MEMORY` e restauração segura para `WAL`), atingindo dezenas de milhares de inserções por segundo.
    - Barra de progresso percentual, métricas em tempo real (linhas injetadas, velocidade em linhas/s, tempo decorrido) e console interativo com logs de transações para desenvolvedores.
  - **Integração Direta com o Pulse DB Studio**: botão imediato ao finalizar para abrir e consultar o novo banco SQLite diretamente na interface do DB Studio, além de atalho para revelar o arquivo `.db` na pasta.
- **Diálogo Nativo de Salvamento na Exportação do Pulse DB Studio**:
  - Ao clicar para exportar dados para **CSV** ou **JSON** no Pulse DB Studio, agora é aberta a janela nativa de diálogo de salvamento do sistema operacional (`ShowSaveFileDialog` via Wails runtime / `SaveFileDialog`).
  - O diálogo sugere automaticamente o nome do arquivo com base na tabela ativa (`<tabela>_export.<csv|json>`), a pasta do banco de dados inspecionado como diretório inicial padrão, e filtros de arquivo específicos (`*.csv` e `*.json`).
  - Suporte resiliente com cancelamento limpo (não salva nada e não exibe erro se o usuário cancelar) e fallback automático para a File System Access API do navegador (`showSaveFilePicker`) ou download direto quando em ambiente web puro.
- **Arrastar e Soltar (Drag & Drop) Fluido, Seguro e Funcional**:
  - Eliminação da causa raiz de travamentos e congelamentos (*freezes*): remoção do atributo `draggable` global do container de painel em `App.tsx`, que interceptava cliques de seleção de arquivos e causava auto-drops involuntários.
  - Implementação de arrastar e soltar granular em itens e linhas de pastas na visão detalhada (`DetailsView`), lista compacta, grade de cartões e colunas Miller (`AlternativeViews`).
  - Suporte completo a soltar arquivos e pastas diretamente sobre subpastas nas listas ou sobre nós na árvore lateral de diretórios (`FolderTree`), com realce visual da pasta destino e auto-expansão ao pairar o cursor.
  - Proteção inteligente no frontend contra auto-drops (mover um arquivo/pasta para onde ele já reside) e contra soltar pastas dentro de si mesmas ou de suas próprias subpastas.
  - Proteção robusta no backend (`internal/ops/ops.go`): detecção determinística de movimentação para o mesmo diretório como no-op seguro e sem bloqueios na fila, prevenção de loops recursivos infinitos ao tentar mover ou copiar diretórios para seus descendentes (`isSameOrDescendant`), e criação automática com sufixo numérico exclusivo (`arquivo (1).ext`) ao duplicar arquivos no mesmo local.
- **Barra Lateral com Activity Bar (estilo VS Code) e Flyout com Auto-Ocultar**:
  - Ao recolher o painel lateral (`Ctrl+B` ou botão na barra de navegação), o espaço de pastas abertas ganha foco total e surge uma **Activity Bar** vertical compacta com ícones rápidos para **Pastas**, **Favoritos**, **Recentes**, **Unidades/Volumes** e **SSH / SFTP**.
  - Abertura de gaveta flutuante (*Flyout*) com efeito de sobreposição ao clicar em qualquer ícone da barra, sem redimensionar ou mover os painéis de arquivos.
  - Comportamento inteligente de **auto-ocultar**: o painel recolhe automaticamente ao navegar para uma pasta/item, ao clicar fora ou ao pressionar `Escape`.
  - Fixação definitiva rápida: botão dedicado de fixação (*Pin*) e botão de alternância do painel para travar a barra lateral aberta permanentemente.
- **Suporte ao Idioma Sueco (Svenska - `sv`)**:
  - Catálogo completo de internacionalização em sueco (`locales/sv/common.json`) com 100% de paridade com os catálogos existentes.
  - Detecção automática de idioma do sistema (`resolveLanguage`) e opção de seleção manual no seletor de idiomas da barra de navegação (`AddressBar`).
- **Suporte ao Idioma Turco (Türkçe - `tr`)**:
  - Catálogo completo de internacionalização em turco (`locales/tr/common.json`) cobrindo 100% dos termos da interface.
  - Detecção automática de idioma do sistema (`resolveLanguage`) e inclusão no seletor de idiomas da interface.
- **Suporte ao Idioma Japonês (日本語 - `ja`)**:
  - Catálogo completo de internacionalização em japonês (`locales/ja/common.json`) cobrindo 100% dos termos e namespaces da interface (navegação, operações, terminal, busca, painéis, visualizador e configurações).
  - Detecção automática de idioma do sistema (`resolveLanguage`) e opção de seleção manual no seletor de idiomas da barra de navegação (`AddressBar`).
- **Suporte ao Idioma Chinês Simplificado (简体中文 - `zh-CN`)**:
  - Catálogo completo de internacionalização em chinês simplificado (`locales/zh-CN/common.json`) com 100% de paridade com os catálogos existentes.
  - Detecção automática de idioma do sistema (`resolveLanguage`) e inclusão no seletor de idiomas da interface.
- **Suporte ao Idioma Italiano (Italiano - `it`)**:
  - Catálogo completo de internacionalização em italiano (`locales/it/common.json`) cobrindo 100% dos termos e namespaces da interface (navegação, operações, terminal, busca, painéis, visualizador e configurações).
  - Detecção automática de idioma do sistema com fallback inteligente (`resolveLanguage`) e opção de seleção manual no seletor de idiomas da barra de navegação (`AddressBar`), consolidando a cobertura do padrão EFIGS.
  - Cobertura nos testes de sincronização de i18n (`check-i18n.js`) e testes unitários do frontend (`run-tests.js`).
- **Suporte ao Idioma Francês (Français - `fr`)**:
  - Catálogo completo de internacionalização em francês (`locales/fr/common.json`) cobrindo 100% dos termos e namespaces da interface (navegação, operações, terminal, busca, painéis, visualizador e configurações).
  - Detecção automática de idioma do sistema com fallback inteligente (`resolveLanguage`) e opção de seleção manual no seletor de idiomas da barra de navegação (`AddressBar`).
  - Cobertura nos testes de sincronização de i18n (`check-i18n.js`) e testes unitários do frontend (`run-tests.js`).
- **Suporte ao Idioma Alemão (Deutsch - `de`)**:
  - Catálogo completo de internacionalização em alemão (`locales/de/common.json`) cobrindo 100% dos termos e namespaces da interface (navegação, operações, terminal, busca, painéis, visualizador e configurações).
  - Detecção automática de idioma do sistema com fallback inteligente (`resolveLanguage`) e opção de seleção manual no seletor de idiomas da barra de navegação (`AddressBar`).
  - Cobertura nos testes de sincronização de i18n (`check-i18n.js`) e testes unitários do frontend (`run-tests.js`).

## [1.1.0] - 2026-11-06

### Adicionado

- **Conexões Remotas Seguras (SSH / SFTP v3)**:
  - Cliente nativo do protocolo SFTP v3 (`internal/vfs/sftp/sftp.go`) implementado sobre `golang.org/x/crypto/ssh` e `golang.org/x/crypto/ssh/agent`, sem dependências de binários externos.
  - Modelo estrito de segurança criptográfica com verificação de chave pública do servidor **TOFU (Trust On First Use)** e pinning da impressão digital SHA-256 (`SHA256:...`). Bloqueio imediato com alerta caso a chave do servidor mude (prevenção contra ataques *Man-in-the-Middle*).
  - Suporte completo a múltiplos métodos de autenticação: **Chave Privada SSH** com detecção automática de arquivos em `~/.ssh` (`id_ed25519`, `id_rsa`, `id_ecdsa`, etc.) e suporte a *passphrase*, **SSH Agent** do sistema e **Senha em RAM** (mantida exclusivamente em memória volátil durante a sessão ativa, sem qualquer gravação de credenciais em texto plano no disco).
  - Sistema de Arquivos Virtual Unificado (`CompositeFS`): navegação transparente em abas (`sftp://<profileId>/...`), árvore de diretórios, pré-visualização, criação, renomeação, exclusão e transferência bidirecional de arquivos (Local ↔ SFTP).
  - Seção dedicada de **SSH / SFTP** na barra lateral (`Sidebar`) e botão rápido na barra de ferramentas superior (`OperationsToolbar`), com atalho direto para iniciar uma sessão de terminal interativo SSH no Terminal Integrado.
- **Pré-visualizador de Apresentações (.pptx e .odp)**:
  - Suporte nativo à inspeção e visualização de apresentações de slides do Microsoft PowerPoint (`.pptx`) e LibreOffice Impress (`.odp`), extraindo texto estruturado, anotações do orador e metadados dos slides.
- **Streaming Contínuo de Vídeos Grandes**:
  - Servidor HTTP local integrado com suporte a **HTTP Range Requests** (`206 Partial Content`), permitindo reprodução instantânea, busca temporal (*scrubbing*) sem recarga e suporte estável a arquivos de vídeo pesados (gigabytes) sem sobrecarregar a memória do processo.
- **Busca por Conteúdo e Otimização de Streaming**:
  - Busca recursiva avançada no conteúdo de arquivos de texto e código, com proteção contra estouro de memória e arquivos binários.
  - Flush imediato do primeiro resultado e lotes progressivos a cada 50ms no `SearchDrawer`, eliminando o estado de espera com "0 resultados" durante buscas profundas.
- **Pulsares Studio Editor**:
  - Editor embutido de código e texto (`Ctrl+E`), com suporte a quebra automática de linhas (`Alt+Z`), formatação de arquivos estruturados (JSON, CSV, Markdown, Go, TypeScript/JavaScript), e edição direta de arquivos locais e remotos via SFTP.
- **Pulsares DB Studio**:
  - Console e visualizador interativo para bancos de dados SQLite (`.db`, `.sqlite`, `.sqlite3`) e DuckDB, permitindo inspeção de esquema, paginação de registros e execução de consultas SQL.
- **Ícones Especializados por Tipo de Arquivo**:
  - Diferenciação visual com ícones coloridos dedicados para linguagens de programação (Python, Go, TypeScript, JavaScript, Rust, C/C++, C#, Java, PHP, Ruby, etc.), bancos de dados, arquivos de configuração (JSON, YAML, TOML, CSV, ENV, Dockerfile) e documentos.
- **Melhorias de Usabilidade na Navegação**:
  - Botão discreto no canto direito da barra de navegação (`AddressBar`) para copiar o caminho atual para a área de transferência com feedback animado de confirmação.
  - Botão de colapsar todas as pastas abertas (`collapseAll`) na árvore de diretórios da barra lateral (`Sidebar`).

### Corrigido

- Prevenção da criação excessiva de abas/processos no Terminal Integrado durante a inicialização do aplicativo, garantindo persistência limpa e restauração controlada de sessão.

## [1.0.0] - 2026-11-05

### Adicionado

- Teste de upgrade e migração idempotente do banco SQLite desde o esquema `0.1.0` até `1.0.0` (`TestStorage_MigrationUpgradeAndTagsRemoteSavedSearches`), preservando todas as configurações e dados do usuário.
- Validação completa de todos os pacotes Go (`vfs`, `listing`, `tree`, `ops`, `terminal`, `thumbs`, `search`, `watch`, `productivity`, `archive`, `storage`, `platform`) e paridade 100% entre os catálogos `pt-BR`, `en` e `es`.

## [0.10.0] - 2026-11-05

### Adicionado

- Pacote `internal/vfs/archive` com suporte a inspeção sem extração (`ListArchive`), criação recursiva (`CreateArchive`) e extração segura (`ExtractArchive` com proteção anti-**Zip-Slip**) para formatos `.zip`, `.tar`, `.tar.gz` e `.tgz`.
- Persistência e gerenciamento de perfis de **Conexões Remotas (`SFTP` / `WebDAV`)** na tabela `remote_profiles` do SQLite e modais integrados à **Paleta de Comandos (`Ctrl+Shift+P`)** para compactar, inspecionar/extrair pacotes e gerenciar servidores remotos.

## [0.9.0] - 2026-11-05

### Adicionado

- Serviço `internal/productivity` com **Renomeação em Lote com Prévia** (`PreviewBatchRename` e `ExecuteBatchRename` com busca/substituição por texto ou Regex, prefixo, sufixo, transformação de caixa, contador sequencial `{n}` e detecção preventiva de conflitos integrada ao Undo/Redo), **Comparação de Pastas** (`CompareDirectories` classificando itens somente na origem, somente no destino, diferentes e idênticos) e **Calculadora/Verificador de Hashes** (`ComputeHashes` em passagem única para `MD5`, `SHA-1` e `SHA-256`).
- Tabelas `item_tags` e `saved_searches` no SQLite (`internal/storage`) para persistência local de etiquetas/cores e buscas salvas.
- **Paleta de Comandos (`Ctrl+Shift+P`)** com filtro instantâneo sobre todas as ações do explorador, modal de **Renomeação em Lote** (acionado automaticamente ao pressionar `F2` com múltiplos itens selecionados), modal de **Comparação de Pastas**, modal de **Calculadora/Verificador de Hashes** e modal de **Atalhos de Teclado Configuráveis** com detecção em tempo real de conflitos.

## [0.8.0] - 2026-11-05

### Adicionado

- Serviço `internal/watch` com monitoramento de diretórios e debounce configurável (`watch:changed`), atualizando automaticamente a pasta visível quando arquivos ou pastas são criados, modificados ou removidos externamente.
- Integração nativa com o sistema operacional em `internal/platform`: cálculo completo de propriedades de arquivos e pastas (`GetItemProperties` com contagem recursiva de arquivos/subpastas, tamanho total, permissões, atributos e checksum SHA-256), seletor nativo **Abrir com…** (`OpenWithDialog`), abertura de **Terminal externo do sistema** (`OpenExternalTerminal`), **Mostrar no explorador nativo** (`RevealInSystemExplorer`) e **Ejeção segura de unidades removíveis** (`EjectDrive`).
- Modal de **Propriedades do Item/Pasta** (`Alt+Enter` ou botão na barra de ferramentas) com ações rápidas de integração com o SO e botão de ejeção de unidades removíveis na `Sidebar`.
- Seletor de extensões de arquivo com chips de acesso rápido no modal de **Novo arquivo**.

### Modificado

- Compactada a barra de ferramentas (`OperationsToolbar`) exibindo apenas ícones para **Nova pasta**, **Novo arquivo**, **Terminal** e **Fila de jobs**, além de tornar a **Barra de visualização** recolhível e desativada por padrão na inicialização para eliminar scroll horizontal em telas menores.

## [0.7.0] - 2026-11-05

### Adicionado

- Filtro instantâneo na pasta ativa (`Ctrl+F` na barra de ferramentas), filtrando itens em tempo real em todos os modos de visualização.
- Serviço `internal/search` de busca recursiva em streaming (`search:batch` e `search:done`) com cancelamento por `requestId` e suporte a **glob** (`*.go`), **expressão regular (Regex)**, filtro por **extensões**, **tipo** (arquivos/pastas), **tamanho mínimo/máximo**, **intervalo de datas** e **busca por conteúdo de texto** com extração da linha encontrada (`snippet`).
- Índice local opcional no SQLite (`index_roots` e `index_entries`) para indexar pastas escolhidas pelo usuário e responder buscas por nome instantaneamente.
- Modal de Busca Recursiva Avançada (`SearchDrawer`, `Ctrl+Shift+S`) com gerenciamento de pastas indexadas e ação rápida para abrir ou revelar o item no explorador.

### Modificado

- Reordenada a barra lateral esquerda (`Sidebar`): primeiro **Favoritos**, depois **Pastas** (Árvore), em seguida **Recentes** e por último **Unidades e Volumes** (colapsada por padrão).
- Exportado `formatDate` em `frontend/src/i18n/format.ts` junto com `formatDateTime`.

## [0.6.0] - 2026-11-05

### Adicionado

- Serviço `internal/thumbs` com geração assíncrona limitada de miniaturas de imagem (`png`, `jpg`, `jpeg`, `gif`, `svg`), cache em disco com poda automática por orçamento LRU (`maxCacheBytes`) e leitura segura de prévia (`ReadPreview`) para imagens, texto/código, Markdown, PDF, áudio/vídeo e binários.
- Novos modos de visualização no navegador de arquivos (`AlternativeViews`): **Lista compacta**, **Grade de miniaturas** (tamanhos pequeno, médio e grande) e **Colunas Miller** (estilo Finder com navegação em cascata).
- Agrupamento dinâmico de itens por **tipo**, **data** ou **tamanho**, além de alternância de densidade visual (**confortável** / **compacta**).
- Painel lateral direito de **Prévia** (`PreviewPanel`) com zoom de imagem, renderização de Markdown, visualização de código/texto com truncamento seguro em 64 KB, reprodutor nativo de áudio/vídeo/PDF e **Prévia Rápida em tela cheia (`Espaço`, estilo Quick Look)**.

## [0.5.0] - 2026-11-05

### Adicionado

- Serviço `internal/terminal` com detecção automática de perfis de shell por sistema operacional (PowerShell 7, Windows PowerShell, Prompt de Comando `cmd`, Git Bash, WSL, Bash, Zsh, Fish e POSIX `sh`), perfis personalizados e variáveis de ambiente (`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=PulsaresExplorer`).
- Fluxo de saída em lotes (~8 ms ou 64 KB) codificado em base64 UTF-8 com controle de contrapressão (`Ack` de 1 MB), evitando sobrecarga na ponte Wails em saídas intensas.
- Citação segura de caminhos (`QuotePath` e `FormatChangeDirCommand`) específica para a sintaxe de cada shell (`powershell`, `cmd`, `posix`, `fish`, `wsl`), cobrindo espaços, acentos e aspas.
- Encerramento completo da árvore de processos filhos ao fechar uma sessão de terminal (`Kill`) e verificação de processos filhos em execução (`HasRunningChildren`) com modal de confirmação antes de fechar a aba.
- Painel inferior recolhível (`` Ctrl+` ``), redimensionável (duplo clique restaura altura padrão) e maximizável (`TerminalPanel`), com abas de terminal (`` Ctrl+Shift+` ``), renomeação inline, divisão lado a lado, comando "Ir para a pasta atual", sincronização opcional de diretório via sequência ANSI `OSC 7`, busca na saída (`Ctrl+Shift+F`), ajuste de fonte, links clicáveis e persistência de estado/metadados.

## [0.4.0] - 2026-11-05

### Adicionado

- Layout de painel único, dividido horizontalmente (lado a lado) e dividido verticalmente (empilhado), com divisor redimensionável (duplo clique restaura 50%) e foco independente por painel (`SecondaryPane`).
- Ações estilo Commander para copiar (`F5`) e mover (`F6`) a seleção ativa diretamente para a pasta aberta no painel oposto.
- Arrastar e soltar interno (Drag & Drop) entre painéis e sobre nós da árvore de pastas (`FolderTree`), com expansão automática do nó ao pairar (~600 ms) e enfileiramento de cópia/movimentação (`Shift`).
- Novas seções no painel lateral (`Sidebar`): **Favoritos** persistidos no SQLite (`favorites`), **Unidades e Volumes** com barra de uso e espaço livre real (`GetDiskFreeSpaceExW` no Windows e `Statfs` no Linux/macOS) e **Locais Recentes** (`history`).
- Menu de contexto nos nós da árvore de pastas (abrir em nova aba, adicionar/remover dos favoritos, criar nova pasta e renomear) e exibição do espaço livre da unidade atual na `StatusBar`.

## [0.3.0] - 2026-11-05

### Adicionado

- Serviço `internal/ops` com fila de jobs assíncronos (`copy`, `move`, `trash`, `delete`), planejamento de árvore sem seguir symlinks recursivamente, cálculo de bytes/itens totais, velocidade (B/s) e ETA.
- Escrita segura e atômica usando arquivos temporários `.nome.pulsares-part`, `fsync`, preservação de datas, verificação pós-cópia opcional por hash SHA-256 e limpeza imediata de parciais em cancelamento ou falha de espaço em disco.
- Validação de nomes reservados do Windows (`CON`, `NUL`, `PRN`, `AUX`, `COM1..9`, `LPT1..9`) e suporte a caminhos longos (`\\?\`).
- Lixeira nativa por sistema operacional (`SHFileOperationW` no Windows, FreeDesktop Trash no Linux e `~/.Trash` no macOS) combinada com staging reversível para restauração instantânea.
- Diário de operações (`op_journal` no SQLite) com suporte completo a Desfazer (`Ctrl+Z`) e Refazer (`Ctrl+Y` / `Ctrl+Shift+Z`) para criar pasta/arquivo, renomear, copiar, mover e enviar para a lixeira.
- Resolução interativa de conflitos (`ask`, `overwrite`, `skip`, `rename`, `keepNewer`) com opção "Aplicar a todos".
- Barra de ferramentas de operações (`OperationsToolbar`), painel da fila de jobs (`OperationsPanel`), modal rico de conflito e atalhos (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `F2`, `Del`, `Shift+Del`, `Ctrl+Shift+N`, `Ctrl+A`, `Esc`).

## [0.2.0] - 2026-11-05

### Adicionado

- Sistema completo de múltiplas abas (`TabBar` + store de sessão): criar (`Ctrl+T`), fechar (`Ctrl+W`, clique do meio), duplicar, fixar/desafixar, fechar outras, fechar à direita, reabrir aba fechada (`Ctrl+Shift+T`), alternar (`Ctrl+Tab`, `Ctrl+1..9`) e reordenar por arrastar.
- Estado independente por aba (histórico voltar/avançar, ordenação, visibilidade de ocultos, seleção) e cache LRU em memória para abas inativas (troca de aba instantânea).
- Persistência automática e restauração de sessão no SQLite (`SaveSession`/`LoadSession`), preservando abas, aba ativa, pilha de abas fechadas e estado do painel lateral.
- Serviço `internal/tree` para carregamento preguiçoso de subdiretórios, raízes do sistema operacional, detecção de symlinks e sondagem assíncrona de subpastas (`HasChildren`) com timeout.
- Painel lateral esquerdo recolhível (`Ctrl+B` e botão na barra de endereço) e redimensionável, com árvore de pastas virtualizada (`FolderTree`), padrão ARIA `tree`/`treeitem`, navegação por teclado (`↑`/`↓`/`←`/`→`/`Enter`/`*`/`F5`) e sincronização automática com a aba ativa.
- Expansão de atalhos e variáveis de ambiente na barra de endereço (`~`, `%APPDATA%`, `%USERPROFILE%`, `$HOME`), autocompletar diretórios ao digitar e atalhos globais de navegação (`Ctrl+L`, `Alt+D`, `Alt+←`, `Alt+→`, `Alt+↑`, `F5`/`Ctrl+R`).

## [0.1.0] - 2026-11-05

### Adicionado

- Documento de contribuição (`AGENTS.md`), visão de produto, catálogo de funcionalidades, arquitetura, roteiro por etapas e ADRs iniciais.
- Workflow `release.yml` manual com builds para Windows x64, Linux x64 (tar.gz, .deb, AppImage) e macOS universal.
- Internacionalização em português (Brasil), inglês e espanhol (ADR-0005), com detecção do idioma do sistema, pseudo-localidade (`VITE_LOCALE=pseudo`), formatadores `Intl` e validação de chaves (`npm run i18n:check`).
- Núcleo `internal/vfs` e provedor `internal/vfs/local` com leitura em lotes cancelável, mapeamento de atributos por SO e códigos de erro de domínio estáveis.
- Serviço `internal/listing` em streaming via eventos (`listing:batch` e `listing:done`) com cancelamento por aba/requisição e benchmarks.
- Persistência SQLite (`internal/storage`) com migrações iniciais e preferências de idioma e tema.
- Interface inicial em React + TypeScript + TanStack Virtual com modo detalhes virtualizado, ordenação natural, barra de endereço com breadcrumbs e edição de caminho, histórico (voltar/avançar/subir/atualizar), alternância de arquivos ocultos e barra de status.
- Planejamento do painel lateral recolhível com árvore de pastas (ADR-0006), previsto para a etapa 0.2.0.
- Planejamento do terminal integrado no painel inferior, estilo VS Code (ADR-0007), previsto para a etapa 0.5.0; etapas seguintes renumeradas até 0.10.0.
