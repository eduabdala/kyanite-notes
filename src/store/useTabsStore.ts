import { create } from 'zustand'

const TABS_KEY = 'kyanite:tabs'

interface TabsState {
  /** paths das notas abertas em abas, na ordem de exibição */
  openPaths: string[]
  activePath: string | null

  openTab: (path: string) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  closeOtherTabs: (path: string) => void
  closeAllTabs: () => void
  /** atualiza o path de uma aba já aberta (usado ao renomear ou mover uma nota) */
  renameTab: (oldPath: string, newPath: string) => void
}

function loadPersisted(): { openPaths: string[]; activePath: string | null } {
  const raw = localStorage.getItem(TABS_KEY)
  if (!raw) return { openPaths: [], activePath: null }
  try {
    return JSON.parse(raw)
  } catch {
    return { openPaths: [], activePath: null }
  }
}

function persist(openPaths: string[], activePath: string | null) {
  localStorage.setItem(TABS_KEY, JSON.stringify({ openPaths, activePath }))
}

export const useTabsStore = create<TabsState>((set, get) => {
  const initial = loadPersisted()

  return {
    openPaths: initial.openPaths,
    activePath: initial.activePath,

    openTab: (path) => {
      const { openPaths } = get()
      const next = openPaths.includes(path) ? openPaths : [...openPaths, path]
      persist(next, path)
      set({ openPaths: next, activePath: path })
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

      persist(next, nextActive)
      set({ openPaths: next, activePath: nextActive })
    },

    setActiveTab: (path) => {
      persist(get().openPaths, path)
      set({ activePath: path })
    },

    closeOtherTabs: (path) => {
      persist([path], path)
      set({ openPaths: [path], activePath: path })
    },

    closeAllTabs: () => {
      persist([], null)
      set({ openPaths: [], activePath: null })
    },

    renameTab: (oldPath, newPath) => {
      const { openPaths, activePath } = get()
      if (!openPaths.includes(oldPath)) return

      const next = openPaths.map((p) => (p === oldPath ? newPath : p))
      const nextActive = activePath === oldPath ? newPath : activePath
      persist(next, nextActive)
      set({ openPaths: next, activePath: nextActive })
    },
  }
})
