import { create } from 'zustand'

/** Estado de UI leve compartilhado entre componentes que não têm relação de pai/filho direta.
 * Usado pelo atalho de plugins da TopBar para pedir ao App que troque o modo de visualização
 * da nota ativa (ex: abrir o quadro Kanban) sem prop drilling. */

export type ViewMode = 'edit' | 'preview' | 'split' | 'board' | 'agenda'

interface UiState {
  /** modo de visualização pedido externamente; o App consome e reflete no seu estado local */
  requestedViewMode: ViewMode | null
  requestViewMode: (mode: ViewMode) => void
  clearRequestedViewMode: () => void
}

export const useUiStore = create<UiState>((set) => ({
  requestedViewMode: null,
  requestViewMode: (mode) => set({ requestedViewMode: mode }),
  clearRequestedViewMode: () => set({ requestedViewMode: null }),
}))
