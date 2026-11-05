# ADR-0006 — Árvore de pastas preguiçosa no painel lateral recolhível

- Situação: aceita
- Data: 2026-11-05

## Contexto

Navegação por árvore é essencial para quem vem do Windows Explorer, mas árvores ingênuas travam em pastas com milhares de subpastas, unidades de rede lentas e ciclos de symlinks/junctions.

## Decisão

- A árvore vive no **painel lateral esquerdo**, recolhível (`Ctrl+B` / `Cmd+B`) e redimensionável, com estado persistido na sessão da janela (`SidebarState`).
- Serviço Go dedicado (`internal/tree`) separado de `listing`: retorna só diretórios, em uma chamada por nó expandido, com `context` cancelável.
- "Tem subpastas" é um valor de três estados (`Yes`, `No`, `Unknown`) obtido por sondagem limitada (primeiro subdiretório + timeout curto, paralelismo limitado). Em provedores lentos/remotos, retorna `Unknown` sem sondar.
- Frontend renderiza uma **lista achatada virtualizada** dos nós visíveis, seguindo o padrão ARIA `tree`.
- Symlinks/junctions são exibidos com indicador e não são expandidos automaticamente ao revelar caminhos.
- A árvore é **única por janela**, sincronizada com a aba ativa do **painel em foco**: ao trocar o foco entre painéis no modo duplo, a árvore revela a pasta do painel recém-focado (acompanhamento pode ser desligado).

## Alternativas consideradas

- **Reaproveitar `listing`** (streaming de todas as entradas): traria arquivos desnecessários e eventos em excesso para cada nó.
- **Árvore por painel**: mais flexível no painel duplo, mas ocupa espaço e confunde. Descartada.
- **Componente de árvore pronto**: a maioria não virtualiza bem ou não segue o ARIA `tree`; implementação própria pequena em cima de TanStack Virtual é suficiente.

## Consequências

- Expandir nós grandes é rápido e nunca bloqueia a UI.
- O chevron pode aparecer em pastas sem filhos quando o estado é `Unknown`; ao expandir, ele some.
- A etapa 0.8 adiciona watchers apenas para nós expandidos e visíveis.
