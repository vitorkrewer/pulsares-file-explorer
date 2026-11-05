# Pulsares Explorer

Explorador de arquivos desktop, rápido e orientado a teclado, para **Windows, Linux e macOS**. Construído com **Wails (Go) + React + TypeScript**.

> Estado: **desenho do projeto** (etapa 0.1.0 em andamento). Nada aqui é estável ainda.

## Por que

O Explorador do Windows é pesado, trava em pastas grandes, não tem painel duplo, tem abas limitadas, copia arquivos sem fila nem controle real de conflitos e quase não é configurável. O Pulsares Explorer quer ser:

- **Rápido**: listagem em streaming e virtualizada; pastas com 100 mil itens abrem sem travar.
- **Multitarefa**: várias abas, painel duplo, sessão restaurada.
- **Árvore de pastas**: painel latveral recolhível com navegação hierárquica rápida.
- **Terminal integrado**: painel inferior estilo VS Code, aberto na pasta da aba ativa.
- **Multilíngue**: português (Brasil), inglês e espanhol.
- **Seguro**: fila de operações com pausa, cancelamento, resolução de conflitos, verificação e desfazer.
- **Mouse e teclado**: uso completo com o mouse (menus, arrastar e soltar) e também por atalhos configuráveis e paleta de comandos.
- **Privado**: sem conta, sem telemetria, 100% offline.

## Documentação

- [AGENTS.md](AGENTS.md) — regras de contribuição (pessoas e agentes de IA).
- [docs/product/vision.md](docs/product/vision.md) — visão de produto, público e não-objetivos.
- [docs/features.md](docs/features.md) — catálogo de funcionalidades por módulo.
- [docs/architecture.md](docs/architecture.md) — arquitetura, fluxos e contratos.
- [docs/roadmap.md](docs/roadmap.md) — etapas de desenvolvimento.
- [docs/development.md](docs/development.md) — ambiente de desenvolvimento.
- [docs/architecture/decisions/](docs/architecture/decisions/) — ADRs.

## Release

Releases são geradas manualmente em **Actions → Release → Run workflow**, a partir da seção correspondente do [CHANGELOG.md](CHANGELOG.md).
