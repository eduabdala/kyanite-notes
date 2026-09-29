# Arquitetura

## Visão geral

O Kyanite é um SPA em React que trata um repositório do GitHub como "vault" (na terminologia do Obsidian): cada arquivo `.md` no repo é uma nota. Não há backend próprio — toda persistência remota passa pela API REST do GitHub, autenticada com um Personal Access Token guardado no `localStorage`.

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Editor     │────▶│  useVaultStore   │────▶│  GitHubClient    │
│  (CodeMirror)│     │   (zustand)      │     │  (@octokit/rest) │
└─────────────┘     └──────────────────┘     └─────────────────┘
                            │
                            ▼
                    localStorage (cache
                    offline-first das notas)
```

## Estrutura de pastas

```
src/
  components/     # componentes React (UI)
  lib/             # lógica pura, sem estado React (parsing, API client)
  store/           # estado global (zustand)
```

### `src/lib`

- **`types.ts`** — tipos centrais: `Note`, `GitHubConfig`, `LinkGraph`, `TreeNode` (nó da árvore de pastas).
- **`github.ts`** — `GitHubClient`, um wrapper fino sobre `@octokit/rest` com os métodos usados pelo app (`listVaultFiles`, `getFileContent`, `putFile`, `deleteFile`, `verifyAccess`). Também cuida de persistir/ler a config de conexão (`GitHubConfig`) no `localStorage`.
- **`vault.ts`** — persistência local das notas e pastas vazias (cache), helpers de conversão path ↔ nome de nota, e `buildFolderTree` para montar a árvore de pastas/notas exibida na sidebar.
- **`wikilinks.ts`** — parser de `[[wikilinks]]` via regex e construção do grafo de links (`buildLinkGraph`), usado para backlinks.
- **`wikilinkAutocomplete.ts`** — extensão de autocomplete do CodeMirror que dispara ao digitar `[[`, sugerindo notas existentes.
- **`markdown.ts`** — renderização de markdown para HTML (`marked`) com wikilinks convertidos em `<a>` clicáveis, sanitizado com DOMPurify antes de ir para o DOM (o conteúdo pode vir de um repo externo, então é tratado como não confiável).

### `src/store/useVaultStore.ts`

Store zustand que centraliza:

- Lista de notas em memória (espelhada no `localStorage` a cada mutação)
- Nota ativa (`activePath`)
- Grafo de links, recalculado a cada mutação de conteúdo
- Config e status de conexão com o GitHub
- Ações de sync: `pullFromGitHub`, `pushNote`, `syncAll`

Cada nota tem um campo `dirty: boolean`. Uma nota fica `dirty` a partir de qualquer edição local e só volta a `false` depois de um push bem-sucedido. Isso permite:

- Autosave local instantâneo (toda edição já é salva no `localStorage`, mesmo sem GitHub conectado)
- Indicar visualmente na sidebar quais notas têm mudanças não sincronizadas
- No `pullFromGitHub`, preservar notas locais `dirty` em vez de sobrescrevê-las com a versão remota (evita perda de edição não sincronizada, mas **não faz merge** — ver limitações abaixo)

Ações de pastas: `createFolder`, `deleteFolder`, `moveNote`, `getFolderTree` (ver seção "Pastas" abaixo).

### `src/store/useThemeStore.ts`

Store simples que aplica o atributo `data-theme` no `<html>` e persiste a escolha (`dark` | `light` | `system`). Quando `system`, escuta `matchMedia('(prefers-color-scheme: light)')` para reagir a mudanças de preferência do OS em tempo real.

## Pastas

Pastas não são uma entidade own no GitHub (git não versiona diretórios vazios), então o Kyanite as trata de duas formas:

- **Pastas com notas dentro**: inferidas automaticamente a partir do `path` das notas (`pasta/subpasta/nota.md`). Não precisam de nenhum registro extra.
- **Pastas vazias**: rastreadas explicitamente em `emptyFolders` (lista de paths, persistida em `localStorage` e, quando conectado ao GitHub, sincronizada como um arquivo marcador vazio `pasta/.folder`). Isso é o mesmo truque usado por convenção em repositórios git (`.gitkeep`) para versionar diretórios sem conteúdo.

`buildFolderTree(notes, emptyFolders)` (em `src/lib/vault.ts`) combina as duas fontes e monta a árvore (`TreeNode[]`) renderizada pela `Sidebar`/`FolderTree`. Uma pasta deixa de existir na árvore quando fica sem notas **e** sem entrada em `emptyFolders` — por isso, mover a última nota de uma pasta para fora a remove da visualização, a menos que ela tenha sido criada explicitamente (o que a mantém em `emptyFolders`).

`moveNote` não tem um endpoint dedicado de "mover" na API do GitHub: o cliente cria o arquivo no novo path e deleta o antigo (duas chamadas). Isso significa que mover uma nota gera dois commits no repositório, não um "rename" atômico.

## Sincronização com GitHub

Fluxo de **pull**:
1. `GET /repos/{owner}/{repo}/git/refs/heads/{branch}` — pega o commit da branch
2. `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=true` — lista todos os arquivos, filtra `.md` e `.folder`
3. Para cada arquivo `.md`, `GET /repos/{owner}/{repo}/contents/{path}` — busca conteúdo (base64) e `sha` do blob
4. Arquivos `.folder` não têm conteúdo lido — só o path é usado para reconstruir a lista de pastas vazias

Fluxo de **push** (`putFile`):
- `PUT /repos/{owner}/{repo}/contents/{path}` com o `sha` atual do arquivo (necessário para update; omitido em criação)

O `sha` de cada nota é guardado localmente e usado como controle de concorrência otimista — sem ele, o GitHub rejeita updates em arquivos que já existem.

### Limitações conhecidas

- **Sem merge de conflitos**: se a mesma nota for editada em dois lugares (ex: outro cliente também sincronizado) entre um pull e um push, o último push sobrescreve o remoto. O `sha` desatualizado faria o GitHub rejeitar a escrita nesse caso, mas hoje não há fluxo de resolução — o erro só aparece no `syncStatus`.
- **Sync manual**: não há polling ou webhook, o usuário decide quando fazer pull/push (botões na topbar, ou `Ctrl+S` para push da nota atual).
- **Rate limit da API REST do GitHub**: 5000 requisições/hora por token autenticado. Repos muito grandes (centenas de notas) fazem várias chamadas no pull (uma por arquivo).

## Editor (CodeMirror 6)

`src/components/Editor.tsx` monta uma instância de `EditorView` por nota ativa (recriada ao trocar `path`, via `key` no React). Extensões principais:

- `@codemirror/lang-markdown` — highlight de sintaxe markdown
- `closeBrackets()` — fecha `[[` automaticamente
- `wikilinkAutocomplete()` — autocomplete customizado (ver `src/lib/wikilinkAutocomplete.ts`)
- Tema customizado via `EditorView.theme()` para cursor, seleção e dropdown de autocomplete usarem as CSS variables do tema ativo (`--accent`, `--selection-bg`, etc), garantindo contraste tanto no tema claro quanto escuro
- Keybinding `Mod-s` com `preventDefault: true` — bloqueia o "Salvar página" nativo do browser quando o foco está no editor (o disparo real do save é feito por um listener global em `App.tsx`, que cobre o atalho mesmo com foco fora do editor)

Scroll sincronizado no modo split: o editor e o preview reportam sua posição de scroll como uma fração (0 a 1) via `onScroll`, e recebem `scrollToFraction` do lado oposto. Usa fração em vez de pixels porque o conteúdo markdown puro e o HTML renderizado têm alturas diferentes.

## Preview e sanitização

`src/lib/markdown.ts` processa wikilinks *antes* de passar pelo `marked` (senão `[[` colide com a sintaxe `[texto](url)` do markdown): substitui cada `[[nome]]` por um placeholder, roda o `marked.parse`, e substitui os placeholders de volta por `<a data-note-name="...">`. O HTML final passa por `DOMPurify.sanitize` — importante porque o conteúdo das notas pode vir de um repositório GitHub arbitrário, então é tratado como entrada não confiável antes de ir para `dangerouslySetInnerHTML`.

Links para notas inexistentes recebem a classe `wikilink-missing` (cor de destaque diferente), igual ao comportamento do Obsidian para links quebrados.

## Segurança

- O Personal Access Token do GitHub é armazenado em `localStorage`, nunca transmitido a nenhum servidor além da API oficial do GitHub (`api.github.com`).
- Recomenda-se sempre um token **fine-grained** com escopo restrito a um único repositório e permissão mínima necessária (`Contents: Read and write`), em vez de um token clássico com acesso a todos os repositórios da conta.
- Todo HTML gerado a partir de conteúdo de notas passa por sanitização (DOMPurify) antes de ser inserido no DOM.
