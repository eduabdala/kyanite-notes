import { create } from 'zustand'
import type { DiffLine } from '../lib/diff'

interface PendingDiff {
  path: string
  lines: DiffLine[]
}

interface PushConfirmState {
  pending: PendingDiff | null
  resolve: ((value: boolean) => void) | null
  /** abre o diálogo de diff e resolve com true (sobrescrever remoto) ou false (cancelar push) */
  confirmOverwrite: (path: string, lines: DiffLine[]) => Promise<boolean>
  resolveWith: (value: boolean) => void
}

/** Estado transitório de UI para o diálogo de diff local vs remoto, exibido antes de um push
 * quando o remoto foi alterado desde o último sync (sha diferente do conhecido localmente). */
export const usePushConfirmStore = create<PushConfirmState>((set, get) => ({
  pending: null,
  resolve: null,
  confirmOverwrite: (path, lines) => {
    return new Promise<boolean>((resolve) => {
      set({ pending: { path, lines }, resolve })
    })
  },
  resolveWith: (value) => {
    get().resolve?.(value)
    set({ pending: null, resolve: null })
  },
}))
