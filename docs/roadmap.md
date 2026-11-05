# Roteiro por etapas

Cada etapa é uma versão *minor* registrada no [`CHANGELOG.md`](../CHANGELOG.md). A ordem é uma intenção e pode mudar com o uso real. Cada etapa só é concluída com **critérios de aceite** atendidos, testes e release manual gerada.

| Versão | Etapa | Situação |
| --- | --- | --- |
| 0.1.0 | Fundação, navegação básica e internacionalização (pt-BR, en, es) | Concluída |
| 0.2.0 | Abas, sessão e painel lateral com árvore de pastas | Concluída |
| 0.3.0 | Operações de arquivo e fila de jobs | Em andamento |
| 0.4.0 | Painel duplo, barra lateral e arrastar e soltar interno | Planejada |
| 0.5.0 | Terminal integrado (painel inferior) | Planejada |
| 0.6.0 | Modos de visualização, miniaturas e prévia | Planejada |
| 0.7.0 | Busca e filtros | Planejada |
| 0.8.0 | Integração com o sistema operacional | Planejada |
| 0.9.0 | Produtividade (paleta, atalhos, renomeação em lote, etiquetas) | Planejada |
| 0.10.0 | Arquivos compactados e locais remotos | Planejada |
| 1.0.0 | Estabilização e distribuição | Planejada |

---

## 0.1.0 — Fundação e navegação básica

**Objetivo:** app abre em < 1 s e navega em pastas locais grandes sem travar.

- Projeto Wails na raiz, frontend React/TS estrito/Vite, ESLint, Vitest, `go vet`, testes Go.
- Tokens de design (claro/escuro/sistema), shell da janela (barra de título, barra de ferramentas, área de conteúdo, barra de status).
- `vfs` + `vfs/local` (Stat, ReadDir em lotes, Open), erros de domínio.
- `listing` com streaming por eventos, cancelamento por `requestId`.
- Modo detalhes virtualizado: nome, tamanho, tipo, data de modificação; ordenação natural; pastas primeiro.
- Navegação: voltar, avançar, subir, atualizar; breadcrumbs + edição de caminho.
- Abrir arquivo com o app padrão; mostrar/ocultar ocultos.
- `storage` com SQLite e migrações; `settings` básico.
- Internacionalização desde o primeiro componente: i18next + catálogos pt-BR/en/es, detecção do idioma do SO, seletor de idioma nas configurações (troca sem reiniciar), formatadores `Intl` (datas, números, tamanhos, ordenação), erros Go como códigos traduzidos no frontend, `npm run i18n:check` e pseudo-localidade de desenvolvimento.
- `release.yml` manual gerando executáveis para os três sistemas.

**Aceite:** pasta com 100 mil arquivos sintéticos mostra o primeiro lote em < 200 ms e rola a 60 fps; navegação rápida entre pastas nunca mostra conteúdo da pasta anterior; toda a interface aparece corretamente em pt-BR, en e es, sem strings fixas (verificado com a pseudo-localidade) e sem textos cortados; release gerada nos três SOs.

## 0.2.0 — Abas, sessão e painel lateral com árvore de pastas

- Store de sessão (janela → painel → abas) e histórico por aba.
- Nova, fechar, duplicar, fixar, fechar outras/à direita, reabrir fechada, reordenar arrastando.
- Abrir em nova aba (clique do meio, `Ctrl+Enter`), atalhos `Ctrl+T`, `Ctrl+W`, `Ctrl+Shift+T`, `Ctrl+Tab`, `Ctrl+1..9`.
- Estado por aba (modo, ordenação, filtro, rolagem, seleção).
- Persistência e restauração da sessão; cache LRU de listagens de abas inativas.
- Painel lateral esquerdo recolhível (`Ctrl+B` / `Cmd+B`, botão e comando) e redimensionável, com estado persistido.
- `internal/tree` + árvore de pastas: raízes por SO, carregamento preguiçoso só de diretórios, sondagem de subpastas com timeout, virtualização, padrão ARIA `tree`, navegação por teclado, abrir na aba ativa ou em nova aba, sincronização com a aba ativa.

**Aceite:** 30 abas abertas com troca < 50 ms; fechar e reabrir o app restaura todas as abas, a aba ativa, a visibilidade/largura do painel lateral e os nós expandidos; expandir uma pasta com 5 mil subpastas não trava a interface; unidade de rede indisponível não bloqueia a árvore; árvore operável só com teclado; testes de `session` e `tree` cobrindo restauração, migração, symlinks em ciclo e permissão negada.

## 0.3.0 — Operações de arquivo e fila de jobs

- Seleção múltipla (clique, `Shift`, `Ctrl`, `Ctrl+A`, retângulo).
- Copiar/recortar/colar, renomear (`F2`), nova pasta/arquivo, lixeira, exclusão permanente.
- `ops`: planejamento, escrita segura (temporário + rename), pausa/retomada/cancelamento, política de conflitos, verificação opcional por hash.
- Painel de operações com progresso, velocidade, ETA e histórico.
- Diário (`op_journal`) e desfazer/refazer.

**Aceite:** testes cobrindo conflitos, cancelamento no meio, disco cheio simulado, permissão negada, caminhos longos no Windows e mover entre volumes; nenhum arquivo parcial deixado após cancelamento.

## 0.4.0 — Painel duplo, barra lateral e arrastar e soltar interno

- Layout único / dividido horizontal / vertical; cada painel com suas abas.
- Ações "copiar/mover para o outro painel" (`F5`/`F6`).
- Arrastar e soltar arquivos e abas entre painéis e sobre nós da árvore (expansão automática ao pairar).
- Novas seções do painel lateral: favoritos, unidades/volumes com espaço livre, pastas do usuário, recentes; menu de contexto nos nós da árvore.
- Infraestrutura de layout com regiões redimensionáveis (lateral, conteúdo, inferior) reaproveitada pelo terminal.

## 0.5.0 — Terminal integrado (painel inferior)

**Objetivo:** terminal real abaixo do conteúdo, estilo VS Code, ligado à pasta da aba ativa.

- `internal/terminal`: sessões de pseudoterminal (ConPTY no Windows, PTY no Linux/macOS), fluxo de saída em lotes, entrada, redimensionamento, encerramento da árvore de processos.
- Detecção de perfis de shell por SO e perfil padrão configurável; perfis personalizados.
- Frontend com xterm.js: painel inferior recolhível (`` Ctrl+` ``), redimensionável e maximizável; abas de terminal; divisão lado a lado.
- Novo terminal na pasta da aba ativa; comando "Ir para a pasta atual"; arrastar arquivos insere caminhos com aspas corretas por shell.
- Integração opcional de shell (OSC 7) para o explorador acompanhar a pasta do terminal; caminhos e URLs clicáveis.
- Tema, fonte e histórico de rolagem configuráveis; busca na saída; aviso ao fechar com processos ativos.
- Persistência do painel (visível, altura) e dos terminais (perfil, pasta, nome).

**Aceite:** `vim`, `htop`/`top`, `ssh` e `git log` com paginação funcionam corretamente nos três SOs; saída intensa (ex.: `cat` de arquivo de 50 MB) não congela a interface do explorador; caracteres acentuados e emojis da saída aparecem corretos; fechar uma aba de terminal encerra todos os processos filhos; caminhos com espaços e acentos são inseridos com aspas corretas em PowerShell, cmd, bash, zsh e fish; testes de `terminal` cobrindo ciclo de vida, redimensionamento e citação de caminhos.

## 0.6.0 — Modos de visualização, miniaturas e prévia

- Modos lista, grade (miniaturas) e colunas (Miller); agrupamento.
- `thumbs`: geração em segundo plano, prioridade para itens visíveis, cache em disco com limite.
- Painel de prévia: imagem, texto/código, markdown, PDF, áudio/vídeo; prévia rápida com `Espaço`.
- Densidade compacta/confortável.

## 0.7.0 — Busca e filtros

- Filtro instantâneo na pasta.
- Busca recursiva em streaming com filtros (glob/regex, extensão, tamanho, datas, conteúdo).
- Índice opcional (SQLite FTS5) para pastas escolhidas, atualizado por watcher.
- Resultados abrem em aba própria ("aba de busca").

## 0.8.0 — Integração com o sistema operacional

- Watchers por pasta visível e por nó expandido da árvore, com debounce.
- Abrir com…, abrir terminal externo do sistema aqui, propriedades, ejetar unidade.
- Ícones do sistema e miniaturas nativas (vídeo, PDF).
- Menu de contexto nativo (Windows) como submenu opcional.
- Arrastar arquivos de/para outros aplicativos.

## 0.9.0 — Produtividade

- Registro de comandos + paleta de comandos.
- Atalhos configuráveis com detecção de conflitos.
- Renomeação em lote com prévia; comparar/sincronizar pastas; hash.
- Etiquetas/cores, buscas salvas, grupos de abas, histórico "ir para".
- Comandos personalizados executados no terminal sobre a seleção.

## 0.10.0 — Arquivos compactados e locais remotos

- `vfs/archive`: navegar em zip/tar; extrair/compactar.
- `vfs/remote`: SFTP (primeiro), WebDAV; credenciais no cofre do sistema.
- Terminal SSH ligado a abas SFTP (opcional).

## 1.0.0 — Estabilização e distribuição

- Testes de upgrade de migrações desde 0.1.0.
- Assinatura de código (Windows) e notarização (macOS), se houver certificados.
- Instalador Windows (NSIS) opcional, atualização com verificação manual de versão.
- Auditoria de desempenho contra os orçamentos do `AGENTS.md`.

## Pendências sem etapa definida

- Multi-janela e destacar aba (depende de Wails v3 — ADR-0004).
- Leitura de MFT/USN Journal no Windows para índice instantâneo.
- SMB nativo, plugins/extensões, definir como explorador padrão do Windows.
