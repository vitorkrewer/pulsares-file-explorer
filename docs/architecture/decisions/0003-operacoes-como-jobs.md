# ADR-0003 — Operações de arquivo como jobs com diário

- Situação: aceita
- Data: 2026-11-05

## Contexto

O principal ponto fraco dos exploradores nativos é a cópia/movimentação: sem fila, conflitos pobres, falhas parciais confusas e nenhum desfazer confiável.

## Decisão

- Toda operação que altera o disco é um **job** em `internal/ops`, com estados (enfileirado, planejando, executando, pausado, aguardando conflito, verificando, concluído, falhou, cancelado).
- Fase de **planejamento** antes de escrever (total de itens/bytes, detecção antecipada de conflitos).
- **Escrita segura**: temporário no destino + `fsync` + rename atômico; mover entre volumes = copiar + verificar + remover.
- **Diário** de passos em SQLite (`op_journal`) para desfazer e recuperação após travamento.
- Exclusão vai para a lixeira por padrão.
- Por padrão, um job ativo por volume de destino.

## Consequências

- Mais código e testes que chamar `os.Rename`/`io.Copy` diretamente, porém comportamento previsível e auditável.
- O frontend apenas enfileira e observa eventos `ops:*`; nunca move arquivos por conta própria.

