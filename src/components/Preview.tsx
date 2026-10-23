import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { renderMarkdown } from '../lib/markdown'
import { renderMermaidBlocks } from '../lib/mermaid'
import { splitPreset, useThemeStore } from '../store/useThemeStore'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './Preview.css'

interface PreviewProps {
  content: string
  onScroll?: (fraction: number) => void
  scrollToFraction?: number
}

export function Preview({ content, onScroll, scrollToFraction }: PreviewProps) {
  const { t } = useTranslation()
  const notes = useVaultStore((s) => s.notes)
  const createNote = useVaultStore((s) => s.createNote)
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
    return renderMermaidBlocks(container, mode, t('mermaid.expand'))
  }, [html, mode, t])

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    const link = target.closest<HTMLElement>('[data-note-name]')
    if (!link) return

    const name = link.dataset.noteName
    if (!name) return

    const note = notes.find((n) => n.name === name)
    if (note) {
      openTab(note.path)
    } else {
      // wikilink para uma nota que ainda não existe: cria automaticamente na raiz,
      // igual ao comportamento do Obsidian ao clicar num link quebrado
      createNote(name)
    }
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
