import { useRef } from 'react'

interface ResizeHandleProps {
  onResize: (deltaX: number) => void
}

/** Divisor arrastável para redimensionar painéis adjacentes (sidebar, backlinks, etc) */
export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const lastXRef = useRef(0)

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault()
    lastXRef.current = e.clientX
    const target = e.currentTarget

    function handlePointerMove(ev: PointerEvent) {
      const delta = ev.clientX - lastXRef.current
      lastXRef.current = ev.clientX
      onResize(delta)
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    target.setPointerCapture(e.pointerId)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return <div className="resize-handle" onPointerDown={handlePointerDown} />
}
