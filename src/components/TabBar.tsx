import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './TabBar.css'

export function TabBar() {
  const { t } = useTranslation()
  const notes = useVaultStore((s) => s.notes)
  const openPaths = useTabsStore((s) => s.openPaths)
  const activePath = useTabsStore((s) => s.activePath)
  const previewPath = useTabsStore((s) => s.previewPath)
  const setActiveTab = useTabsStore((s) => s.setActiveTab)
  const pinTab = useTabsStore((s) => s.pinTab)
  const closeTab = useTabsStore((s) => s.closeTab)

  if (openPaths.length === 0) return null

  return (
    <div className="tab-bar">
      {openPaths.map((path) => {
        const note = notes.find((n) => n.path === path)
        if (!note) return null
        const isActive = path === activePath
        const isPreview = path === previewPath

        return (
          <div
            key={path}
            className={`tab ${isActive ? 'active' : ''} ${isPreview ? 'preview' : ''}`}
            onClick={() => setActiveTab(path)}
            onDoubleClick={() => pinTab(path)}
            onAuxClick={(e) => {
              // clique do meio fecha a aba
              if (e.button === 1) closeTab(path)
            }}
            title={isPreview ? `${path} · ${t('tabs.previewHint')}` : path}
          >
            <span className="tab-label">
              {note.name}
              {note.dirty && <span className="tab-dirty-dot" />}
            </span>
            <button
              className="tab-close"
              aria-label={t('tabs.close')}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(path)
              }}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
