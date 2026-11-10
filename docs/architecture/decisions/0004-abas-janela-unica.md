# ADR-0004 — Abas e painéis em janela única; multi-janela adiada

- Situação: aceita
- Data: 2026-11-05

## Contexto

Várias abas são requisito central. Wails v2 oferece uma única janela por processo; multi-janela nativa está no Wails v3. Arrastar arquivos do app para outros programas também não é nativo no v2.

## Decisão

- Modelo **Sessão → Janela → Painéis → Abas**, já com `windows[]` no esquema para não exigir migração futura.
- Na v2: uma janela, até dois painéis (único/dividido), abas ilimitadas por painel.
- Estado em tempo de execução no frontend (Zustand); snapshot persistido no SQLite com debounce.
- "Destacar aba em nova janela" fica pendente até a reavaliação do Wails v3. Alternativa paliativa: abrir uma **nova instância** do app com a aba (`--open <caminho>`), com sessão separada.
- Arrastar para outros programas será feito com código nativo por SO na etapa 0.8.

## Consequências

- Nenhuma funcionalidade das etapas 0.1–0.10 depende de multi-janela.
- A migração para Wails v3, se ocorrer, gera um novo ADR e afeta principalmente `main.go`, `internal/app` e `frontend/src/lib`.

## Atualização (1.1.1)

- O navegador principal de arquivos permanece em janela única com abas ilimitadas e painel duplo.
- As ferramentas especializadas da suíte (**Pulsares Studio Editor** e **Pulsares DB Studio**) passaram a rodar como **janelas independentes do sistema operacional** iniciadas por processos separados com flags CLI (`--studio` e `--dbstudio`), `WindowClassName` distinto, ícone Win32 dedicado e `AppUserModelID` próprio (`Pulsares.StudioEditor`, `Pulsares.DBStudio`), mantendo o isolamento da sessão principal.
