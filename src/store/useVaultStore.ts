import { create } from 'zustand'
import { GitHubClient, loadGitHubConfig, saveGitHubConfig, clearGitHubConfig } from '../lib/github'
import {
  loadLocalNotes,
  saveLocalNotes,
  loadLocalFolders,
  saveLocalFolders,
  pathToName,
  nameToPath,
  joinPath,
  buildFolderTree,
  FOLDER_MARKER,
} from '../lib/vault'
import { buildLinkGraph } from '../lib/wikilinks'
import { withCreatedDate } from '../lib/frontmatter'
import { buildTagTree } from '../lib/tags'
import { diffLines, isDiffEmpty } from '../lib/diff'
import { compressImage } from '../lib/imageCompress'
import { buildAttachmentFileName, attachmentPath } from '../lib/attachments'
import {
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
  //clearNoteLinks,
  type KanbanCollection,
} from '../lib/kanban'
import { useConflictStore } from './useConflictStore'
import { useTabsStore } from './useTabsStore'
import type { GitHubConfig, LinkGraph, Note, TreeNode } from '../lib/types'

type SyncStatus = 'idle' | 'syncing' | 'error'

interface VaultState {
  notes: Note[]
  /** pastas vazias conhecidas (pastas com notas são inferidas automaticamente dos paths) */
  emptyFolders: string[]
  linkGraph: LinkGraph
  githubConfig: GitHubConfig | null
  syncStatus: SyncStatus
  syncError: string | null
  /** soma do tamanho de todos os arquivos do repo (notas + anexos), em bytes; null se ainda não calculado */
  repoUsageBytes: number | null
  refreshRepoUsage: () => Promise<void>

  connectGitHub: (config: GitHubConfig) => Promise<{ ok: boolean; error?: string }>
  disconnectGitHub: () => void
  pullFromGitHub: () => Promise<void>
  pushNote: (path: string) => Promise<void>
  syncAll: () => Promise<void>

  createNote: (name: string, folder?: string) => Note
  updateNoteContent: (path: string, content: string) => void
  deleteNote: (path: string) => Promise<void>
  renameNote: (path: string, newName: string) => Promise<void>

  createFolder: (name: string, parent?: string) => void
  deleteFolder: (path: string) => Promise<void>
  moveNote: (path: string, targetFolder: string) => Promise<void>
  getFolderTree: () => TreeNode[]
  getTagTree: () => TreeNode[]

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

  /** Coleção de quadros Kanban do vault (`.kyanite/kanban.json`), independente das notas */
  kanbanCollection: KanbanCollection
  saveKanbanCollection: (collection: KanbanCollection) => Promise<void>
}

function recomputeGraph(notes: Note[]): LinkGraph {
  return buildLinkGraph(notes)
}

const KANBAN_LOCAL_KEY = 'kyanite:kanban-board'

function loadLocalKanbanCollection(): KanbanCollection {
  const raw = localStorage.getItem(KANBAN_LOCAL_KEY)
  if (!raw) return emptyCollection()
  return parseCollection(raw)
}

function saveLocalKanbanCollection(collection: KanbanCollection) {
  localStorage.setItem(KANBAN_LOCAL_KEY, serializeCollection(collection))
}

/** Antes de sobrescrever uma nota existente no GitHub, verifica se o remoto mudou desde o
 * último sync local (sha diferente do conhecido). Se mudou, mostra o diff e espera confirmação
 * do usuário. Retorna false se o push deve ser cancelado. */
async function confirmPushIfRemoteChanged(client: GitHubClient, note: Note): Promise<boolean> {
  if (!note.sha) return true // nota nova, ainda não existe no remoto

  try {
    const remote = await client.getFileContent(note.path)
    if (remote.sha === note.sha) return true // remoto não mudou desde o último sync

    const lines = diffLines(remote.content, note.content)
    if (isDiffEmpty(lines)) return true // conteúdo idêntico, mesmo com sha diferente

    return await useConflictStore.getState().confirmOverwrite(note.path, lines)
  } catch {
    // arquivo pode ter sido deletado no remoto, ou outro erro de leitura: deixa o putFile
    // original tratar o erro (ex: recriar o arquivo)
    return true
  }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  notes: loadLocalNotes(),
  emptyFolders: loadLocalFolders(),
  linkGraph: recomputeGraph(loadLocalNotes()),
  githubConfig: loadGitHubConfig(),
  syncStatus: 'idle',
  syncError: null,
  repoUsageBytes: null,

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
      set({ githubConfig: config })
      get().refreshRepoUsage()
    }
    return result
  },

  disconnectGitHub: () => {
    clearGitHubConfig()
    set({ githubConfig: null, repoUsageBytes: null })
  },

  pullFromGitHub: async () => {
    const { githubConfig } = get()
    if (!githubConfig) return
    set({ syncStatus: 'syncing', syncError: null })

    try {
      const client = new GitHubClient(githubConfig)
      const files = await client.listVaultFiles()

      const noteFiles = files.filter((f) => f.path.endsWith('.md'))
      const folderMarkers = files.filter((f) => f.path.endsWith(`/${FOLDER_MARKER}`))
      const remoteEmptyFolders = folderMarkers.map((f) =>
        f.path.slice(0, f.path.length - FOLDER_MARKER.length - 1)
      )

      const remoteNotes: Note[] = await Promise.all(
        noteFiles.map(async ({ path, sha }) => {
          const file = await client.getFileContent(path)
          return {
            path,
            name: pathToName(path),
            content: file.content,
            sha,
            updatedAt: Date.now(),
            dirty: false,
          }
        })
      )

      // notas locais com mudanças ainda não enviadas: se o remoto também mudou (sha diferente
      // do que tínhamos quando editamos localmente) E o conteúdo realmente diverge, é um
      // conflito real — pergunta ao usuário qual versão manter em vez de decidir silenciosamente
      const localDirty = get().notes.filter((n) => n.dirty)
      const merged = [...remoteNotes]

      for (const dirtyNote of localDirty) {
        const idx = merged.findIndex((n) => n.path === dirtyNote.path)
        const remoteNote = idx >= 0 ? merged[idx] : null

        const remoteChangedSinceLocalEdit = remoteNote && remoteNote.sha !== dirtyNote.sha
        const contentDiffers = remoteNote && remoteNote.content !== dirtyNote.content

        if (remoteNote && remoteChangedSinceLocalEdit && contentDiffers) {
          const lines = diffLines(remoteNote.content, dirtyNote.content)
          const resolution = isDiffEmpty(lines)
            ? 'keep-local'
            : await useConflictStore.getState().confirmPullConflict(dirtyNote.path, lines)

          if (resolution === 'use-remote') {
            // aceita a versão remota; a nota deixa de estar dirty pois não há mais mudança local pendente
            continue
          }
        }

        // mantém a versão local (dirty), seja por não ter conflito real ou por escolha do usuário
        if (idx >= 0) merged[idx] = dirtyNote
        else merged.push(dirtyNote)
      }

      // preserva pastas vazias criadas localmente que ainda não foram enviadas
      const localFolders = get().emptyFolders
      const mergedFolders = Array.from(new Set([...remoteEmptyFolders, ...localFolders]))

      // config de plugins (.kyanite/config.json): o repo é a fonte de verdade compartilhada
      // entre dispositivos quando existe; se ainda não existir no repo, mantém a config local
      let pluginConfig = get().pluginConfig
      try {
        const configFile = await client.getFileContent(PLUGIN_CONFIG_PATH)
        pluginConfig = parsePluginConfig(configFile.content)
        saveLocalPluginConfig(pluginConfig)
      } catch {
        // arquivo ainda não existe no repo; mantém a config local como está
      }

      // quadros Kanban (.kyanite/kanban.json): mesma lógica — repo é a fonte de verdade
      let kanbanCollection = get().kanbanCollection
      try {
        const boardFile = await client.getFileContent(KANBAN_BOARD_PATH)
        kanbanCollection = parseCollection(boardFile.content)
        saveLocalKanbanCollection(kanbanCollection)
      } catch {
        // arquivo ainda não existe no repo; mantém a coleção local como está
      }

      saveLocalNotes(merged)
      saveLocalFolders(mergedFolders)
      set({
        notes: merged,
        emptyFolders: mergedFolders,
        linkGraph: recomputeGraph(merged),
        pluginConfig,
        kanbanCollection,
        syncStatus: 'idle',
      })
      get().refreshRepoUsage()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao sincronizar'
      set({ syncStatus: 'error', syncError: message })
    }
  },

  pushNote: async (path) => {
    const { githubConfig, notes } = get()
    if (!githubConfig) return
    const note = notes.find((n) => n.path === path)
    if (!note) return

    const client = new GitHubClient(githubConfig)
    const shouldPush = await confirmPushIfRemoteChanged(client, note)
    if (!shouldPush) return

    set({ syncStatus: 'syncing', syncError: null })
    try {
      const sha = await client.putFile(note.path, note.content, note.sha)
      const updated = get().notes.map((n) =>
        n.path === path ? { ...n, sha, dirty: false } : n
      )
      saveLocalNotes(updated)
      set({ notes: updated, syncStatus: 'idle' })
      get().refreshRepoUsage()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar nota'
      set({ syncStatus: 'error', syncError: message })
    }
  },

  syncAll: async () => {
    const { notes, emptyFolders, githubConfig } = get()
    if (!githubConfig) return
    const dirtyNotes = notes.filter((n) => n.dirty)

    const client = new GitHubClient(githubConfig)

    // verifica conflitos antes de começar a sincronizar, para o usuário decidir cada
    // um sem misturar com o estado "syncing" (e sem enviar parte das notas e travar no meio)
    for (const note of dirtyNotes) {
      const shouldPush = await confirmPushIfRemoteChanged(client, note)
      if (!shouldPush) return
    }

    set({ syncStatus: 'syncing', syncError: null })
    try {
      let current = get().notes
      for (const note of dirtyNotes) {
        const sha = await client.putFile(note.path, note.content, note.sha)
        current = current.map((n) => (n.path === note.path ? { ...n, sha, dirty: false } : n))
      }
      saveLocalNotes(current)

      // garante que pastas vazias locais existam como marcador no GitHub também
      for (const folder of emptyFolders) {
        try {
          await client.putFile(`${folder}/${FOLDER_MARKER}`, '')
        } catch {
          // marcador provavelmente já existe no remoto (pasta não está mais vazia lá, ou já sincronizada); ignora
        }
      }

      set({ notes: current, syncStatus: 'idle' })
      get().refreshRepoUsage()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao sincronizar'
      set({ syncStatus: 'error', syncError: message })
    }
  },

  createNote: (name, folder) => {
    const path = nameToPath(name, folder)
    const note: Note = {
      path,
      name,
      content: withCreatedDate(`# ${name}\n\n`),
      updatedAt: Date.now(),
      dirty: true,
    }
    const notes = [...get().notes, note]
    saveLocalNotes(notes)
    set({ notes, linkGraph: recomputeGraph(notes) })
    useTabsStore.getState().openTab(path)
    return note
  },

  
  updateNoteContent: (path, content) => {
    const notes = get().notes.map((n) =>
      n.path === path ? { ...n, content, dirty: true, updatedAt: Date.now() } : n
    )
    saveLocalNotes(notes)
    set({ notes, linkGraph: recomputeGraph(notes) })
  },

  deleteNote: async (path) => {
    const { githubConfig, notes } = get()
    const note = notes.find((n) => n.path === path)
    if (!note) return

    if (githubConfig && note.sha) {
      try {
        const client = new GitHubClient(githubConfig)
        await client.deleteFile(path, note.sha)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao excluir no GitHub'
        set({ syncStatus: 'error', syncError: message })
        return
      }
    }

    const remaining = notes.filter((n) => n.path !== path)
    saveLocalNotes(remaining)
    set({ notes: remaining, linkGraph: recomputeGraph(remaining) })
    useTabsStore.getState().closeTab(path)
  },

  renameNote: async (path, newName) => {
    const { notes, githubConfig } = get()
    const note = notes.find((n) => n.path === path)
    if (!note) return
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const newPath = nameToPath(newName, folder)

    if (githubConfig && note.sha) {
      try {
        const client = new GitHubClient(githubConfig)
        // GitHub não tem "renomear": cria no novo path e remove o antigo
        const sha = await client.putFile(newPath, note.content)
        await client.deleteFile(path, note.sha)
        const updated = notes.map((n) =>
          n.path === path ? { ...n, path: newPath, name: newName, sha, dirty: false } : n
        )
        saveLocalNotes(updated)
        set({ notes: updated, linkGraph: recomputeGraph(updated) })
        useTabsStore.getState().renameTab(path, newPath)
        {
          const retargeted = retargetNoteLinks(get().kanbanCollection, path, newPath)
          if (retargeted !== get().kanbanCollection) get().saveKanbanCollection(retargeted)
        }
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao renomear nota no GitHub'
        set({ syncStatus: 'error', syncError: message })
        return
      }
    }

    const updated = notes.map((n) =>
      n.path === path
        ? { ...n, path: newPath, name: newName, dirty: true, sha: undefined }
        : n
    )
    saveLocalNotes(updated)
    set({ notes: updated, linkGraph: recomputeGraph(updated) })
    useTabsStore.getState().renameTab(path, newPath)
    {
      const retargeted = retargetNoteLinks(get().kanbanCollection, path, newPath)
      if (retargeted !== get().kanbanCollection) get().saveKanbanCollection(retargeted)
    }
  },

  createFolder: (name, parent = '') => {
    const path = joinPath(parent, name.trim())
    const { emptyFolders, githubConfig } = get()
    if (emptyFolders.includes(path)) return

    const updated = [...emptyFolders, path]
    saveLocalFolders(updated)
    set({ emptyFolders: updated })

    if (githubConfig) {
      const client = new GitHubClient(githubConfig)
      client.putFile(`${path}/${FOLDER_MARKER}`, '').catch((err) => {
        const message = err instanceof Error ? err.message : 'Erro ao criar pasta no GitHub'
        set({ syncStatus: 'error', syncError: message })
      })
    }
  },

  deleteFolder: async (path) => {
    const { notes, emptyFolders, githubConfig } = get()
    const prefix = `${path}/`
    const notesInside = notes.filter((n) => n.path.startsWith(prefix))

    // remove todas as notas dentro da pasta (e no GitHub, se conectado)
    if (githubConfig) {
      try {
        const client = new GitHubClient(githubConfig)
        for (const note of notesInside) {
          if (note.sha) await client.deleteFile(note.path, note.sha)
        }
        const markerPath = `${path}/${FOLDER_MARKER}`
        // marcador só existe no GitHub se a pasta estava vazia; ignora erro se não existir
        const files = await client.listVaultFiles()
        const marker = files.find((f) => f.path === markerPath)
        if (marker) await client.deleteFile(markerPath, marker.sha)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao excluir pasta no GitHub'
        set({ syncStatus: 'error', syncError: message })
        return
      }
    }

    const remainingNotes = notes.filter((n) => !n.path.startsWith(prefix))
    const remainingFolders = emptyFolders.filter((f) => f !== path && !f.startsWith(prefix))

    saveLocalNotes(remainingNotes)
    saveLocalFolders(remainingFolders)
    set({
      notes: remainingNotes,
      emptyFolders: remainingFolders,
      linkGraph: recomputeGraph(remainingNotes),
    })
    notesInside.forEach((n) => useTabsStore.getState().closeTab(n.path))
  },

  moveNote: async (path, targetFolder) => {
    const { notes, githubConfig } = get()
    const note = notes.find((n) => n.path === path)
    if (!note) return

    const newPath = joinPath(targetFolder, `${note.name}.md`)
    if (newPath === path) return

    if (githubConfig && note.sha) {
      try {
        const client = new GitHubClient(githubConfig)
        // GitHub não tem "mover": cria no destino e remove a origem
        const sha = await client.putFile(newPath, note.content)
        await client.deleteFile(path, note.sha)
        const updated = notes.map((n) =>
          n.path === path ? { ...n, path: newPath, sha, dirty: false } : n
        )
        saveLocalNotes(updated)
        set({ notes: updated, linkGraph: recomputeGraph(updated) })
        useTabsStore.getState().renameTab(path, newPath)
        {
          const retargeted = retargetNoteLinks(get().kanbanCollection, path, newPath)
          if (retargeted !== get().kanbanCollection) get().saveKanbanCollection(retargeted)
        }
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao mover nota no GitHub'
        set({ syncStatus: 'error', syncError: message })
        return
      }
    }

    const updated = notes.map((n) =>
      n.path === path ? { ...n, path: newPath, dirty: true, sha: undefined } : n
    )
    saveLocalNotes(updated)
    set({ notes: updated, linkGraph: recomputeGraph(updated) })
    useTabsStore.getState().renameTab(path, newPath)
    {
      const retargeted = retargetNoteLinks(get().kanbanCollection, path, newPath)
      if (retargeted !== get().kanbanCollection) get().saveKanbanCollection(retargeted)
    }
  },

  getFolderTree: () => {
    const { notes, emptyFolders } = get()
    return buildFolderTree(notes, emptyFolders)
  },

  getTagTree: () => {
    return buildTagTree(get().notes)
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

  isPluginEnabled: (id) => {
    return get().pluginConfig.plugins[id] ?? false
  },

  setPluginEnabled: async (id, enabled) => {
    const current = get().pluginConfig
    const next: PluginConfig = { plugins: { ...current.plugins, [id]: enabled } }

    saveLocalPluginConfig(next)
    set({ pluginConfig: next })

    const { githubConfig } = get()
    if (!githubConfig) return

    try {
      const client = new GitHubClient(githubConfig)
      let sha: string | undefined
      try {
        const existing = await client.getFileContent(PLUGIN_CONFIG_PATH)
        sha = existing.sha
      } catch {
        // arquivo ainda não existe no repo; será criado sem sha
      }
      await client.putFile(PLUGIN_CONFIG_PATH, serializePluginConfig(next), sha)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configuração de plugins'
      set({ syncStatus: 'error', syncError: message })
    }
  },

  saveKanbanCollection: async (collection) => {
    saveLocalKanbanCollection(collection)
    set({ kanbanCollection: collection })

    const { githubConfig } = get()
    if (!githubConfig) return

    try {
      const client = new GitHubClient(githubConfig)
      let sha: string | undefined
      try {
        const existing = await client.getFileContent(KANBAN_BOARD_PATH)
        sha = existing.sha
      } catch {
        // arquivo ainda não existe no repo; será criado sem sha
      }
      await client.putFile(KANBAN_BOARD_PATH, serializeCollection(collection), sha)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar os quadros Kanban'
      set({ syncStatus: 'error', syncError: message })
    }
  },
}))

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
