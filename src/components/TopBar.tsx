import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, Puzzle, LayoutGrid, Timer, RefreshCw, CalendarDays, AlertTriangle } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { overdueTasks } from '../lib/agenda'
import { useTabsStore } from '../store/useTabsStore'
import { useUiStore } from '../store/useUiStore'
import { usePomodoroStore } from '../store/usePomodoroStore'
import { AppLogo } from './AppLogo'
import { APP_VERSION } from '../lib/version'
import { GitHubConnectModal } from './GitHubConnectModal'
import { PomodoroWidget } from './PomodoroWidget'
import './TopBar.css'

interface TopBarProps {
  onOpenSidebar: () => void
}

const isBeta = APP_VERSION.includes('-beta')

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const { t } = useTranslation()
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const syncStatus = useVaultStore((s) => s.syncStatus)
  const syncError = useVaultStore((s) => s.syncError)
  const notes = useVaultStore((s) => s.notes)
  const syncNow = useVaultStore((s) => s.syncNow)
  const disconnectGitHub = useVaultStore((s) => s.disconnectGitHub)

  const kanbanEnabled = useVaultStore((s) => s.isPluginEnabled('kanban'))
  const pomodoroEnabled = useVaultStore((s) => s.isPluginEnabled('pomodoro'))
  const agendaEnabled = useVaultStore((s) => s.isPluginEnabled('agenda'))
  const agendaCollection = useVaultStore((s) => s.agendaCollection)
  const activePath = useTabsStore((s) => s.activePath)
  const requestViewMode = useUiStore((s) => s.requestViewMode)
  const togglePomodoro = usePomodoroStore((s) => s.toggleOpen)

  // recalcula a cada minuto para o badge de atrasados não ficar parado no horário em que a
  // página foi aberta (uma tarefa pode "virar" atrasada a qualquer minuto, sem nenhuma outra
  // mudança de estado que dispararia um re-render)
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])
  const overdueCount = agendaEnabled
    ? overdueTasks(agendaCollection, new Date(nowTick)).length
    : 0

  const [showModal, setShowModal] = useState(false)
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const pluginsRef = useRef<HTMLDivElement>(null)

  const dirtyCount = notes.filter((n) => n.dirty).length
  const anyPluginEnabled = kanbanEnabled || pomodoroEnabled || agendaEnabled
  // no mobile o Pomodoro some do menu (sessão de foco contínua não combina com consulta
  // rápida); se nem Kanban nem Agenda estiverem habilitados, o botão de plugins não teria
  // nada pra mostrar no mobile
  const anyPluginEnabledOnMobile = kanbanEnabled || agendaEnabled

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

  function openAgenda() {
    setPluginsOpen(false)
    requestViewMode('agenda')
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
        {isBeta && <span className="app-beta-tag">{t('app.betaTag')}</span>}
      </div>

      <div className="top-bar-center">
        {pomodoroEnabled && <PomodoroWidget />}
      </div>

      <div className="sync-area">
        {agendaEnabled && overdueCount > 0 && (
          <button
            className="agenda-overdue-topbar-btn"
            onClick={() => requestViewMode('agenda')}
            title={t('agenda.overdueHint', { count: overdueCount })}
          >
            <AlertTriangle size={13} strokeWidth={2} />
            {overdueCount}
          </button>
        )}

        {anyPluginEnabled && (
          <div
            className={`plugins-menu ${!anyPluginEnabledOnMobile ? 'plugins-menu-desktop-only' : ''}`}
            ref={pluginsRef}
          >
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
                {agendaEnabled && (
                  <button className="plugins-dropdown-item" onClick={openAgenda}>
                    <CalendarDays size={15} strokeWidth={1.75} />
                    <span>{t('plugins.agenda.name')}</span>
                    <span className="plugins-dropdown-hint">{t('topBar.pluginShortcuts.agenda')}</span>
                  </button>
                )}
                {pomodoroEnabled && (
                  <button
                    className="plugins-dropdown-item plugins-dropdown-item-desktop-only"
                    onClick={openPomodoro}
                  >
                    <Timer size={15} strokeWidth={1.75} />
                    <span>{t('plugins.pomodoro.name')}</span>
                    <span className="plugins-dropdown-hint">{t('topBar.pluginShortcuts.pomodoro')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {syncStatus === 'auth-error' && (
          <>
            <span className="sync-error sync-text" title={syncError ?? ''}>
              {t('topBar.authError')}
            </span>
            <span className="sync-dot sync-dot-error" title={t('topBar.authError')} />
          </>
        )}
        {syncStatus === 'error' && (
          <>
            <span className="sync-error sync-text" title={syncError ?? ''}>
              {t('topBar.syncError')}
            </span>
            <span className="sync-dot sync-dot-error" title={t('topBar.syncError')} />
          </>
        )}
        {syncStatus === 'syncing' && (
          <>
            <span className="sync-status sync-text">{t('topBar.syncing')}</span>
            <span className="sync-dot sync-dot-syncing" title={t('topBar.syncing')} />
          </>
        )}
        {syncStatus === 'idle' && dirtyCount > 0 && (
          <>
            <span className="sync-status sync-text">
              {t('topBar.pendingNotes', { count: dirtyCount })}
            </span>
            <span
              className="sync-dot sync-dot-pending"
              title={t('topBar.pendingNotes', { count: dirtyCount })}
            />
          </>
        )}

        {githubConfig ? (
          <>
            {syncStatus === 'auth-error' ? (
              <button className="btn-topbar btn-connect" onClick={() => setShowModal(true)}>
                {t('topBar.reconnect')}
              </button>
            ) : (
              <button
                className="icon-toggle-btn"
                onClick={() => syncNow()}
                disabled={syncStatus === 'syncing'}
                title={t('topBar.sync')}
              >
                <RefreshCw size={16} strokeWidth={1.75} className={syncStatus === 'syncing' ? 'spin' : ''} />
              </button>
            )}
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