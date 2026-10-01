import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { wikilinkAutocomplete } from '../lib/wikilinkAutocomplete'
import { livePreview } from '../lib/livePreview'
import { useVaultStore } from '../store/useVaultStore'
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
  /** chamado ao Ctrl/Cmd+click (ou clique no modo live preview) sobre um [[wikilink]] */
  onOpenWikilink?: (name: string) => void
}

/** Extrai arquivos de imagem de um evento de paste (DataTransferItemList) */
function extractImageFilesFromItems(items: DataTransferItemList | null | undefined): File[] {
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    const file = item.getAsFile()
    if (file && file.type.startsWith('image/')) files.push(file)
  }
  return files
}

/** Extrai arquivos de imagem de um evento de drop (FileList) */
function extractImageFilesFromFileList(fileList: FileList | null | undefined): File[] {
  if (!fileList) return []
  return Array.from(fileList).filter((file) => file.type.startsWith('image/'))
}

export function Editor({
  path,
  content,
  onChange,
  getNoteNames,
  onScroll,
  scrollToFraction,
  onOpenWikilink,
}: EditorProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  const onScrollRef = useRef(onScroll)
  const getNoteNamesRef = useRef(getNoteNames)
  const onOpenWikilinkRef = useRef(onOpenWikilink)
  const suppressScrollRef = useRef(false)
  const uploadAttachment = useVaultStore((s) => s.uploadAttachment)
  // guarda a função de upload atual em uma ref para poder chamá-la a partir do botão de anexo,
  // que fica fora do useEffect (não é recriado quando o arquivo ativo muda)
  const handleImageFileRef = useRef<(file: File, position: number) => Promise<void>>(null!)
  onChangeRef.current = onChange
  onScrollRef.current = onScroll
  getNoteNamesRef.current = getNoteNames
  onOpenWikilinkRef.current = onOpenWikilink

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
        livePreview(),
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

    /** Insere um placeholder no cursor, sobe a imagem, e substitui pelo `![[nome]]` final
     * (ou remove o placeholder se o upload falhar). */
    async function handleImageFile(file: File, position: number) {
      const placeholderText = `![[Enviando ${file.name}...]]`
      view.dispatch({
        changes: { from: position, to: position, insert: placeholderText },
        selection: { anchor: position + placeholderText.length },
      })

      const result = await uploadAttachment(file)
      const currentDoc = view.state.doc.toString()
      const placeholderStart = currentDoc.indexOf(placeholderText)
      if (placeholderStart === -1) return // usuário já editou/desfez o placeholder

      const replacement = result.ok ? `![[${result.fileName}]]` : `<!-- ${result.error} -->`
      view.dispatch({
        changes: {
          from: placeholderStart,
          to: placeholderStart + placeholderText.length,
          insert: replacement,
        },
      })
    }
    handleImageFileRef.current = handleImageFile

    function handlePaste(e: ClipboardEvent) {
      const files = extractImageFilesFromItems(e.clipboardData?.items)
      if (files.length === 0) return
      e.preventDefault()
      const position = view.state.selection.main.from
      files.forEach((file, i) => handleImageFile(file, position + i))
    }

    function handleDrop(e: DragEvent) {
      const files = extractImageFilesFromFileList(e.dataTransfer?.files)
      if (files.length === 0) return
      e.preventDefault()
      const dropPos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.from
      files.forEach((file, i) => handleImageFile(file, dropPos + i))
    }

    // Ctrl/Cmd+click sobre um [[wikilink]] renderizado (live preview) abre a nota, igual Obsidian;
    // clique simples continua só posicionando o cursor para edição normal
    function handleClick(e: MouseEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      const target = e.target as HTMLElement
      const link = target.closest<HTMLElement>('[data-wikilink-name]')
      if (!link) return
      e.preventDefault()
      onOpenWikilinkRef.current?.(link.dataset.wikilinkName!)
    }

    view.dom.addEventListener('paste', handlePaste)
    view.dom.addEventListener('drop', handleDrop)
    view.dom.addEventListener('dragover', (e) => e.preventDefault())
    view.dom.addEventListener('click', handleClick)

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
      view.dom.removeEventListener('paste', handlePaste)
      view.dom.removeEventListener('drop', handleDrop)
      view.dom.removeEventListener('click', handleClick)
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

  // no celular não há paste de imagem nem drag-and-drop de arquivo do sistema, então o botão
  // de anexo (input file com accept="image/*") é o caminho principal: no iOS/Android o browser
  // já oferece a escolha entre câmera e galeria nativamente
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const view = viewRef.current
    if (files.length > 0 && view) {
      const position = view.state.selection.main.from
      files.forEach((file, i) => handleImageFileRef.current(file, position + i))
    }
    e.target.value = '' // permite selecionar o mesmo arquivo de novo depois
  }

  return (
    <div className="editor-container">
      <div className="editor-cm-mount" ref={containerRef} />
      <button
        type="button"
        className="editor-attach-btn"
        title={t('editor.attachImage')}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus size={18} strokeWidth={1.75} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="editor-attach-input"
        onChange={handleFileInputChange}
      />
    </div>
  )
}
