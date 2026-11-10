# Ambiente de desenvolvimento

## Requisitos

- Go (`1.25.0`, conforme `go.mod`).
- Node.js 22.x e npm.
- Wails CLI v2: `go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0`
- Verificar dependências: `wails doctor`.

Por sistema:

- **Windows**: WebView2 Runtime (já presente no Windows 10/11).
- **Linux**: `build-essential libgtk-3-dev libwebkit2gtk-4.1-dev` — usar a tag `webkit2_41` (`wails dev -tags webkit2_41`).
- **macOS**: Xcode Command Line Tools.

## Comandos

```bash
wails dev                 # app com hot reload
wails build               # binário em build/bin

go vet ./...
go test ./internal/...
go test -bench=. ./internal/listing/...

cd frontend
npm run typecheck
npm run lint
npm run i18n:check        # chaves faltantes/órfãs nos 10 idiomas
npm test
```

## Traduções

- Textos ficam em `frontend/src/i18n/locales/<idioma>/common.json`; `pt-BR` é a referência.
- Idiomas suportados: `pt-BR`, `en`, `es`, `de`, `fr`, `it`, `ja`, `zh-CN`, `tr` e `sv`.
- Ao criar ou alterar uma chave, atualizar todos os catálogos e validar com `npm run i18n:check`.
- Para achar strings fixas ou textos cortados, rode o app com a pseudo-localidade: `VITE_LOCALE=pseudo wails dev`.

## Dados de teste

- Nunca rodar testes de `ops` contra pastas reais. Use `t.TempDir()`.
- Utilitários auxiliares ficam em `tools/` (`generate_icon.py` para ícones multi-resolução do Explorer, DB Studio e Studio Editor).

## Release

1. Garantir a seção `## [X.Y.Z] - AAAA-MM-DD` no `CHANGELOG.md`.
2. Atualizar a versão em `main.go` (`var version`), `wails.json` (`info.productVersion`) e `frontend/package.json` (`version`).
3. GitHub → Actions → **Release Pulsares Explorer** → *Run workflow* (gera executáveis nativos, pacotes portáteis e `Pulsares-Explorer-Multiverse-Portable.zip`).
