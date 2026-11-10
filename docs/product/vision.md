# Visão de produto

## Proposta

O **Pulsares Explorer** é uma alternativa desktop multiplataforma (Windows, Linux e macOS), **local-first** e **offline**, pensada para reunir em um único aplicativo rápido o gerenciamento de arquivos e ferramentas essenciais do fluxo de trabalho técnico e de desenvolvimento:

1. Abas ilimitadas e painel duplo como cidadãos de primeira classe.
2. Operações de arquivo como uma **fila de jobs** visível, atômica e reversível (Desfazer/Refazer).
3. Busca instantânea na pasta atual e busca recursiva com filtros, Regex e busca por conteúdo.
4. Paridade de mouse e teclado: ações disponíveis por cliques, menu de contexto, arrastar e soltar, atalhos e paleta de comandos.
5. Prévia rica sem abrir aplicativos externos (código, Markdown, HTML renderizado, vídeo com HTTP Range 206, apresentações `.pptx`/`.odp`, PDF).
6. Suíte integrada para desenvolvedores e análise de dados: acesso remoto **SSH/SFTP v3** com verificação criptográfica, **Terminal Integrado** multi-shell com modo *Follow-up*, **Pulsares Studio Editor** com Prévia Web em tempo real e **Pulsares DB Studio** com Mapa ER e criação rápida de bancos SQLite.

## Público

- Pessoas desenvolvedoras, analistas de dados, profissionais de infraestrutura e usuários avançados que trabalham diariamente com projetos de código, servidores remotos, planilhas/datasets, bancos SQLite e grandes volumes de arquivos.

## Não-objetivos (por enquanto)

- Substituir o shell do sistema operacional (área de trabalho, barra de tarefas).
- Ser cliente de sincronização em nuvem (Dropbox, OneDrive etc.). O app navega em pastas sincronizadas pelo sistema, sem gerenciar sync proprietário.
- Telemetria, contas obrigatórias ou recursos dependentes de servidor central.

## Princípios de experiência

- **Nada trava.** Listagens, buscas, inspeção de bancos grandes e operações mostram progresso e podem ser canceladas.
- **Nada some.** Excluir envia para a lixeira por padrão; operações possuem diário de desfazer; conflitos seguem política explícita ou diálogo interativo.
- **Segurança local-first.** Chaves de servidores SSH são fixadas via TOFU (SHA-256) e senhas/passphrases residem apenas na memória RAM durante a sessão.
- **Previsível.** Os mesmos atalhos e padrões operam de forma consistente entre abas, painéis e janelas auxiliares.
- **Denso, mas legível.** Interface compacta com tipografia clara, ícones vetoriais e temas claro/escuro.

## Métricas de sucesso

| Métrica | Alvo |
| --- | --- |
| Abertura a frio | < 1 s |
| Primeiro lote de pasta com 100 mil itens | < 200 ms |
| Troca de aba | < 50 ms |
| Memória ociosa (3 abas) | < 150 MB |
| Cópia de arquivos grandes | Escrita atômica com verificação SHA-256 opcional |
| Perda de dados em operações | Zero (testes de falha, conflito e cancelamento) |
