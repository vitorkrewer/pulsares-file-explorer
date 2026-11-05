# ADR-0002 — Sistema de arquivos virtual (VFS) com capacidades opcionais

- Situação: aceita
- Data: 2026-11-05

## Contexto

Queremos navegar em disco local, arquivos compactados e locais remotos com a mesma interface, abas, operações e busca.

## Decisão

- Todo acesso a arquivos passa por `internal/vfs`. Somente `vfs/local` usa `os.*`.
- Contrato mínimo (`Stat`, `ReadDir` em lotes, `Open`) + **capacidades opcionais** por interface (`Writer`, `Trasher`, `Watcher`, …), detectadas por *type assertion*.
- Locais são identificados por `Location{Provider, Root, Path}`, serializável para a sessão.
- Erros de domínio padronizados, traduzidos em códigos estáveis na fronteira Wails.

## Consequências

- `ops`, `listing`, `search` e `thumbs` são testáveis com um provedor em memória.
- A UI desabilita ações conforme as capacidades do provedor da aba (ex.: zip somente leitura).
- Operações entre provedores diferentes (local → SFTP) usam o caminho genérico copiar-via-stream.

