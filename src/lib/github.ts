import { Octokit } from '@octokit/rest'
import type { GitHubConfig } from './types'

const CONFIG_KEY = 'kyanite:github-config'

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

  /** Lista recursivamente todos os arquivos .md e marcadores de pasta (.folder) do repo */
  async listVaultFiles(): Promise<{ path: string; sha: string }[]> {
    const { data: refData } = await this.octokit.git.getRef({
      owner: this.config.owner,
      repo: this.config.repo,
      ref: `heads/${this.config.branch}`,
    })

    const { data: tree } = await this.octokit.git.getTree({
      owner: this.config.owner,
      repo: this.config.repo,
      tree_sha: refData.object.sha,
      recursive: 'true',
    })

    return tree.tree
      .filter(
        (item) =>
          item.type === 'blob' && item.path && (item.path.endsWith('.md') || item.path.endsWith('/.folder'))
      )
      .map((item) => ({ path: item.path!, sha: item.sha! }))
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
