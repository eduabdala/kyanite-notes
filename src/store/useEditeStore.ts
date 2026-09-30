import { create } from 'zustand'

type EditionKind = 'note' | 'folder'

interface EditionState {

  parent: string | null
  newParent: string | null
  kind: EditionKind
  start: (kind: EditionKind, parent: string) => void
  cancel: () => void
}

export const useEditionStore = create<EditionState>((set) => ({
  parent: null,
  newParent: null,
  kind: 'note',
  start: (kind, parent) => set({ kind, parent }),
  cancel: () => set({ parent: null }),
}))