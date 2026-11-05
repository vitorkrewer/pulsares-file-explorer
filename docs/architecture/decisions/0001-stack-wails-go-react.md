# ADR-0001 — Stack: Wails v2, Go, React + TypeScript

- Situação: aceita
- Data: 2026-11-05

## Contexto

Precisamos de um explorador multiplataforma (Windows, Linux, macOS), leve e rápido, com interface rica (abas, painéis, prévias) e acesso de baixo nível ao sistema de arquivos e APIs nativas.

## Decisão

- **Wails v2** (estável, fixado em `v2.16.0` no `release.yml`): usa o webview do sistema (WebView2, WKWebView, WebKitGTK), sem empacotar Chromium. Binários pequenos e baixo consumo de memória comparado ao Electron.
- **Go** no núcleo: concorrência simples (goroutines + `context`) para listagem, cópia e busca; compilação cruzada; acesso a syscalls por plataforma.
- **React + TypeScript estrito + Vite** na interface; Zustand para estado; TanStack Virtual para listas.
- **SQLite via `modernc.org/sqlite`** (pure-Go) para evitar dependência extra de CGO no driver.

## Alternativas consideradas

- **Electron**: maduro, multi-janela e drag-out nativos, mas pesado — contraria o objetivo central.
- **Tauri (Rust)**: leve e com multi-janela, mas a equipe prefere Go e o ecossistema já usado em Pulsares Research.
- **Wails v3**: multi-janela, menus e drag-and-drop melhores; reavaliar quando estável o bastante (ver ADR-0004).
- **UI nativa (Qt, WinUI)**: desempenho máximo, porém três bases de UI ou licenciamento/complexidade maiores.

## Consequências

- Diferenças entre webviews exigem testes visuais nos três SOs.
- Recursos nativos avançados (drag-out, menu de contexto do shell, ícones do sistema) precisam de código por plataforma em `internal/platform`.

