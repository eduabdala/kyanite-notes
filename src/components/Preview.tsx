import { useEffect, useMemo, useRef } from 'react'
import { MERMAID_PLACEHOLDER_CLASS, renderMarkdown } from '../lib/markdown'
import { splitPreset, useThemeStore } from '../store/useThemeStore'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './Preview.css'

let mermaidIdCounter = 0

interface PreviewProps {
  content: string
  onScroll?: (fraction: number) => void
  scrollToFraction?: number
}

export function Preview({ content, onScroll, scrollToFraction }: PreviewProps) {
  const notes = useVaultStore((s) => s.notes)
  const openTab = useTabsStore((s) => s.openTab)
  const preset = useThemeStore((s) => s.preset)
  const { mode } = splitPreset(preset)
  const containerRef = useRef<HTMLDivElement>(null)
  const suppressScrollRef = useRef(false)
  const getAttachmentUrl = useVaultStore((s) => s.getAttachmentUrl)
  // força um novo render quando um anexo termina de carregar (o cache vive fora do useMemo)
  const attachmentCacheVersion = useVaultStore((s) => s.attachmentCache)

  const existingNames = useMemo(() => new Set(notes.map((n) => n.name)), [notes])
  const html = useMemo(
    () => renderMarkdown(content, existingNames, getAttachmentUrl),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachmentCacheVersion dispara recomputo quando o cache muda
    [content, existingNames, getAttachmentUrl, attachmentCacheVersion]
  )

  // renderiza os blocos ```mermaid``` como SVG após o HTML ser injetado no DOM
  // (import dinâmico: mermaid só é carregado quando a nota realmente tem um diagrama)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const blocks = container.querySelectorAll<HTMLElement>(`.${MERMAID_PLACEHOLDER_CLASS}`)
    if (blocks.length === 0) return

    let cancelled = false

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
  }, [html, mode])

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    const link = target.closest<HTMLElement>('[data-note-name]')
    if (!link) return

    const name = link.dataset.noteName
    const note = notes.find((n) => n.name === name)
    if (note) openTab(note.path)
  }

  function handleScroll() {
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false
      return
    }
    const el = containerRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    const fraction = max > 0 ? el.scrollTop / max : 0
    onScroll?.(fraction)
  }

  useEffect(() => {
    if (scrollToFraction === undefined) return
    const el = containerRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    if (max <= 0) return
    suppressScrollRef.current = true
    el.scrollTop = scrollToFraction * max
  }, [scrollToFraction])

  return (
    <div className="preview-container" ref={containerRef} onClick={handleClick} onScroll={handleScroll}>
      <div className="preview-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
