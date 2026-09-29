import { X } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import './TabBar.css'

export function TabBar() {
  const notes = useVaultStore((s) => s.notes)
  const openPaths = useTabsStore((s) => s.openPaths)
  const activePath = useTabsStore((s) => s.activePath)
  const setActiveTab = useTabsStore((s) => s.setActiveTab)
  const closeTab = useTabsStore((s) => s.closeTab)

  if (openPaths.length === 0) return null

  return (
    <div className="tab-bar">
      {openPaths.map((path) => {
        const note = notes.find((n) => n.path === path)
        if (!note) return null
        const isActive = path === activePath

        return (
          <div
            key={path}
            className={`tab ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(path)}
            title={path}
          >
            <span className="tab-label">
              {note.name}
              {note.dirty && <span className="tab-dirty-dot" />}
            </span>
            <button
              className="tab-close"
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
