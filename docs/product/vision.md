# Visão de produto

## Problema

Exploradores nativos são o software mais usado do desktop e um dos menos evoluídos:

- **Windows Explorer**: lento em pastas grandes e unidades de rede, abas recentes e limitadas, sem painel duplo, cópia sem fila real, diálogo de conflito pobre, busca lenta e imprevisível, pouca personalização, menu de contexto inchado.
- **Finder (macOS)**: sem "recortar" nativo, sem painel duplo, caminho pouco visível, operações de arquivo opacas.
- **Linux** (Nautilus/Dolphin/etc.): bons, mas inconsistentes entre ambientes e sem a mesma experiência nos três sistemas.

## Proposta

Um explorador **único nos três sistemas**, com desempenho de ferramenta profissional e ergonomia moderna:

1. Abas e painéis como cidadãos de primeira classe.
2. Operações de arquivo como uma **fila de jobs** visível e controlável.
3. Busca instantânea na pasta atual e busca recursiva com filtros, com índice local opcional.
4. Mouse e teclado com paridade: tudo funciona com cliques, menu de contexto e arrastar e soltar, e também por atalhos e paleta de comandos.
5. Prévia rica sem abrir aplicativos.

## Público

- Pessoas que lidam com muitos arquivos no dia a dia (pesquisa, desenvolvimento, design, audiovisual, administração).
- Usuários avançados que hoje recorrem a Total Commander, Directory Opus, Files, OneCommander, Double Commander, Everything etc.

## Não-objetivos (por enquanto)

- Substituir o shell do sistema (área de trabalho, barra de tarefas).
- Ser cliente de sincronização de nuvem (Dropbox, OneDrive etc.). Podemos *navegar* em pastas sincronizadas, não sincronizar.
- Editor de arquivos embutido além de prévia e renomeação.
- Telemetria, contas ou recursos dependentes de servidor.

## Princípios de experiência

- **Nada trava.** Qualquer coisa lenta mostra progresso e pode ser cancelada.
- **Nada some.** Excluir vai para a lixeira; operações têm desfazer; conflitos são sempre perguntados ou seguem política explícita.
- **Previsível.** O mesmo atalho faz a mesma coisa em todas as abas e painéis.
- **Denso, mas legível.** Interface compacta, tipografia clara, temas claro/escuro.

## Métricas de sucesso

| Métrica | Alvo |
| --- | --- |
| Abertura a frio | < 1 s |
| Primeiro lote de pasta com 100 mil itens | < 200 ms |
| Troca de aba | < 50 ms |
| Memória ociosa (3 abas) | < 150 MB |
| Cópia de 10 GB vs. Explorer | igual ou mais rápida, com verificação opcional |
| Perda de dados em operações | zero (testes de falha e cancelamento) |
