import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useIdeStore, type QuickOpenMode } from '../store/useIdeStore'
import { fuzzyScore } from '../lib/fuzzy'
import './IdeViews.css'

export interface PaletteCommand {
  id: string
  label: string
  shortcut?: string
  run: () => void
}

const MAX_RESULTS = 50

/** Quick Open (Ctrl+P): busca arquivo pelo caminho. Começando com ">" vira paleta de comandos
 * (Ctrl+Shift+P), igual ao VS Code. */
export function QuickOpen({ commands }: { commands: PaletteCommand[] }) {
  const { t } = useTranslation()
  const mode = useIdeStore((s) => s.quickOpen)
  const close = useIdeStore((s) => s.closeQuickOpen)
  if (!mode) return null
  return <QuickOpenDialog key={mode} mode={mode} commands={commands} onClose={close} t={t} />
}

function QuickOpenDialog({
  mode,
  commands,
  onClose,
  t,
}: {
  mode: QuickOpenMode
  commands: PaletteCommand[]
  onClose: () => void
  t: (key: string) => string
}) {
  const notes = useVaultStore((s) => s.notes)
  const openTab = useTabsStore((s) => s.openTab)
  const [query, setQuery] = useState(mode === 'commands' ? '>' : '')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const isCommand = query.startsWith('>')
  const term = isCommand ? query.slice(1).trim() : query.trim()

  const items = useMemo(() => {
    if (isCommand) {
      return commands
        .map((c) => ({ c, score: fuzzyScore(term, c.label) }))
        .filter((x) => x.score !== null)
        .sort((a, b) => b.score! - a.score!)
        .map(({ c }) => ({ key: c.id, primary: c.label, secondary: c.shortcut ?? '', run: c.run }))
    }
    const scored = notes
      .map((n) => ({ n, score: fuzzyScore(term, n.path) }))
      .filter((x) => x.score !== null)
    if (term) scored.sort((a, b) => b.score! - a.score!)
    return scored.slice(0, MAX_RESULTS).map(({ n }) => ({
      key: n.path,
      primary: n.name,
      secondary: n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : '',
      run: () => openTab(n.path),
    }))
  }, [isCommand, term, commands, notes, openTab])

  useEffect(() => setSelected(0), [term, isCommand])

  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  function run(index: number) {
    const item = items[index]
    if (!item) return
    onClose()
    item.run()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(selected)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="quick-open-overlay" onMouseDown={onClose}>
      <div
        className="quick-open"
        role="dialog"
        aria-modal="true"
        aria-label={isCommand ? t('ide.commandPalette') : t('ide.quickOpen')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          className="quick-open-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isCommand ? t('ide.commandPlaceholder') : t('ide.quickOpenPlaceholder')}
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-open-list"
          aria-activedescendant={items[selected] ? `qo-${selected}` : undefined}
        />
        <ul className="quick-open-list" id="quick-open-list" role="listbox" ref={listRef}>
          {items.map((item, i) => (
            <li
              key={item.key}
              id={`qo-${i}`}
              role="option"
              aria-selected={i === selected}
              className={`quick-open-item ${i === selected ? 'selected' : ''}`}
              onMouseMove={() => setSelected(i)}
              onClick={() => run(i)}
            >
              <span className="quick-open-primary">{item.primary}</span>
              <span className="quick-open-secondary">{item.secondary}</span>
            </li>
          ))}
          {items.length === 0 && <li className="quick-open-empty">{t('ide.noResults')}</li>}
        </ul>
      </div>
    </div>
  )
}
