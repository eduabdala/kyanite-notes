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
