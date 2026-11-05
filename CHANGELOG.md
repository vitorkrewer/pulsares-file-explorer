# Changelog

Todas as mudanças visíveis são registradas aqui, agrupadas pela etapa (versão *minor*) em andamento. Ver [docs/roadmap.md](docs/roadmap.md).

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
