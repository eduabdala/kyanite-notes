import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MERMAID_PLACEHOLDER_CLASS, renderMarkdown } from '../lib/markdown'
import { splitIntoBlocks, joinBlocks, type Block } from '../lib/blocks'
import { splitPreset, useThemeStore } from '../store/useThemeStore'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './BlockEditor.css'

let mermaidIdCounter = 0

interface BlockEditorProps {
  content: string
  onChange: (content: string) => void
}

/**
 * Modo "clique para editar": renderiza a nota como HTML (igual o Preview), dividida em blocos
 * (parágrafo, heading, lista, citação, código, tabela). Clicar num bloco troca só aquele trecho
 * por um textarea com o markdown bruto; ao sair do bloco (blur/Escape/Ctrl+Enter), volta a
 * renderizar. O resto da nota nunca sai do modo leitura durante a edição de um bloco.
 */
export function BlockEditor({ content, onChange }: BlockEditorProps) {
  const { t } = useTranslation()
  const notes = useVaultStore((s) => s.notes)
  const createNote = useVaultStore((s) => s.createNote)
  const openTab = useTabsStore((s) => s.openTab)
  const getAttachmentUrl = useVaultStore((s) => s.getAttachmentUrl)
  // força um novo render quando um anexo termina de carregar (o cache vive fora do React state
  // normal); a própria leitura do hook já dispara o re-render, só precisamos "usar" o valor
  useVaultStore((s) => s.attachmentCache)
  const preset = useThemeStore((s) => s.preset)
  const { mode } = splitPreset(preset)

  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const blocks = useMemo(() => splitIntoBlocks(content), [content])
  const existingNames = useMemo(() => new Set(notes.map((n) => n.name)), [notes])

  // ao entrar em modo edição, foca o textarea e seleciona tudo (facilita substituir rápido)
  useEffect(() => {
    if (editingIndex === null) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    autoGrow(el)
  }, [editingIndex])

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function startEditing(index: number, block: Block) {
    setEditingIndex(index)
    setDraft(block.raw)
  }

  function commitEditing() {
    if (editingIndex === null) return

    // nota vazia: não há blocos ainda, o draft inteiro se torna o conteúdo da nota
    if (blocks.length === 0) {
      setEditingIndex(null)
      if (draft !== '') onChange(draft)
      return
    }

    const next = [...blocks]
    const normalized = draft.endsWith('\n') || editingIndex === blocks.length - 1 ? draft : `${draft}\n`
    next[editingIndex] = { ...next[editingIndex], raw: normalized }
    setEditingIndex(null)
    onChange(joinBlocks(next))
  }

  function cancelEditing() {
    setEditingIndex(null)
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      commitEditing()
    }
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement

    // clique num wikilink (fora do modo edição) abre a nota, igual o Preview
    const link = target.closest<HTMLElement>('[data-note-name]')
    if (link) {
      const name = link.dataset.noteName
      if (!name) return
      const note = notes.find((n) => n.name === name)
      if (note) openTab(note.path)
      else createNote(name)
      return
    }

    const blockEl = target.closest<HTMLElement>('[data-block-index]')
    if (!blockEl) return
    const index = Number(blockEl.dataset.blockIndex)
    if (Number.isNaN(index) || editingIndex === index) return
    startEditing(index, blocks[index])
  }

  // renderiza os blocos ```mermaid``` como SVG (mesmo mecanismo do Preview)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const mermaidBlocks = container.querySelectorAll<HTMLElement>(`.${MERMAID_PLACEHOLDER_CLASS}`)
    if (mermaidBlocks.length === 0) return

    let cancelled = false
    import('mermaid').then(({ default: mermaid }) => {
      if (cancelled) return
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: mode === 'dark' ? 'dark' : 'default',
      })
      mermaidBlocks.forEach(async (block) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachmentCacheVersion/editingIndex disparam re-render do HTML
  }, [content, editingIndex, mode])

  if (blocks.length === 0) {
    // nota vazia: um único bloco "fantasma" clicável para começar a escrever
    return (
      <div className="block-editor-container">
        <div className="preview-content block-editor-content">
          <div
            className="block-editor-empty"
            onClick={() => {
              setEditingIndex(0)
              setDraft('')
            }}
          >
            {editingIndex === 0 ? (
              <textarea
                ref={textareaRef}
                className="block-editor-textarea"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  autoGrow(e.target)
                }}
                onBlur={commitEditing}
                onKeyDown={handleTextareaKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="block-editor-placeholder">{t('editor.emptyPlaceholder')}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="block-editor-container" ref={containerRef} onClick={handleContainerClick}>
      <div className="preview-content block-editor-content">
        {blocks.map((block, index) => {
          if (editingIndex === index) {
            return (
              <div className="block-editor-editing" key={index} data-block-index={index}>
                <textarea
                  ref={textareaRef}
                  className="block-editor-textarea"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    autoGrow(e.target)
                  }}
                  onBlur={commitEditing}
                  onKeyDown={handleTextareaKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )
          }

          if (block.kind === 'blank') {
            // linha em branco: área fina mas clicável, para poder inserir conteúdo entre blocos
            return <div className="block-editor-blank" key={index} data-block-index={index} />
          }

          const html = renderMarkdown(block.raw, existingNames, getAttachmentUrl)
          return (
            <div
              className="block-editor-block"
              key={index}
              data-block-index={index}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        })}
      </div>
    </div>
  )
}
