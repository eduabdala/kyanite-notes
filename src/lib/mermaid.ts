import { MERMAID_PLACEHOLDER_CLASS } from './markdown'
import { useMermaidViewerStore } from '../store/useMermaidViewerStore'

let mermaidIdCounter = 0

// ícone "maximize-2" do lucide, inline porque o botão é injetado fora do React
const EXPAND_ICON =
  '<svg class="app-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'

/**
 * Renderiza os placeholders ```mermaid``` dentro do container como SVG e adiciona um botão
 * para abrir o diagrama no visualizador em tela cheia (zoom/arraste).
 * Retorna uma função de cancelamento para usar no cleanup do useEffect.
 */
export function renderMermaidBlocks(
  container: HTMLElement,
  mode: 'dark' | 'light',
  expandLabel: string
): () => void {
  const blocks = container.querySelectorAll<HTMLElement>(`.${MERMAID_PLACEHOLDER_CLASS}`)
  if (blocks.length === 0) return () => {}

  let cancelled = false

  // import dinâmico: mermaid só é carregado quando a nota realmente tem um diagrama
  import('mermaid').then(({ default: mermaid }) => {
    if (cancelled) return
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: mode === 'dark' ? 'dark' : 'default',
    })

    blocks.forEach(async (block) => {
      const code = block.dataset.mermaidCode ? decodeURIComponent(block.dataset.mermaidCode) : ''
      if (!code) return
      const id = `mermaid-${mermaidIdCounter++}`
      try {
        const { svg } = await mermaid.render(id, code)
        if (cancelled) return
        block.innerHTML = svg
        block.classList.add('mermaid-block-rendered')

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'mermaid-expand-btn'
        button.title = expandLabel
        button.setAttribute('aria-label', expandLabel)
        button.innerHTML = EXPAND_ICON
        button.addEventListener('click', (e) => {
          // impede que o clique chegue ao container (no BlockEditor isso entraria em modo edição)
          e.stopPropagation()
          useMermaidViewerStore.getState().open(svg)
        })
        block.appendChild(button)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Erro ao renderizar diagrama'
        block.textContent = message
        block.classList.add('mermaid-block-error')
      }
    })
  })

  return () => {
    cancelled = true
  }
}
