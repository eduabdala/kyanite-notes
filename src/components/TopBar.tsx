import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { AppLogo } from './AppLogo'
import { GitHubConnectModal } from './GitHubConnectModal'
import './TopBar.css'

interface TopBarProps {
  onOpenSidebar: () => void
}

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const { t } = useTranslation()
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const syncStatus = useVaultStore((s) => s.syncStatus)
  const syncError = useVaultStore((s) => s.syncError)
  const notes = useVaultStore((s) => s.notes)
  const syncAll = useVaultStore((s) => s.syncAll)
  const pullFromGitHub = useVaultStore((s) => s.pullFromGitHub)
  const disconnectGitHub = useVaultStore((s) => s.disconnectGitHub)
  const [showModal, setShowModal] = useState(false)

  const dirtyCount = notes.filter((n) => n.dirty).length

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="mobile-menu-btn" onClick={onOpenSidebar} title={t('sidebar.openMenu')}>
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <AppLogo size={20} />
        <span className="app-title">{t('app.title')}</span>
      </div>

      <div className="sync-area">
        {syncStatus === 'error' && (
          <span className="sync-error" title={syncError ?? ''}>
            {t('topBar.syncError')}
          </span>
        )}
        {syncStatus === 'syncing' && <span className="sync-status">{t('topBar.syncing')}</span>}
        {syncStatus === 'idle' && dirtyCount > 0 && (
          <span className="sync-status">{t('topBar.pendingNotes', { count: dirtyCount })}</span>
        )}

        {githubConfig ? (
          <>
            <button className="btn-topbar" onClick={() => pullFromGitHub()}>
              {t('topBar.pull')}
            </button>
            <button className="btn-topbar" onClick={() => syncAll()} disabled={dirtyCount === 0}>
              {t('topBar.push')}
            </button>
            <button className="btn-topbar" onClick={disconnectGitHub}>
              {t('topBar.disconnect')}
            </button>
          </>
        ) : (
          <button className="btn-topbar btn-connect" onClick={() => setShowModal(true)}>
            {t('topBar.connectGitHub')}
          </button>
        )}
      </div>

      {showModal && <GitHubConnectModal onClose={() => setShowModal(false)} />}
    </header>
  )
}
