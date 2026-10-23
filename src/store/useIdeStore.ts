import { create } from 'zustand'
import { setOnTabActivate } from './useTabsStore'

/** Estado de UI do workspace de código: painel lateral ativo, Quick Open/paleta e diff aberto. */

export type IdePanel = 'explorer' | 'search' | 'changes'
export type QuickOpenMode = 'files' | 'commands'

interface IdeState {
  panel: IdePanel
  setPanel: (panel: IdePanel) => void
  quickOpen: QuickOpenMode | null
  openQuickOpen: (mode: QuickOpenMode) => void
  closeQuickOpen: () => void
  /** arquivo com o diff aberto no lugar do editor (painel de alterações) */
  diffPath: string | null
  openDiff: (path: string) => void
  closeDiff: () => void
  /** pedido para o editor selecionar uma linha (resultado da busca); consumido pelo Editor */
  reveal: { path: string; line: number } | null
  revealLine: (path: string, line: number) => void
  clearReveal: () => void
}

// abrir/trocar de aba (árvore, abas, Quick Open, busca) fecha o diff e mostra o arquivo
setOnTabActivate(() => {
  if (useIdeStore.getState().diffPath) useIdeStore.setState({ diffPath: null })
})

export const useIdeStore = create<IdeState>((set) => ({
  panel: 'explorer',
  setPanel: (panel) => set({ panel }),
  quickOpen: null,
  openQuickOpen: (mode) => set({ quickOpen: mode }),
  closeQuickOpen: () => set({ quickOpen: null }),
  diffPath: null,
  openDiff: (path) => set({ diffPath: path }),
  closeDiff: () => set({ diffPath: null }),
  reveal: null,
  revealLine: (path, line) => set({ reveal: { path, line }, diffPath: null }),
  clearReveal: () => set({ reveal: null }),
}))
