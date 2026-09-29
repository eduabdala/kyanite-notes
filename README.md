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

- [ ] Resolução de conflitos ao fazer pull com mudanças locais não sincronizadas
- [ ] Empacotamento desktop via Tauri
- [ ] PWA (uso offline completo na versão web)
- [ ] Grafo visual de notas (visualização interativa das conexões entre notas, estilo grafo do Obsidian)
- [ ] Canvas (quadro visual livre para organizar notas, texto e conexões espacialmente)
- [ ] Sistema de plugins (API para extensões de terceiros, como no Obsidian)
- [ ] Temas personalizados (além de claro/escuro, permitir criar/importar paletas de cores)
- [ ] Login simplificado entre dispositivos (ver notas abaixo)

### Notas: login simplificado entre dispositivos

Hoje conectar ao GitHub exige gerar um Personal Access Token manualmente e colar owner/repo/branch/token em cada dispositivo. Investigação sobre alternativas mais simples, mantendo a arquitetura descentralizada (sem backend próprio guardando dados do usuário):

- **OAuth Device Flow do GitHub**: mostraria um código curto pro usuário autorizar em outro dispositivo (`github.com/login/device`), sem copiar/colar token manualmente. Porém o endpoint `github.com/login/oauth/access_token` **não tem CORS habilitado** — é uma restrição de segurança do próprio GitHub, documentada inclusive pelo Octokit (`@octokit/auth-oauth-device` "does not work in browsers due to CORS constraints"). Não existe forma de completar esse fluxo 100% client-side.
- Isso vale para **qualquer OAuth flow do GitHub** (Device Flow ou Web Flow), com OAuth App ou GitHub App: a troca de código por token sempre exige uma chamada server-side.
- Alternativa que mantém zero-backend: **transferência de config via QR code / código de pareamento** — exportar a config atual (token + owner + repo + branch) como um código que pode ser escaneado/colado em outro dispositivo, evitando digitar tudo de novo manualmente. Não é OAuth, só transporte da config local entre dispositivos.
- Alternativa com OAuth real: um micro-proxy serverless (ex: Vercel Function ou Cloudflare Worker) que só repassa a troca de código→token pro GitHub, sem guardar nada. Resolve a UX (usuário nunca vê/copia um PAT) mas deixa de ser 100% descentralizado, já que essa etapa pontual passa pela sua infra.

Referências: [octokit/auth-oauth-user.js](https://github.com/octokit/auth-oauth-user.js/), [stackoverflow: cors issue on github oauth](https://stackoverflow.com/questions/42150075/cors-issue-on-github-oauth/42150336).

## Stack

React + TypeScript + Vite, CodeMirror 6, Zustand, Octokit, `marked` + DOMPurify para o preview.
