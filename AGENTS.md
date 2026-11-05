# Pulsares Explorer — guia de contribuição

> Nome de trabalho: **Pulsares Explorer**. Repositório: `pulsares-file-explorer`.

## Propósito

Pulsares Explorer é um explorador de arquivos desktop, **multiplataforma** (Windows, Linux e macOS), **rápido, leve e orientado a teclado**, criado para substituir o Explorador do Windows (e equivalentes) no uso diário intenso. Deve abrir pastas enormes sem travar, trabalhar com várias abas e painéis, executar operações de arquivo em fila com controle total e nunca perder dados.

Prioridades, em ordem:

1. **Segurança dos dados** — nenhuma operação destrutiva sem confirmação, lixeira por padrão, operações verificáveis e com desfazer quando possível.
2. **Desempenho percebido** — a interface nunca bloqueia; listagens são transmitidas em lotes; tudo que é pesado roda em Go, fora da thread de UI.
3. **Produtividade** — abas, painel duplo, paleta de comandos, atalhos configuráveis, busca instantânea.
4. **Privacidade** — sem conta, sem telemetria, funcionamento 100% offline. Integrações remotas são opcionais.
5. **Modularidade** — sistema de arquivos abstrato (VFS); provedores locais, compactados e remotos implementam o mesmo contrato.

## Stack

- Desktop: **Wails v2** (versão estável fixada em `go.mod` e no `release.yml`; migração para v3 avaliada em ADR quando multi-janela for necessária).
- Núcleo: **Go** (versão definida em `go.mod`).
- Interface: **React + TypeScript estrito + Vite**.
- Estado da UI: Zustand (stores pequenas por feature). Listas grandes: TanStack Virtual.
- Persistência local: **SQLite** (driver pure-Go `modernc.org/sqlite`) com migrações versionadas.
- Observação de arquivos: `fsnotify` + implementações nativas por plataforma quando necessário.
- Terminal integrado: pseudoterminal nativo em Go (ConPTY no Windows, PTY no Linux/macOS) + **xterm.js** no frontend (ADR-0007).
- Ícones: Lucide. Não usar emojis na interface.
- Internacionalização: `i18next` + `react-i18next` (formato ICU para plurais) e API `Intl` para datas, números, tamanhos e ordenação. Idiomas: **pt-BR (padrão), en, es**.
- Estilo: tokens CSS próprios (claro/escuro), sem bibliotecas visuais pesadas sem justificativa em ADR.

## Estrutura

O repositório é um projeto Wails na raiz (layout padrão do Wails).

```text
main.go                    # entrada Wails: janela, bindings, ciclo de vida
wails.json
go.mod
build/                     # ícones, manifestos, Info.plist, recursos de instalador
frontend/
  src/
    app/                   # shell, layout de painéis, providers, atalhos globais
    features/
      tabs/                # abas, grupos, histórico por aba, sessão
      panes/               # painel único/duplo, divisões
      browser/             # listagem, modos de visualização, seleção
      address-bar/         # breadcrumbs, edição de caminho, autocompletar
      sidebar/             # painel lateral recolhível: árvore de pastas, favoritos, unidades, recentes
        folder-tree/       # árvore preguiçosa e virtualizada
      preview/             # painel de prévia
      operations/          # fila de operações, progresso, conflitos
      search/              # busca na pasta e busca recursiva
      terminal/            # painel inferior, abas de terminal, xterm.js
      command-palette/
      settings/
    ui/                    # design system: tokens, componentes base
    lib/                   # wrappers tipados dos bindings Wails e eventos
    i18n/                  # configuração i18next, formatadores Intl e catálogos
      locales/
        pt-BR/             # idioma de referência (fonte das chaves)
        en/
        es/
internal/
  app/                     # serviços expostos ao Wails (fachadas finas, sem regra de negócio)
  vfs/                     # contrato FileSystem + provedores
    local/
    archive/               # zip, tar (etapa posterior)
    remote/                # SFTP, WebDAV, SMB (etapa posterior)
  listing/                 # listagem em streaming, ordenação, filtros
  ops/                     # fila de jobs: copiar, mover, excluir, renomear, conflitos, desfazer
  watch/                   # observação de diretórios com debounce
  search/                  # busca ao vivo e consultas ao índice
  index/                   # índice opcional em SQLite FTS5
  thumbs/                  # miniaturas e cache em disco
  preview/                 # extração de prévias (texto, imagem, mídia, metadados)
  tree/                    # filhos de pasta (somente diretórios) e sondagem de subpastas
  terminal/                # sessões PTY, perfis de shell, citação de caminhos por shell
  session/                 # abas, painéis, painel lateral e janelas persistidos
  settings/                # preferências, idioma e atalhos
  i18n/                    # catálogo mínimo para textos nativos (menus do SO, diálogos, notificações)
  storage/                 # SQLite, migrações, repositórios
  platform/                # windows/, darwin/, linux/ via build tags
  events/                  # nomes e payloads dos eventos Go -> frontend
docs/                      # produto, arquitetura, roteiro, ADRs
.github/workflows/         # release.yml (somente manual)
```

Regras de fronteira:

- Nenhuma regra de domínio em componentes React; nenhum detalhe de interface em `internal/`.
- `internal/app` só orquestra: valida entrada, chama o domínio, converte erros. Nada de lógica de arquivo ali.
- Código específico de SO fica **apenas** em `internal/platform/<so>` com build tags (`//go:build windows`). O resto do código usa interfaces.
- O frontend acessa o Go **somente** por `frontend/src/lib` (wrappers tipados). Componentes não importam `wailsjs` diretamente.
- Módulos se comunicam por contratos públicos, não por imports profundos.

## Princípios de desempenho

- **Nunca bloquear a UI.** Toda chamada que toca o disco é assíncrona; operações longas viram jobs com progresso por evento.
- **Listagem em streaming.** Diretórios são enviados em lotes (ex.: 500–2000 itens) via eventos, com `requestId` para descartar respostas obsoletas quando o usuário navega.
- **Virtualização obrigatória** em qualquer lista que possa passar de 200 itens.
- **Cancelamento** via `context.Context` em todas as operações de Go que leem disco ou rede.
- **Metadados caros sob demanda** (tamanho de pasta, miniaturas, hash, ícones): calculados preguiçosamente e em cache.
- Orçamentos de referência (máquina média, SSD): abertura do app < 1 s; primeiro lote de uma pasta com 100 mil itens < 200 ms; memória ociosa < 150 MB; troca de aba < 50 ms.
- Regressões de desempenho em listagem ou abas exigem benchmark (`go test -bench`) antes do merge.

## Segurança de operações de arquivo

- Excluir envia para a **lixeira do sistema** por padrão; exclusão permanente exige ação explícita e confirmação.
- Copiar/mover: escrever em arquivo temporário no destino e renomear atomicamente ao final; nunca sobrescrever sem política de conflito definida (perguntar, substituir, ignorar, renomear, manter mais recente).
- Mover entre volumes = copiar + verificar + remover origem, nunca o inverso.
- Toda operação registra um **diário** (journal) para permitir desfazer e para retomar/relatar falhas após travamento.
- Tratar explicitamente: caminhos longos no Windows (`\\?\`), nomes reservados (`CON`, `NUL`…), diferenças de maiúsculas/minúsculas, links simbólicos e junctions (não seguir em operações recursivas sem opção explícita), permissões negadas, disco cheio.
- Nunca seguir symlinks fora do escopo em exclusões recursivas.

## Dados e privacidade

- Sem conta, sem rede obrigatória, sem telemetria.
- SQLite guarda sessão, preferências, favoritos, etiquetas, histórico e índice opcional. **Nunca** copia o conteúdo dos arquivos do usuário.
- Credenciais de provedores remotos ficam no cofre do sistema (Windows Credential Manager, Keychain, Secret Service). Nunca em texto puro, logs ou SQLite.
- Logs não registram nomes de arquivos pessoais em nível padrão; caminhos só em nível `debug`, ativado manualmente.
- Toda integração externa responde: funciona offline sem ela? que dados saem? onde ficam as credenciais? como revogar? como falha sem rede?

## Abas, painéis e sessão

- Cada aba tem: id, provedor + caminho, histórico próprio (voltar/avançar), modo de visualização, ordenação, filtros, seleção e posição de rolagem.
- Suporte a: nova aba, duplicar, fixar, fechar outras/à direita, reabrir fechada (pilha), reordenar por arrastar, mover entre painéis.
- Sessão (abas, painéis, layout) é restaurada ao abrir o app; gravação com debounce.
- Uma aba inativa não mantém watchers nem listagem na memória além de um cache limitado (LRU).

## Painel lateral e árvore de pastas

- O painel lateral esquerdo é **recolhível** (`Ctrl+B` / `Cmd+B`, botão na barra de ferramentas e comando na paleta) e **redimensionável**; visibilidade, largura e seções abertas são persistidas na sessão.
- A árvore é **preguiçosa**: filhos são lidos apenas ao expandir, só diretórios, com `context` cancelável. Nunca varrer a árvore inteira.
- O indicador de "tem subpastas" usa sondagem limitada (para no primeiro subdiretório, com timeout); em unidades de rede/lentas o estado é "desconhecido" e o chevron aparece até a expansão.
- A árvore é **virtualizada** (lista achatada de nós visíveis) e segue o padrão ARIA `tree` (`treeitem`, `aria-expanded`, `aria-level`, navegação por setas).
- Symlinks e junctions aparecem com indicador e não são expandidos recursivamente de forma automática (evita ciclos).
- A árvore é **única por janela** e acompanha a aba ativa do **painel em foco** (revelar pasta atual), com opção de desligar o acompanhamento. Não há uma árvore por painel.

## Terminal integrado

- Fica no **painel inferior**, como no VS Code: `` Ctrl+` `` / `` Cmd+` `` abre e fecha, `` Ctrl+Shift+` `` cria novo terminal; painel redimensionável, maximizável e com estado persistido.
- Usa **pseudoterminal real** (`internal/terminal`); nunca simular terminal com pipes. Código específico de ConPTY/PTY fica atrás de uma interface pequena.
- Novo terminal abre na pasta da aba ativa (provedor `local`); demais provedores usam a pasta pessoal.
- Saída enviada em **lotes** (~8 ms ou 64 KB) com contrapressão; o terminal nunca pode congelar a listagem nem as abas.
- Ações do explorador no terminal ("Ir para a pasta atual", arrastar arquivos) **apenas digitam texto** com citação correta para o shell (`ShellKind`); o app nunca executa comandos por iniciativa própria.
- Fechar um terminal encerra **toda a árvore de processos**; fechar o app com processos ativos pede confirmação.
- Entrada e saída do terminal **nunca** vão para logs, SQLite ou qualquer destino externo. Persistem só perfil, pasta inicial, nome e layout.
- Com foco no terminal, as teclas pertencem ao shell, exceto a lista reservada de atalhos do app (configurável).

## Internacionalização

- Idiomas suportados: **pt-BR (padrão e referência), en, es**. Nenhuma string visível ao usuário escrita diretamente em componentes — sempre `t('namespace:chave')`.
- Resolução do idioma em modo automático: idioma do SO mapeado para o suportado mais próximo (`pt-*` → pt-BR, `es-*` → es, `en-*` → en); **se o idioma do SO não for suportado, usar inglês (en)**. Chaves ausentes em um catálogo também caem para en.
- Chaves semânticas em `kebab-case` agrupadas por namespace de feature (`tabs`, `tree`, `ops`, `errors`…), ex.: `ops:conflict.title`. Nunca usar o texto em português como chave.
- Plurais e interpolação em ICU (`{count, plural, one {# item} other {# itens}}`); nunca concatenar frases.
- Datas, números, tamanhos de arquivo e ordenação usam `Intl` com a localidade ativa (ex.: `Intl.Collator(locale, { numeric: true })`). Nada de formatação manual.
- O Go **não traduz erros**: retorna código estável + parâmetros (`{ code: "permission-denied", path }`) e o frontend traduz em `errors:*`. Somente textos nativos (menus do SO, diálogos nativos, notificações) usam o catálogo `internal/i18n`.
- Toda chave nova entra nos três idiomas no mesmo commit; `npm run i18n:check` falha se faltar chave ou sobrar chave órfã.
- Atalhos e nomes de teclas exibidos são localizados e adaptados ao SO (`Ctrl` / `Cmd`).
- Layout tolera textos até ~40% mais longos (espanhol e português costumam ser maiores que inglês); evitar larguras fixas em botões e menus.

## Interface e acessibilidade

- Tema claro e escuro com tokens semânticos; respeitar o tema do sistema.
- **Mouse e teclado com paridade**: toda ação pode ser feita com o mouse (cliques, menu de contexto, arrastar e soltar, barras de ferramentas) **e** com o teclado (atalhos e paleta de comandos). Nenhum recurso pode depender exclusivamente de um dos dois. Ações recorrentes têm atalho; atalhos são configuráveis e seguem convenções de cada SO (`Ctrl` no Windows/Linux, `Cmd` no macOS).
- Comportamentos de mouse esperados: clique seleciona, duplo clique abre, clique do meio abre em nova aba, botão direito abre o menu de contexto, botões laterais do mouse (voltar/avançar) navegam no histórico, `Ctrl`/`Shift` + clique e seleção por retângulo, `Ctrl` + roda ajusta o tamanho dos ícones, arrastar redimensiona painéis e reordena abas, gestos de touchpad no macOS (deslizar para voltar/avançar).
- Comandos essenciais têm tooltip e nome acessível. Não comunicar estado apenas por cor. Respeitar movimento reduzido.
- Textos da interface em **português brasileiro** por padrão, com traduções para inglês e espanhol, seguindo a seção [Internacionalização](#internacionalização).

## Convenções e qualidade

- TypeScript estrito; proibido `any`. Componentes `PascalCase.tsx`; demais arquivos e pastas `kebab-case`.
- Go: erros com contexto (`fmt.Errorf("copiar %s: %w", ...)`), erros de domínio tipados (`ErrNotFound`, `ErrPermission`, `ErrConflict`) traduzidos para códigos estáveis na fronteira Wails. Interfaces pequenas, definidas perto do consumidor.
- Testes: `*.test.ts(x)` e `*_test.go`. Obrigatório cobrir: `vfs`, `ops` (conflitos, cancelamento, desfazer, falhas parciais), `listing` (ordenação natural, lotes, cancelamento), `session` (restauração), `tree`, `terminal` (ciclo de vida, redimensionamento, citação de caminhos em PowerShell, cmd, bash, zsh e fish) e migrações.
- Testes de `ops` usam diretórios temporários (`t.TempDir()`) — nunca caminhos reais do usuário.
- Antes de finalizar mudança relevante: `go vet ./...`, `go test ./...`, `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm test` e `wails build` quando houver mudança de bindings.

## Git, documentação e releases

- Commits pequenos e focados (Conventional Commits recomendado: `feat(tabs): ...`).
- **Versionamento por etapa**: cada etapa do [roteiro](docs/roadmap.md) é uma versão *minor* (`0.1.0` → `0.2.0` …) até a `1.0.0`. Mudanças visíveis entram na seção da etapa em andamento (`## [X.Y.Z] - AAAA-MM-DD`) no topo do `CHANGELOG.md`. Não usar `Unreleased`.
- Ao abrir uma etapa: atualizar `docs/roadmap.md`, a versão em `wails.json` (`info.productVersion`) e em `frontend/package.json`.
- `release.yml` roda **somente por acionamento manual** (`workflow_dispatch`); não adicionar gatilhos de `push`.
- `release.yml` lê a seção da versão no `CHANGELOG.md` para as notas da release; não duplicar esse texto no workflow.
- Decisões duradouras são registradas em `docs/architecture/decisions/` (formato ADR numerado).
- Nunca versionar binários, bancos locais, chaves ou tokens.
