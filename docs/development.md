# Ambiente de desenvolvimento

## Requisitos

- Go (versão em `go.mod`).
- Node.js 22.x e npm.
- Wails CLI v2: `go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0`
- Verificar dependências: `wails doctor`.

Por sistema:

- **Windows**: WebView2 Runtime (já presente no Windows 11).
- **Linux**: `build-essential libgtk-3-dev libwebkit2gtk-4.1-dev` — usar a tag `webkit2_41` (`wails dev -tags webkit2_41`).
- **macOS**: Xcode Command Line Tools.

## Comandos

```bash
wails dev                 # app com hot reload
wails build               # binário em build/bin

go vet ./...
go test ./...
go test -bench=. ./internal/listing/...

cd frontend
npm run typecheck
npm run lint
npm run i18n:check        # chaves faltantes/órfãs entre pt-BR, en e es
npm test
```

## Traduções

- Textos ficam em `frontend/src/i18n/locales/<idioma>/<namespace>.json`; pt-BR é a referência.
- Ao criar uma chave, adicioná-la em `pt-BR`, `en` e `es` no mesmo commit.
- Para achar strings fixas ou textos cortados, rode o app com a pseudo-localidade: `VITE_LOCALE=pseudo wails dev`.

## Dados de teste

- Nunca rodar testes de `ops` contra pastas reais. Use `t.TempDir()`.
- Gerador de pastas sintéticas (a criar na 0.1.0): `go run ./tools/gen-fixtures -count 100000 -out <pasta>` para testes de desempenho de listagem.

## Release

1. Garantir a seção `## [X.Y.Z] - AAAA-MM-DD` no `CHANGELOG.md`.
2. Atualizar `wails.json` (`info.productVersion`) e `frontend/package.json`.
3. GitHub → Actions → **Release** → *Run workflow* (versão em branco usa a mais recente do CHANGELOG).
