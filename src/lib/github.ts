import { Octokit } from '@octokit/rest'
import type { GitHubConfig } from './types'
import { wsKey } from './workspace'

const CONFIG_KEY = wsKey('github-config')

export function saveGitHubConfig(config: GitHubConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function loadGitHubConfig(): GitHubConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY)
  return raw ? JSON.parse(raw) : null
}

export function clearGitHubConfig() {
  localStorage.removeItem(CONFIG_KEY)
}

export interface RemoteFile {
  path: string
  content: string
  sha: string
}

/** Arquivo (blob) presente na árvore git da branch */
export interface TreeEntry {
  path: string
  sha: string
  size: number
  /** modo git (100644 normal, 100755 executável, 120000 symlink): preservado ao reescrever */
  mode: string
}

/** Estado do repo num commit: base para detectar mudanças (pull incremental) e para commitar
 * em cima (push em um commit só). Repo vazio (sem commits) tem commitSha/treeSha vazios. */
export interface RemoteSnapshot {
  commitSha: string
  treeSha: string
  entries: TreeEntry[]
}

/** Alteração de um arquivo num commit em lote: escrever texto, apagar, ou apontar para um blob
 * já existente pelo sha (renomear/mover sem baixar o conteúdo, inclusive arquivos binários) */
export type FileChange =
  | { path: string; content: string }
  | { path: string; delete: true }
  | { path: string; sha: string }

type GitMode = '100644' | '100755' | '040000' | '160000' | '120000'

/** Erro de "não é fast-forward" ao atualizar a ref: outro dispositivo commitou no meio */
export class StaleSnapshotError extends Error {
  constructor() {
    super('A branch mudou durante o envio')
  }
}

export interface RemoteRepo {
  owner: string
  repo: string
  defaultBranch: string
  private: boolean
}

/** Troca o `code` do OAuth Web Flow por um access_token, via o worker proxy (necessário por CORS). */
export async function exchangeOAuthCode(
  workerUrl: string,
  code: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      return { ok: false, error: data.error || 'Falha ao obter token' }
    }
    return { ok: true, token: data.access_token }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro de rede'
    return { ok: false, error: message }
  }
}

/** Lista os repositórios que o usuário autenticado tem acesso (para o dropdown pós-login). */
export async function listUserRepos(token: string): Promise<RemoteRepo[]> {
  const octokit = new Octokit({ auth: token })
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: 'updated',
  })
  return repos.map((r) => ({
    owner: r.owner.login,
    repo: r.name,
    defaultBranch: r.default_branch,
    private: r.private,
  }))
}

/** Cliente fino sobre a API REST do GitHub, focado em ler/escrever arquivos .md de um repo */
export class GitHubClient {
  private octokit: Octokit
  private config: GitHubConfig

  constructor(config: GitHubConfig) {
    this.config = config
    this.octokit = new Octokit({ auth: config.token })
  }

  async verifyAccess(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.octokit.repos.get({
        owner: this.config.owner,
        repo: this.config.repo,
      })
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { ok: false, error: message }
    }
  }

  /** Soma o tamanho (em bytes) de todos os arquivos do repo na branch atual, usando o `size`
   * de cada blob já presente na árvore git (sem precisar baixar o conteúdo de cada arquivo). */
  async getRepoUsageBytes(): Promise<number> {
    const { entries } = await this.getSnapshot()
    return sumSizes(entries)
  }

  /** sha do commit atual da branch (1 request); '' se o repositório ainda não tem commits */
  async getHeadSha(): Promise<string> {
    try {
      const { data } = await this.octokit.git.getRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `heads/${this.config.branch}`,
      })
      return data.object.sha
    } catch (err) {
      // 409 = repositório vazio (sem nenhum commit ainda)
      if (statusOf(err) === 409) return ''
      throw err
    }
  }

  /** Commit atual da branch + árvore recursiva (2 requests, independente do nº de arquivos).
   * Passe `commitSha` se já souber o head, para pular a leitura da ref. */
  async getSnapshot(commitSha?: string): Promise<RemoteSnapshot> {
    commitSha ??= await this.getHeadSha()
    if (!commitSha) return { commitSha: '', treeSha: '', entries: [] }

    const { data: tree } = await this.octokit.git.getTree({
      owner: this.config.owner,
      repo: this.config.repo,
      tree_sha: commitSha,
      recursive: 'true',
    })

    return {
      commitSha,
      treeSha: tree.sha,
      entries: tree.tree
        .filter((item) => item.type === 'blob' && item.path && item.sha)
        .map((item) => ({ path: item.path!, sha: item.sha!, size: item.size ?? 0, mode: item.mode ?? '100644' })),
    }
  }

  /** Conteúdo de um blob como data URL (visualizar imagens e outros binários) */
  async getBlobDataUrl(sha: string, path: string): Promise<string> {
    const { data } = await this.octokit.git.getBlob({
      owner: this.config.owner,
      repo: this.config.repo,
      file_sha: sha,
    })
    return `data:${guessMimeType(path)};base64,${data.content.replace(/\n/g, '')}`
  }

  async listBranches(): Promise<string[]> {
    const branches = await this.octokit.paginate(this.octokit.repos.listBranches, {
      owner: this.config.owner,
      repo: this.config.repo,
      per_page: 100,
    })
    return branches.map((b) => b.name)
  }

  async getDefaultBranch(): Promise<string> {
    const { data } = await this.octokit.repos.get({ owner: this.config.owner, repo: this.config.repo })
    return data.default_branch
  }

  /** cria `name` apontando para o commit `fromSha` */
  async createBranch(name: string, fromSha: string): Promise<void> {
    await this.octokit.git.createRef({
      owner: this.config.owner,
      repo: this.config.repo,
      ref: `refs/heads/${name}`,
      sha: fromSha,
    })
  }

  /** PR aberto da branch atual, se existir */
  async findOpenPullRequest(): Promise<{ url: string; number: number } | null> {
    const { data } = await this.octokit.pulls.list({
      owner: this.config.owner,
      repo: this.config.repo,
      head: `${this.config.owner}:${this.config.branch}`,
      state: 'open',
      per_page: 1,
    })
    return data[0] ? { url: data[0].html_url, number: data[0].number } : null
  }

  /** abre um PR da branch atual para `base`; se já existir um aberto, retorna ele */
  async createPullRequest(title: string, body: string, base: string): Promise<{ url: string; number: number }> {
    try {
      const { data } = await this.octokit.pulls.create({
        owner: this.config.owner,
        repo: this.config.repo,
        head: this.config.branch,
        base,
        title,
        body,
      })
      return { url: data.html_url, number: data.number }
    } catch (err) {
      if (statusOf(err) === 422) {
        const existing = await this.findOpenPullRequest()
        if (existing) return existing
      }
      throw err
    }
  }

  /** Lê o conteúdo de texto de um blob pelo sha (sha vem da árvore, então é exato e cacheável) */
  async getBlobText(sha: string): Promise<string> {
    const { data } = await this.octokit.git.getBlob({
      owner: this.config.owner,
      repo: this.config.repo,
      file_sha: sha,
    })
    return decodeBase64Utf8(data.content)
  }

  /** Aplica várias alterações em UM commit em cima do snapshot informado (Git Data API).
   * Lança StaleSnapshotError se a branch andou desde o snapshot (o chamador relê e tenta de novo).
   * Retorna o sha do blob de cada arquivo escrito, para atualizar o estado local sem novo request. */
  async commitChanges(
    base: RemoteSnapshot,
    changes: FileChange[],
    message?: string
  ): Promise<CommitResult> {
    const remoteSha = new Map(base.entries.map((e) => [e.path, e.sha]))
    const modeByPath = new Map(base.entries.map((e) => [e.path, e.mode]))
    const modeBySha = new Map(base.entries.map((e) => [e.sha, e.mode]))
    const isContent = (c: FileChange): c is { path: string; content: string } => 'content' in c
    const isCopy = (c: FileChange): c is { path: string; sha: string } => 'sha' in c

    const allWrites = changes.filter(isContent)
    const hashed = canHashLocally()
      ? new Map(await Promise.all(allWrites.map(async (w) => [w.path, await gitBlobSha(w.content)] as const)))
      : null

    const effective = changes.filter((c) => {
      // deletar um path que não existe no remoto faz a API falhar; descarta essas remoções
      if ('delete' in c) return remoteSha.has(c.path)
      // conteúdo idêntico ao remoto: não precisa entrar no commit (evita commits vazios)
      if (isCopy(c)) return remoteSha.get(c.path) !== c.sha
      return !(hashed && hashed.get(c.path) === remoteSha.get(c.path))
    })
    const copies = new Map(changes.filter(isCopy).map((c) => [c.path, c.sha]))
    if (effective.length === 0) {
      return { commitSha: base.commitSha, blobShas: new Map([...(hashed ?? []), ...copies]) }
    }

    const writes = effective.filter(isContent)
    const commitMessage = message?.trim() || buildCommitMessage(effective, new Set(remoteSha.keys()))

    // repo vazio: não há commit base para a Git Data API; cria os arquivos pela Contents API
    // (cópias por sha não existem aqui: um repo vazio não tem blobs)
    if (!base.commitSha) {
      const shas = new Map<string, string>()
      for (const w of writes) shas.set(w.path, await this.putFile(w.path, w.content))
      return { commitSha: '', blobShas: shas }
    }

    // mantém o modo do arquivo (ex: script executável); cópias herdam o modo do blob de origem
    const modeFor = (c: FileChange): GitMode =>
      (modeByPath.get(c.path) ?? (isCopy(c) ? modeBySha.get(c.sha) : undefined) ?? '100644') as GitMode

    const { owner, repo, branch } = this.config
    const { data: tree } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: base.treeSha,
      tree: effective.map((c) => {
        if ('delete' in c) return { path: c.path, mode: '100644' as const, type: 'blob' as const, sha: null }
        if (isCopy(c)) return { path: c.path, mode: modeFor(c), type: 'blob' as const, sha: c.sha }
        return { path: c.path, mode: modeFor(c), type: 'blob' as const, content: c.content }
      }),
    })
    const { data: commit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: tree.sha,
      parents: [base.commitSha],
    })
    try {
      await this.octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha, force: false })
    } catch (err) {
      if (statusOf(err) === 422) throw new StaleSnapshotError()
      throw err
    }

    const written = hashed ?? (await this.readBlobShas(tree.sha, writes))
    return { commitSha: commit.sha, blobShas: new Map([...written, ...copies]) }
  }

  /** Fallback sem WebCrypto (ex: app servido por http sem TLS): lê os shas da árvore nova */
  private async readBlobShas(
    treeSha: string,
    writes: { path: string; content: string }[]
  ): Promise<Map<string, string>> {
    const shas = new Map<string, string>()
    const { data } = await this.octokit.git.getTree({
      owner: this.config.owner,
      repo: this.config.repo,
      tree_sha: treeSha,
      recursive: 'true',
    })
    const byPath = new Map(data.tree.map((i) => [i.path, i.sha]))
    for (const w of writes) {
      const sha = byPath.get(w.path)
      if (sha) shas.set(w.path, sha)
    }
    return shas
  }

  async getFileContent(path: string): Promise<RemoteFile> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      ref: this.config.branch,
    })

    if (Array.isArray(data) || data.type !== 'file' || !data.content) {
      throw new Error(`"${path}" não é um arquivo válido`)
    }

    const content = decodeBase64Utf8(data.content)
    return { path, content, sha: data.sha }
  }

  /** Cria ou atualiza um arquivo. Se sha for omitido, tenta criar; caso já exista, o GitHub retorna erro. */
  async putFile(path: string, content: string, sha?: string): Promise<string> {
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      message: sha ? `Update ${path}` : `Create ${path}`,
      content: encodeBase64Utf8(content),
      sha,
      branch: this.config.branch,
    })
    return data.content!.sha!
  }

  /** Cria ou atualiza um arquivo binário (imagens e outros anexos), sem passar pelo encoding UTF-8. */
  async putBinaryFile(path: string, blob: Blob, sha?: string): Promise<string> {
    const base64 = await blobToBase64(blob)
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      message: sha ? `Update ${path}` : `Create ${path}`,
      content: base64,
      sha,
      branch: this.config.branch,
    })
    return data.content!.sha!
  }

  /** Lê um arquivo binário (imagem/anexo) e retorna como data URL, para uso direto em `<img src>`.
   * Usa a Contents API autenticada em vez de raw.githubusercontent.com, o que funciona também
   * para repositórios privados (a URL raw pública não tem acesso ao token do usuário). */
  async getBinaryFileAsDataUrl(path: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      ref: this.config.branch,
    })

    if (Array.isArray(data) || data.type !== 'file' || !data.content) {
      throw new Error(`"${path}" não é um arquivo válido`)
    }

    const mime = guessMimeType(path)
    return `data:${mime};base64,${data.content.replace(/\n/g, '')}`
  }

  async deleteFile(path: string, sha: string): Promise<void> {
    await this.octokit.repos.deleteFile({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      message: `Delete ${path}`,
      sha,
      branch: this.config.branch,
    })
  }
}

export interface CommitResult {
  /** sha do commit criado (ou o do snapshot base, se nada mudou; '' em repo vazio) */
  commitSha: string
  /** path -> sha do blob de cada arquivo escrito */
  blobShas: Map<string, string>
}

/** Mensagem de commit legível a partir das alterações, ex:
 * "kyanite: update notas/a.md", "kyanite: rename a.md → b.md", "kyanite: update 3 files, delete 1 file" */
export function buildCommitMessage(changes: FileChange[], existing: Set<string>): string {
  const deletes = changes.filter((c) => 'delete' in c)
  const writes = changes.filter((c) => !('delete' in c))
  const created = writes.filter((c) => !existing.has(c.path))
  const updated = writes.filter((c) => existing.has(c.path))

  if (changes.length === 1) {
    const verb = deletes.length ? 'delete' : created.length ? 'create' : 'update'
    return `kyanite: ${verb} ${changes[0].path}`
  }
  if (created.length === 1 && deletes.length === 1 && updated.length === 0) {
    return `kyanite: rename ${deletes[0].path} → ${created[0].path}`
  }

  const count = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`
  const parts: string[] = []
  if (updated.length) parts.push(`update ${count(updated.length)}`)
  if (created.length) parts.push(`create ${count(created.length)}`)
  if (deletes.length) parts.push(`delete ${count(deletes.length)}`)
  return `kyanite: ${parts.join(', ')}`
}

function canHashLocally(): boolean {
  return Boolean(globalThis.crypto?.subtle)
}

export function statusOf(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status
}

export function sumSizes(entries: TreeEntry[]): number {
  return entries.reduce((total, e) => total + e.size, 0)
}

/** sha1 de "blob <tamanho>\0<conteúdo>": o mesmo id que o git atribui ao arquivo */
async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content)
  const header = new TextEncoder().encode(`blob ${body.length}\0`)
  const buf = new Uint8Array(header.length + body.length)
  buf.set(header)
  buf.set(body, header.length)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Executa `fn` sobre os itens com no máximo `limit` chamadas simultâneas */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
}

function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // FileReader.readAsDataURL retorna "data:<mime>;base64,<dados>" — descarta o prefixo
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
