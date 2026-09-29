import { create } from 'zustand'

interface ConfirmState {
  message: string | null
  resolve: ((value: boolean) => void) | null
  /** abre o diálogo e resolve com true/false conforme o usuário confirma ou cancela */
  confirm: (message: string) => Promise<boolean>
  resolveWith: (value: boolean) => void
}

/** Estado transitório de UI para o diálogo de confirmação (substitui window.confirm) */
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  message: null,
  resolve: null,
  confirm: (message) => {
    return new Promise<boolean>((resolve) => {
      set({ message, resolve })
    })
  },
  resolveWith: (value) => {
    get().resolve?.(value)
    set({ message: null, resolve: null })
  },
}))
