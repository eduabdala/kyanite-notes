import { useEffect, useRef, useState } from 'react'
import { FileText, Folder } from 'lucide-react'

interface InlineCreateInputProps {
  kind: 'note' | 'folder'
  depth: number
  onConfirm: (name: string) => void
  onCancel: () => void
  /** quando informado, o input inicia preenchido e com o texto selecionado (usado para renomear) */
  initialValue?: string
}

/** Input inline estilo VSCode/Obsidian para nomear uma nova nota ou pasta (ou renomear uma existente) diretamente na árvore */
export function InlineCreateInput({ kind, depth, onConfirm, onCancel, initialValue = '' }: InlineCreateInputProps) {
  const [name, setName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const settledRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function settle(action: () => void) {
    if (settledRef.current) return
    settledRef.current = true
    action()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      const trimmed = name.trim()
      settle(() => (trimmed ? onConfirm(trimmed) : onCancel()))
    } else if (e.key === 'Escape') {
      settle(onCancel)
    }
  }

  function handleBlur() {
    // dá tempo para o keydown (Enter) processar antes do blur cancelar
    setTimeout(() => settle(onCancel), 0)
  }

  return (
    <div
      className="tree-row tree-inline-create"
      style={{ paddingLeft: `${depth * 14 + (kind === 'folder' ? 8 : 24)}px` }}
    >
      {kind === 'folder' ? (
        <Folder size={14} strokeWidth={1.75} className="tree-inline-icon" />
      ) : (
        <FileText size={14} strokeWidth={1.75} className="tree-inline-icon" />
      )}
      <input
        ref={inputRef}
        className="tree-inline-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  )
}
