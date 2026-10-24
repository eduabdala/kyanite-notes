/** Workspaces: cada um aponta para um repositório próprio e guarda notas, abas, config do
 * GitHub e estado de sync separados no localStorage (prefixo `kyanite:ws:<id>:`).
 * O workspace "default" usa as chaves sem prefixo, então dados de versões anteriores continuam
 * nele sem migração. Preferências de aparência e layout são globais (valem para todos).
 * Trocar de workspace recarrega a página: todas as stores leem o localStorage ao iniciar. */

export type WorkspaceKind = 'notes' | 'code'

export interface Workspace {
  id: string
  /** vazio no workspace padrão: a UI mostra um nome traduzido */
  name: string
  /** notes: só .md, com wikilinks/tags/plugins sincronizados. code: todos os arquivos de texto */
  kind: WorkspaceKind
}

export const DEFAULT_WORKSPACE_ID = 'default'

const LIST_KEY = 'kyanite:workspaces'
const ACTIVE_KEY = 'kyanite:active-workspace'
/** sessionStorage: pede para abrir o modal de conexão (com o token a reaproveitar) após a troca */
const CONNECT_HINT_KEY = 'kyanite:connect-hint'

const DEFAULT_WORKSPACE: Workspace = { id: DEFAULT_WORKSPACE_ID, name: '', kind: 'notes' }

export function loadWorkspaces(): Workspace[] {
  let list: Workspace[] = []
  try {
    const raw = localStorage.getItem(LIST_KEY)
    if (raw) list = JSON.parse(raw)
  } catch {
    list = []
  }
  if (!Array.isArray(list)) list = []
  if (!list.some((w) => w.id === DEFAULT_WORKSPACE_ID)) list = [DEFAULT_WORKSPACE, ...list]
  return list
}

function saveWorkspaces(list: Workspace[]) {
  localStorage.setItem(LIST_KEY, JSON.stringify(list))
}

function resolveActive(): Workspace {
  const id = localStorage.getItem(ACTIVE_KEY) ?? DEFAULT_WORKSPACE_ID
  return loadWorkspaces().find((w) => w.id === id) ?? DEFAULT_WORKSPACE
}

/** workspace ativo; fixo durante a vida da página (trocar recarrega) */
export const ACTIVE_WORKSPACE: Workspace = resolveActive()
export const IS_CODE_WORKSPACE = ACTIVE_WORKSPACE.kind === 'code'

/** chave de localStorage de um workspace (por padrão, o ativo) */
export function wsKey(base: string, workspaceId: string = ACTIVE_WORKSPACE.id): string {
  return workspaceId === DEFAULT_WORKSPACE_ID ? `kyanite:${base}` : `kyanite:ws:${workspaceId}:${base}`
}

export function switchWorkspace(id: string) {
  localStorage.setItem(ACTIVE_KEY, id)
  window.location.reload()
}

export function createWorkspace(name: string, kind: WorkspaceKind): Workspace {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const workspace: Workspace = { id, name: name.trim(), kind }
  saveWorkspaces([...loadWorkspaces(), workspace])
  return workspace
}

export function renameWorkspace(id: string, name: string) {
  saveWorkspaces(loadWorkspaces().map((w) => (w.id === id ? { ...w, name: name.trim() } : w)))
}

/** Remove o workspace e todos os dados locais dele (o repositório no GitHub não é tocado) */
export function deleteWorkspace(id: string) {
  if (id === DEFAULT_WORKSPACE_ID) return
  const prefix = `kyanite:ws:${id}:`
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix)) localStorage.removeItem(key)
  }
  saveWorkspaces(loadWorkspaces().filter((w) => w.id !== id))
  if (ACTIVE_WORKSPACE.id === id) switchWorkspace(DEFAULT_WORKSPACE_ID)
}

/** repositório conectado a um workspace (para exibir no seletor), sem expor o token */
export function workspaceRepoLabel(id: string): string | null {
  try {
    const raw = localStorage.getItem(wsKey('github-config', id))
    if (!raw) return null
    const cfg = JSON.parse(raw) as { owner?: string; repo?: string }
    return cfg.owner && cfg.repo ? `${cfg.owner}/${cfg.repo}` : null
  } catch {
    return null
  }
}

export function setConnectHint(token: string | null) {
  sessionStorage.setItem(CONNECT_HINT_KEY, JSON.stringify({ token }))
}

/** lê e apaga o pedido de conexão deixado antes da troca de workspace */
export function takeConnectHint(): { token: string | null } | null {
  const raw = sessionStorage.getItem(CONNECT_HINT_KEY)
  if (!raw) return null
  sessionStorage.removeItem(CONNECT_HINT_KEY)
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ---- arquivos ----

export const isMarkdownPath = (path: string) => path.toLowerCase().endsWith('.md')

/** arquivos acima disso não são abertos no editor (ficam lentos e estouram o localStorage) */
export const MAX_TEXT_FILE_BYTES = 1_000_000

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'icns', 'avif', 'tif', 'tiff', 'psd',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'tar', 'jar', 'war', 'apk', 'aab', 'ipa',
  'exe', 'dll', 'so', 'dylib', 'a', 'lib', 'o', 'obj', 'class', 'pyc', 'wasm', 'bin', 'dat',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'wav', 'ogg', 'flac', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'sqlite', 'db', 'keystore', 'jks', 'p12',
])

/** em workspaces de código: arquivo que aparece na árvore (texto ou binário) */
export function isVisibleCodeFile(path: string): boolean {
  return !path.startsWith('.git/')
}

/** em workspaces de código: arquivo de texto que pode ser aberto no editor */
export function isEditableCodeFile(path: string, size: number): boolean {
  const fileName = path.split('/').pop() ?? path
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
  return !BINARY_EXTENSIONS.has(ext) && size <= MAX_TEXT_FILE_BYTES
}
