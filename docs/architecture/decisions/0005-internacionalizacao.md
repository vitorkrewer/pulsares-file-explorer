# ADR-0005 — Internacionalização com i18next, ICU e Intl

- Situação: aceita
- Data: 2026-11-05

## Contexto

O app precisa nascer multilíngue (pt-BR, en, es) e permitir novos idiomas apenas com arquivos de tradução. Retrofit de i18n em uma base existente é caro; por isso entra na etapa 0.1.0.

## Decisão

- Frontend: **i18next + react-i18next**, mensagens em formato **ICU** (plurais, seleção, interpolação), catálogos JSON por idioma e namespace, embutidos no bundle (app offline).
- **pt-BR é o idioma de referência**: as chaves e os tipos TypeScript são derivados dele; `en` e `es` precisam ter exatamente as mesmas chaves (`npm run i18n:check` no CI).
- Formatação exclusivamente via **`Intl`** (`DateTimeFormat`, `NumberFormat`, `RelativeTimeFormat`, `Collator` com `numeric: true` para ordenação natural).
- **Go não traduz mensagens de erro**: devolve códigos estáveis e parâmetros. Apenas textos nativos (menus do SO, diálogos, notificações) ficam em `internal/i18n`, catálogo JSON embutido.
- Idioma: `auto` (idioma do SO mapeado para o suportado mais próximo) ou escolha manual; troca em tempo de execução, sem reiniciar.
- **Idioma de reserva: inglês (en).** Usado quando o idioma do SO não é suportado (ex.: francês, alemão) e como `fallbackLng` do i18next para chaves ausentes. pt-BR continua sendo o idioma de referência das chaves e o padrão do projeto.

## Alternativas consideradas

- **FormatJS / react-intl**: ICU nativo e ótimo, mas i18next tem ecossistema maior (namespaces, ferramentas de extração, plugins de ICU) e é conhecido pela equipe.
- **Lingui**: extração por macros e catálogos compilados enxutos, porém exige etapa de compilação extra e plugin de build.
- **Catálogo próprio**: simples no início, mas reinventaria plurais e interpolação.

## Consequências

- Nenhum texto fixo em componentes; revisão de código recusa strings literais visíveis.
- Ordenação de nomes de arquivos passa a depender da localidade (`Intl.Collator`), com opção de ordenação por código (binária) nas configurações para quem preferir.
- Novos idiomas exigem só uma pasta em `locales/` e uma entrada na lista de idiomas suportados.
