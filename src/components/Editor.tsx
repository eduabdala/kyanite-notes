import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Check, CloudUpload, RefreshCw } from 'lucide-react'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { wikilinkAutocomplete } from '../lib/wikilinkAutocomplete'
import { codeEditorExtensions, loadLanguageFor } from '../lib/codeEditor'
import { IS_CODE_WORKSPACE } from '../lib/workspace'
import { fileNameOf } from '../lib/vault'
import { useVaultStore } from '../store/useVaultStore'
import { useIdeStore } from '../store/useIdeStore'
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
}: EditorProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  const onScrollRef = useRef(onScroll)
  const getNoteNamesRef = useRef(getNoteNames)
  const suppressScrollRef = useRef(false)
  const uploadAttachment = useVaultStore((s) => s.uploadAttachment)
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const pushNote = useVaultStore((s) => s.pushNote)
  const syncStatus = useVaultStore((s) => s.syncStatus)
  const isDirty = useVaultStore((s) => s.notes.find((n) => n.path === path)?.dirty ?? false)
  // guarda a função de upload atual em uma ref para poder chamá-la a partir do botão de anexo,
  // que fica fora do useEffect (não é recriado quando o arquivo ativo muda)
  const handleImageFileRef = useRef<(file: File, position: number) => Promise<void>>(null!)
  onChangeRef.current = onChange
  onScrollRef.current = onScroll
  getNoteNamesRef.current = getNoteNames

  // pedido de pular para uma linha (vindo da busca no repo)
  const reveal = useIdeStore((s) => (s.reveal?.path === path ? s.reveal : null))
  const clearReveal = useIdeStore((s) => s.clearReveal)
  useEffect(() => {
    const view = viewRef.current
    if (!reveal || !view) return
    const lineNo = Math.min(Math.max(1, reveal.line), view.state.doc.lines)
    const line = view.state.doc.line(lineNo)
    view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true })
    view.focus()
    clearReveal()
  })

  // workspaces de código: arquivo ainda não baixado é buscado ao abrir
  const isUnloaded = useVaultStore((s) => s.notes.find((n) => n.path === path)?.unloaded ?? false)
  const loadFileContent = useVaultStore((s) => s.loadFileContent)
  useEffect(() => {
    if (isUnloaded) loadFileContent(path)
  }, [isUnloaded, path, loadFileContent])

  // recria a instância do editor quando o arquivo ativo muda (ou termina de carregar)
  useEffect(() => {
    if (!containerRef.current || isUnloaded) return

    const languageCompartment = new Compartment()
    const modeExtensions = IS_CODE_WORKSPACE
      ? [codeEditorExtensions(), keymap.of([indentWithTab]), languageCompartment.of([])]
      : [
          wikilinkAutocomplete(() => getNoteNamesRef.current()),
          markdown(),
          placeholder('Comece a escrever...'),
          EditorView.lineWrapping,
        ]

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        closeBrackets(),
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
        modeExtensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: 'var(--note-font-size, 15px)', color: 'var(--text-primary)' },
          '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto' },
          '.cm-content': { padding: '24px 0', caretColor: 'var(--accent)' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
            backgroundColor: 'var(--selection-bg) !important',
          },
          '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
          ...(IS_CODE_WORKSPACE ? {} : { '.cm-gutters': { display: 'none' } }),
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

    // linguagem do arquivo carregada sob demanda (cada uma é um chunk separado no build)
    let disposed = false
    if (IS_CODE_WORKSPACE) {
      loadLanguageFor(fileNameOf(path)).then((lang) => {
        if (lang && !disposed) view.dispatch({ effects: languageCompartment.reconfigure(lang) })
      })
    }

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

    view.dom.addEventListener('paste', handlePaste)
    view.dom.addEventListener('drop', handleDrop)
    view.dom.addEventListener('dragover', (e) => e.preventDefault())

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
      disposed = true
      scroller.removeEventListener('scroll', handleScroll)
      view.dom.removeEventListener('paste', handlePaste)
      view.dom.removeEventListener('drop', handleDrop)
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, isUnloaded])

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

  const isSyncingThisNote = syncStatus === 'syncing'

  return (
    <div className={`editor-container ${IS_CODE_WORKSPACE ? 'editor-code' : ''}`}>
      {isUnloaded && <div className="editor-loading">{t('editor.loadingFile')}</div>}
      <div className="editor-cm-mount" ref={containerRef} />
      {/* em código o envio é pelo painel de alterações (Ctrl+S abre o painel) */}
      {githubConfig && !IS_CODE_WORKSPACE && (
        <button
          type="button"
          className={`editor-save-btn ${isDirty ? 'dirty' : ''}`}
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
      )}
      {!IS_CODE_WORKSPACE && (
        <button
          type="button"
          className="editor-attach-btn"
          title={t('editor.attachImage')}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={18} strokeWidth={1.75} />
        </button>
      )}
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
