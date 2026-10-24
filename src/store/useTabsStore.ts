import { create } from 'zustand'
import { wsKey } from '../lib/workspace'

/** informado pelo useVaultStore: arquivos com alterações pendentes nunca são substituídos */
let isDirty: (path: string) => boolean = () => false
export function setTabDirtyCheck(fn: (path: string) => boolean) {
  isDirty = fn
}

const TABS_KEY = wsKey('tabs')

/** chamado ao abrir/ativar uma aba (o workspace de código usa para fechar o diff aberto) */
let onActivate: (() => void) | null = null
export function setOnTabActivate(fn: () => void) {
  onActivate = fn
}

interface TabsState {
  /** paths das notas abertas em abas, na ordem de exibição */
  openPaths: string[]
  activePath: string | null
  /** aba de pré-visualização (estilo VS Code): abrir outro arquivo substitui ela.
   * Vira fixa ao editar o arquivo ou com duplo clique na aba */
  previewPath: string | null

  /** abre como pré-visualização (substitui a anterior); `pinned` abre direto como fixa */
  openTab: (path: string, pinned?: boolean) => void
  /** fixa a aba: ela não é mais substituída ao abrir outro arquivo */
  pinTab: (path: string) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  closeOtherTabs: (path: string) => void
  closeAllTabs: () => void
  /** atualiza o path de uma aba já aberta (usado ao renomear ou mover uma nota) */
  renameTab: (oldPath: string, newPath: string) => void
}

interface Persisted {
  openPaths: string[]
  activePath: string | null
  previewPath: string | null
}

function loadPersisted(): Persisted {
  const empty: Persisted = { openPaths: [], activePath: null, previewPath: null }
  const raw = localStorage.getItem(TABS_KEY)
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw)
    return { ...empty, ...parsed }
  } catch {
    return empty
  }
}

function persist(s: Persisted) {
  localStorage.setItem(TABS_KEY, JSON.stringify(s))
}

export const useTabsStore = create<TabsState>((set, get) => {
  const initial = loadPersisted()

  /** aplica e persiste; preview que não está mais nas abas é descartado */
  function update(patch: Partial<Persisted>) {
    const next = { ...pick(get()), ...patch }
    if (next.previewPath && !next.openPaths.includes(next.previewPath)) next.previewPath = null
    persist(next)
    set(next)
  }

  return {
    openPaths: initial.openPaths,
    activePath: initial.activePath,
    previewPath: initial.previewPath,

    openTab: (path, pinned = false) => {
      const { openPaths, previewPath } = get()
      onActivate?.()

      if (openPaths.includes(path)) {
        update({ activePath: path, previewPath: pinned && previewPath === path ? null : previewPath })
        return
      }

      // substitui a aba de pré-visualização atual (na mesma posição), se houver e não tiver edições
      const replaceable = previewPath && openPaths.includes(previewPath) && !isDirty(previewPath)
      const next = replaceable
        ? openPaths.map((p) => (p === previewPath ? path : p))
        : [...openPaths, path]
      update({ openPaths: next, activePath: path, previewPath: pinned ? null : path })
    },

    pinTab: (path) => {
      if (get().previewPath === path) update({ previewPath: null })
    },

    closeTab: (path) => {
      const { openPaths, activePath } = get()
      const idx = openPaths.indexOf(path)
      if (idx === -1) return

      const next = openPaths.filter((p) => p !== path)
      let nextActive = activePath
      if (activePath === path) {
        // ao fechar a aba ativa, foca a vizinha (preferindo a da direita)
        nextActive = next[idx] ?? next[idx - 1] ?? null
      }
      update({ openPaths: next, activePath: nextActive })
    },

    setActiveTab: (path) => {
      onActivate?.()
      update({ activePath: path })
    },

    closeOtherTabs: (path) => {
      update({ openPaths: [path], activePath: path })
    },

    closeAllTabs: () => {
      update({ openPaths: [], activePath: null, previewPath: null })
    },

    renameTab: (oldPath, newPath) => {
      const { openPaths, activePath, previewPath } = get()
      if (!openPaths.includes(oldPath)) return
      update({
        openPaths: openPaths.map((p) => (p === oldPath ? newPath : p)),
        activePath: activePath === oldPath ? newPath : activePath,
        previewPath: previewPath === oldPath ? newPath : previewPath,
      })
    },
  }
})

function pick(s: Persisted): Persisted {
  return { openPaths: s.openPaths, activePath: s.activePath, previewPath: s.previewPath }
}
