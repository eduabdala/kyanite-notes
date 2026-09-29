import { create } from 'zustand'

type CreationKind = 'note' | 'folder'

interface CreationState {
  /** pasta onde o item está sendo criado ('' = raiz), ou null se nada está sendo criado */
  parent: string | null
  kind: CreationKind
  start: (kind: CreationKind, parent: string) => void
  cancel: () => void
}

/** Estado transitório de UI para o input inline de criação de nota/pasta (estilo VSCode) */
export const useCreationStore = create<CreationState>((set) => ({
  parent: null,
  kind: 'note',
  start: (kind, parent) => set({ kind, parent }),
  cancel: () => set({ parent: null }),
}))
