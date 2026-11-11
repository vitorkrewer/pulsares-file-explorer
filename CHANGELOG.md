# Changelog

Todas as mudanças visíveis são registradas aqui, agrupadas pela etapa (versão *minor*) em andamento. Ver [docs/roadmap.md](docs/roadmap.md).

## [1.2.0] - 2026-11-11

### Adicionado

- **Integração Multiplataforma de Nuvens Conectadas (OneDrive, Google Drive, Dropbox, iCloud Drive, Nextcloud, ownCloud, MEGA, Box, pCloud, Proton Drive, Synology Drive, QNAP Qsync, Seafile, Tresorit, Yandex Disk, Rclone e GVFS) no Menu de Contexto (`cloud_storage.go`, `cloud_storage_windows.go`, `cloud_storage_unix.go`, `app.go`, `wails.ts` e `FileContextMenu.tsx`)**:
  - **Autodetecção Multiplataforma (`ListConnectedClouds` / `GetCloudItemStatus`)**:
    - **Windows**: detecta contas pessoais/corporativas via Registro (`HKCU\Software\Microsoft\OneDrive\Accounts\*`, todos os provedores registrados na Cloud Files API em `HKCU\Software\SyncEngines\Providers\*`, `HKCU\Software\Google\DriveFS`), `%APPDATA%\Dropbox\info.json`, variáveis de ambiente, pastas de perfil e unidades virtuais montadas (`GetVolumeInformationW` para *pCloud Drive*, *SeaDrive*, *Tresorit*, *Google Drive* e *WinFsp / Rclone*).
    - **macOS (`FileProvider` / `iCloud`)**: detecta `~/Library/Mobile Documents/com~apple~CloudDocs` (iCloud Drive), todos os provedores em `~/Library/CloudStorage/*` (*OneDrive*, *Google Drive*, *Dropbox*, *Proton Drive*, *Box*, *Nextcloud*) e volumes em `/Volumes`, identificando arquivos *dataless* (`st_blocks == 0`) e executando ações nativas com `brctl download` / `brctl evict` e `fileproviderctl materialize` / `fileproviderctl evict`.
    - **Linux (`GVFS`, `Rclone FUSE`, `Dropbox CLI` e `Nextcloud Socket`)**: detecta montagens `/run/user/$UID/gvfs/*` (`google-drive:`, `onedrive:`, `davs:`), montagens FUSE em `/proc/mounts` (`fuse.rclone`, `fuse.onedriver`, `pcloud`), gera e copia links públicos de compartilhamento via `rclone link` e `dropbox sharelink`, consulta status em tempo real via `dropbox filestatus` e aciona o diálogo nativo de compartilhamento do Nextcloud/ownCloud via UNIX socket (`$XDG_RUNTIME_DIR/Nextcloud/socket`).
  - **Inspeção Nativa de Estado de Hidratação / Fixação (`FILE_ATTRIBUTE_PINNED` / `FILE_ATTRIBUTE_UNPINNED` / `Stat_t.Blocks`)**: identifica em tempo real se o arquivo ou pasta está **Sempre mantido neste dispositivo (`Fixado no PC`)**, **Disponível localmente (`No PC`)**, **Sincronizando (`Sincronizando`)** ou **Disponível apenas na nuvem (`Na Nuvem` / sob demanda)**.
  - **Submenu Contextual do Provedor de Nuvem (`OneDrive ▸`, `Google Drive ▸`, `Dropbox ▸`, `pCloud ▸`, `Proton Drive ▸`, `Rclone ▸`, etc.)**: exibido automaticamente ao clicar com o botão direito em arquivos ou pastas dentro de qualquer nuvem conectada, oferecendo:
    - **Sempre manter neste dispositivo** (`attrib.exe +P -U` + `SetFileAttributesW`, recursivo em pastas)
    - **Liberar espaço (Apenas online)** (`attrib.exe +U -P` + `SetFileAttributesW` para desidratar o arquivo e liberar espaço em disco)
    - **Baixar / Sincronizar agora** (hidratação sob demanda via filtro `cldflt.sys`)
    - **Compartilhar na nuvem…** e **Histórico de versões na nuvem…** (acionando os verbos nativos da extensão Shell do provedor ou abrindo o portal web correspondente)
    - **Ver online no navegador** e **Ir para a raiz da nuvem**.
- **Submenu Interativo "Abrir com" nos Menus de Contexto Listando Programas do Sistema (`open_with_windows.go`, `open_with_unix.go`, `os_integration.go`, `app.go`, `wails.ts` e `FileContextMenu.tsx`)**:
  - **Descoberta Nativa de Programas por Extensão (`ListOpenWithApps`)**: consulta o registro do Windows (`UserChoice`, `OpenWithProgids`, `OpenWithList`, `SystemFileAssociations`, `App Paths` e recursos de versão Win32 via `version.dll`) e pacotes em sistemas Unix/macOS para listar dinamicamente todos os programas instalados capazes de abrir o tipo de arquivo selecionado (ex.: navegadores *Microsoft Edge*, *Google Chrome*, *Firefox*, *Bloco de Notas*, *Paint*, *WordPad*, *Excel*, *Word*, *LibreOffice*, *VLC*, *Windows Media Player*, *7-Zip*, *WinRAR*, *Adobe Acrobat*), destacando o programa padrão com o selo **`Padrão`**.
  - **Submenu Flutuante "Abrir com ▸" no Gerenciador de Arquivos**: ao clicar com o botão direito sobre qualquer arquivo, o item **Abrir com** expande um submenu organizado em três seções: **Suíte Pulsares** (*Pulsares Studio Editor* e *Pulsares DB Studio*), **Programas do Sistema (`.ext`)** com lançamento direto via `OpenFileWithApp`, e opções adicionais para **Abrir no aplicativo padrão do sistema**, **Procurar outro programa no PC (`.exe`)…** e **Mais aplicativos (Diálogo do Sistema)…**.
- **Renderizador GFM Completo na Prévia em Tempo Real de Markdown do Pulsares Studio e Painel de Prévia (`CodeEditorModal.tsx`, `PreviewPanel.tsx` e `editor/store.ts`)**:
  - **Formatação Markdown (GFM) Completa**: suporte a tabelas GFM com alinhamento de colunas (`:---`, `:---:`, `---:`), listas de tarefas (`- [x]` / `- [ ]`), listas ordenadas e não ordenadas, blocos de citação (`>`), blocos de código com cabeçalho de linguagem, alertas estilo GitHub (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), além de formatação inline completa (`**negrito**`, `*itálico*`, `~~tachado~~`, `` `código` ``, links e imagens locais resolvidas pelo servidor de mídia) e ativação automática da prévia dividida ao abrir arquivos `.md` / `.markdown`.
- **Evolução Completa do Pulsares DB Studio — Criação Standalone de Bancos, Edição Inline (CRUD), Construtor Visual DDL, Autocomplete SQL e Manutenção (`DBStudioModal.tsx`, `db-studio/store.ts`, `app.go` e `App.tsx`)**:
  - **Criação de Bancos SQLite Diretamente no DB Studio (Inclusive quando Aberto Sozinho)**: nova tela inicial Dual-Card (`!dbPath`) e botão **`+ Novo Banco`** na barra superior permitindo criar bancos `.db`/`.sqlite` do zero (em branco, com script DDL personalizado ou a partir de templates relacionais com chaves estrangeiras como *Sistema de Usuários & Perfis*, *Catálogo de Produtos & Pedidos* e *Gerenciador de Tarefas / Projetos*), além de integração direta com o assistente **Criar a partir de CSV / JSON / JSONL** (`DBCreatorModal`) e histórico clicável de bancos recentes.
  - **Edição Inline de Células (`UPDATE`), Inserção (`+ Inserir Registro`) e Exclusão na Grade de Dados**: duplo clique em qualquer célula da aba *Dados da Tabela* abre edição inline parametrizada (`Enter` salva, `Esc` cancela, botão `NULL`), acompanhada de formulário rápido para inserir novos registros e exclusão de linhas pela chave primária.
  - **Construtor Visual de Tabelas e Colunas (`+ Nova Tabela` e `+ Coluna`)**: assistente visual na barra lateral para definir colunas (`INTEGER`, `TEXT`, `REAL`, `NUMERIC`, `BLOB`, `PK`, `AUTOINCREMENT`, `NOT NULL`, `UNIQUE`, `DEFAULT`) com prévia `CREATE TABLE` e `ALTER TABLE ADD COLUMN` em tempo real.
  - **Console SQL Multi-Abas, Favoritos, Autocompletar Contextual e Manutenção**: múltiplas abas de script SQL, biblioteca persistida de consultas favoritas, sugestões automáticas de tabelas/colunas/palavras-chave (`Tab` ou clique), menu de manutenção em 1 clique (`VACUUM`, `PRAGMA integrity_check`, `ANALYZE`, `PRAGMA foreign_key_check`, `WAL Checkpoint`) e exportação completa de **Dump `.SQL`** (`CREATE TABLE` + `INSERT INTO`).
- **Evolução do Pulsares Studio Editor — Árvore Multinível com Git, Busca/Substituição Global (`Ctrl+Shift+F`), Console Web/Viewports e Player de Áudio/Vídeo (`CodeEditorModal.tsx`, `StudioMediaViewer.tsx`, `editor/store.ts` e `app.go`)**:
  - **Árvore de Diretórios Expansível Multinível + Status Git**: subpastas em *Arquivos do Projeto* agora expandem e recolhem inline (`▸`/`▾`) exibindo toda a hierarquia sem trocar a raiz do projeto, acompanhadas de badges de status Git (`M`, `U`, `A`, `D`) por arquivo e indicador da branch ativa (`🌿 branch`) na barra de status.
  - **Busca e Substituição Global no Projeto (`Ctrl + Shift + F`)**: novo painel na Activity Bar para localizar e substituir texto ou Regex em todos os arquivos do projeto simultaneamente (`StudioSearchInProject` / `StudioReplaceInProject`), saltando diretamente para a linha clicada.
  - **Seletor de Viewport Responsivo e Console JS na Prévia em Tempo Real (HTML)**: botões para testar a página em **Desktop (`100%`)**, **Tablet (`768px`)** e **Mobile (`375px`)**, além de gaveta **Console da Prévia Web** que captura `console.log`, `console.info`, `console.warn`, `console.error` e exceções de execução da página renderizada em tempo real.
  - **Inspetor e Reprodutor Nativo de Áudio e Vídeo nas Abas do Studio**: suporte a `.mp4`, `.webm`, `.ogg`, `.mov`, `.mp3`, `.wav`, `.flac`, `.m4a` e `.aac` diretamente nas abas do Studio com controle de velocidade (`0.5x`–`2x`), `Loop`, resolução e streaming via `/__localmedia`.
- **Correção da Prévia Web em Tempo Real via Servidor Loopback HTTP e Buffers em Memória (`media_server.go`, `app.go`, `CodeEditorModal.tsx`, `PreviewPanel.tsx` e `editor/store.ts`)**:
  - **Servidor HTTP Real de Projetos Web (`http://127.0.0.1:<porta>/__project/p_<hash>/...`)**: substitui o antigo `<iframe srcDoc>` (que sofria com `origin: "null"` no esquema `wails://`, estouro de segmento base64 em caminhos longos e bloqueio de `localStorage` em `about:srcdoc`) por carregamento HTTP direto em loopback com tokens compactos SHA-256 (`RegisterProjectDir`), resolvendo 100% de subpastas (`css/styles.css`, `js/*.js`, `assets/img/*.png`, `pdfs/*.pdf`), `url(...)` relativos dentro do CSS, módulos ES, `fetch()` e `window.localStorage` / `sessionStorage`.
  - **Overlay em Tempo Real na RAM (`ReplaceStudioLiveBuffers` / `SyncStudioLiveFiles`)**: edições ainda não salvas nas abas abertas de `.html`, `.css` e `.js` do Pulsares Studio são servidas diretamente da memória sobre a árvore real do disco, preservando caminhos relativos de subpastas e recarregando instantaneamente a prévia.
  - **Prevenção de Abas Duplicadas no Studio (`deduplicateTabsByPath` / `normalizeStudioFilePath`)**: normalização de barras/caixa e reconciliação pós-leitura assíncrona impedem a abertura duplicada da mesma aba (ex.: `index.html`) durante hidratação/IPC concorrente, além de preservar a pasta raiz do projeto ao navegar em subpastas (`css/`, `js/`).
- **Renderizador Nativo de PDF e Inspetor Visual de Imagens no Pulsares Studio (`StudioMediaViewer.tsx`, `CodeEditorModal.tsx`, `editor/store.ts`, `thumbs.go` e `media_server.go`)**:
  - **Renderizador Integrado de Documentos PDF**: clicar em arquivos `.pdf` na árvore de projetos do Pulsares Studio (ou abri-los via menu de contexto / painel de prévia) abre uma aba nativa dedicada com streaming local via HTTP Range Request (`/__localmedia` com `Content-Disposition: inline`), estimativa automática de páginas em Go puro, navegação por página, seletor de zoom (`Ajustar largura`, `Ajustar página`, `50%`–`300%`), alternância de miniaturas/sumário e recarregamento instantâneo do disco sem bibliotecas externas.
  - **Inspetor de Ativos e Imagens de Projeto**: suporte nativo a `.png`, `.jpg`, `.jpeg`, `.jfif`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`, `.avif`, `.tif` e `.tiff` diretamente em abas do Studio com zoom contínuo pela roda do mouse (`25%`–`800%`, `Ajustar à tela` e `1:1`), arrasto panorâmico (*pan*), rotação (`±90°`), espelhamento horizontal/vertical, modo de nitidez de pixels para ícones/sprites, alternador de fundo (**Transparente quadriculado**, **Escuro** e **Claro**), metadados em tempo real (`L × A px`, proporção e tamanho), cópia direta da imagem para o clipboard do sistema e alternância com 1 clique entre **Visualização Gráfica** e **Código XML** em arquivos `.svg`.
- **Suavização Visual de Droplists e Menus Flutuantes (`SoftSelect.tsx` e `tokens.css`)**: novo componente `<SoftSelect />` renderizado via Portal com cantos arredondados suaves, indicador animado, sombras difusas adaptadas aos temas claro/escuro (`--shadow-dropdown`), anel de foco sutil (`--ring-soft`), navegação por teclado e transição fluida `@keyframes pulsares-dropdown-in`, aplicado em seletores de idioma (`AddressBar.tsx`), modos/agrupamento (`OperationsToolbar.tsx`), unidades de rede (`NetworkDriveModal.tsx`), busca (`SearchDrawer.tsx`), extensões (`OperationsPanel.tsx`), perfis de terminal (`TerminalPanel.tsx`), além de estilização global de `<select>` nativos e menus suspensos (`FolderZoomControl.tsx`, `TabBar.tsx`, `FolderTree.tsx` e `FileContextMenu.tsx`).
- **Correção de Paralelismo e Concorrência com Ferramentas de Captura de Tela como Lightshot (`clipboard_windows.go`, `clipboard.go`, `clipboard/store.ts` e `App.tsx`)**: afinidade estrita de thread OS (`runtime.LockOSThread()`) + mutex entre `OpenClipboard` e `CloseClipboard` para eliminar vazamentos de lock global no Win32, extração de `dibToPNG` (`png.BestSpeed`) para fora da seção crítica do clipboard (`< 1ms` de retenção), detecção não-intrusiva de ocupação/arrasto de captura (`GetOpenClipboardWindow` + `VK_SNAPSHOT` / `VK_LBUTTON`) com retorno `Busy` sem disputar lock e debounce na retomada de foco/sequência.
- **Contenção Inteligente de Caminhos Longos na Barra de Endereço (`AddressBar.tsx`)**: corrigido o estouro horizontal (`minWidth: 0` + `flexShrink: 0` nos controles laterais) para que caminhos extensos nunca empurrem os botões de ocultos, idioma, clipboard e tema para fora da janela, agrupando diretórios intermediários em um menu suspenso clicável (`…`) quando há mais de 4 níveis e aplicando reticências responsivas por segmento.
- **Ícones Oficiais em Cores Reais para Studio Editor e DB Studio (`SuiteAppIcon.tsx`, `OperationsToolbar.tsx` e `FileContextMenu.tsx`)**: botões de abertura do **Pulsares Studio Editor** (`</>`) e do **Pulsares DB Studio** (cilindro SQLite) na barra de ferramentas e no menu de contexto agora exibem o emblema oficial em cores reais (`#2563eb` → `#4f46e5`) para destaque imediato.
- **Correção de Rolagem, Expansão e Menu de Contexto na Seção "Pastas" da Barra Lateral (`Sidebar.tsx`, `FolderTree.tsx` e `tokens.css`)**: corrigida a cadeia flexível (`minHeight: 0` + `height: 100%`) que impedia a exibição da barra de rolagem vertical/horizontal ao expandir subpastas na árvore, adicionado fechamento do menu de contexto por tecla `Esc` e clique fora da área, opção **Copiar caminho da pasta** para o clipboard nativo, cabeçalho recolhível em *Pastas* e expansão por duplo clique.
- **Zoom Progressivo e Alternância Dinâmica de Visualização nas Pastas (`FolderZoomControl.tsx`, `StatusBar.tsx` e `preview/store.ts`)**:
  - **Botão de Zoom na Barra de Ferramentas e na Barra de Status**: controle segmentado (`−` · `100% ▾` · `+`) sempre visível na barra de ferramentas (`OperationsToolbar.tsx`) com popover interativo (slider contínuo + lista completa de modos) e controles rápidos de visualização/zoom no canto inferior direito da `StatusBar.tsx`.
  - **Atalhos `Ctrl + +`, `Ctrl + -`, `Ctrl + 0` e `Ctrl + Roda do Mouse`**: dar zoom progressivo alterna automaticamente entre **Detalhes Compactos (85%) → Detalhes (100%) → Lista Compacta (115%) → Ícones Pequenos (130%) → Ícones Médios (150%) → Ícones Grandes (175%) → Ícones Extra Grandes (200%)**, com indicador flutuante instantâneo (HUD) no painel de pastas e bloqueio de zoom acidental da janela WebView2.
- **Conexão de Unidades e Pastas de Rede Multiplataforma — SMB/CIFS, NFS e AFP em "Unidades e Volumes" (`\\192.168.10.195\`, `smb://...`, `nfs://...`, `IP:/export`, `afp://...`)**:
  - **Seletor de Protocolo no Modal de Conexão (`NetworkDriveModal.tsx`)**: opções explícitas **Automático**, **SMB / CIFS**, **NFS** e **AFP** (Apple Filing Protocol), adaptando dinamicamente exemplos de endereço, campos de domínio/credenciais e avisos por plataforma, além de badges de protocolo (`SMB`, `NFS`, `AFP`) nos atalhos salvos em `Sidebar.tsx`.
  - **Suporte Completo a NFS e AFP (`netdrive_common.go`, `netdrive_windows.go` e `netdrive_unix.go`)**: interpretação de exportações NFS multi-nível (`nfs://host/volume1/media` e sintaxe clássica `host:/mnt/dados`), descoberta automática de exportações via `showmount -e`, montagem via *Client for NFS* (`WNetAddConnection2W` / `mount.exe` / `umount.exe`) no Windows, montagem nativa `afp://` e `nfs://` em `/Volumes` (`osascript`) no macOS e montagem `afp-volume:` / `nfs:` via GVFS (`gio mount`) e `/proc/mounts` no Linux.
  - **Botão `+` ("Conectar Unidade de Rede") em Unidades e Volumes (`Sidebar.tsx` e `NetworkDriveModal.tsx`)**: disponível tanto no painel lateral fixo quanto no Flyout da Activity Bar e na Paleta de Comandos (`Ctrl + Shift + P`).
  - **Navegação direta pela Barra de Endereço (`AddressBar.tsx` + `internal/vfs/local/local.go`)**: suporte nativo a caminhos UNC (`\\192.168.10.195\`, `\\192.168.10.195\Publico`) e URLs `smb://`/`cifs://`/`nfs://`, incluindo enumeração automática das pastas compartilhadas na raiz do servidor (`NetShareEnum` no Windows, `smbclient`/GVFS no Linux e `smbutil` no macOS), autocompletar de compartilhamentos, breadcrumbs clicáveis e botão *Subir* (`goUp`).
  - **Autenticação, Mapeamento de Letra e Desconexão (`netdrive_windows.go` e `netdrive_unix.go`)**: suporte opcional a usuário, domínio/workgroup e senha (sem jamais persistir senhas em texto puro), mapeamento opcional de letra de unidade livre no Windows (`Z:`, `Y:`... via `WNetAddConnection2W` com opção de reconexão ao iniciar o sistema), montagem nativa via GVFS (`gio mount`) no Linux e `/Volumes` (`osascript`) no macOS, além de botão **Desconectar** (`Unplug`) nas unidades montadas.
  - **Atalhos Salvos em SQLite (`saved_network_drives`)**: salva atalhos de servidores/compartilhamentos em **Unidades e Volumes** para reconexão com 1 clique.
- **Integração Nativa Bidirecional da Área de Transferência de Arquivos e Imagens com o Sistema Operacional (`internal/platform/clipboard_windows.go` e `clipboard_unix.go`)**:
  - **Pulsares Explorer ⇄ Windows Explorer / Linux / macOS**: copiar (`Ctrl + C`) ou recortar (`Ctrl + X`) arquivos e pastas dentro do Pulsares Explorer agora grava nativamente os arquivos no clipboard do sistema operacional (`CF_HDROP` + `Preferred DropEffect` no Windows, `x-special/gnome-copied-files` no Linux Wayland/X11 e `POSIX file` no macOS), permitindo colar diretamente no Windows Explorer, Área de Trabalho, editores externos, mensageiros e navegadores.
  - **Caminho inverso (SO → Pulsares)**: copiar ou recortar arquivos no Explorador de Arquivos do sistema habilita automaticamente o botão **Colar** na barra de ferramentas e no menu de contexto do Pulsares Explorer e permite colar com `Ctrl + V` na pasta ativa.
  - **Captura nativa de Prints e Imagens (`CF_DIB` / `PNG`)**: monitoramento leve por `GetClipboardSequenceNumber()` no Win32 detectando instantaneamente capturas de tela (`Win + Shift + S` / `PrtSc`), imagens e arquivos copiados fora do aplicativo sem exigir permissões de navegador.
- **Gerenciador de Histórico da Área de Transferência Multiplataforma (`Alt + V` / `Ctrl + Shift + V`)**:
  - Novo botão **Histórico do Clipboard** (`ClipboardList`) na barra superior (`AddressBar.tsx`) ao lado do alternador de tema claro/escuro, com indicador dinâmico da quantidade de itens armazenados.
  - Atalhos globais **`Alt + V`** (ergonômico e livre de conflito com o `Win + V` reservado pelo Windows) e **`Ctrl + Shift + V`** (além de integração na Paleta de Comandos `Ctrl + Shift + P`), abrindo um **painel lateral à direita (`ClipboardHistoryDrawer.tsx`)**.
  - **Capacidade inteligente de 20 itens recentes + itens fixados ilimitados**:
    - Armazena automaticamente os **últimos 20 itens não fixados** em banco SQLite local (`clipboard_history` em `internal/storage/clipboard.go`) com deduplicação por hash SHA-256 (`content_hash`).
    - Permite **fixar ("Manter no histórico")** itens importantes para que nunca sejam descartados quando novos itens entrarem na fila.
  - **Suporte multimídia e integração direta com a pasta aberta no explorador**:
    - **Textos e Snippets**: visualização rápida em fonte monoespaçada, cópia com 1 clique e botão para **salvar diretamente como arquivo `.txt` na pasta aberta atual** (com escrita atômica via arquivo temporário + rename).
    - **Imagens e Prints (`PNG`)**: captura de imagens copiadas/coladas da área de transferência com miniatura visual e dimensões, cópia rápida de volta para o clipboard do sistema e botão para **salvar o print diretamente como arquivo `.png` na pasta aberta atual**.
    - **Lotes de Arquivos Copiados/Recortados (`Ctrl + C` / `Ctrl + X`)**: registra os conjuntos de arquivos copiados ou recortados no Pulsares Explorer permitindo **colar novamente na pasta atual** a qualquer momento sem perder seleções anteriores.
  - **Controles de Privacidade e Filtros**:
    - Botão **Pausar / Retomar captura** para suspender o monitoramento quando estiver lidando com dados sensíveis.
    - Busca instantânea no histórico, filtros por categoria (*Todos*, *Texto*, *Imagens*, *Arquivos*, *Fixados*) e botão para limpar itens não fixados em um clique.
    - Internacionalização completa nos **10 idiomas** suportados (`pt-BR`, `en`, `es`, `de`, `fr`, `it`, `ja`, `zh-CN`, `tr`, `sv`).

## [1.1.1] - 2026-11-09

### Adicionado

- **Botão "Follow-up" no Terminal Integrado (Sincronização de Navegação com a Aba Ativa)**:
  - Novo botão **Follow-up** na barra de ferramentas do Terminal Integrado (`TerminalPanel.tsx`), **desativado por padrão**.
  - Quando ativado pelo usuário (indicador luminoso verde), conforme você navega pelas pastas no terminal (`cd`, `cd ..`, `cd /d`, `sl`, `Set-Location`, `pushd`, trocas de unidade `C:`/`D:`, prompts do PowerShell/CMD ou sequências `OSC 7`), a **aba ativa** do gerenciador de pastas (`useBrowserStore.navigateTo`) acompanha e navega automaticamente junto com o terminal em tempo real.
  - Detecção dupla (cliente em `resolveClientCdCommand` + backend em `detectCdTarget` com emissão imediata de evento `terminal:data`), garantindo sincronização instantânea mesmo em shells que não emitem saída padrão ao executar `cd`.
- **Menu de Contexto e Operações Completas em "Arquivos do Projeto" no Pulsares Studio Editor**:
  - Ao clicar com o botão direito do mouse sobre qualquer arquivo, pasta ou área vazia em **ARQUIVOS DO PROJETO**, abre um menu de contexto com todas as operações essenciais de desenvolvimento:
    - **Editar arquivo / Abrir pasta**: abre o arquivo na aba ativa do editor ou entra na pasta selecionada.
    - **Novo arquivo...**: cria o arquivo em disco (com seletor rápido de extensões `.html`, `.css`, `.js`, `.ts`, `.tsx`, `.json`, `.md`, `.py`, `.go`, `.sql`) e já o abre imediatamente para edição.
    - **Nova pasta...**: cria diretórios e subpastas diretamente na árvore do projeto.
    - **Renomear (`F2`)**: renomeia arquivos e pastas em disco sincronizando automaticamente o caminho, nome e linguagem das abas abertas no Studio (`syncTabAfterPathChange`).
    - **Mover para... (Modal, Recortar/Colar e Drag & Drop)**: permite mover arquivos ou pastas selecionando subpastas do projeto, subindo para a pasta pai (`..`), recortando/colando pelo menu de contexto ou arrastando e soltando diretamente sobre pastas na lista lateral.
    - **Duplicar arquivo**: cria uma cópia imediata (`*-copia.ext`) na mesma pasta e abre no editor.
    - **Excluir (`Delete` / Lixeira ou Exclusão Permanente)**: envia para a Lixeira ou exclui permanentemente com diálogo de confirmação e fechamento automático de abas associadas (`closeTabsForDeletedPath`).
    - **Botões rápidos no cabeçalho**: atalhos diretos para **Novo Arquivo**, **Nova Pasta** e **Atualizar Lista** no topo de `ARQUIVOS DO PROJETO`.
- **Abertura Direta de Pastas de Projeto no Pulsares Studio Editor (Sem Criar Rascunhos `sem-titulo.md`)**:
  - Ao clicar em **"Abrir Pulsares Studio Editor"** no menu de contexto de uma pasta (ou no fundo da pasta atual) ou no botão da barra de ferramentas, o Pulsares Studio abre diretamente a pasta selecionada como projeto (`workspaceDir`) sem criar arquivos `sem-titulo-1.md` ou `sem-titulo-2.md` do zero.
  - Descarte automático de abas de rascunho vazias (`sem-titulo-*` sem caminho e sem conteúdo) ao restaurar sessão do `localStorage`.
  - Seleção inteligente do arquivo de entrada do projeto (`index.html`, `README.md`, `main.tsx`, `main.go`, `package.json`, etc.) ao abrir uma pasta no editor.
  - Suporte completo na IPC e argumentos CLI (`--studio <pasta>`) para abrir diretórios diretamente na janela independente do Pulsares Studio Editor.
- **Prévia Web Conectada em Tempo Real (HTML + CSS + JS + Imagens Locais)**:
  - **Servidor HTTP Local de Ativos de Projeto (`/__project/<base64_dir>/<relPath>`)**: nova rota em `internal/thumbs/media_server.go` capaz de servir folhas de estilo, scripts ES/JS, imagens, ícones SVG e fontes de projetos web locais com cabeçalhos MIME e CORS apropriados.
  - **Conector em Tempo Real no Pulsares Studio Editor (`buildConnectedWebPreviewDoc`)**:
    - Injeta automaticamente `<base href="...">` apontando para o servidor de projeto local e substitui `<link rel="stylesheet" href="...">` e `<script src="..."></script>` locais pelo conteúdo ao vivo das abas abertas e dos arquivos irmãos da pasta (`style.css`, `matrizes.js`, `tech-effects.js`, etc.).
    - Permite visualizar a página `index.html` renderizada na Prévia em Tempo Real mesmo enquanto o desenvolvedor está editando a aba `style.css` ou `matrizes.js` da mesma pasta.
    - Habilitação de `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"` no iframe de prévia para execução fiel de animações, bibliotecas externas (Anime.js, Xterm.js, FontAwesome, Google Fonts) e scripts do projeto.
  - **Prévia Web Renderizada no Painel de Prévia do Pulsares Explorer (`PreviewPanel.tsx`)**:
    - Ao selecionar um arquivo `.html`/`.htm` e abrir a Prévia, exibe por padrão a página web totalmente estilizada e conectada aos arquivos `.css` e `.js` da pasta, com seletor rápido para alternar entre **"Prévia Web Renderizada"** e **"Código HTML"**.
- **Mapa de Entidade-Relacionamento (ERD / Diagrama Interativo no Estilo React Flow) no Pulsares DB Studio**:
  - Nova aba dedicada **"Mapa ER (Diagrama)"** na barra de ferramentas superior do DB Studio para visualização interativa do grafo de entidades e chaves do banco de dados.
  - **Mapeamento e Extração de Chaves no SQLite (`internal/app/app.go`)**:
    - Inspeção nativa via `PRAGMA foreign_key_list(tabela)` para mapear chaves estrangeiras (FK), tabela destino, coluna referenciada (PK), regras de integridade referencial (`ON UPDATE`, `ON DELETE`).
    - Resolução automática de chave primária quando omitida no schema e consolidação da lista de arestas relacionais (`schema.Relationships`).
    - Marcação granular de atributos por coluna: badges douradas de **PK** (`Key`) e badges lilás/roxas de **FK** (`Link` com destino `tabela.coluna`).
  - **Engine Visual Interativa de Nós e Arestas (`ERDiagramView.tsx`)**:
    - **Canvas Infinito com Panning e Zooming**: arrasto fluido com o mouse, zoom suave centrado no ponteiro via scroll wheel (25% a 250%) e grade de pontos (*dots background*) proporcional.
    - **Nós de Tabelas Arrastáveis (Draggable Nodes)**: cartões estilizados com gradiente de cabeçalho, contagem de registros/colunas, tipos de dados em tipografia mono, botões de atalho para inspecionar dados e pontos de ancoragem (*connection handles*) nas laterais.
    - **Arestas de Conexão Bézier Cúbicas**: traçadas dinamicamente entre o handle da chave estrangeira (FK) e a chave primária (PK) com marcadores direcionais, labels centrais das regras (`coluna_fk → coluna_pk`), realce neon em hover (`#38bdf8`), drop-shadow glow e atenuação suave de tabelas não conectadas.
    - **Controles Avançados estilo React Flow**:
      - Barra de ferramentas com Zoom In, Zoom Out, Ajustar à Tela (*Fit View*), Resetar Zoom para 100%.
      - **Auto Layout Inteligente**: algoritmo em camadas topológicas que organiza automaticamente tabelas mestres e dependentes em colunas balanceadas.
      - **Busca e Foco Rápido**: campo de busca que filtra tabelas/colunas e realiza foco suave centralizado na tabela escolhida.
      - **Minimapa Interativo (MiniMap)** no canto inferior direito para visão panorâmica e navegação rápida por grandes esquemas.
      - **Exportação para SVG Vetorial**: gera e baixa arquivo `.svg` autônomo com design de alta fidelidade para documentação técnica.
  - Geração de pacotes de ícones `.ico` e `.png` multi-resolução (16x16 até 256x256 com High-DPI) padronizados com o gradiente azul clássico do Pulsares (`#2563eb` a `#4f46e5`), squircle com cantos arredondados, iluminação interna e sombra suave:
    - **Pulsares Explorer**: ícone da pasta branca moderna.
    - **Pulsares DB Studio**: ícone do cilindro de banco de dados SQLite em branco (`build/windows/icon-dbstudio.ico` e `favicon-dbstudio.svg`).
    - **Pulsares Studio Editor**: ícone com os símbolos de código `< / >` em branco (`build/windows/icon-studio.ico` e `favicon-studio.svg`).
  - **Injeção de Ícone Nativo em Janelas Win32 (`internal/platform/window_icon_windows.go`)**:
    - Integração de inicialização via `WM_SETICON` (`ICON_BIG` e `ICON_SMALL`) e `SetClassLongPtrW` (`GCLP_HICON` e `GCLP_HICONSM`) no runtime Go (`main.go`).
    - Identificação precisa da janela pelo identificador de classe (`WindowClassName`) e PID do processo com carregamento automático de `HICON` nativo via `LoadImageW` (`LR_LOADFROMFILE`).
    - Atribuição de `AppUserModelID` dedicado (`Pulsares.Explorer`, `Pulsares.DBStudio`, `Pulsares.StudioEditor`) impedindo o agrupamento incorreto no Windows e garantindo que cada botão na barra de tarefas exiba seu respectivo ícone individualizado e nítido.
- **Janelas Independentes e Autônomas para o Pulsares DB Studio e Pulsares Studio Editor**:
  - Restauração e reforço estrito da arquitetura desacoplada: tanto o **Pulsares DB Studio** quanto o **Pulsares Studio Editor** operam exclusivamente como janelas independentes do sistema operacional, nunca acoplados ou sobrepostos aos arquivos do Pulsares Explorer.
  - O store de ambos os módulos mantém `preferSeparateWindow: true` por padrão, acionando as APIs nativas (`OpenDBStudioWindow` e `OpenStudioWindow`) que invocam os processos frameless autônomos (`--dbstudio` e `--studio`) com controles nativos de janela (minimizar, maximizar e fechar).
  - Correção da inicialização de instâncias independentes mesmo quando nenhum arquivo prévio estiver selecionado, apresentando imediatamente a tela nativa dedicada de boas-vindas e seleção de arquivos.
- **Correção da Opacidade, Camadas de Fundo e Bug de Paginação no Pulsares DB Studio**:
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
  - **Integração Direta com o Pulsares DB Studio**: botão imediato ao finalizar para abrir e consultar o novo banco SQLite diretamente na interface do DB Studio, além de atalho para revelar o arquivo `.db` na pasta.
- **Diálogo Nativo de Salvamento na Exportação do Pulsares DB Studio**:
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
