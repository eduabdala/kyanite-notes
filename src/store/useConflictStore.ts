import { create } from 'zustand'
import type { DiffLine } from '../lib/diff'

export type PullConflictResolution = 'keep-local' | 'use-remote'

interface PendingPush {
  direction: 'push'
  path: string
  lines: DiffLine[]
}

interface PendingPull {
  direction: 'pull'
  path: string
  lines: DiffLine[]
}

type Pending = PendingPush | PendingPull

interface ConflictState {
  pending: Pending | null
  resolvePush: ((overwrite: boolean) => void) | null
  resolvePull: ((resolution: PullConflictResolution) => void) | null

  /** Push: pergunta se sobrescreve o remoto (que mudou desde o último sync local). */
  confirmOverwrite: (path: string, lines: DiffLine[]) => Promise<boolean>
  /** Pull: pergunta se mantém a versão local (dirty) ou aceita a versão remota que também mudou. */
  confirmPullConflict: (path: string, lines: DiffLine[]) => Promise<PullConflictResolution>

  resolvePushWith: (overwrite: boolean) => void
  resolvePullWith: (resolution: PullConflictResolution) => void
}

/** Estado transitório de UI para o diálogo de diff local vs remoto, usado tanto antes de um
 * push (sobrescrever ou não o remoto) quanto durante um pull (manter local ou aceitar remoto)
 * quando uma nota tem mudanças não sincronizadas dos dois lados. */
export const useConflictStore = create<ConflictState>((set, get) => ({
  pending: null,
  resolvePush: null,
  resolvePull: null,

  confirmOverwrite: (path, lines) => {
    return new Promise<boolean>((resolve) => {
      set({ pending: { direction: 'push', path, lines }, resolvePush: resolve, resolvePull: null })
    })
  },

  confirmPullConflict: (path, lines) => {
    return new Promise<PullConflictResolution>((resolve) => {
      set({ pending: { direction: 'pull', path, lines }, resolvePull: resolve, resolvePush: null })
    })
  },

  resolvePushWith: (overwrite) => {
    get().resolvePush?.(overwrite)
    set({ pending: null, resolvePush: null, resolvePull: null })
  },

  resolvePullWith: (resolution) => {
    get().resolvePull?.(resolution)
    set({ pending: null, resolvePush: null, resolvePull: null })
  },
}))
