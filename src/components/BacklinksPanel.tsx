import { useTranslation } from 'react-i18next'
import { PanelRightClose } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './BacklinksPanel.css'

interface BacklinksPanelProps {
  /** opcional: quando informado, mostra um botão para recolher o painel (não exibido no drawer mobile) */
  onCollapse?: () => void
}

export function BacklinksPanel({ onCollapse }: BacklinksPanelProps) {
  const { t } = useTranslation()
  const activePath = useTabsStore((s) => s.activePath)
  const openTab = useTabsStore((s) => s.openTab)
  const notes = useVaultStore((s) => s.notes)
  const linkGraph = useVaultStore((s) => s.linkGraph)

  if (!activePath) return null

  const backlinkPaths = Array.from(linkGraph.incoming.get(activePath) ?? [])
  const outgoingPaths = Array.from(linkGraph.outgoing.get(activePath) ?? [])
  const findNote = (p: string) => notes.find((n) => n.path === p)

  return (
    <aside className="backlinks-panel">
      {onCollapse && (
        <div className="backlinks-header">
          <button className="backlinks-collapse-btn" onClick={onCollapse} title={t('backlinks.collapse')}>
            <PanelRightClose size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}
      <div className="backlinks-section">
        <h4>{t('backlinks.links', { count: outgoingPaths.length })}</h4>
        {outgoingPaths.length === 0 && <p className="backlinks-empty">{t('backlinks.noLinks')}</p>}
        <ul>
          {outgoingPaths.map((p) => {
            const n = findNote(p)
            if (!n) return null
            return (
              <li key={p} onClick={() => openTab(p)}>
                {n.name}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="backlinks-section">
        <h4>{t('backlinks.backlinks', { count: backlinkPaths.length })}</h4>
        {backlinkPaths.length === 0 && (
          <p className="backlinks-empty">{t('backlinks.noBacklinks')}</p>
        )}
        <ul>
          {backlinkPaths.map((p) => {
            const n = findNote(p)
            if (!n) return null
            return (
              <li key={p} onClick={() => openTab(p)}>
                {n.name}
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
