# Catálogo de funcionalidades

Cada funcionalidade indica a etapa prevista (ver [roadmap.md](roadmap.md)). Prioridade: **P0** essencial para a etapa, **P1** desejável, **P2** futura.

## 1. Navegação

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Listagem de diretório em streaming com virtualização | 0.1 | P0 |
| Voltar, avançar, subir, atualizar (por aba) | 0.1 | P0 |
| Barra de endereço com breadcrumbs clicáveis e modo de edição | 0.1 | P0 |
| Autocompletar caminhos ao digitar | 0.1 | P1 |
| Abrir arquivo com aplicativo padrão | 0.1 | P0 |
| Arquivos ocultos/sistema: mostrar/ocultar | 0.1 | P0 |
| Ordenação natural (`arquivo2` antes de `arquivo10`), por nome, tamanho, tipo, datas | 0.1 | P0 |
| Digitar para saltar (type-ahead) | 0.1 | P1 |
| Variáveis e atalhos de caminho (`~`, `%APPDATA%`, `$HOME`) | 0.2 | P1 |

## 1.1 Interação com mouse

Mouse e teclado têm paridade: nenhuma funcionalidade depende só de um deles.

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Clique seleciona, duplo clique abre pasta/arquivo | 0.1 | P0 |
| Botões laterais do mouse (voltar/avançar) navegam no histórico da aba | 0.1 | P0 |
| Barra de ferramentas com botões para as ações principais (voltar, avançar, subir, atualizar, nova pasta, modos de visualização) | 0.1 | P0 |
| Clique nos cabeçalhos de coluna ordena; arrastar redimensiona e reordena colunas | 0.1 | P0 |
| Clique do meio abre pasta em nova aba; duplo clique na área vazia da barra de abas cria nova aba | 0.2 | P0 |
| Arrastar divisores para redimensionar painel lateral, painel inferior e painéis; duplo clique no divisor restaura o tamanho padrão | 0.2 | P0 |
| `Ctrl`/`Shift` + clique e seleção por retângulo (laço) | 0.3 | P0 |
| Menu de contexto próprio (botão direito) em arquivos, pastas, área vazia, abas e nós da árvore | 0.3 | P0 |
| Arrastar e soltar para copiar/mover (com modificadores `Ctrl`/`Shift`/`Alt` e menu ao soltar com botão direito) | 0.4 | P0 |
| `Ctrl` + roda do mouse ajusta o tamanho dos ícones/miniaturas | 0.6 | P1 |
| Pairar exibe dica (tooltip) com nome completo, tamanho e datas | 0.6 | P1 |
| Gestos de touchpad no macOS (deslizar para voltar/avançar, pinça para zoom de ícones) | 0.8 | P1 |

## 2. Abas

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Múltiplas abas com histórico independente | 0.2 | P0 |
| Nova, fechar, duplicar, fechar outras / à direita | 0.2 | P0 |
| Reabrir aba fechada (pilha) | 0.2 | P0 |
| Fixar aba (compacta, não fecha com "fechar outras") | 0.2 | P0 |
| Reordenar por arrastar | 0.2 | P0 |
| Abrir pasta em nova aba (clique do meio, `Ctrl+Enter`) | 0.2 | P0 |
| Restaurar sessão ao iniciar | 0.2 | P0 |
| Estado por aba: modo de visualização, ordenação, filtro, seleção, rolagem | 0.2 | P0 |
| Cor/rótulo de aba | 0.2 | P1 |
| Grupos de abas / espaços de trabalho nomeados | 0.9 | P1 |
| Aba "bloqueada" (navegar abre nova aba) | 0.9 | P2 |
| Destacar aba em nova janela | 1.x | P2 (depende de multi-janela, ver ADR-0004) |

## 3. Painéis e layout

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Painel duplo (lado a lado / empilhado), cada um com suas abas | 0.4 | P0 |
| Mover/copiar para o painel oposto (`F5`/`F6` estilo commander) | 0.4 | P0 |
| Arrastar abas entre painéis | 0.4 | P1 |
| Painel lateral esquerdo recolhível e redimensionável (`Ctrl+B` / `Cmd+B`) | 0.2 | P0 |
| Seções do painel lateral: árvore de pastas, favoritos, unidades/volumes, locais do usuário, recentes | 0.2–0.4 | P0 |
| Painel inferior recolhível e redimensionável para o terminal integrado | 0.5 | P0 |
| Painel de prévia recolhível | 0.6 | P0 |
| Barra de status: contagem, seleção, espaço livre | 0.1 | P0 |
| Layouts salvos | 0.9 | P2 |

## 3.1 Árvore de pastas

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Árvore hierárquica no painel lateral, com raízes por SO (unidades no Windows; `/`, pasta pessoal e volumes no Linux/macOS) | 0.2 | P0 |
| Carregamento preguiçoso: filhos lidos só ao expandir, somente pastas, cancelável | 0.2 | P0 |
| Indicador de "tem subpastas" sem varrer tudo (sondagem limitada; "desconhecido" em rede) | 0.2 | P0 |
| Expandir/recolher com mouse e teclado (`→` expande, `←` recolhe/vai ao pai, `Enter` abre, `*` expande nível) | 0.2 | P0 |
| Clique abre na aba ativa; clique do meio ou `Ctrl+Enter` abre em nova aba | 0.2 | P0 |
| Sincronizar com a aba ativa: revelar e destacar a pasta atual (opção ligar/desligar) | 0.2 | P0 |
| Árvore virtualizada (milhares de nós visíveis sem perda de fluidez) | 0.2 | P0 |
| Estado persistido: visível/oculto, largura, nós expandidos | 0.2 | P0 |
| Respeitar "mostrar ocultos" da aba ativa ou configuração própria | 0.2 | P1 |
| Symlinks/junctions exibidos com indicador, sem expansão recursiva automática (evita ciclos) | 0.2 | P0 |
| Soltar arquivos sobre um nó (copiar/mover), com expansão automática ao pairar | 0.4 | P0 |
| Menu de contexto do nó (nova pasta, renomear, abrir em nova aba, favoritar) | 0.4 | P1 |
| Atualização automática dos nós expandidos via watcher | 0.8 | P1 |

## 3.2 Terminal integrado

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Abrir/fechar o painel do terminal abaixo do conteúdo (`` Ctrl+` `` / `` Cmd+` ``), estilo VS Code | 0.5 | P0 |
| Painel redimensionável, maximizável e com altura persistida | 0.5 | P0 |
| Pseudoterminal real (ConPTY no Windows, PTY no Linux/macOS): cores, cursor, programas interativos (vim, htop, ssh) | 0.5 | P0 |
| Novo terminal abre na pasta da aba ativa | 0.5 | P0 |
| Vários terminais em abas dentro do painel (novo `` Ctrl+Shift+` ``, renomear, fechar, reordenar) | 0.5 | P0 |
| Dividir terminais lado a lado dentro do painel | 0.5 | P1 |
| Perfis de shell detectados automaticamente: PowerShell 7, Windows PowerShell, Prompt de Comando, Git Bash, WSL; bash, zsh, fish; perfil padrão configurável | 0.5 | P0 |
| Perfis personalizados (executável, argumentos, variáveis de ambiente, pasta inicial) | 0.5 | P1 |
| Comando "Ir para a pasta atual" (envia `cd` com aspas corretas para o shell do terminal) | 0.5 | P0 |
| Arrastar arquivos/pastas para o terminal insere os caminhos com aspas | 0.5 | P0 |
| Explorador acompanha a pasta do terminal (integração de shell via sequência OSC 7), opcional | 0.5 | P1 |
| Caminhos na saída clicáveis (abrem no explorador); URLs abrem no navegador | 0.5 | P1 |
| Copiar/colar, seleção, busca na saída, histórico de rolagem configurável | 0.5 | P0 |
| Tema sincronizado com claro/escuro; fonte e tamanho configuráveis | 0.5 | P0 |
| Renderização acelerada (WebGL) com alternativa automática | 0.5 | P1 |
| Restaurar terminais ao reabrir (perfil e pasta; os processos não são restaurados) | 0.5 | P1 |
| Aviso ao fechar o app com processos em execução no terminal | 0.5 | P0 |
| Executar comandos personalizados sobre a seleção (ex.: `git status` na pasta, script com os arquivos selecionados) | 0.9 | P2 |
| Terminal SSH ligado a abas SFTP | 0.10 | P2 |

## 4. Visualização

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Modo detalhes (colunas redimensionáveis e reordenáveis) | 0.1 | P0 |
| Modo lista compacta | 0.6 | P0 |
| Modo grade com miniaturas (tamanhos ajustáveis) | 0.6 | P0 |
| Modo colunas (Miller, estilo Finder) | 0.6 | P1 |
| Miniaturas de imagem com cache em disco | 0.6 | P0 |
| Miniaturas de vídeo/PDF via sistema | 0.8 | P1 |
| Ícones por tipo de arquivo (do sistema ou conjunto próprio) | 0.8 | P1 |
| Agrupar por tipo, data, tamanho | 0.6 | P1 |
| Pastas primeiro / misturadas | 0.1 | P0 |
| Tamanho calculado de pastas (sob demanda, cancelável) | 0.9 | P1 |

## 5. Prévia

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Imagem (zoom, EXIF básico) | 0.6 | P0 |
| Texto e código (realce de sintaxe, limite de tamanho) | 0.6 | P0 |
| Markdown renderizado | 0.6 | P1 |
| PDF (primeira página / navegação) | 0.6 | P1 |
| Áudio e vídeo (player do webview) | 0.6 | P1 |
| Conteúdo de arquivos compactados | 0.10 | P1 |
| Prévia rápida em tela cheia (`Espaço`, estilo Quick Look) | 0.6 | P1 |

## 6. Operações de arquivo

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Copiar, recortar, colar (área de transferência interna e do SO) | 0.3 | P0 |
| Renomear in-place (`F2`), sem selecionar extensão | 0.3 | P0 |
| Nova pasta, novo arquivo | 0.3 | P0 |
| Enviar para lixeira / excluir permanentemente | 0.3 | P0 |
| Fila de operações com progresso, velocidade, ETA | 0.3 | P0 |
| Pausar, retomar, cancelar, reordenar jobs | 0.3 | P0 |
| Diálogo de conflito rico (comparar tamanho/data, aplicar a todos) | 0.3 | P0 |
| Desfazer / refazer (renomear, mover, criar, lixeira) | 0.3 | P0 |
| Verificação pós-cópia por hash (opcional) | 0.3 | P1 |
| Arrastar e soltar entre abas/painéis | 0.4 | P0 |
| Arrastar e soltar de/para outros aplicativos | 0.8 | P1 (ver ADR-0004) |
| Renomeação em lote (padrões, regex, contador, prévia) | 0.9 | P0 |
| Criar links simbólicos / atalhos | 0.9 | P2 |
| Comparar e sincronizar pastas | 0.9 | P1 |
| Calcular hash (MD5, SHA-1, SHA-256) | 0.9 | P1 |
| Compactar / extrair (zip, tar.gz) | 0.10 | P1 |

## 7. Busca e filtros

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Filtro instantâneo na pasta atual | 0.7 | P0 |
| Busca recursiva com streaming de resultados e cancelamento | 0.7 | P0 |
| Filtros: nome (glob/regex), extensão, tamanho, datas, tipo | 0.7 | P0 |
| Busca por conteúdo de texto | 0.7 | P1 |
| Índice local opcional (SQLite FTS5) por pastas escolhidas | 0.7 | P1 |
| Leitura de MFT/USN Journal no Windows (estilo Everything) | 1.x | P2 |
| Buscas salvas (pastas virtuais) | 0.9 | P1 |

## 8. Integração com o sistema

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Listar unidades/volumes, espaço livre, mídias removíveis | 0.4 | P0 |
| Observação de mudanças (watcher) na pasta visível | 0.8 | P0 |
| "Abrir com…" | 0.8 | P0 |
| Menu de contexto nativo do SO (submenu "Mais opções") | 0.8 | P1 |
| Propriedades / permissões | 0.8 | P1 |
| Abrir terminal externo do sistema aqui (Windows Terminal, Terminal.app, terminal padrão do Linux) | 0.8 | P1 |
| Definir como explorador padrão (Windows, opcional e reversível) | 1.x | P2 |
| Ejetar unidade | 0.8 | P1 |

## 9. Produtividade

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Paleta de comandos (`Ctrl+Shift+P` / `Cmd+Shift+P`) | 0.9 | P0 |
| Atalhos configuráveis com detecção de conflitos | 0.9 | P0 |
| Etiquetas/cores em arquivos (armazenadas localmente) | 0.9 | P1 |
| Favoritos e acesso rápido | 0.4 | P0 |
| Histórico de pastas visitadas com busca ("ir para") | 0.9 | P1 |

## 10. Arquivos compactados e remotos

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Navegar dentro de zip/tar como pasta | 0.10 | P0 |
| SFTP | 0.10 | P1 |
| WebDAV | 0.10 | P2 |
| SMB (sem montagem pelo SO) | 1.x | P2 |
| Credenciais no cofre do sistema | 0.10 | P0 |

## 11. Configurações e aparência

| Funcionalidade | Etapa | Prioridade |
| --- | --- | --- |
| Tema claro, escuro e do sistema | 0.1 | P0 |
| Densidade (compacta / confortável) | 0.6 | P1 |
| Infraestrutura de internacionalização (chaves, catálogos, plurais, formatação por localidade) | 0.1 | P0 |
| Idiomas: português (Brasil), inglês e espanhol | 0.1 | P0 |
| Detecção do idioma do sistema com escolha manual nas configurações (troca sem reiniciar) | 0.1 | P0 |
| Datas, números, tamanhos e ordenação conforme a localidade (`Intl`) | 0.1 | P0 |
| Verificação automática de chaves faltantes entre idiomas | 0.1 | P0 |
| Novos idiomas por contribuição (somente arquivos de tradução) | 1.x | P2 |
| Exportar/importar configurações | 0.9 | P2 |
| Plugins / extensões | 1.x | P2 |
