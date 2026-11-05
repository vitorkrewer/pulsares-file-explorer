# ADR-0007 — Terminal integrado com PTY nativo e xterm.js

- Situação: aceita
- Data: 2026-11-05

## Contexto

Queremos um terminal no painel inferior, como no VS Code, ligado à pasta da aba ativa, que rode programas interativos (vim, htop, ssh) nos três sistemas, sem comprometer a fluidez do explorador.

## Decisão

- **Backend Go** (`internal/terminal`) com pseudoterminal real: **ConPTY** no Windows 10 1809+ e **`openpty`** no Linux/macOS, por meio de uma biblioteca multiplataforma (candidata: `aymanbagabas/go-pty`; alternativas `creack/pty` + `UserExistsError/conpty`), escondida atrás de uma interface pequena para permitir troca.
- **Frontend** com **xterm.js** (complementos `fit`, `webgl`, `search`, `web-links`, `unicode11`).
- **Transporte** pela ponte de eventos do Wails: saída em lotes (~8 ms ou 64 KB), em base64, com contrapressão via `Ack`; entrada e redimensionamento por bindings.
- Encerramento de **toda a árvore de processos** ao fechar um terminal (Job Object no Windows, grupo de processos no Unix).
- Ações do explorador no terminal (ir para a pasta, inserir caminhos) usam **citação por tipo de shell** e apenas digitam texto, nunca executam por conta própria.
- Integração de shell (OSC 7) para o explorador acompanhar o terminal é **opcional** e desligada por padrão.
- Conteúdo do terminal nunca é registrado, persistido ou enviado; só metadados (perfil, pasta, nome, layout) entram na sessão.

## Alternativas consideradas

- **Abrir terminal externo apenas**: simples, mas não atende ao fluxo integrado pedido (continua disponível na etapa 0.8).
- **Pipes sem PTY** (`exec.Cmd` com stdin/stdout): não suporta programas interativos, cores dependentes de TTY nem redimensionamento.
- **WebSocket local entre Go e xterm.js**: mais vazão, mas abre porta local (superfície de ataque e firewall); só reavaliar se os eventos do Wails se mostrarem insuficientes em benchmark.

## Consequências

- Dependência de ConPTY limita o terminal a Windows 10 1809+; em versões anteriores o recurso fica desativado com aviso.
- Testes de integração precisam rodar nos três SOs (citação de caminhos, ciclo de vida, redimensionamento).
- O tema do terminal passa a fazer parte dos tokens de design (paleta ANSI clara/escura).

