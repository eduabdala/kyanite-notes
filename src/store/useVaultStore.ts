import { create } from 'zustand'
import {
  GitHubClient,
  StaleSnapshotError,
  clearGitHubConfig,
  loadGitHubConfig,
  mapLimit,
  saveGitHubConfig,
  sumSizes,
  type FileChange,
  type RemoteSnapshot,
} from '../lib/github'
import {
  loadLocalNotes,
  saveLocalNotes,
  loadLocalFolders,
  saveLocalFolders,
  pathToName,
  nameToPath,
  fileNameOf,
  joinPath,
  buildFolderTree,
  FOLDER_MARKER,
} from '../lib/vault'
import { IS_CODE_WORKSPACE, isEditableCodeFile, isMarkdownPath, isVisibleCodeFile, wsKey } from '../lib/workspace'
import { buildLinkGraph, renameLinksAcrossNotes } from '../lib/wikilinks'
import { withCreatedDate } from '../lib/frontmatter'
import { buildTagTree } from '../lib/tags'
import { diffLines, isDiffEmpty } from '../lib/diff'
import { compressImage } from '../lib/imageCompress'
import { buildAttachmentFileName, attachmentPath } from '../lib/attachments'
import {
  DEFAULT_PLUGIN_CONFIG,
  PLUGIN_CONFIG_PATH,
  loadLocalPluginConfig,
  saveLocalPluginConfig,
  parsePluginConfig,
  serializePluginConfig,
  type PluginConfig,
  type PluginId,
} from '../lib/plugins'
import {
  KANBAN_BOARD_PATH,
  emptyCollection,
  parseCollection,
  serializeCollection,
  retargetNoteLinks,
  type KanbanCollection,
} from '../lib/kanban'
import {
  AGENDA_PATH,
  emptyCollection as emptyAgendaCollection,
  parseCollection as parseAgendaCollection,
  serializeCollection as serializeAgendaCollection,
  type AgendaCollection,
} from '../lib/agenda'
import {
  classifyError,
  loadAutoSync,
  loadMetaShas,
  loadPendingDeletes,
  loadPendingFolders,
  loadPendingMeta,
  loadRemoteHead,
  resetRemoteTracking,
  saveAutoSync,
  saveMetaShas,
  savePendingDeletes,
  savePendingFolders,
  savePendingMeta,
  saveRemoteHead,
  type PendingDelete,
} from '../lib/syncState'
import type { Preferences } from '../lib/preferences'
import { useConflictStore } from './useConflictStore'
import { setTabDirtyCheck, useTabsStore } from './useTabsStore'
import type { GitHubConfig, LinkGraph, Note, TreeNode } from '../lib/types'

type SyncStatus = 'idle' | 'syncing' | 'error' | 'auth-error' | 'offline'

export interface CommitOptions {
  /** só esses paths entram no commit (padrão: tudo que está pendente) */
  paths?: Set<string>
  /** mensagem do commit (padrão: gerada a partir das alterações) */
  message?: string
}

export interface SearchResult {
  path: string
  /** 1-based */
  line: number
  column: number
  text: string
}

const MAX_SEARCH_RESULTS = 500
/** conteúdo baixado para a busca (sha -> texto): só em memória, fora do localStorage */
const searchCache = new Map<string, string>()

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed'

export interface PendingChange {
  path: string
  kind: ChangeKind
  /** renamed: path anterior */
  from?: string
  /** paths que precisam entrar juntos no commit (ex: rename = novo + antigo) */
  commitPaths: string[]
}

interface VaultState {
  notes: Note[]
  /** pastas vazias conhecidas (pastas com notas são inferidas automaticamente dos paths) */
  emptyFolders: string[]
  linkGraph: LinkGraph
  githubConfig: GitHubConfig | null
  syncStatus: SyncStatus
  syncError: string | null
  /** timestamp do último sync concluído com sucesso nesta sessão */
  lastSyncedAt: number | null
  /** soma do tamanho de todos os arquivos do repo (notas + anexos), em bytes; null se ainda não calculado */
  repoUsageBytes: number | null
  refreshRepoUsage: () => Promise<void>

  /** alterações locais estruturais ainda não enviadas (ver lib/syncState) */
  pendingDeletes: PendingDelete[]
  pendingFolders: string[]
  pendingMeta: string[]

  /** envia edições automaticamente alguns segundos após parar de digitar e puxa periodicamente */
  autoSync: boolean
  setAutoSync: (on: boolean) => void
  /** agenda um envio (debounced). Ignorado sem repo conectado, com sessão expirada ou em rate limit */
  schedulePush: (delayMs?: number) => void

  connectGitHub: (config: GitHubConfig) => Promise<{ ok: boolean; error?: string }>
  disconnectGitHub: () => void
  pullFromGitHub: () => Promise<void>
  /** envia todas as alterações pendentes (mantido com esse nome para o botão/atalho de salvar) */
  pushNote: (path: string) => Promise<void>
  /** envia todas as alterações pendentes em um único commit */
  syncAll: () => Promise<void>
  /** pull seguido de push: usado pelo botão único de sync da TopBar */
  syncNow: () => Promise<void>

  createNote: (name: string, folder?: string) => Note
  updateNoteContent: (path: string, content: string) => void
  deleteNote: (path: string) => Promise<void>
  renameNote: (path: string, newName: string) => Promise<void>

  createFolder: (name: string, parent?: string) => void
  deleteFolder: (path: string) => Promise<void>
  renameFolder: (path: string, newName: string) => Promise<void>
  moveNote: (path: string, targetFolder: string) => Promise<void>
  getFolderTree: () => TreeNode[]
  getTagTree: () => TreeNode[]
  /** workspaces de código: baixa o conteúdo de um arquivo ainda não carregado */
  loadFileContent: (path: string) => Promise<void>

  /** painel de alterações: commita só os paths escolhidos, com mensagem própria. true se deu certo */
  commitChanges: (options?: CommitOptions) => Promise<boolean>
  /** desfaz uma alteração local (edição, arquivo novo, exclusão ou rename) */
  discardChange: (path: string) => Promise<void>
  /** conteúdo do arquivo no último commit sincronizado (para o diff) */
  getRemoteContent: (path: string) => Promise<string>
  /** data URL de um arquivo do repo (visualizar imagens e binários) */
  getFileDataUrl: (path: string) => Promise<string | null>

  listBranches: () => Promise<string[]>
  /** troca (ou cria a partir da atual) a branch do workspace; exige não ter alterações pendentes */
  switchBranch: (branch: string, create?: boolean) => Promise<{ ok: boolean; error?: string }>
  /** abre (ou reaproveita) um PR da branch atual para a branch padrão do repo */
  openPullRequest: (title: string, body: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
  /** URL do PR aberto da branch atual, se houver */
  findPullRequest: () => Promise<string | null>
  /** busca texto em todos os arquivos de texto do repo (baixa sob demanda os não carregados) */
  searchRepo: (
    query: string,
    opts: { caseSensitive: boolean },
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ results: SearchResult[]; truncated: boolean }>

  /** Comprime (se for imagem) e envia um arquivo para a pasta de anexos no GitHub.
   * Retorna o nome do arquivo salvo (para inserir como `![[nome]]` na nota), ou null em caso de erro. */
  uploadAttachment: (file: File) => Promise<{ ok: true; fileName: string } | { ok: false; error: string }>

  /** Cache em memória de anexos já baixados (nome do arquivo -> data URL) */
  attachmentCache: Map<string, string>
  /** Retorna a data URL do anexo se já estiver em cache; caso contrário, dispara o download
   * em background (via Contents API autenticada) e atualiza o cache quando terminar. */
  getAttachmentUrl: (fileName: string) => string | null

  /** Config de plugins (`.kyanite/config.json`), compartilhada via repo quando conectado */
  pluginConfig: PluginConfig
  isPluginEnabled: (id: PluginId) => boolean
  setPluginEnabled: (id: PluginId, enabled: boolean) => Promise<void>
  /** grava as preferências sincronizadas (tema, idioma, fonte, ícones, Pomodoro) no config.json */
  savePreferences: (preferences: Preferences) => Promise<void>
  /** persiste o config.json inteiro (localStorage + repo, se conectado) */
  savePluginConfig: (config: PluginConfig) => Promise<void>

  /** Coleção de quadros Kanban do vault (`.kyanite/kanban.json`), independente das notas */
  kanbanCollection: KanbanCollection
  saveKanbanCollection: (collection: KanbanCollection) => Promise<void>

  /** Tarefas da Agenda do vault (`.kyanite/agenda.json`), independente das notas */
  agendaCollection: AgendaCollection
  saveAgendaCollection: (collection: AgendaCollection) => Promise<void>
}

const EMPTY_GRAPH: LinkGraph = { outgoing: new Map(), incoming: new Map() }

function recomputeGraph(notes: Note[]): LinkGraph {
  // wikilinks só fazem sentido em notas; em repos de código o grafo ficaria caro e vazio
  return IS_CODE_WORKSPACE ? EMPTY_GRAPH : buildLinkGraph(notes)
}

/** arquivo que entra no workspace: .md em vaults de notas; todos os arquivos em workspaces de código */
function isTrackedFile(path: string): boolean {
  if (isMarker(path)) return false
  return IS_CODE_WORKSPACE ? isVisibleCodeFile(path) : isMarkdownPath(path)
}

/** arquivo sem conteúdo baixado, a ser lido sob demanda (código) ou já marcado como binário */
function placeholderNote(path: string, sha: string, size: number): Note {
  const binary = IS_CODE_WORKSPACE && !isEditableCodeFile(path, size)
  return {
    path,
    name: displayName(path),
    content: '',
    sha,
    updatedAt: Date.now(),
    dirty: false,
    ...(binary ? { binary: true } : { unloaded: true }),
  }
}

const KANBAN_LOCAL_KEY = wsKey('kanban-board')
const AGENDA_LOCAL_KEY = wsKey('agenda')

function loadLocalKanbanCollection(): KanbanCollection {
  const raw = localStorage.getItem(KANBAN_LOCAL_KEY)
  if (!raw) return emptyCollection()
  return parseCollection(raw)
}

function loadLocalAgendaCollection(): AgendaCollection {
  const raw = localStorage.getItem(AGENDA_LOCAL_KEY)
  if (!raw) return emptyAgendaCollection()
  return parseAgendaCollection(raw)
}

function saveLocalAgendaCollection(collection: AgendaCollection) {
  localStorage.setItem(AGENDA_LOCAL_KEY, serializeAgendaCollection(collection))
}

function saveLocalKanbanCollection(collection: KanbanCollection) {
  localStorage.setItem(KANBAN_LOCAL_KEY, serializeCollection(collection))
}

/** arquivos de dados do vault (fora das notas) sincronizados junto com o resto.
 * Em workspaces de código não são sincronizados, para não criar `.kyanite/` no repo do projeto. */
const META_PATHS = IS_CODE_WORKSPACE ? [] : [PLUGIN_CONFIG_PATH, KANBAN_BOARD_PATH, AGENDA_PATH]
/** espera após a última tecla antes do envio automático */
const AUTO_PUSH_DELAY_MS = 4000
/** espera após mudanças em Kanban/Agenda/config (arrastar cartões gera várias em sequência) */
const META_PUSH_DELAY_MS = 1500
/** downloads simultâneos no pull (evita estourar o limite de requisições secundário do GitHub) */
const FETCH_CONCURRENCY = 6

/** nome exibido: sem `.md` em notas; com extensão em workspaces de código */
const displayName = (path: string) => (IS_CODE_WORKSPACE ? fileNameOf(path) : pathToName(path))

const markerPath = (folder: string) => `${folder}/${FOLDER_MARKER}`
const isMarker = (path: string) => path.endsWith(`/${FOLDER_MARKER}`)
const markerFolder = (path: string) => path.slice(0, -(FOLDER_MARKER.length + 1))
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/** conteúdo de cada arquivo `.kyanite/*.json` quando o usuário nunca mexeu nele */
function defaultMeta(path: string): string {
  if (path === PLUGIN_CONFIG_PATH) return serializePluginConfig(DEFAULT_PLUGIN_CONFIG)
  if (path === KANBAN_BOARD_PATH) return serializeCollection(emptyCollection())
  return serializeAgendaCollection(emptyAgendaCollection())
}

function withPendingDelete(list: PendingDelete[], path: string, sha?: string): PendingDelete[] {
  return [...list.filter((d) => d.path !== path), { path, sha }]
}

// pull/push nunca rodam em paralelo: cada operação espera a anterior terminar
let queue: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

let pushTimer: ReturnType<typeof setTimeout> | null = null
/** rate limit: nenhuma chamada automática antes desse timestamp */
let retryAt = 0
/** notas cujo overwrite o usuário recusou (path -> sha remoto): não pergunta de novo a cada auto-push */
const declinedOverwrites = new Map<string, string>()

export const useVaultStore = create<VaultState>((set, get) => {
  /** Centraliza o tratamento de erros de chamadas ao GitHub: sessão expirada, offline,
   * rate limit e demais erros viram estados diferentes na UI. */
  function handleGitHubError(err: unknown, fallbackMessage: string) {
    const c = classifyError(err, fallbackMessage)
    if (c.retryAt) retryAt = c.retryAt
    const syncStatus: SyncStatus = c.kind === 'auth' ? 'auth-error' : c.kind === 'offline' ? 'offline' : 'error'
    set({ syncStatus, syncError: c.message })
  }

  function setNotes(notes: Note[]) {
    saveLocalNotes(notes)
    set({ notes, linkGraph: recomputeGraph(notes) })
  }

  function setFolders(folders: string[]) {
    saveLocalFolders(folders)
    set({ emptyFolders: folders })
  }

  function setPending(patch: Partial<Pick<VaultState, 'pendingDeletes' | 'pendingFolders' | 'pendingMeta'>>) {
    if (patch.pendingDeletes) savePendingDeletes(patch.pendingDeletes)
    if (patch.pendingFolders) savePendingFolders(patch.pendingFolders)
    if (patch.pendingMeta) savePendingMeta(patch.pendingMeta)
    set(patch)
  }

  function serializeMeta(path: string): string {
    const s = get()
    if (path === PLUGIN_CONFIG_PATH) return serializePluginConfig(s.pluginConfig)
    if (path === KANBAN_BOARD_PATH) return serializeCollection(s.kanbanCollection)
    return serializeAgendaCollection(s.agendaCollection)
  }

  function applyMeta(path: string, content: string): Partial<VaultState> {
    if (path === PLUGIN_CONFIG_PATH) {
      const pluginConfig = parsePluginConfig(content)
      saveLocalPluginConfig(pluginConfig)
      return { pluginConfig }
    }
    if (path === KANBAN_BOARD_PATH) {
      const kanbanCollection = parseCollection(content)
      saveLocalKanbanCollection(kanbanCollection)
      return { kanbanCollection }
    }
    const agendaCollection = parseAgendaCollection(content)
    saveLocalAgendaCollection(agendaCollection)
    return { agendaCollection }
  }

  function markMetaPending(path: string) {
    // sem repo conectado não marca: ao conectar, a versão do repo deve prevalecer sobre os defaults locais
    if (!get().githubConfig || !META_PATHS.includes(path)) return
    if (!get().pendingMeta.includes(path)) setPending({ pendingMeta: [...get().pendingMeta, path] })
    get().schedulePush(META_PUSH_DELAY_MS)
  }

  /** pós-commit/pull, alterações estruturais pendentes: no vault de notas são enviadas na hora;
   * em workspaces de código só com auto-sync ligado (senão vão no próximo commit do painel) */
  function pushStructural() {
    if (!IS_CODE_WORKSPACE || get().autoSync) get().schedulePush(0)
  }

  /** Move notas para novos paths localmente; o push envia criação + remoção num commit só.
   * Arquivos não baixados (ou binários) são movidos pelo sha do blob, sem baixar o conteúdo. */
  function relocateNotes(moves: Map<string, string>) {
    let deletes = get().pendingDeletes
    const now = Date.now()
    const next = get().notes.map((n) => {
      const to = moves.get(n.path)
      if (!to) return n
      if (n.sha) deletes = withPendingDelete(deletes, n.path, n.sha)
      const keepBlob = n.unloaded || n.binary
      return {
        ...n,
        path: to,
        name: displayName(to),
        sha: undefined,
        dirty: true,
        updatedAt: now,
        copyOf: keepBlob ? (n.copyOf ?? n.sha) : undefined,
        movedFrom: n.movedFrom ?? (n.sha ? n.path : undefined),
      }
    })
    setNotes(next)
    setPending({ pendingDeletes: deletes })

    let kanban = get().kanbanCollection
    moves.forEach((to, from) => {
      useTabsStore.getState().renameTab(from, to)
      kanban = retargetNoteLinks(kanban, from, to)
    })
    if (kanban !== get().kanbanCollection) get().saveKanbanCollection(kanban)
  }

  /** Pull incremental: compara a árvore remota com os shas locais e baixa só o que mudou */
  async function doPull(): Promise<void> {
    const { githubConfig } = get()
    if (!githubConfig || Date.now() < retryAt) return
    set({ syncStatus: 'syncing', syncError: null })

    try {
      const client = new GitHubClient(githubConfig)
      const head = await client.getHeadSha()
      // nada mudou no remoto desde o último pull: 1 request e pronto
      if (head && head === loadRemoteHead()) {
        set({ syncStatus: 'idle', lastSyncedAt: Date.now() })
        return
      }

      const snapshot = await client.getSnapshot(head)
      await mergeSnapshot(client, snapshot)
      saveRemoteHead(snapshot.commitSha || null)
      set({ syncStatus: 'idle', lastSyncedAt: Date.now(), repoUsageBytes: sumSizes(snapshot.entries) })
      // pendências locais que o pull revelou (ex: primeiro sync após conectar): envia em seguida
      if (get().autoSync && pendingChangesCount(get()) > 0) get().schedulePush(0)
    } catch (err) {
      handleGitHubError(err, 'Erro ao sincronizar')
    }
  }

  async function mergeSnapshot(client: GitHubClient, snapshot: RemoteSnapshot) {
    const startedAt = Date.now()
    // sem baseline (primeiro sync neste dispositivo/repo), pastas vazias locais são enviadas
    const hasBaseline = loadRemoteHead() !== null
    const allPaths = new Set(snapshot.entries.map((e) => e.path))
    const remoteNotes = snapshot.entries.filter((e) => isTrackedFile(e.path))
    const remotePaths = new Set(remoteNotes.map((e) => e.path))
    const local = new Map(get().notes.map((n) => [n.path, n]))
    const pdByPath = new Map(get().pendingDeletes.map((d) => [d.path, d]))
    const droppedDeletes = new Set<string>()

    // só baixa notas cujo sha remoto difere do sha local conhecido. Em workspaces de código,
    // arquivos sem edição local não são baixados aqui: ficam "unloaded" e são buscados ao abrir
    const toFetch = remoteNotes.filter((e) => {
      const mine = local.get(e.path)
      const pd = pdByPath.get(e.path)
      if (IS_CODE_WORKSPACE && (!mine?.dirty || mine.copyOf || !isEditableCodeFile(e.path, e.size))) return false
      if (!mine) return !(pd && pd.sha === e.sha)
      return (mine.sha ?? pd?.sha) !== e.sha
    })
    const fetched = new Map<string, string>()
    await mapLimit(toFetch, FETCH_CONCURRENCY, async (e) => {
      fetched.set(e.path, await client.getBlobText(e.sha))
    })

    const merged: Note[] = []
    const removedPaths: string[] = []

    for (const e of remoteNotes) {
      let mine = local.get(e.path)
      const pd = pdByPath.get(e.path)
      if (pd) {
        if (!mine && pd.sha === e.sha) continue // apagada aqui, ainda não enviada
        // editada em outro dispositivo depois de apagada aqui (restaura), ou renomeada de volta
        droppedDeletes.add(e.path)
        if (mine && !mine.sha) mine = { ...mine, sha: pd.sha }
      }
      if (mine && mine.sha === e.sha) {
        merged.push(mine)
        continue
      }

      declinedOverwrites.delete(e.path)
      const fetchedContent = fetched.get(e.path)
      const content = fetchedContent ?? ''
      const remote: Note =
        fetchedContent !== undefined
          ? { path: e.path, name: displayName(e.path), content, sha: e.sha, updatedAt: Date.now(), dirty: false }
          : placeholderNote(e.path, e.sha, e.size)
      if (!mine || !mine.dirty) {
        merged.push(remote)
        continue
      }
      if (mine.copyOf) {
        // arquivo movido para cá sem conteúdo baixado: o remoto vira a base e o push decide
        merged.push({ ...mine, sha: e.sha })
        continue
      }
      if (mine.content === content) {
        merged.push({ ...mine, sha: e.sha, dirty: false })
        continue
      }

      // mudou dos dois lados: pergunta qual versão manter
      const lines = diffLines(content, mine.content)
      const resolution = isDiffEmpty(lines)
        ? 'keep-local'
        : await useConflictStore.getState().confirmPullConflict(mine.path, lines)
      // manter local: assume o sha remoto como base, então o próximo push sobrescreve sem perguntar de novo
      merged.push(resolution === 'use-remote' ? remote : { ...mine, sha: e.sha })
    }

    for (const mine of local.values()) {
      if (remotePaths.has(mine.path)) continue
      if (!mine.sha) {
        merged.push(mine) // nota nova, ainda não enviada
      } else if (mine.dirty) {
        // apagada no remoto, mas com edições locais: mantém como nova para não perder o trabalho
        merged.push({ ...mine, sha: undefined, dirty: true })
      } else {
        // apagada em outro dispositivo (ou nota de outro repo, ao trocar de repositório)
        removedPaths.push(mine.path)
      }
    }

    // o usuário pode ter editado/criado/apagado notas enquanto o pull baixava: o estado atual vence
    const latest = get().notes
    const latestPaths = new Set(latest.map((n) => n.path))
    const result = merged.filter((n) => !local.has(n.path) || latestPaths.has(n.path))
    for (const cur of latest) {
      if (cur.updatedAt < startedAt) continue
      // mantém o sha antigo: se o remoto também mudou, o push mostra o diff antes de sobrescrever
      const i = result.findIndex((n) => n.path === cur.path)
      if (i >= 0) result[i] = cur
      else result.push(cur)
    }

    // pendências que já não se aplicam (arquivo não existe mais no remoto, ou restaurado acima)
    const pendingDeletes = get().pendingDeletes.filter((d) => allPaths.has(d.path) && !droppedDeletes.has(d.path))

    // pastas vazias: marcadores remotos + pastas locais ainda não enviadas
    const remoteFolders = snapshot.entries.filter((e) => isMarker(e.path)).map((e) => markerFolder(e.path))
    const deletedFolders = new Set(pendingDeletes.filter((d) => isMarker(d.path)).map((d) => markerFolder(d.path)))
    let pendingFolders = get().pendingFolders
    if (!hasBaseline) {
      const remoteSet = new Set(remoteFolders)
      const localOnly = get().emptyFolders.filter((f) => !remoteSet.has(f))
      pendingFolders = Array.from(new Set([...pendingFolders, ...localOnly]))
    }
    const folders = Array.from(new Set([...remoteFolders.filter((f) => !deletedFolders.has(f)), ...pendingFolders]))

    // .kyanite/*.json: baixa só se mudou; mudança local pendente vence (será enviada no push)
    const metaShas = loadMetaShas()
    const metaPatch: Partial<VaultState> = {}
    let pendingMeta = get().pendingMeta
    for (const path of META_PATHS) {
      const entry = snapshot.entries.find((e) => e.path === path)
      if (!entry) {
        // repo ainda sem esse arquivo: no primeiro sync, envia os dados locais se não forem os padrões
        if (!hasBaseline && !pendingMeta.includes(path) && serializeMeta(path) !== defaultMeta(path)) {
          pendingMeta = [...pendingMeta, path]
        }
        continue
      }
      if (metaShas[path] === entry.sha) continue
      if (pendingMeta.includes(path)) continue
      Object.assign(metaPatch, applyMeta(path, await client.getBlobText(entry.sha)))
      metaShas[path] = entry.sha
    }
    saveMetaShas(metaShas)

    setNotes(result)
    setFolders(folders)
    setPending({ pendingDeletes, pendingFolders, pendingMeta })
    set(metaPatch)
    removedPaths.forEach((p) => useTabsStore.getState().closeTab(p))
  }

  /** Push em lote: tudo que está pendente (ou só os paths escolhidos) vai num único commit */
  async function doPush(options: CommitOptions = {}): Promise<boolean> {
    const { githubConfig } = get()
    if (!githubConfig || Date.now() < retryAt) return false
    const client = new GitHubClient(githubConfig)
    try {
      // se outro dispositivo commitar no meio, relê o remoto e tenta de novo
      for (let attempt = 0; ; attempt++) {
        try {
          await pushOnce(client, options)
          return true
        } catch (err) {
          if (err instanceof StaleSnapshotError && attempt < 2) continue
          throw err
        }
      }
    } catch (err) {
      handleGitHubError(err, 'Erro ao enviar alterações')
      return false
    }
  }

  async function pushOnce(client: GitHubClient, { paths, message }: CommitOptions) {
    const s = get()
    // marcadores de pasta e `.kyanite/*.json` não aparecem no painel: vão junto em qualquer commit
    const included = (p: string) => !paths || paths.has(p) || isMarker(p) || META_PATHS.includes(p)
    const dirty = s.notes.filter((n) => n.dirty && included(n.path))
    const deletes = s.pendingDeletes.filter((d) => included(d.path))
    const folders = s.pendingFolders.filter((f) => included(markerPath(f)))
    const metas = s.pendingMeta.filter(included)
    if (!dirty.length && !deletes.length && !folders.length && !metas.length) {
      if (s.syncStatus !== 'idle') set({ syncStatus: 'idle', syncError: null })
      return
    }
    set({ syncStatus: 'syncing', syncError: null })

    const snapshot = await client.getSnapshot()
    const remote = new Map(snapshot.entries.map((e) => [e.path, e.sha]))
    const pdByPath = new Map(s.pendingDeletes.map((d) => [d.path, d]))
    const changes: FileChange[] = []
    const sentNotes = new Map<string, string>()
    const sentMeta = new Map<string, string>()

    for (const note of dirty) {
      const known = note.sha ?? pdByPath.get(note.path)?.sha
      const remoteSha = remote.get(note.path)
      // arquivo movido sem conteúdo baixado: reaproveita o blob pelo sha (inclusive binários)
      if (note.copyOf) {
        if (remoteSha && remoteSha !== known && declinedOverwrites.get(note.path) === remoteSha) continue
        changes.push({ path: note.path, sha: note.copyOf })
        sentNotes.set(note.path, note.content)
        continue
      }
      if (remoteSha && remoteSha !== known) {
        // remoto mudou desde o último sync: mostra o diff antes de sobrescrever
        if (declinedOverwrites.get(note.path) === remoteSha) continue
        const lines = diffLines(await client.getBlobText(remoteSha), note.content)
        if (!isDiffEmpty(lines) && !(await useConflictStore.getState().confirmOverwrite(note.path, lines))) {
          declinedOverwrites.set(note.path, remoteSha)
          continue
        }
      }
      changes.push({ path: note.path, content: note.content })
      sentNotes.set(note.path, note.content)
    }
    for (const folder of folders) changes.push({ path: markerPath(folder), content: '' })
    for (const path of metas) {
      const content = serializeMeta(path)
      changes.push({ path, content })
      sentMeta.set(path, content)
    }

    const written = new Set(changes.map((c) => c.path))
    for (const d of deletes) {
      if (written.has(d.path)) continue
      const remoteSha = remote.get(d.path)
      // editada em outro dispositivo depois de apagada aqui: não apaga (o próximo pull restaura)
      if (d.sha && remoteSha && remoteSha !== d.sha) continue
      changes.push({ path: d.path, delete: true })
    }

    const result = await client.commitChanges(snapshot, changes, message)

    // se o usuário continuou digitando durante o envio, a nota segue dirty com o novo sha como base
    setNotes(
      get().notes.map((n) => {
        const sent = sentNotes.get(n.path)
        if (sent === undefined) return n
        const stillDirty = n.content !== sent
        return {
          ...n,
          sha: result.blobShas.get(n.path) ?? n.sha,
          dirty: stillDirty,
          copyOf: undefined,
          movedFrom: stillDirty ? n.movedFrom : undefined,
        }
      })
    )

    const handledDeletes = new Set(deletes.map((d) => d.path))
    const sentFolders = new Set(folders)
    setPending({
      pendingDeletes: get().pendingDeletes.filter((d) => !handledDeletes.has(d.path)),
      pendingFolders: get().pendingFolders.filter((f) => !sentFolders.has(f)),
      pendingMeta: get().pendingMeta.filter((p) => !sentMeta.has(p) || sentMeta.get(p) !== serializeMeta(p)),
    })

    const metaShas = loadMetaShas()
    sentMeta.forEach((_content, path) => {
      const sha = result.blobShas.get(path)
      if (sha) metaShas[path] = sha
    })
    saveMetaShas(metaShas)

    // se estávamos em dia com o remoto, o commit novo vira a baseline (o próximo pull não baixa nada)
    if (snapshot.commitSha && snapshot.commitSha === loadRemoteHead()) saveRemoteHead(result.commitSha)

    set({ syncStatus: 'idle', lastSyncedAt: Date.now() })
  }

  return {
    notes: loadLocalNotes(),
    emptyFolders: loadLocalFolders(),
    linkGraph: recomputeGraph(loadLocalNotes()),
    githubConfig: loadGitHubConfig(),
    syncStatus: 'idle',
    syncError: null,
    lastSyncedAt: null,
    repoUsageBytes: null,
    pendingDeletes: loadPendingDeletes(),
    pendingFolders: loadPendingFolders(),
    pendingMeta: loadPendingMeta(),
    autoSync: loadAutoSync(),

    setAutoSync: (on) => {
      saveAutoSync(on)
      set({ autoSync: on })
      if (on) get().schedulePush(0)
    },

    schedulePush: (delayMs = AUTO_PUSH_DELAY_MS) => {
      const { githubConfig, syncStatus } = get()
      if (!githubConfig || syncStatus === 'auth-error') return
      if (pushTimer) clearTimeout(pushTimer)
      const wait = Math.max(delayMs, retryAt - Date.now())
      pushTimer = setTimeout(() => {
        pushTimer = null
        get().syncAll()
      }, wait)
    },

    refreshRepoUsage: async () => {
      const { githubConfig } = get()
      if (!githubConfig) return
      try {
        const client = new GitHubClient(githubConfig)
        const bytes = await client.getRepoUsageBytes()
        set({ repoUsageBytes: bytes })
      } catch {
        // não interrompe o fluxo principal por falha ao calcular uso; mantém o valor anterior
      }
    },

    connectGitHub: async (config) => {
      const client = new GitHubClient(config)
      const result = await client.verifyAccess()
      if (result.ok) {
        saveGitHubConfig(config)
        resetRemoteTracking()
        retryAt = 0
        // exclusões pendentes se referem ao repo anterior; não devem ser aplicadas no novo
        setPending({ pendingDeletes: [], pendingMeta: [] })
        set({ githubConfig: config, syncStatus: 'idle', syncError: null })
      }
      return result
    },

    disconnectGitHub: () => {
      clearGitHubConfig()
      resetRemoteTracking()
      if (pushTimer) clearTimeout(pushTimer)
      setPending({ pendingDeletes: [], pendingMeta: [] })
      set({ githubConfig: null, repoUsageBytes: null, syncStatus: 'idle', syncError: null })
    },

    pullFromGitHub: () => exclusive(doPull),

    pushNote: () => get().syncAll(),

    syncAll: () =>
      exclusive(async () => {
        await doPush()
      }),

    syncNow: () =>
      exclusive(async () => {
        // puxa primeiro (resolve conflitos com o remoto) e só depois envia o que ficou pendente;
        // se o pull falhar, não tenta o push para não mascarar o erro original
        await doPull()
        if (get().syncStatus !== 'idle') return
        // código sem auto-sync: o envio é sempre pelo painel de alterações (com mensagem e seleção)
        if (IS_CODE_WORKSPACE && !get().autoSync) return
        await doPush()
      }),

    createNote: (name, folder) => {
      const path = nameToPath(name, folder)
      const note: Note = {
        path,
        name: displayName(path),
        content: IS_CODE_WORKSPACE ? '' : withCreatedDate(`# ${name}\n\n`),
        updatedAt: Date.now(),
        dirty: true,
      }
      setNotes([...get().notes, note])
      useTabsStore.getState().openTab(path, true)
      if (get().autoSync) get().schedulePush()
      return note
    },

    updateNoteContent: (path, content) => {
      setNotes(
        get().notes.map((n) => (n.path === path ? { ...n, content, dirty: true, updatedAt: Date.now() } : n))
      )
      // editar fixa a aba: ela não é mais substituída ao abrir outro arquivo
      useTabsStore.getState().pinTab(path)
      if (get().autoSync) get().schedulePush()
    },

    deleteNote: async (path) => {
      const note = get().notes.find((n) => n.path === path)
      if (!note) return
      // (arquivo movido e não enviado: a remoção do path original já está pendente)
      if (note.sha) setPending({ pendingDeletes: withPendingDelete(get().pendingDeletes, path, note.sha) })
      setNotes(get().notes.filter((n) => n.path !== path))
      useTabsStore.getState().closeTab(path)
      pushStructural()
    },

    renameNote: async (path, newName) => {
      const note = get().notes.find((n) => n.path === path)
      if (!note) return
      const newPath = nameToPath(newName, parentOf(path))
      if (newPath === path || get().notes.some((n) => n.path === newPath)) return

      relocateNotes(new Map([[path, newPath]]))
      // atualiza [[nome-antigo]] -> [[nome-novo]] em quem linkava para essa nota, para não
      // quebrar backlinks; tudo vai no mesmo commit do rename
      if (!IS_CODE_WORKSPACE) setNotes(renameLinksAcrossNotes(get().notes, note.name, newName))
      pushStructural()
    },

    createFolder: (name, parent = '') => {
      const path = joinPath(parent, name.trim())
      if (get().emptyFolders.includes(path)) return
      setFolders([...get().emptyFolders, path])
      // em código, pasta vazia fica só local (não cria arquivo .folder no repo do projeto)
      if (!IS_CODE_WORKSPACE) {
        setPending({ pendingFolders: [...get().pendingFolders, path] })
        pushStructural()
      }
    },

    deleteFolder: async (path) => {
      const { notes, emptyFolders } = get()
      const prefix = `${path}/`
      const notesInside = notes.filter((n) => n.path.startsWith(prefix))

      let deletes = get().pendingDeletes
      for (const n of notesInside) if (n.sha) deletes = withPendingDelete(deletes, n.path, n.sha)

      // marcadores de pasta vazia que possam existir no remoto (a pasta e subpastas)
      const folders = new Set([path, ...emptyFolders.filter((f) => f.startsWith(prefix))])
      notesInside.forEach((n) => folders.add(parentOf(n.path)))
      let pendingFolders = get().pendingFolders
      for (const f of folders) {
        if (pendingFolders.includes(f)) pendingFolders = pendingFolders.filter((p) => p !== f)
        else deletes = withPendingDelete(deletes, markerPath(f))
      }

      setNotes(notes.filter((n) => !n.path.startsWith(prefix)))
      setFolders(emptyFolders.filter((f) => f !== path && !f.startsWith(prefix)))
      setPending({ pendingDeletes: deletes, pendingFolders })
      notesInside.forEach((n) => useTabsStore.getState().closeTab(n.path))
      pushStructural()
    },

    renameFolder: async (path, newName) => {
      const name = newName.trim()
      if (!name) return
      const newPath = joinPath(parentOf(path), name)
      if (newPath === path) return

      const prefix = `${path}/`
      const renamed = (p: string) => newPath + p.slice(path.length)
      const moves = new Map(
        get()
          .notes.filter((n) => n.path.startsWith(prefix))
          .map((n) => [n.path, renamed(n.path)])
      )
      relocateNotes(moves)

      // marcadores: os ainda não enviados só trocam de nome; os já no remoto são removidos e recriados
      const inside = get().emptyFolders.filter((f) => f === path || f.startsWith(prefix))
      let deletes = get().pendingDeletes
      let pendingFolders = get().pendingFolders
      for (const f of inside) {
        if (!pendingFolders.includes(f)) deletes = withPendingDelete(deletes, markerPath(f))
        pendingFolders = [...pendingFolders.filter((p) => p !== f), renamed(f)]
      }
      setFolders(get().emptyFolders.map((f) => (f === path || f.startsWith(prefix) ? renamed(f) : f)))
      setPending({ pendingDeletes: deletes, pendingFolders })
      pushStructural()
    },

    moveNote: async (path, targetFolder) => {
      const note = get().notes.find((n) => n.path === path)
      if (!note) return
      const newPath = joinPath(targetFolder, fileNameOf(path))
      if (newPath === path || get().notes.some((n) => n.path === newPath)) return
      relocateNotes(new Map([[path, newPath]]))
      pushStructural()
    },

    commitChanges: (options) => exclusive(() => doPush(options)),

    discardChange: async (path) => {
      const s = get()
      const note = s.notes.find((n) => n.path === path)
      /** volta o arquivo para a versão sincronizada; o conteúdo é baixado de novo */
      const restore = (target: string, sha: string, binary?: boolean): Note =>
        binary
          ? { ...placeholderNote(target, sha, 0), binary: true, unloaded: undefined }
          : { ...placeholderNote(target, sha, 0), binary: undefined, unloaded: true }

      let reload: string | null = null
      if (note?.movedFrom) {
        // renomeado/movido: volta para o path original
        const original = note.movedFrom
        const originalSha = s.pendingDeletes.find((d) => d.path === original)?.sha
        const others = s.notes.filter((n) => n.path !== path)
        setNotes(originalSha ? [...others, restore(original, originalSha, note.binary)] : others)
        setPending({ pendingDeletes: get().pendingDeletes.filter((d) => d.path !== original) })
        useTabsStore.getState().renameTab(path, original)
        reload = original
      } else if (note && !note.sha) {
        // arquivo novo, nunca enviado: remove
        setNotes(s.notes.filter((n) => n.path !== path))
        useTabsStore.getState().closeTab(path)
      } else if (note?.dirty && note.sha) {
        // editado: volta para a versão do último sync
        setNotes(s.notes.map((n) => (n.path === path ? restore(path, note.sha!, note.binary) : n)))
        reload = path
      } else {
        // apagado: restaura
        const pd = s.pendingDeletes.find((d) => d.path === path)
        if (!pd?.sha) return
        setNotes([...s.notes, restore(path, pd.sha)])
        setPending({ pendingDeletes: s.pendingDeletes.filter((d) => d.path !== path) })
        reload = path
      }

      // vault de notas: Preview/Live não baixam sob demanda, então já carrega o conteúdo
      if (reload && !IS_CODE_WORKSPACE) await get().loadFileContent(reload)
    },

    listBranches: async () => {
      const { githubConfig } = get()
      if (!githubConfig) return []
      try {
        return await new GitHubClient(githubConfig).listBranches()
      } catch (err) {
        handleGitHubError(err, 'Erro ao listar branches')
        return []
      }
    },

    switchBranch: async (branch, create) => {
      const { githubConfig } = get()
      if (!githubConfig || branch === githubConfig.branch) return { ok: true }
      if (pendingChangesCount(get()) > 0) return { ok: false, error: 'pending' }

      try {
        const client = new GitHubClient(githubConfig)
        if (create) {
          const head = await client.getHeadSha()
          if (!head) return { ok: false, error: 'empty' }
          await client.createBranch(branch, head)
        }
      } catch (err) {
        handleGitHubError(err, 'Erro ao criar branch')
        return { ok: false, error: classifyError(err, 'Erro ao criar branch').message }
      }

      // nova base: a árvore da outra branch substitui a local (não há alterações pendentes)
      const config = { ...githubConfig, branch }
      saveGitHubConfig(config)
      resetRemoteTracking()
      declinedOverwrites.clear()
      setNotes([])
      setFolders([])
      setPending({ pendingDeletes: [], pendingFolders: [], pendingMeta: [] })
      useTabsStore.getState().closeAllTabs()
      set({ githubConfig: config, syncStatus: 'idle', syncError: null })
      await get().pullFromGitHub()
      return { ok: true }
    },

    openPullRequest: async (title, body) => {
      const { githubConfig } = get()
      if (!githubConfig) return { ok: false, error: 'Sem repositório conectado' }
      try {
        const client = new GitHubClient(githubConfig)
        const base = await client.getDefaultBranch()
        if (base === githubConfig.branch) return { ok: false, error: 'same-branch' }
        const pr = await client.createPullRequest(title, body, base)
        return { ok: true, url: pr.url }
      } catch (err) {
        return { ok: false, error: classifyError(err, 'Erro ao abrir pull request').message }
      }
    },

    findPullRequest: async () => {
      const { githubConfig } = get()
      if (!githubConfig) return null
      try {
        return (await new GitHubClient(githubConfig).findOpenPullRequest())?.url ?? null
      } catch {
        return null
      }
    },

    searchRepo: async (query, opts, onProgress) => {
      const { githubConfig } = get()
      const term = opts.caseSensitive ? query : query.toLowerCase()
      if (!term) return { results: [], truncated: false }

      // arquivos de texto: os carregados usam o conteúdo local; os outros são baixados (com cache)
      const files = get().notes.filter((n) => !n.binary)
      const missing = files.filter((n) => n.unloaded && n.sha && !searchCache.has(n.sha))
      if (missing.length && githubConfig) {
        const client = new GitHubClient(githubConfig)
        let done = 0
        await mapLimit(missing, FETCH_CONCURRENCY, async (n) => {
          try {
            searchCache.set(n.sha!, await client.getBlobText(n.sha!))
          } catch {
            // arquivo ilegível: fica fora da busca
          }
          onProgress?.(++done, missing.length)
        })
      }

      const results: SearchResult[] = []
      let total = 0
      for (const n of files) {
        const content = n.unloaded ? (n.sha ? searchCache.get(n.sha) : undefined) : n.content
        if (!content) continue
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const hay = opts.caseSensitive ? lines[i] : lines[i].toLowerCase()
          const col = hay.indexOf(term)
          if (col === -1) continue
          if (++total > MAX_SEARCH_RESULTS) return { results, truncated: true }
          results.push({ path: n.path, line: i + 1, column: col, text: lines[i] })
        }
      }
      return { results, truncated: false }
    },

    getFileDataUrl: async (path) => {
      const { githubConfig, notes } = get()
      const sha = notes.find((n) => n.path === path)?.copyOf ?? notes.find((n) => n.path === path)?.sha
      if (!githubConfig || !sha) return null
      try {
        return await new GitHubClient(githubConfig).getBlobDataUrl(sha, path)
      } catch {
        return null
      }
    },

    getRemoteContent: async (path) => {
      const s = get()
      const note = s.notes.find((n) => n.path === path)
      const sha =
        s.pendingDeletes.find((d) => d.path === (note?.movedFrom ?? path))?.sha ?? note?.sha ?? undefined
      if (!s.githubConfig || !sha) return ''
      return new GitHubClient(s.githubConfig).getBlobText(sha)
    },

    getFolderTree: () => {
      const { notes, emptyFolders } = get()
      return buildFolderTree(notes, emptyFolders)
    },

    getTagTree: () => {
      return IS_CODE_WORKSPACE ? [] : buildTagTree(get().notes)
    },

    loadFileContent: async (path) => {
      const note = get().notes.find((n) => n.path === path)
      const { githubConfig } = get()
      if (!note?.unloaded || !note.sha || !githubConfig) return
      try {
        const content = await new GitHubClient(githubConfig).getBlobText(note.sha)
        setNotes(
          get().notes.map((n) =>
            // só aplica se o arquivo não mudou enquanto baixava (ex: pull trocou o sha)
            n.path === path && n.unloaded && n.sha === note.sha ? { ...n, content, unloaded: false } : n
          )
        )
      } catch (err) {
        handleGitHubError(err, 'Erro ao abrir arquivo')
      }
    },

    uploadAttachment: async (file) => {
      const { githubConfig } = get()
      if (!githubConfig) {
        return { ok: false, error: 'Conecte o GitHub para enviar anexos' }
      }

      try {
        const { blob, extension } = await compressImage(file)
        const fileName = buildAttachmentFileName(file.name, extension)
        const client = new GitHubClient(githubConfig)
        await client.putBinaryFile(attachmentPath(fileName), blob)

        // já guarda no cache local a partir do próprio blob enviado, evitando um round-trip
        // de download imediatamente após o upload
        const dataUrl = await blobToDataUrl(blob)
        set((state) => {
          const next = new Map(state.attachmentCache)
          next.set(fileName, dataUrl)
          return { attachmentCache: next }
        })
        get().refreshRepoUsage()

        return { ok: true, fileName }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao enviar anexo'
        return { ok: false, error: message }
      }
    },

    attachmentCache: new Map(),

    getAttachmentUrl: (fileName) => {
      const { attachmentCache, githubConfig } = get()
      const cached = attachmentCache.get(fileName)
      if (cached !== undefined) return cached
      if (!githubConfig) return null

      // marca como "carregando" (string vazia) para não disparar múltiplos fetches em paralelo
      // enquanto o preview re-renderiza a cada tecla digitada
      set((state) => {
        const next = new Map(state.attachmentCache)
        next.set(fileName, '')
        return { attachmentCache: next }
      })

      const client = new GitHubClient(githubConfig)
      client
        .getBinaryFileAsDataUrl(attachmentPath(fileName))
        .then((dataUrl) => {
          set((state) => {
            const next = new Map(state.attachmentCache)
            next.set(fileName, dataUrl)
            return { attachmentCache: next }
          })
        })
        .catch(() => {
          set((state) => {
            const next = new Map(state.attachmentCache)
            next.delete(fileName)
            return { attachmentCache: next }
          })
        })

      return null
    },

    pluginConfig: loadLocalPluginConfig(),
    kanbanCollection: loadLocalKanbanCollection(),
    agendaCollection: loadLocalAgendaCollection(),

    isPluginEnabled: (id) => {
      return get().pluginConfig.plugins[id] ?? false
    },

    setPluginEnabled: async (id, enabled) => {
      const current = get().pluginConfig
      await get().savePluginConfig({ ...current, plugins: { ...current.plugins, [id]: enabled } })
    },

    savePreferences: async (preferences) => {
      await get().savePluginConfig({ ...get().pluginConfig, preferences })
    },

    savePluginConfig: async (next) => {
      saveLocalPluginConfig(next)
      set({ pluginConfig: next })
      markMetaPending(PLUGIN_CONFIG_PATH)
    },

    saveKanbanCollection: async (collection) => {
      saveLocalKanbanCollection(collection)
      set({ kanbanCollection: collection })
      markMetaPending(KANBAN_BOARD_PATH)
    },

    saveAgendaCollection: async (collection) => {
      saveLocalAgendaCollection(collection)
      set({ agendaCollection: collection })
      markMetaPending(AGENDA_PATH)
    },
  }
})

setTabDirtyCheck((path) => useVaultStore.getState().notes.some((n) => n.path === path && n.dirty))

/** Alterações de arquivos para o painel de alterações (sem marcadores de pasta e `.kyanite/`) */
export function listPendingChanges(s: Pick<VaultState, 'notes' | 'pendingDeletes'>): PendingChange[] {
  const changes: PendingChange[] = []
  const movedFrom = new Set<string>()
  for (const n of s.notes) {
    if (!n.dirty) continue
    if (n.movedFrom) {
      movedFrom.add(n.movedFrom)
      changes.push({ path: n.path, kind: 'renamed', from: n.movedFrom, commitPaths: [n.path, n.movedFrom] })
    } else {
      changes.push({ path: n.path, kind: n.sha ? 'modified' : 'added', commitPaths: [n.path] })
    }
  }
  for (const d of s.pendingDeletes) {
    if (movedFrom.has(d.path) || isMarker(d.path)) continue
    changes.push({ path: d.path, kind: 'deleted', commitPaths: [d.path] })
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

/** total de alterações locais ainda não enviadas (notas, exclusões, pastas, Kanban/Agenda/config) */
export function pendingChangesCount(s: VaultState): number {
  return s.notes.filter((n) => n.dirty).length + s.pendingDeletes.length + s.pendingFolders.length + s.pendingMeta.length
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
