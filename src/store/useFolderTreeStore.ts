import { create } from 'zustand'

const COLLAPSED_KEY = 'kyanite:collapsed-folders'

function loadCollapsed(): Set<string> {
  const raw = localStorage.getItem(COLLAPSED_KEY)
  return raw ? new Set(JSON.parse(raw)) : new Set()
}

function saveCollapsed(paths: Set<string>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(paths)))
}

interface FolderTreeState {
  /** paths das pastas atualmente colapsadas (pastas novas começam expandidas por padrão) */
  collapsed: Set<string>
  isExpanded: (path: string) => boolean
  toggle: (path: string) => void
}

/** Persiste em localStorage quais pastas estão colapsadas na sidebar, para sobreviver a reloads (F5) */
export const useFolderTreeStore = create<FolderTreeState>((set, get) => ({
  collapsed: loadCollapsed(),
  isExpanded: (path) => !get().collapsed.has(path),
  toggle: (path) => {
    const next = new Set(get().collapsed)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    saveCollapsed(next)
    set({ collapsed: next })
  },
}))
