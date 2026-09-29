import { useEffect, useRef } from 'react'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { wikilinkAutocomplete } from '../lib/wikilinkAutocomplete'
import './Editor.css'

interface EditorProps {
  path: string
  content: string
  onChange: (content: string) => void
  /** retorna os nomes de notas existentes, usado para sugerir wikilinks */
  getNoteNames: () => string[]
  /** fração de scroll (0 a 1), reportada para sincronizar com o preview */
  onScroll?: (fraction: number) => void
  /** quando fornecido, o editor ajusta seu próprio scroll para essa fração */
  scrollToFraction?: number
}

export function Editor({
  path,
  content,
  onChange,
  getNoteNames,
  onScroll,
  scrollToFraction,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onScrollRef = useRef(onScroll)
  const getNoteNamesRef = useRef(getNoteNames)
  const suppressScrollRef = useRef(false)
  onChangeRef.current = onChange
  onScrollRef.current = onScroll
  getNoteNamesRef.current = getNoteNames

  // recria a instância do editor quando o arquivo ativo muda
  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        closeBrackets(),
        wikilinkAutocomplete(() => getNoteNamesRef.current()),
        keymap.of([
          // bloqueia o Ctrl+S nativo do browser; o sync real é feito pelo listener
          // global em App.tsx (cobre também quando o foco não está no editor)
          { key: 'Mod-s', run: () => true, preventDefault: true },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        markdown(),
        placeholder('Comece a escrever...'),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '15px', color: 'var(--text-primary)' },
          '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto' },
          '.cm-content': { padding: '24px 0', caretColor: 'var(--accent)' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
            backgroundColor: 'var(--selection-bg) !important',
          },
          '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
          '.cm-gutters': { display: 'none' },
          '.cm-tooltip-autocomplete': {
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            overflow: 'hidden',
          },
          '.cm-tooltip-autocomplete ul li': {
            color: 'var(--text-primary)',
            padding: '4px 8px',
          },
          '.cm-tooltip-autocomplete ul li[aria-selected]': {
            backgroundColor: 'var(--accent)',
            color: 'white',
          },
          '.cm-completionIcon': { display: 'none' },
        }, { dark: true }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    const scroller = view.scrollDOM
    const handleScroll = () => {
      if (suppressScrollRef.current) {
        suppressScrollRef.current = false
        return
      }
      const max = scroller.scrollHeight - scroller.clientHeight
      const fraction = max > 0 ? scroller.scrollTop / max : 0
      onScrollRef.current?.(fraction)
    }
    scroller.addEventListener('scroll', handleScroll)

    return () => {
      scroller.removeEventListener('scroll', handleScroll)
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // aplica scroll externo (vindo do preview) sem disparar o próprio onScroll de volta
  useEffect(() => {
    if (scrollToFraction === undefined || !viewRef.current) return
    const scroller = viewRef.current.scrollDOM
    const max = scroller.scrollHeight - scroller.clientHeight
    if (max <= 0) return
    suppressScrollRef.current = true
    scroller.scrollTop = scrollToFraction * max
  }, [scrollToFraction])

  return <div className="editor-container" ref={containerRef} />
}
