import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, Puzzle, LayoutGrid, Timer } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useUiStore } from '../store/useUiStore'
import { usePomodoroStore } from '../store/usePomodoroStore'
import { AppLogo } from './AppLogo'
import { GitHubConnectModal } from './GitHubConnectModal'
import { PomodoroWidget } from './PomodoroWidget'
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

  const kanbanEnabled = useVaultStore((s) => s.isPluginEnabled('kanban'))
  const pomodoroEnabled = useVaultStore((s) => s.isPluginEnabled('pomodoro'))
  const activePath = useTabsStore((s) => s.activePath)
  const requestViewMode = useUiStore((s) => s.requestViewMode)
  const togglePomodoro = usePomodoroStore((s) => s.toggleOpen)

  const [showModal, setShowModal] = useState(false)
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const pluginsRef = useRef<HTMLDivElement>(null)

  const dirtyCount = notes.filter((n) => n.dirty).length
  const anyPluginEnabled = kanbanEnabled || pomodoroEnabled

  // fecha o dropdown ao clicar fora dele
  useEffect(() => {
    if (!pluginsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (pluginsRef.current && !pluginsRef.current.contains(e.target as Node)) {
        setPluginsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [pluginsOpen])

  function openKanban() {
    setPluginsOpen(false)
    requestViewMode('board')
  }

  function openPomodoro() {
    setPluginsOpen(false)
    togglePomodoro()
  }

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="mobile-menu-btn" onClick={onOpenSidebar} title={t('sidebar.openMenu')}>
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <AppLogo size={20} />
        <span className="app-title">{t('app.title')}</span>
      </div>

      <div className="top-bar-center">
        {pomodoroEnabled && <PomodoroWidget />}
      </div>

      <div className="sync-area">
        {anyPluginEnabled && (
          <div className="plugins-menu" ref={pluginsRef}>
            <button
              className={`icon-toggle-btn ${pluginsOpen ? 'active' : ''}`}
              onClick={() => setPluginsOpen((o) => !o)}
              title={t('topBar.plugins')}
            >
              <Puzzle size={16} strokeWidth={1.75} />
            </button>

            {pluginsOpen && (
              <div className="plugins-dropdown">
                {kanbanEnabled && (
                  <button className="plugins-dropdown-item" onClick={openKanban} disabled={!activePath}>
                    <LayoutGrid size={15} strokeWidth={1.75} />
                    <span>{t('plugins.kanban.name')}</span>
                    <span className="plugins-dropdown-hint">{t('topBar.pluginShortcuts.kanban')}</span>
                  </button>
                )}
                {pomodoroEnabled && (
                  <button className="plugins-dropdown-item" onClick={openPomodoro}>
                    <Timer size={15} strokeWidth={1.75} />
                    <span>{t('plugins.pomodoro.name')}</span>
                    <span className="plugins-dropdown-hint">{t('topBar.pluginShortcuts.pomodoro')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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