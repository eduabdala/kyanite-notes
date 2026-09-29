import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../store/useVaultStore'
import { useThemeStore } from '../store/useThemeStore'
import { GitHubConnectModal } from './GitHubConnectModal'
import './TopBar.css'

export function TopBar() {
  const { t, i18n } = useTranslation()
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const syncStatus = useVaultStore((s) => s.syncStatus)
  const syncError = useVaultStore((s) => s.syncError)
  const notes = useVaultStore((s) => s.notes)
  const syncAll = useVaultStore((s) => s.syncAll)
  const pullFromGitHub = useVaultStore((s) => s.pullFromGitHub)
  const disconnectGitHub = useVaultStore((s) => s.disconnectGitHub)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [showModal, setShowModal] = useState(false)

  const dirtyCount = notes.filter((n) => n.dirty).length

  return (
    <header className="top-bar">
      <span className="app-title">{t('app.title')}</span>

      <div className="sync-area">
        <select
          className="theme-select"
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          title={t('topBar.language')}
        >
          <option value="pt">Português</option>
          <option value="en">English</option>
        </select>

        <select
          className="theme-select"
          value={theme}
          onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
          title={t('topBar.theme')}
        >
          <option value="dark">{t('topBar.themeDark')}</option>
          <option value="light">{t('topBar.themeLight')}</option>
          <option value="system">{t('topBar.themeSystem')}</option>
        </select>

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
