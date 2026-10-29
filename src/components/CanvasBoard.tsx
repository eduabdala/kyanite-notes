import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Plus, Pencil, Trash2, StickyNote, FileText, ZoomIn, ZoomOut, Maximize, FileDown,
  MousePointer2, PenLine, Eraser, ImagePlus, Link, GitBranchPlus, ExternalLink, Square,
  RectangleHorizontal, Circle,
} from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useConfirmStore } from '../store/useConfirmStore'
import { renderMarkdown } from '../lib/markdown'
import {
  NODE_COLORS, NODE_SHAPES, STROKE_WIDTHS, addCanvas, addChildNode, addEdge, addSiblingNode, borderPoint,
  canvasBounds, getActiveCanvas, newId, putCanvas, removeCanvas, removeNodes, safeUrl, strokeDistance,
  strokePath, type Canvas, type CanvasNode, type CanvasStroke, type NodeShape,
} from '../lib/canvas'
import { exportCanvasPdf } from '../lib/pdfExport'
// reaproveita o header/abas do Kanban e a tipografia do Preview
import './KanbanBoard.css'
import './Preview.css'
import './CanvasBoard.css'

interface CanvasBoardProps {
  onClose: () => void
}

interface View {
  x: number
  y: number
  zoom: number
}

type Tool = 'select' | 'pen' | 'eraser'

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
  | { kind: 'connect'; from: string }
  | { kind: 'draw'; points: number[]; color: string; width: number }
  | { kind: 'erase'; erased: boolean }

type Selection = { type: 'node' | 'edge'; id: string } | null
type Prompt = 'rename' | 'note' | 'link' | null

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5
const HISTORY_LIMIT = 50
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
const round1 = (v: number) => Math.round(v * 10) / 10

const SHAPE_ICONS: Record<NodeShape, typeof Square> = {
  rect: Square,
  pill: RectangleHorizontal,
  ellipse: Circle,
}

/** tamanho inicial do cartão de imagem: proporção original, no máximo 400px */
async function imageSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 400 / bmp.width, 400 / bmp.height)
    const size = { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) }
    bmp.close()
    return size
  } catch {
    return { width: 320, height: 240 }
  }
}

function isTyping(): boolean {
  const tag = (document.activeElement as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA'
}

export function CanvasBoard({ onClose }: CanvasBoardProps) {
  const { t } = useTranslation()
  const collection = useVaultStore((s) => s.canvasCollection)
  const save = useVaultStore((s) => s.saveCanvasCollection)
  const notes = useVaultStore((s) => s.notes)
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const uploadAttachment = useVaultStore((s) => s.uploadAttachment)
  const getAttachmentUrl = useVaultStore((s) => s.getAttachmentUrl)
  const attachmentCache = useVaultStore((s) => s.attachmentCache)
  const openTab = useTabsStore((s) => s.openTab)
  const confirm = useConfirmStore((s) => s.confirm)

  // rascunho local durante arrastes: só grava no store (localStorage + sync) ao soltar
  const [draft, setDraft] = useState<Canvas | null>(null)
  const canvas = draft ?? getActiveCanvas(collection)
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas

  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [tool, setTool] = useState<Tool>('select')
  const [penColor, setPenColor] = useState('')
  const [penWidth, setPenWidth] = useState(STROKE_WIDTHS[1])
  const [liveStroke, setLiveStroke] = useState<CanvasStroke | null>(null)
  const [selected, setSelected] = useState<Selection>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [connectLine, setConnectLine] = useState<{ from: string; x: number; y: number } | null>(null)
  const [prompt, setPrompt] = useState<Prompt>(null)
  const [promptValue, setPromptValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const historyRef = useRef<Canvas[]>([])
  /** cartões cuja edição já foi concluída (evita o onBlur do textarea desmontado gravar por cima depois) */
  const editDoneRef = useRef(new Set<string>())
  const requestedImagesRef = useRef(new Set<string>())

  const existingNames = useMemo(() => new Set(notes.map((n) => n.name)), [notes])
  const notesByPath = useMemo(() => new Map(notes.map((n) => [n.path, n])), [notes])
  const nodeById = new Map(canvas.nodes.map((n) => [n.id, n]))

  function commit(next: Canvas) {
    const current = useVaultStore.getState().canvasCollection
    const before = getActiveCanvas(current)
    if (before.id === next.id) {
      historyRef.current = [...historyRef.current.slice(-(HISTORY_LIMIT - 1)), before]
    }
    setDraft(null)
    save(putCanvas(current, next))
  }

  function undo() {
    const prev = historyRef.current.pop()
    if (!prev) return
    const current = useVaultStore.getState().canvasCollection
    if (prev.id !== current.activeCanvasId) return
    setSelected(null)
    setEditing(null)
    save(putCanvas(current, prev))
  }

  function toWorld(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom }
  }

  function nodeAt(x: number, y: number): CanvasNode | undefined {
    // de trás pra frente: o último desenhado fica por cima
    return [...canvasRef.current.nodes].reverse().find(
      (n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height
    )
  }

  // ---- arrastes (listeners na janela para não perder o ponteiro fora do viewport) ----

  function startDrag(d: Drag) {
    dragRef.current = d
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  function eraseAt(clientX: number, clientY: number, d: Extract<Drag, { kind: 'erase' }>) {
    const p = toWorld(clientX, clientY)
    const tolerance = 8 / viewRef.current.zoom
    const c = canvasRef.current
    const strokes = c.strokes.filter((s) => strokeDistance(s, p.x, p.y) > tolerance + s.width / 2)
    if (strokes.length === c.strokes.length) return
    d.erased = true
    const next = { ...c, strokes }
    canvasRef.current = next
    setDraft(next)
  }

  function onPointerMove(e: PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const zoom = viewRef.current.zoom
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }))
    } else if (d.kind === 'move') {
      const dx = (e.clientX - d.sx) / zoom
      const dy = (e.clientY - d.sy) / zoom
      if (!d.moved && Math.hypot(dx, dy) < 3) return
      d.moved = true
      const c = canvasRef.current
      setDraft({
        ...c,
        nodes: c.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) } : n)),
      })
    } else if (d.kind === 'resize') {
      const w = Math.max(40, Math.round(d.ow + (e.clientX - d.sx) / zoom))
      const h = Math.max(30, Math.round(d.oh + (e.clientY - d.sy) / zoom))
      const c = canvasRef.current
      setDraft({ ...c, nodes: c.nodes.map((n) => (n.id === d.id ? { ...n, width: w, height: h } : n)) })
    } else if (d.kind === 'connect') {
      const p = toWorld(e.clientX, e.clientY)
      setConnectLine({ from: d.from, x: p.x, y: p.y })
    } else if (d.kind === 'draw') {
      const p = toWorld(e.clientX, e.clientY)
      const pts = d.points
      if (Math.hypot(p.x - pts[pts.length - 2], p.y - pts[pts.length - 1]) < 2 / zoom) return
      pts.push(round1(p.x), round1(p.y))
      setLiveStroke({ id: 'live', points: [...pts], color: d.color, width: d.width })
    } else {
      eraseAt(e.clientX, e.clientY, d)
    }
  }

  function onPointerUp(e: PointerEvent) {
    window.removeEventListener('pointermove', onPointerMove)
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.kind === 'connect') {
      setConnectLine(null)
      const p = toWorld(e.clientX, e.clientY)
      const target = nodeAt(p.x, p.y)
      if (target) commit(addEdge(canvasRef.current, d.from, target.id))
    } else if (d.kind === 'draw') {
      setLiveStroke(null)
      const c = canvasRef.current
      const stroke: CanvasStroke = { id: newId('stroke'), points: d.points, color: d.color, width: d.width }
      commit({ ...c, strokes: [...c.strokes, stroke] })
    } else if ((d.kind === 'move' && d.moved) || d.kind === 'resize' || (d.kind === 'erase' && d.erased)) {
      commit(canvasRef.current)
    }
  }

  useEffect(() => () => window.removeEventListener('pointermove', onPointerMove), []) // eslint-disable-line react-hooks/exhaustive-deps

  // roda do mouse: pan; Ctrl/⌘ + roda (ou pinça no trackpad): zoom em torno do cursor.
  // listener nativo porque o onWheel do React é passivo e não deixa cancelar o scroll da página
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if ((e.target as HTMLElement).closest('.canvas-node-body')) {
        // rolar dentro de um cartão com conteúdo longo rola o cartão, não a tela
        const body = (e.target as HTMLElement).closest('.canvas-node-body')!
        if (!e.ctrlKey && !e.metaKey && body.scrollHeight > body.clientHeight) return
      }
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el!.getBoundingClientRect()
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.01))
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function zoomAt(sx: number, sy: number, factor: number) {
    setView((v) => {
      const zoom = clampZoom(v.zoom * factor)
      const k = zoom / v.zoom
      return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k }
    })
  }

  function zoomBy(factor: number) {
    const rect = viewportRef.current!.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, factor)
  }

  function fitToScreen() {
    const rect = viewportRef.current!.getBoundingClientRect()
    const b = canvasBounds(canvasRef.current)
    const zoom = clampZoom(Math.min(1, rect.width / b.width, rect.height / b.height))
    setView({
      zoom,
      x: (rect.width - b.width * zoom) / 2 - b.x * zoom,
      y: (rect.height - b.height * zoom) / 2 - b.y * zoom,
    })
  }

  // ao trocar de canvas, enquadra o conteúdo e zera o histórico de desfazer
  useEffect(() => {
    setSelected(null)
    setEditing(null)
    historyRef.current = []
    fitToScreen()
  }, [collection.activeCanvasId])

  // baixa as imagens dos cartões (uma vez por arquivo, mesmo se o download falhar)
  useEffect(() => {
    for (const n of canvas.nodes) {
      if (n.type !== 'image' || !n.file || requestedImagesRef.current.has(n.file)) continue
      requestedImagesRef.current.add(n.file)
      getAttachmentUrl(n.file)
    }
  }, [canvas.nodes, getAttachmentUrl])

  // atalhos: Delete remove, Tab cria filho, Enter cria irmão (mapa mental), F2 edita, Ctrl+Z desfaz
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping()) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.key === 'Escape') {
        setSelected(null)
        setTool('select')
        return
      }
      if (!selected) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
      } else if (selected.type === 'node' && (e.key === 'Tab' || e.key === 'Enter')) {
        e.preventDefault()
        growMindMap(canvasRef.current, selected.id, e.key === 'Tab' ? 'child' : 'sibling')
      } else if (selected.type === 'node' && e.key === 'F2' && nodeById.get(selected.id)?.type === 'text') {
        startEditing(selected.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // colar: imagem vira cartão de imagem, URL vira cartão de link, texto vira cartão de texto
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isTyping() || !e.clipboardData) return
      const files = Array.from(e.clipboardData.files)
      if (files.length) {
        e.preventDefault()
        addImageFiles(files, viewportCenter())
        return
      }
      const text = e.clipboardData.getData('text/plain').trim()
      if (!text) return
      e.preventDefault()
      const url = /\s/.test(text) ? null : safeUrl(text)
      if (url) addNode({ type: 'link', url })
      else addNode({ type: 'text', text })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function deleteSelected() {
    if (!selected) return
    const c = canvasRef.current
    if (selected.type === 'node') commit(removeNodes(c, new Set([selected.id])))
    else commit({ ...c, edges: c.edges.filter((e) => e.id !== selected.id) })
    setSelected(null)
  }

  // ---- criação e edição de cartões ----

  function viewportCenter() {
    const rect = viewportRef.current!.getBoundingClientRect()
    return toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  function addNode(partial: Pick<CanvasNode, 'type'> & Partial<CanvasNode>, at = viewportCenter()) {
    const width = partial.width ?? (partial.type === 'note' ? 320 : partial.type === 'link' ? 280 : 240)
    const height = partial.height ?? (partial.type === 'note' ? 240 : partial.type === 'link' ? 80 : 120)
    const node: CanvasNode = {
      id: newId('node'),
      ...partial,
      x: Math.round(at.x - width / 2),
      y: Math.round(at.y - height / 2),
      width,
      height,
    }
    commit({ ...canvasRef.current, nodes: [...canvasRef.current.nodes, node] })
    setSelected({ type: 'node', id: node.id })
    return node
  }

  async function addImageFiles(files: File[], at: { x: number; y: number }) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    if (!githubConfig) {
      setError(t('canvas.imageNeedsGithub'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      let offset = 0
      for (const file of images) {
        const size = await imageSize(file)
        const res = await uploadAttachment(file)
        if (!res.ok) {
          setError(res.error)
          continue
        }
        requestedImagesRef.current.add(res.fileName)
        addNode({ type: 'image', file: res.fileName, ...size }, { x: at.x + offset, y: at.y + offset })
        offset += 30
      }
    } finally {
      setBusy(false)
    }
  }

  function startEditing(id: string) {
    editDoneRef.current.delete(id)
    setEditing(id)
  }

  /** cria filho/irmão no mapa mental a partir de `c` e já entra em edição no novo cartão */
  function growMindMap(c: Canvas, id: string, kind: 'child' | 'sibling') {
    const r = (kind === 'child' ? addChildNode : addSiblingNode)(c, id)
    if (!r) return
    commit(r.canvas)
    setSelected({ type: 'node', id: r.node.id })
    startEditing(r.node.id)
  }

  function finishEdit(id: string, text: string, then?: 'child' | 'sibling') {
    if (editDoneRef.current.has(id)) return
    editDoneRef.current.add(id)
    setEditing(null)
    const c = canvasRef.current
    const node = c.nodes.find((n) => n.id === id)
    if (!node) return
    // cartão de texto que ficou vazio some (comum ao criar filhos com Tab e desistir)
    if (!text.trim() && !then) {
      commit(removeNodes(c, new Set([id])))
      setSelected(null)
      return
    }
    const next = { ...c, nodes: c.nodes.map((n) => (n.id === id ? { ...n, text } : n)) }
    if (then) growMindMap(next, id, then)
    else commit(next)
  }

  function updateNode(id: string, patch: Partial<CanvasNode>) {
    const c = canvasRef.current
    commit({ ...c, nodes: c.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
  }

  function updateEdgeLabel(id: string, label: string) {
    const c = canvasRef.current
    commit({ ...c, edges: c.edges.map((e) => (e.id === id ? { ...e, label: label.trim() || undefined } : e)) })
  }

  // ---- barra de entrada (renomear, adicionar nota/link) ----

  function openPrompt(kind: Prompt, value = '') {
    setPrompt(kind)
    setPromptValue(value)
    setError(null)
  }

  function submitPrompt() {
    const value = promptValue.trim()
    if (prompt === 'rename' && value) {
      commit({ ...canvasRef.current, name: value })
    } else if (prompt === 'note' && value) {
      const q = value.toLowerCase()
      const match = notes.find((n) => n.name.toLowerCase() === q || n.path.toLowerCase() === q)
      if (match) addNode({ type: 'note', notePath: match.path })
      else setError(t('canvas.noteNotFound', { name: value }))
    } else if (prompt === 'link' && value) {
      const url = safeUrl(/^[a-z]+:/i.test(value) ? value : `https://${value}`)
      if (url) addNode({ type: 'link', url })
      else setError(t('canvas.invalidUrl'))
    }
    setPrompt(null)
    setPromptValue('')
  }

  // ---- gestão de canvases ----

  async function handleRemoveCanvas() {
    const ok = await confirm(t('canvas.removeConfirm', { name: canvas.name }))
    if (ok) save(removeCanvas(collection, canvas.id))
  }

  async function handleExport() {
    setBusy(true)
    try {
      await exportCanvasPdf(canvas, notes, existingNames, getAttachmentUrl)
    } finally {
      setBusy(false)
    }
  }

  function handleViewportPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // botão do meio arrasta a tela em qualquer ferramenta
    if (e.button === 1) {
      e.preventDefault()
      startDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y })
      return
    }
    if (e.button !== 0) return
    if (tool === 'pen') {
      const p = toWorld(e.clientX, e.clientY)
      const points = [round1(p.x), round1(p.y)]
      setLiveStroke({ id: 'live', points, color: penColor, width: penWidth })
      startDrag({ kind: 'draw', points, color: penColor, width: penWidth })
      return
    }
    if (tool === 'eraser') {
      const d: Drag = { kind: 'erase', erased: false }
      startDrag(d)
      eraseAt(e.clientX, e.clientY, d)
      return
    }
    if (e.target !== e.currentTarget) return
    setSelected(null)
    setEditing(null)
    startDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y })
  }

  function renderNodeContent(node: CanvasNode) {
    if (editing === node.id) {
      return (
        <textarea
          autoFocus
          className="canvas-node-edit"
          defaultValue={node.text ?? ''}
          placeholder={t('canvas.textPlaceholder')}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => finishEdit(node.id, e.target.value)}
          onKeyDown={(e) => {
            const value = (e.target as HTMLTextAreaElement).value
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              finishEdit(node.id, value)
            } else if (e.key === 'Tab') {
              e.preventDefault()
              finishEdit(node.id, value, 'child')
            }
          }}
        />
      )
    }

    if (node.type === 'image') {
      const url = node.file ? attachmentCache.get(node.file) : undefined
      return url ? (
        <img className="canvas-node-image" src={url} alt={node.file} draggable={false} />
      ) : (
        <div className="canvas-node-placeholder">{url === '' ? t('canvas.loadingImage') : node.file}</div>
      )
    }

    if (node.type === 'link' && node.url) {
      let host = node.url
      try {
        host = new URL(node.url).hostname
      } catch {
        /* url já validada ao criar */
      }
      return (
        <a
          className="canvas-node-link"
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="canvas-node-link-host">
            <ExternalLink size={13} strokeWidth={1.75} />
            {host}
          </span>
          <span className="canvas-node-link-url">{node.url}</span>
        </a>
      )
    }

    const md = node.type === 'note' ? (notesByPath.get(node.notePath ?? '')?.content ?? '') : (node.text ?? '')
    return (
      <div
        className="canvas-node-body preview-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(md, existingNames, getAttachmentUrl) }}
      />
    )
  }

  const selectedNode = selected?.type === 'node' ? nodeById.get(selected.id) : undefined
  const selectedEdge = selected?.type === 'edge' ? canvas.edges.find((e) => e.id === selected.id) : undefined

  return (
    <div className={`canvas-view tool-${tool}`}>
      <div className="kanban-view-header">
        <button className="kanban-back-btn" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.75} />
          {t('kanban.backToNotes')}
        </button>

        <div className="kanban-tabs">
          {collection.canvases.map((c) => (
            <button
              key={c.id}
              className={`kanban-tab ${c.id === collection.activeCanvasId ? 'active' : ''}`}
              onClick={() => c.id !== collection.activeCanvasId && save({ ...collection, activeCanvasId: c.id })}
            >
              {c.name}
            </button>
          ))}
          <button
            className="kanban-tab kanban-tab-add"
            title={t('canvas.add')}
            onClick={() => save(addCanvas(collection, t('canvas.defaultName')))}
          >
            <Plus size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div className="kanban-board-actions">
          <button className="kanban-icon-btn" title={t('pdf.export')} onClick={handleExport} disabled={busy}>
            <FileDown size={15} strokeWidth={1.75} />
          </button>
          <button className="kanban-icon-btn" title={t('canvas.rename')} onClick={() => openPrompt('rename', canvas.name)}>
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            className="kanban-icon-btn"
            title={t('canvas.remove')}
            onClick={handleRemoveCanvas}
            disabled={collection.canvases.length <= 1}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {(prompt || error) && (
        <div className="kanban-rename-row canvas-prompt-row">
          {prompt && (
            <>
              <input
                autoFocus
                list={prompt === 'note' ? 'canvas-note-options' : undefined}
                className="kanban-input"
                value={promptValue}
                placeholder={t(`canvas.prompt.${prompt}`)}
                onChange={(e) => setPromptValue(e.target.value)}
                onBlur={submitPrompt}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitPrompt()
                  if (e.key === 'Escape') {
                    setPrompt(null)
                    setPromptValue('')
                  }
                }}
              />
              {prompt === 'note' && (
                <datalist id="canvas-note-options">
                  {notes.map((n) => (
                    <option key={n.path} value={n.name} />
                  ))}
                </datalist>
              )}
            </>
          )}
          {error && (
            <span className="canvas-error" role="alert">
              {error}
            </span>
          )}
        </div>
      )}

      <div className="canvas-stage">
        {/* barra de ferramentas lateral: ferramentas e inserção de elementos */}
        <div className="canvas-toolbar" role="toolbar" aria-label={t('canvas.tools')}>
          {(
            [
              ['select', MousePointer2, t('canvas.toolSelect')],
              ['pen', PenLine, t('canvas.toolPen')],
              ['eraser', Eraser, t('canvas.toolEraser')],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              className={`kanban-icon-btn ${tool === id ? 'active' : ''}`}
              title={label}
              aria-label={label}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
            >
              <Icon size={16} strokeWidth={1.75} />
            </button>
          ))}
          <span className="canvas-toolbar-sep" />
          <button
            className="kanban-icon-btn"
            title={t('canvas.addText')}
            aria-label={t('canvas.addText')}
            onClick={() => {
              setTool('select')
              startEditing(addNode({ type: 'text', text: '' }).id)
            }}
          >
            <StickyNote size={16} strokeWidth={1.75} />
          </button>
          <button
            className="kanban-icon-btn"
            title={t('canvas.addNote')}
            aria-label={t('canvas.addNote')}
            onClick={() => openPrompt('note')}
          >
            <FileText size={16} strokeWidth={1.75} />
          </button>
          <button
            className="kanban-icon-btn"
            title={t('canvas.addImage')}
            aria-label={t('canvas.addImage')}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={16} strokeWidth={1.75} />
          </button>
          <button
            className="kanban-icon-btn"
            title={t('canvas.addLink')}
            aria-label={t('canvas.addLink')}
            onClick={() => openPrompt('link')}
          >
            <Link size={16} strokeWidth={1.75} />
          </button>
          <span className="canvas-toolbar-sep" />
          <button className="kanban-icon-btn" title={t('canvas.zoomIn')} aria-label={t('canvas.zoomIn')} onClick={() => zoomBy(1.2)}>
            <ZoomIn size={16} strokeWidth={1.75} />
          </button>
          <span className="canvas-zoom-label">{Math.round(view.zoom * 100)}%</span>
          <button className="kanban-icon-btn" title={t('canvas.zoomOut')} aria-label={t('canvas.zoomOut')} onClick={() => zoomBy(1 / 1.2)}>
            <ZoomOut size={16} strokeWidth={1.75} />
          </button>
          <button className="kanban-icon-btn" title={t('canvas.fit')} aria-label={t('canvas.fit')} onClick={fitToScreen}>
            <Maximize size={15} strokeWidth={1.75} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addImageFiles(Array.from(e.target.files ?? []), viewportCenter())
              e.target.value = ''
            }}
          />
        </div>

        {/* barra flutuante contextual: caneta, cartão ou seta selecionados */}
        {tool === 'pen' && (
          <div className="canvas-float-bar" role="toolbar" aria-label={t('canvas.toolPen')}>
            {NODE_COLORS.map((color) => (
              <button
                key={color || 'default'}
                className={`canvas-color-swatch ${penColor === color ? 'active' : ''}`}
                style={{ background: color || 'var(--text-primary)' }}
                aria-label={color || t('canvas.defaultColor')}
                onClick={() => setPenColor(color)}
              />
            ))}
            <span className="canvas-toolbar-sep vertical" />
            {STROKE_WIDTHS.map((w) => (
              <button
                key={w}
                className={`canvas-width-btn ${penWidth === w ? 'active' : ''}`}
                aria-label={t('canvas.strokeWidth', { width: w })}
                onClick={() => setPenWidth(w)}
              >
                <span style={{ width: w + 4, height: w + 4 }} />
              </button>
            ))}
          </div>
        )}

        {tool === 'select' && selectedNode && !editing && (
          <div className="canvas-float-bar" role="toolbar" aria-label={t('canvas.color')}>
            {NODE_COLORS.map((color) => (
              <button
                key={color || 'default'}
                className={`canvas-color-swatch ${(selectedNode.color ?? '') === color ? 'active' : ''}`}
                style={{ background: color || 'var(--bg-secondary)' }}
                title={color || t('canvas.defaultColor')}
                aria-label={color || t('canvas.defaultColor')}
                onClick={() => updateNode(selectedNode.id, { color: color || undefined })}
              />
            ))}
            {selectedNode.type !== 'image' && (
              <>
                <span className="canvas-toolbar-sep vertical" />
                {NODE_SHAPES.map((shape) => {
                  const Icon = SHAPE_ICONS[shape]
                  const active = (selectedNode.shape ?? 'rect') === shape
                  return (
                    <button
                      key={shape}
                      className={`kanban-icon-btn ${active ? 'active' : ''}`}
                      title={t(`canvas.shapes.${shape}`)}
                      aria-label={t(`canvas.shapes.${shape}`)}
                      aria-pressed={active}
                      onClick={() => updateNode(selectedNode.id, { shape: shape === 'rect' ? undefined : shape })}
                    >
                      <Icon size={14} strokeWidth={1.75} />
                    </button>
                  )
                })}
              </>
            )}
            <span className="canvas-toolbar-sep vertical" />
            <button
              className="kanban-icon-btn"
              title={t('canvas.addChild')}
              aria-label={t('canvas.addChild')}
              onClick={() => growMindMap(canvasRef.current, selectedNode.id, 'child')}
            >
              <GitBranchPlus size={14} strokeWidth={1.75} />
            </button>
            <button className="kanban-icon-btn" title={t('canvas.delete')} aria-label={t('canvas.delete')} onClick={deleteSelected}>
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}

        {tool === 'select' && selectedEdge && (
          <div className="canvas-float-bar" role="toolbar" aria-label={t('canvas.edgeLabel')}>
            <input
              key={selectedEdge.id}
              className="kanban-input canvas-edge-label-input"
              defaultValue={selectedEdge.label ?? ''}
              placeholder={t('canvas.edgeLabel')}
              onBlur={(e) => {
                if ((selectedEdge.label ?? '') !== e.target.value.trim()) updateEdgeLabel(selectedEdge.id, e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
              }}
            />
            <button className="kanban-icon-btn" title={t('canvas.delete')} aria-label={t('canvas.delete')} onClick={deleteSelected}>
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}

        <div
          ref={viewportRef}
          className="canvas-viewport"
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px` }}
          onPointerDown={handleViewportPointerDown}
          onDoubleClick={(e) => {
            if (tool !== 'select' || e.target !== e.currentTarget) return
            startEditing(addNode({ type: 'text', text: '' }, toWorld(e.clientX, e.clientY)).id)
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return
            e.preventDefault()
            addImageFiles(Array.from(e.dataTransfer.files), toWorld(e.clientX, e.clientY))
          }}
        >
          {canvas.nodes.length === 0 && canvas.strokes.length === 0 && !liveStroke && (
            <div className="canvas-empty">{t('canvas.emptyHint')}</div>
          )}

          <div
            className="canvas-world"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          >
            <svg className="canvas-svg">
              <defs>
                <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
                </marker>
              </defs>
              {canvas.edges.map((edge) => {
                const a = nodeById.get(edge.fromNode)
                const b = nodeById.get(edge.toNode)
                if (!a || !b) return null
                const p1 = borderPoint(a, b.x + b.width / 2, b.y + b.height / 2)
                const p2 = borderPoint(b, a.x + a.width / 2, a.y + a.height / 2)
                const isSel = selected?.type === 'edge' && selected.id === edge.id
                return (
                  <g
                    key={edge.id}
                    className="canvas-edge-group"
                    onPointerDown={(e) => {
                      if (tool !== 'select') return
                      e.stopPropagation()
                      setSelected({ type: 'edge', id: edge.id })
                    }}
                  >
                    <line className="canvas-edge-hit" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
                    <line className={`canvas-edge ${isSel ? 'selected' : ''}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} markerEnd="url(#canvas-arrow)" />
                    {edge.label && (
                      <text className="canvas-edge-label" x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2}>
                        {edge.label}
                      </text>
                    )}
                  </g>
                )
              })}
              {connectLine && nodeById.get(connectLine.from) && (() => {
                const from = nodeById.get(connectLine.from)!
                const p = borderPoint(from, connectLine.x, connectLine.y)
                return <line className="canvas-edge selected" x1={p.x} y1={p.y} x2={connectLine.x} y2={connectLine.y} markerEnd="url(#canvas-arrow)" />
              })()}
            </svg>

            {canvas.nodes.map((node) => {
              const note = node.type === 'note' ? notesByPath.get(node.notePath ?? '') : undefined
              const isSel = selected?.type === 'node' && selected.id === node.id
              return (
                <div
                  key={node.id}
                  className={`canvas-node type-${node.type} shape-${node.shape ?? 'rect'} ${isSel ? 'selected' : ''}`}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    ...(node.color ? { borderColor: node.color } : {}),
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || editing === node.id || tool !== 'select') return
                    e.stopPropagation()
                    setSelected({ type: 'node', id: node.id })
                    startDrag({ kind: 'move', id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y, moved: false })
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (node.type === 'text') startEditing(node.id)
                    else if (note) openTab(note.path)
                  }}
                >
                  {node.type === 'note' && (
                    <button
                      className="canvas-node-title"
                      title={node.notePath}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => note && openTab(note.path)}
                    >
                      <FileText size={13} strokeWidth={1.75} />
                      {note?.name ?? t('canvas.missingNote', { path: node.notePath })}
                    </button>
                  )}

                  {renderNodeContent(node)}

                  <span
                    className="canvas-connect-handle"
                    title={t('canvas.connect')}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      const p = toWorld(e.clientX, e.clientY)
                      setConnectLine({ from: node.id, x: p.x, y: p.y })
                      startDrag({ kind: 'connect', from: node.id })
                    }}
                  />
                  <span
                    className="canvas-resize-handle"
                    title={t('canvas.resize')}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      startDrag({ kind: 'resize', id: node.id, sx: e.clientX, sy: e.clientY, ow: node.width, oh: node.height })
                    }}
                  />
                </div>
              )
            })}

            {/* desenho livre por cima dos cartões */}
            <svg className="canvas-svg canvas-strokes">
              {[...canvas.strokes, ...(liveStroke ? [liveStroke] : [])].map((s) => (
                <path
                  key={s.id}
                  d={strokePath(s.points)}
                  stroke={s.color || 'currentColor'}
                  strokeWidth={s.width}
                />
              ))}
            </svg>
          </div>

          {/* camada de captura: com caneta/borracha os cliques não chegam aos cartões */}
          {tool !== 'select' && <div className="canvas-draw-layer" />}
        </div>
      </div>
    </div>
  )
}
