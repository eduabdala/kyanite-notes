# Kyanite

Editor de notas estilo Obsidian, com wikilinks, backlinks e sincronização direta com um repositório do GitHub. Roda no navegador (web) e pode ser empacotado como app desktop (Tauri) sem mudar o código.

## Features

- Editor markdown (CodeMirror 6) com highlight de sintaxe e autocomplete de `[[wikilinks]]`
- Preview renderizado, com modo lado a lado (split) e scroll sincronizado
- Backlinks automáticos: veja quais notas linkam para a nota atual
- Estrutura de pastas (criar, aninhar, mover notas e excluir), igual ao Obsidian
- Busca simples por nome/conteúdo na sidebar
- Sincronização com GitHub via API REST (funciona com repositórios públicos e privados)
- Autosave local (localStorage) mesmo sem conexão com o GitHub
- Atalho `Ctrl+S` / `Cmd+S` para enviar a nota atual ao repositório
- Tema claro, escuro ou seguindo o sistema operacional, com paleta azul inspirada na pedra kyanite
- Interface em português e inglês
- Uso do repositório (notas + anexos) exibido nas configurações, com percentual sobre um limite de referência de 10GB

## Rodando localmente

Requer Node 18+.

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

Build de produção:

```bash
npm run build
npm run preview
```

## Build desktop (Tauri)

O mesmo código roda como app nativo de desktop (Windows e Linux) via [Tauri](https://tauri.app), sem nenhuma mudança no `src/`.

### Pré-requisitos (uma vez por máquina)

- **Rust**: instale via [rustup.rs](https://rustup.rs) (`winget install Rustlang.Rustup` no Windows)
- **Windows**: Microsoft C++ Build Tools, com o componente "Desktop development with C++" (`winget install Microsoft.VisualStudio.2022.BuildTools`)
- **Linux**: `webkit2gtk`, `libayatana-appindicator3-dev` e demais dependências do WebView — veja a lista completa em [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/#linux)

Depois de instalar o Rust, feche e reabra o terminal para o PATH atualizar.

### Rodando em modo dev (janela nativa com hot reload)

```bash
npm run desktop:dev
```

### Gerando o instalador/executável

```bash
npm run desktop:build
```

Gera, em `src-tauri/target/release/bundle/`:
- Windows: instalador `.exe` (NSIS)
- Linux: `.deb` e `.AppImage`

A versão exibida no instalador vem de `src-tauri/tauri.conf.json` (campo `version`) — atualize junto com `APP_VERSION` em `src/lib/version.ts` a cada release.

### Build Linux via Docker

Para gerar o `.deb`/`.AppImage` sem instalar Rust na máquina local, use o `Dockerfile` na raiz do projeto (requer Docker 23+ com BuildKit):

```bash
DOCKER_BUILDKIT=1 docker build --target artifacts --output dist-linux .
```

Os instaladores aparecem em `./dist-linux/deb/` e `./dist-linux/appimage/`.

### Build automático via GitHub Actions

O workflow [`.github/workflows/desktop-build.yml`](./.github/workflows/desktop-build.yml) builda os instaladores Windows e Linux automaticamente, cada um na sua runner nativa (sem cross-compile). Ele dispara:
- manualmente, pela aba **Actions → Build desktop (Windows + Linux) → Run workflow**
- automaticamente, ao criar uma tag `v*` (ex: `git tag v0.5.0 && git push --tags`)

Os instaladores ficam disponíveis como artifacts do run (download direto na aba Actions). O workflow não cria uma Release automaticamente — se quiser isso, dá para trocar os passos de `upload-artifact` por [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action), que já integra com GitHub Releases.

## Conectando ao GitHub

O Kyanite não usa git por trás — ele lê e escreve arquivos `.md` direto via API REST do GitHub, usando um **Personal Access Token**. Isso funciona igual em repositórios públicos ou privados.

1. Crie um token em [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) (fine-grained)
2. Em **Repository access**, selecione o repositório que vai guardar as notas
3. Em **Permissions → Contents**, marque **Read and write**
4. No Kyanite, clique em "Conectar GitHub" na barra superior e informe:
   - Owner (seu usuário ou organização)
   - Nome do repositório
   - Branch (padrão `main`)
   - O token gerado

O token fica salvo apenas no `localStorage` do navegador, nunca é enviado a nenhum servidor além da API do GitHub.

Se a conexão falhar com "Repositório não encontrado (ou sem permissão)": confirme que o token tem esse repositório específico selecionado no escopo, e que a permissão de Contents está como Read and write. Repos de organização podem exigir aprovação de um admin para tokens fine-grained — nesse caso, um token clássico com escopo `repo` também funciona.

## Arquitetura

Ver [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) para detalhes sobre a estrutura do código, o modelo de sincronização e como o grafo de links é calculado.

## Roadmap

- [x] Resolução de conflitos ao fazer pull com mudanças locais não sincronizadas (diff visual, escolher versão local ou remota)
- [x] Empacotamento desktop via Tauri (Windows e Linux)
- [ ] PWA (uso offline completo na versão web)
- [ ] Grafo visual de notas (visualização interativa das conexões entre notas, estilo grafo do Obsidian)
- [ ] Canvas (quadro visual livre para organizar notas, texto e conexões espacialmente)
- [ ] Sistema de plugins (API para extensões de terceiros, como no Obsidian)
- [ ] Temas personalizados (além de claro/escuro, permitir criar/importar paletas de cores)
- [ ] Login simplificado entre dispositivos (ver notas abaixo)
- [ ] Busca fuzzy (tipo `Ctrl+P`) por nome/conteúdo das notas
- [x] Tags (`#tag` inline e `tags:` no frontmatter) com painel de navegação na sidebar
- [ ] Templates de notas
- [ ] Command palette (`Ctrl+K`) para ações rápidas
- [x] Diff visual entre versão local e remota antes do push
- [ ] Exportar nota/vault para PDF ou HTML standalone
- [x] Suporte a frontmatter YAML (metadados como tags, data, aliases), com `created` como padrão automático em notas novas
- [ ] Modal de atalhos de teclado (`?`)
- [ ] Testes automatizados (Vitest) para a lógica em `src/lib`
- [x] Navegação por tags em árvore, estilo plugin Tag Folder do Obsidian
- [ ] Visualização interativa de arquivos (grafo/canvas navegável)
- [ ] Exportar nota/vault para EPUB, além de PDF
- [x] Diálogos de confirmação com a identidade visual do app, no lugar dos alerts nativos do navegador
- [x] Integração com multimídia: cole ou arraste imagens no editor (`![[nome]]`), com compressão automática (resize + WebP) antes do upload para o GitHub
- [ ] Sincronização com banco de dados (alternativa/complemento ao GitHub como storage)

### Notas: login simplificado entre dispositivos

Hoje conectar ao GitHub exige gerar um Personal Access Token manualmente e colar owner/repo/branch/token em cada dispositivo. Investigação sobre alternativas mais simples, mantendo a arquitetura descentralizada (sem backend próprio guardando dados do usuário):

- **OAuth Device Flow do GitHub**: mostraria um código curto pro usuário autorizar em outro dispositivo (`github.com/login/device`), sem copiar/colar token manualmente. Porém o endpoint `github.com/login/oauth/access_token` **não tem CORS habilitado** — é uma restrição de segurança do próprio GitHub, documentada inclusive pelo Octokit (`@octokit/auth-oauth-device` "does not work in browsers due to CORS constraints"). Não existe forma de completar esse fluxo 100% client-side.
- Isso vale para **qualquer OAuth flow do GitHub** (Device Flow ou Web Flow), com OAuth App ou GitHub App: a troca de código por token sempre exige uma chamada server-side.
- Alternativa que mantém zero-backend: **transferência de config via QR code / código de pareamento** — exportar a config atual (token + owner + repo + branch) como um código que pode ser escaneado/colado em outro dispositivo, evitando digitar tudo de novo manualmente. Não é OAuth, só transporte da config local entre dispositivos.
- Alternativa com OAuth real: um micro-proxy serverless (ex: Vercel Function ou Cloudflare Worker) que só repassa a troca de código→token pro GitHub, sem guardar nada. Resolve a UX (usuário nunca vê/copia um PAT) mas deixa de ser 100% descentralizado, já que essa etapa pontual passa pela sua infra.

Referências: [octokit/auth-oauth-user.js](https://github.com/octokit/auth-oauth-user.js/), [stackoverflow: cors issue on github oauth](https://stackoverflow.com/questions/42150075/cors-issue-on-github-oauth/42150336).

## Stack

React + TypeScript + Vite, CodeMirror 6, Zustand, Octokit, `marked` + DOMPurify para o preview.
