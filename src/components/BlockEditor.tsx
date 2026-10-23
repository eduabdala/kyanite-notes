import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CloudUpload, RefreshCw } from 'lucide-react'
import { renderMarkdown } from '../lib/markdown'
import { renderMermaidBlocks } from '../lib/mermaid'
import { splitIntoBlocks, joinBlocks, type Block } from '../lib/blocks'
import { splitPreset, useThemeStore } from '../store/useThemeStore'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './BlockEditor.css'

interface BlockEditorProps {
  path: string
  content: string
  onChange: (content: string) => void
}

/**
 * Modo "clique para editar": renderiza a nota como HTML (igual o Preview), dividida em blocos
 * (parágrafo, heading, lista, citação, código, tabela). Clicar num bloco troca só aquele trecho
 * por um textarea com o markdown bruto; ao sair do bloco (blur/Escape/Ctrl+Enter), volta a
 * renderizar. O resto da nota nunca sai do modo leitura durante a edição de um bloco.
 */
export function BlockEditor({ path, content, onChange }: BlockEditorProps) {
  const { t } = useTranslation()
  const notes = useVaultStore((s) => s.notes)
  const createNote = useVaultStore((s) => s.createNote)
  const openTab = useTabsStore((s) => s.openTab)
  const getAttachmentUrl = useVaultStore((s) => s.getAttachmentUrl)
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const pushNote = useVaultStore((s) => s.pushNote)
  const syncStatus = useVaultStore((s) => s.syncStatus)
  const isDirty = notes.find((n) => n.path === path)?.dirty ?? false
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
    // content/editingIndex disparam re-render do HTML, então os placeholders precisam ser renderizados de novo
    return renderMermaidBlocks(container, mode, t('mermaid.expand'))
  }, [content, editingIndex, mode, t])

  const isSyncingThisNote = syncStatus === 'syncing'
  const saveSyncButton = githubConfig && (
    <button
      type="button"
      className={`editor-save-btn block-editor-save-btn ${isDirty ? 'dirty' : ''}`}
      title={isDirty ? t('editor.saveAndSync') : t('editor.synced')}
      onClick={() => pushNote(path)}
      disabled={!isDirty || isSyncingThisNote}
    >
      {isSyncingThisNote ? (
        <RefreshCw size={16} strokeWidth={1.75} className="spin" />
      ) : isDirty ? (
        <CloudUpload size={16} strokeWidth={1.75} />
      ) : (
        <Check size={16} strokeWidth={1.75} />
      )}
    </button>
  )

  if (blocks.length === 0) {
    // nota vazia: um único bloco "fantasma" clicável para começar a escrever
    return (
      <div className="block-editor-container">
        {saveSyncButton}
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
      {saveSyncButton}
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
