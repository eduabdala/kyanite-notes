import { create } from 'zustand'

interface MermaidViewerState {
  svg: string | null
  open: (svg: string) => void
  close: () => void
}

/** Estado do visualizador em tela cheia de diagramas mermaid (montado uma vez no App) */
export const useMermaidViewerStore = create<MermaidViewerState>((set) => ({
  svg: null,
  open: (svg) => set({ svg }),
  close: () => set({ svg: null }),
}))
