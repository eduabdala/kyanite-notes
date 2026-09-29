import { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './Preview.css'

interface PreviewProps {
  content: string
  onScroll?: (fraction: number) => void
  scrollToFraction?: number
}

export function Preview({ content, onScroll, scrollToFraction }: PreviewProps) {
  const notes = useVaultStore((s) => s.notes)
  const openTab = useTabsStore((s) => s.openTab)
  const containerRef = useRef<HTMLDivElement>(null)
  const suppressScrollRef = useRef(false)

  const existingNames = useMemo(() => new Set(notes.map((n) => n.name)), [notes])
  const html = useMemo(() => renderMarkdown(content, existingNames), [content, existingNames])

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
