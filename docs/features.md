# Catálogo de funcionalidades

Cada funcionalidade indica a etapa em que foi implementada ou planejada (ver [roadmap.md](roadmap.md)). Prioridade: **P0** essencial para a etapa, **P1** desejável, **P2** futura.

## 1. Navegação

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Listagem de diretório em streaming com virtualização | 0.1 | P0 |
| Voltar, avançar, subir, atualizar (por aba) | 0.1 | P0 |
| Barra de endereço com breadcrumbs clicáveis, edição e botão de copiar caminho | 0.1 / 1.1.0 | P0 |
| Autocompletar caminhos ao digitar | 0.2 | P1 |
| Abrir arquivo com aplicativo padrão | 0.1 | P0 |
| Arquivos ocultos/sistema: mostrar/ocultar | 0.1 | P0 |
| Ordenação natural (`arquivo2` antes de `arquivo10`), por nome, tamanho, tipo, datas | 0.1 | P0 |
| Variáveis e atalhos de caminho (`~`, `%APPDATA%`, `%USERPROFILE%`, `$HOME`) | 0.2 | P1 |

## 1.1 Interação com mouse e teclado

Mouse e teclado têm paridade: as ações essenciais funcionam tanto por cliques, menu de contexto e arrastar/soltar quanto por atalhos e paleta de comandos.

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Clique seleciona, duplo clique abre pasta/arquivo | 0.1 | P0 |
| Botões laterais do mouse (voltar/avançar) navegam no histórico da aba | 0.1 | P0 |
| Barra de ferramentas e ponteiro padrão desktop (`default`) consistente | 0.1 / 1.1.1 | P0 |
| Clique nos cabeçalhos de coluna ordena; redimensionar colunas | 0.1 | P0 |
| Clique do meio abre pasta em nova aba; duplo clique na área vazia cria nova aba | 0.2 | P0 |
| Arrastar divisores para redimensionar painéis; duplo clique restaura tamanho padrão | 0.2 / 0.4 | P0 |
| `Ctrl`/`Shift` + clique e seleção múltipla | 0.3 | P0 |
| Menu de contexto próprio (botão direito) em arquivos, pastas, área vazia, abas e nós da árvore | 0.3 / 1.1.1 | P0 |
| Arrastar e soltar granular em itens, pastas e árvore (com proteção contra auto-drop e loops) | 0.4 / 1.1.1 | P0 |

## 2. Abas

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Múltiplas abas com histórico independente | 0.2 | P0 |
| Nova, fechar, duplicar, fechar outras / à direita | 0.2 | P0 |
| Reabrir aba fechada (pilha) | 0.2 | P0 |
| Fixar aba (compacta, não fecha com "fechar outras") | 0.2 | P0 |
| Reordenar por arrastar | 0.2 | P0 |
| Abrir pasta em nova aba (clique do meio, `Ctrl+Enter`) | 0.2 | P0 |
| Restaurar sessão ao iniciar | 0.2 | P0 |
| Estado por aba: modo de visualização, ordenação, filtro, seleção, rolagem | 0.2 | P0 |
| Destacar aba / janelas independentes para ferramentas auxiliares | 1.1.1 (Studio/DB) | P1 |

## 3. Painéis e layout

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Painel duplo (lado a lado / empilhado), cada um com suas abas | 0.4 | P0 |
| Mover/copiar para o painel oposto (`F5`/`F6` estilo commander) | 0.4 | P0 |
| Barra lateral esquerda recolhível e redimensionável (`Ctrl+B` / `Cmd+B`) | 0.2 | P0 |
| Activity Bar compacta ao recolher a barra lateral + Flyout com auto-ocultar e Pin | 1.1.1 | P0 |
| Seções da barra lateral: favoritos, árvore de pastas, recentes, unidades/volumes, SSH / SFTP | 0.2–1.1.0 | P0 |
| Painel inferior recolhível e redimensionável para o terminal integrado | 0.5 | P0 |
| Painel de prévia recolhível | 0.6 | P0 |
| Barra de status: contagem, seleção, espaço livre e spinners de carregamento | 0.1 / 1.1.1 | P0 |

## 3.1 Árvore de pastas

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Árvore hierárquica com raízes por SO | 0.2 | P0 |
| Carregamento preguiçoso cancelável (somente diretórios) e sondagem `HasChildren` | 0.2 | P0 |
| Expandir/recolher com mouse e teclado (`↑`/`↓`/`→`/`←`/`Enter`/`*`) e botão colapsar tudo | 0.2 / 1.1.0 | P0 |
| Clique abre na aba ativa; clique do meio ou `Ctrl+Enter` abre em nova aba | 0.2 | P0 |
| Sincronizar com a aba ativa e árvore virtualizada | 0.2 | P0 |
| Symlinks/junctions com indicador (sem recursão infinita) | 0.2 | P0 |
| Soltar arquivos sobre nós da árvore com expansão automática ao pairar | 0.4 / 1.1.1 | P0 |
| Menu de contexto do nó (nova pasta, renomear, abrir em nova aba, favoritar) | 0.4 | P1 |

## 3.2 Terminal integrado

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Abrir/fechar o painel inferior (`` Ctrl+` `` / `` Cmd+` ``), estilo VS Code | 0.5 | P0 |
| Painel redimensionável, maximizável e com altura persistida | 0.5 | P0 |
| Pseudoterminal real (ConPTY no Windows, PTY no Linux/macOS) | 0.5 | P0 |
| Novo terminal abre na pasta da aba ativa; abas e divisão lado a lado | 0.5 | P0 |
| Perfis detectados automaticamente (PowerShell 7, Windows PowerShell, CMD, Git Bash, WSL, bash, zsh, fish, sh) + perfis personalizados | 0.5 | P0 |
| Comando "Ir para a pasta atual" e inserção de caminhos com aspas corretas por shell | 0.5 | P0 |
| Sincronização de pasta via `OSC 7` e botão **Follow-up** (acompanha `cd`/`Set-Location` na aba ativa em tempo real) | 0.5 / 1.1.1 | P0 |
| Busca na saída, ajuste de fonte, links clicáveis e aviso ao fechar com processos filhos ativos | 0.5 | P0 |
| Terminal SSH integrado ligado aos perfis SSH / SFTP | 1.1.0 | P0 |

## 4. Visualização

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Modo detalhes virtualizado (colunas ordenáveis) | 0.1 | P0 |
| Modo lista compacta | 0.6 | P0 |
| Modo grade com miniaturas (tamanhos pequeno, médio e grande) | 0.6 | P0 |
| Modo colunas (Miller, estilo Finder) | 0.6 | P1 |
| Miniaturas de imagem com cache em disco LRU | 0.6 | P0 |
| Ícones coloridos especializados por linguagem, banco, configuração e documento | 1.1.0 | P1 |
| Agrupamento por tipo, data, tamanho e alternância de densidade (confortável/compacta) | 0.6 | P1 |
| Pastas primeiro / ordenação configurável | 0.1 | P0 |

## 5. Prévia

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Imagem (zoom), texto e código (truncamento seguro em 64 KB) | 0.6 | P0 |
| Markdown renderizado | 0.6 | P1 |
| Prévia Web renderizada de `.html`/`.htm` conectada aos `.css`/`.js` irmãos (`/__project/`) | 1.1.1 | P0 |
| PDF e apresentações `.pptx` / `.odp` (slides estruturados e notas do orador) | 0.6 / 1.1.0 | P1 |
| Streaming contínuo de áudio e vídeos grandes via HTTP 206 (Range Requests) | 1.1.0 | P0 |
| Conteúdo de arquivos compactados | 0.10 | P1 |
| Prévia rápida em tela cheia (`Espaço`, estilo Quick Look) | 0.6 | P1 |

## 6. Operações de arquivo

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Copiar, recortar, colar (área de transferência interna e do SO) | 0.3 | P0 |
| Renomear in-place (`F2`), nova pasta, novo arquivo (com chips de extensão) | 0.3 / 0.8 | P0 |
| Enviar para lixeira nativa (staging reversível) / excluir permanentemente | 0.3 | P0 |
| Fila de operações atômicas (`.pulsares-part` + `fsync` + rename) com progresso, velocidade, ETA e verificação SHA-256 opcional | 0.3 | P0 |
| Pausar, retomar, cancelar e diálogo de conflitos rico | 0.3 | P0 |
| Desfazer (`Ctrl+Z`) / Refazer (`Ctrl+Y`) persistido no SQLite (`op_journal`) | 0.3 | P0 |
| Renomeação em lote (busca/Regex, prefixo, sufixo, caixa, `{n}`, prévia e conflitos) | 0.9 | P0 |
| Comparar pastas e calculadora de hashes (`MD5`, `SHA-1`, `SHA-256`) | 0.9 | P1 |
| Compactar / extrair (`.zip`, `.tar`, `.tar.gz`, `.tgz` com proteção anti-Zip-Slip) | 0.10 | P0 |
| Arrastar e soltar para aplicativos externos | 1.x | P1 |

## 7. Busca e filtros

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Filtro instantâneo na pasta atual (`Ctrl+F`) | 0.7 | P0 |
| Busca recursiva em streaming com cancelamento (`Ctrl+Shift+S`) | 0.7 | P0 |
| Filtros: nome (glob/regex), extensão, tamanho, datas, tipo e conteúdo de texto com snippets | 0.7 / 1.1.0 | P0 |
| Índice local opcional no SQLite (`index_roots`, `index_entries`) | 0.7 | P1 |
| Buscas salvas (`saved_searches`) | 0.9 | P1 |
| Leitura de MFT/USN Journal no Windows | 1.x | P2 |

## 8. Integração com o sistema

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Listar unidades/volumes, espaço livre e ejeção segura | 0.4 / 0.8 | P0 |
| Watcher com debounce na pasta visível (`watch:changed`) | 0.8 | P0 |
| "Abrir com…", mostrar no explorador nativo, abrir terminal externo | 0.8 | P0 |
| Propriedades recursivas (contagem, tamanho, permissões, checksum SHA-256) | 0.8 | P1 |
| Janelas independentes (`--studio`, `--dbstudio`) com `AppUserModelID` e ícones Win32 próprios | 1.1.1 | P0 |
| Menu de contexto nativo do SO / definir como explorador padrão | 1.x | P2 |

## 9. Produtividade

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Paleta de comandos (`Ctrl+Shift+P` / `Cmd+Shift+P`) | 0.9 | P0 |
| Atalhos configuráveis com detecção de conflitos | 0.9 | P0 |
| Etiquetas/cores em arquivos (`item_tags`) | 0.9 | P1 |
| Favoritos e locais recentes | 0.4 | P0 |

## 10. Arquivos compactados e remotos

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Navegar dentro de `.zip`, `.tar`, `.tar.gz` e `.tgz` sem extrair | 0.10 | P0 |
| Cliente nativo **SSH / SFTP v3** (`sftp://<profileId>/...`) integrado ao `CompositeFS` | 1.1.0 | P0 |
| Verificação criptográfica de host **TOFU (SHA-256 Pinning)** e credenciais voláteis apenas em RAM | 1.1.0 | P0 |
| WebDAV e SMB nativos | 1.x | P2 |

## 11. Configurações, idiomas e portabilidade

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Tema claro e escuro com tokens semânticos | 0.1 | P0 |
| Densidade (compacta / confortável) | 0.6 | P1 |
| 10 idiomas com 100% de paridade (`pt-BR`, `en`, `es`, `de`, `fr`, `it`, `ja`, `zh-CN`, `tr`, `sv`) | 0.1 / 1.1.0 / 1.1.1 | P0 |
| Detecção do idioma do SO, seletor sem reiniciar, formatação `Intl` e validação via `npm run i18n:check` | 0.1 | P0 |
| Modo portátil (`portable.dat` / `./data/explorer.db`) e pacote **Multiverse Portable** (pendrive Windows + Linux + macOS) | 1.1.1 | P0 |

## 12. Pulsares Studio Editor

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Editor de código e texto em janela independente (`--studio`) | 1.1.0 / 1.1.1 | P0 |
| Abertura direta de pastas de projeto (`workspaceDir`) sem criar rascunhos `sem-titulo.md` | 1.1.1 | P0 |
| Árvore `ARQUIVOS DO PROJETO` com menu de contexto completo (novo arquivo com chips, nova pasta, `F2` com sync de abas, mover modal/recortar/drag & drop, duplicar, lixeira/exclusão) | 1.1.1 | P0 |
| **Prévia Web Conectada em Tempo Real** (HTML + abas CSS/JS vivas + assets locais via `/__project/`) | 1.1.1 | P0 |
| Formatação estruturada, quebra de linha (`Alt+Z`), busca, snippets e edição remota via SFTP | 1.1.0 | P0 |

## 13. Pulsares DB Studio & Criador SQLite

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Visualizador e console SQL para bancos SQLite e DuckDB em janela independente (`--dbstudio`) | 1.1.0 / 1.1.1 | P0 |
| PRAGMAs de alta performance (`mmap_size`, `cache_size`) e inspeção O(1) via `sqlite_sequence` | 1.1.1 | P0 |
| **Mapa ER (Diagrama Interativo)** com PK/FK, curvas Bézier, auto-layout topológico, busca, MiniMap e exportação SVG | 1.1.1 | P0 |
| **Criador de Banco SQLite (`internal/dbcreator`)** a partir de CSV, TSV, JSON e JSONL com inferência de tipos, modos Simples e Desenvolvedor (DDL, WAL, batch) e progresso em tempo real | 1.1.1 | P0 |
| Exportação de tabelas/consultas para CSV e JSON com diálogo nativo de salvamento do SO | 1.1.1 | P0 |
