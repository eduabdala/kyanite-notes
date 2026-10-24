import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize, Minus, Plus, X } from 'lucide-react'
import { useMermaidViewerStore } from '../store/useMermaidViewerStore'
import './MermaidViewer.css'

const MIN_SCALE = 0.1
const MAX_SCALE = 10

interface View {
  scale: number
  x: number
  y: number
}

/** Visualizador em tela cheia para diagramas mermaid: zoom (roda/botões/teclado) e arraste */
export function MermaidViewer() {
  const { t } = useTranslation()
  const svg = useMermaidViewerStore((s) => s.svg)
  const close = useMermaidViewerStore((s) => s.close)
  const stageRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })

  // ajusta o diagrama para caber na tela, centralizado
  function fit() {
    const stage = stageRef.current
    const svgEl = contentRef.current?.querySelector('svg')
    if (!stage || !svgEl) return
    const vb = svgEl.viewBox.baseVal
    const w = vb && vb.width ? vb.width : svgEl.getBoundingClientRect().width
    const h = vb && vb.height ? vb.height : svgEl.getBoundingClientRect().height
    // o mermaid define max-width inline; removemos para controlar o tamanho via transform
    svgEl.style.maxWidth = 'none'
    svgEl.setAttribute('width', String(w))
    svgEl.setAttribute('height', String(h))
    const padding = 48
    const scale = Math.min((stage.clientWidth - padding) / w, (stage.clientHeight - padding) / h)
    setView({
      scale,
      x: (stage.clientWidth - w * scale) / 2,
      y: (stage.clientHeight - h * scale) / 2,
    })
  }

  useEffect(() => {
    if (svg) fit()
  }, [svg])

  // zoom mantendo fixo o ponto (cx, cy) do stage
  function zoomAt(factor: number, cx?: number, cy?: number) {
    const stage = stageRef.current
    if (!stage) return
    const px = cx ?? stage.clientWidth / 2
    const py = cy ?? stage.clientHeight / 2
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const ratio = scale / v.scale
      return { scale, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio }
    })
  }

  useEffect(() => {
    if (!svg) return
    function onKey(e: KeyboardEvent) {
      // Ctrl/Cmd +/-/0 é o zoom da interface (useAppearanceStore); aqui só teclas sem modificador
      if (e.ctrlKey || e.metaKey) return
      if (e.key === 'Escape') close()
      else if (e.key === '+' || e.key === '=') zoomAt(1.2)
      else if (e.key === '-') zoomAt(1 / 1.2)
      else if (e.key === '0') fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [svg, close])

  // wheel precisa de listener não-passivo para poder chamar preventDefault
  useEffect(() => {
    const stage = stageRef.current
    if (!svg || !stage) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = stage!.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [svg])

  if (!svg) return null

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // impede o início de seleção de texto / arraste nativo do navegador
    e.preventDefault()
    window.getSelection()?.removeAllRanges()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, x: view.x, y: view.y }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    setView((v) => ({ ...v, x: drag.x + e.clientX - drag.startX, y: drag.y + e.clientY - drag.startY }))
  }

  function onPointerUp() {
    dragRef.current = null
  }

  return (
    <div className="mermaid-viewer" role="dialog" aria-modal="true" aria-label={t('mermaid.viewer')}>
      <div className="mermaid-viewer-toolbar">
        <button type="button" onClick={() => zoomAt(1 / 1.2)} title={t('mermaid.zoomOut')} aria-label={t('mermaid.zoomOut')}>
          <Minus size={16} strokeWidth={1.75} />
        </button>
        <span className="mermaid-viewer-scale">{Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={() => zoomAt(1.2)} title={t('mermaid.zoomIn')} aria-label={t('mermaid.zoomIn')}>
          <Plus size={16} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={fit} title={t('mermaid.fit')} aria-label={t('mermaid.fit')}>
          <Maximize size={16} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={close} title={t('mermaid.close')} aria-label={t('mermaid.close')} autoFocus>
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div
        className="mermaid-viewer-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="mermaid-viewer-content"
          ref={contentRef}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}
