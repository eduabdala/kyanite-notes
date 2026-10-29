import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MonitorSmartphone, Palette, User, Languages, X, Info, GitBranch, MessageSquareWarning, Blocks, Minus, Plus } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import {
  STONES,
  buildPreset,
  splitPreset,
  useThemeStore,
  type ThemePreset,
} from '../store/useThemeStore'
import { formatBytes, repoUsagePercent, REPO_USAGE_LIMIT_BYTES } from '../lib/bytes'
import { APP_VERSION, PROJECT_INFO } from '../lib/version'
import type { PluginId } from '../lib/plugins'
import { usePomodoroStore } from '../store/usePomodoroStore'
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  ICON_SIZES,
  ZOOM_DEFAULT,
  ZOOM_LEVELS,
  useAppearanceStore,
} from '../store/useAppearanceStore'
import { AppLogo } from './AppLogo'
import './SettingsPanel.css'

type SettingsSection = 'appearance' | 'language' | 'profile' | 'plugins' | 'about'

const PLUGIN_IDS: PluginId[] = ['kanban', 'pomodoro', 'agenda', 'canvas']

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t, i18n } = useTranslation()
  const [section, setSection] = useState<SettingsSection>('appearance')

  const preset = useThemeStore((s) => s.preset)
  const setPreset = useThemeStore((s) => s.setPreset)
  const followSystem = useThemeStore((s) => s.followSystem)
  const setFollowSystem = useThemeStore((s) => s.setFollowSystem)
  const { mode: activeMode } = splitPreset(preset)
  const fontSize = useAppearanceStore((s) => s.fontSize)
  const setFontSize = useAppearanceStore((s) => s.setFontSize)
  const iconSize = useAppearanceStore((s) => s.iconSize)
  const setIconSize = useAppearanceStore((s) => s.setIconSize)
  const zoom = useAppearanceStore((s) => s.zoom)
  const setZoom = useAppearanceStore((s) => s.setZoom)
  const zoomIn = useAppearanceStore((s) => s.zoomIn)
  const zoomOut = useAppearanceStore((s) => s.zoomOut)

  const githubConfig = useVaultStore((s) => s.githubConfig)
  const disconnectGitHub = useVaultStore((s) => s.disconnectGitHub)
  const autoSync = useVaultStore((s) => s.autoSync)
  const setAutoSync = useVaultStore((s) => s.setAutoSync)
  const repoUsageBytes = useVaultStore((s) => s.repoUsageBytes)
  const pluginConfig = useVaultStore((s) => s.pluginConfig)
  const setPluginEnabled = useVaultStore((s) => s.setPluginEnabled)
  const pomodoroDurations = usePomodoroStore((st) => st.durations)
  const setPomodoroDuration = usePomodoroStore((st) => st.setDuration)

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'appearance', label: t('settings.appearance'), icon: <Palette size={15} strokeWidth={1.75} /> },
    { id: 'language', label: t('settings.language'), icon: <Languages size={15} strokeWidth={1.75} /> },
    { id: 'profile', label: t('settings.profile'), icon: <User size={15} strokeWidth={1.75} /> },
    { id: 'plugins', label: t('settings.plugins'), icon: <Blocks size={15} strokeWidth={1.75} /> },
    { id: 'about', label: t('settings.about'), icon: <Info size={15} strokeWidth={1.75} /> },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sidebar">
          <div className="settings-title">{t('settings.title')}</div>
          <nav className="settings-nav">
            {sections.map((s) => (
              <button
                key={s.id}
                className={`settings-nav-item ${section === s.id ? 'active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="settings-content">
          <button className="settings-close" onClick={onClose} title={t('settings.close')}>
            <X size={18} strokeWidth={1.75} />
          </button>

          {section === 'appearance' && (
            <div className="settings-section">
              <h3>{t('settings.appearance')}</h3>

              <div className="settings-row">
                <div className="settings-row-label">
                  <span>{t('topBar.themeColor')}</span>
                  <span className="settings-row-hint">{t('settings.themeHint')}</span>
                </div>
              </div>

              <div className="theme-grid">
                {STONES.map((stone) => {
                  const modeForStone = stone === splitPreset(preset).stone ? activeMode : 'dark'
                  const value = buildPreset(stone, modeForStone)
                  const isActive = splitPreset(preset).stone === stone
                  return (
                    <button
                      key={stone}
                      className={`theme-swatch ${isActive ? 'active' : ''}`}
                      onClick={() => setPreset(value as ThemePreset)}
                      title={t(`topBar.themeColors.${stone}`)}
                    >
                      <span className="theme-swatch-preview" data-theme-color={stone} data-theme={modeForStone}>
                        <AppLogo size={18} stone={stone} />
                      </span>
                      <span className="theme-swatch-name">{t(`topBar.themeColors.${stone}`)}</span>
                    </button>
                  )
                })}
              </div>

              <div className="settings-row settings-row-inline">
                <div className="settings-row-label">
                  <span>{t('topBar.theme')}</span>
                </div>
                <div className="mode-toggle">
                  <button
                    className={activeMode === 'dark' && !followSystem ? 'active' : ''}
                    onClick={() => {
                      if (followSystem) setFollowSystem(false)
                      setPreset(buildPreset(splitPreset(preset).stone, 'dark'))
                    }}
                  >
                    {t('topBar.themeDark')}
                  </button>
                  <button
                    className={activeMode === 'light' && !followSystem ? 'active' : ''}
                    onClick={() => {
                      if (followSystem) setFollowSystem(false)
                      setPreset(buildPreset(splitPreset(preset).stone, 'light'))
                    }}
                  >
                    {t('topBar.themeLight')}
                  </button>
                  <button
                    className={followSystem ? 'active' : ''}
                    onClick={() => setFollowSystem(true)}
                  >
                    <MonitorSmartphone size={13} strokeWidth={1.75} />
                    {t('topBar.followSystem')}
                  </button>
                </div>
              </div>

              <div className="settings-row settings-row-inline">
                <div className="settings-row-label">
                  <span>{t('settings.zoom')}</span>
                  <span className="settings-row-hint">{t('settings.zoomHint')}</span>
                </div>
                <div className="font-size-control">
                  <button
                    type="button"
                    className="btn-secondary zoom-step-btn"
                    onClick={zoomOut}
                    disabled={zoom <= ZOOM_LEVELS[0]}
                    aria-label={t('settings.zoomOut')}
                    title={t('settings.zoomOut')}
                  >
                    <Minus size={14} strokeWidth={1.75} />
                  </button>
                  <span className="font-size-value">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    className="btn-secondary zoom-step-btn"
                    onClick={zoomIn}
                    disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                    aria-label={t('settings.zoomIn')}
                    title={t('settings.zoomIn')}
                  >
                    <Plus size={14} strokeWidth={1.75} />
                  </button>
                  {zoom !== ZOOM_DEFAULT && (
                    <button
                      type="button"
                      className="btn-secondary font-size-reset"
                      onClick={() => setZoom(ZOOM_DEFAULT)}
                    >
                      {t('settings.reset')}
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-row settings-row-inline">
                <div className="settings-row-label">
                  <label htmlFor="settings-font-size">{t('settings.fontSize')}</label>
                  <span className="settings-row-hint">{t('settings.fontSizeHint')}</span>
                </div>
                <div className="font-size-control">
                  <input
                    id="settings-font-size"
                    type="range"
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    step={1}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                  />
                  <span className="font-size-value">{fontSize}px</span>
                  {fontSize !== FONT_SIZE_DEFAULT && (
                    <button
                      type="button"
                      className="btn-secondary font-size-reset"
                      onClick={() => setFontSize(FONT_SIZE_DEFAULT)}
                    >
                      {t('settings.reset')}
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-row settings-row-inline">
                <div className="settings-row-label">
                  <span>{t('settings.iconSize')}</span>
                </div>
                <div className="mode-toggle" role="group" aria-label={t('settings.iconSize')}>
                  {ICON_SIZES.map((size) => (
                    <button
                      key={size}
                      className={iconSize === size ? 'active' : ''}
                      aria-pressed={iconSize === size}
                      onClick={() => setIconSize(size)}
                    >
                      {t(`settings.iconSizes.${size}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'language' && (
            <div className="settings-section">
              <h3>{t('settings.language')}</h3>

              <div className="settings-row settings-row-inline">
                <div className="settings-row-label">
                  <span>{t('topBar.language')}</span>
                </div>
                <select
                  className="settings-select"
                  value={i18n.language}
                  onChange={(e) => i18n.changeLanguage(e.target.value)}
                >
                  <option value="pt">Português</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          )}

          {section === 'profile' && (
            <div className="settings-section">
              <h3>{t('settings.profile')}</h3>

              {githubConfig ? (
                <>
                  <div className="profile-card">
                    <div className="profile-avatar">
                      <User size={22} strokeWidth={1.75} />
                    </div>
                    <div className="profile-info">
                      <span className="profile-owner">{githubConfig.owner}</span>
                      <span className="profile-repo">
                        {githubConfig.repo} · {githubConfig.branch}
                      </span>
                    </div>
                    <button className="btn-secondary" onClick={disconnectGitHub}>
                      {t('topBar.disconnect')}
                    </button>
                  </div>

                  <div className="settings-row settings-row-inline plugin-row auto-sync-row">
                    <div className="settings-row-label">
                      <span id="settings-auto-sync-label">{t('settings.autoSync')}</span>
                      <span className="settings-row-hint">{t('settings.autoSyncHint')}</span>
                    </div>
                    <label className="plugin-switch">
                      <input
                        type="checkbox"
                        aria-labelledby="settings-auto-sync-label"
                        checked={autoSync}
                        onChange={(e) => setAutoSync(e.target.checked)}
                      />
                      <span className="plugin-switch-track" />
                    </label>
                  </div>

                  <div className="settings-row repo-usage">
                    <div className="settings-row-label">
                      <span>{t('settings.repoUsage')}</span>
                      <span className="settings-row-hint">
                        {repoUsageBytes === null
                          ? t('settings.repoUsageLoading')
                          : t('settings.repoUsageDetail', {
                              used: formatBytes(repoUsageBytes),
                              total: formatBytes(REPO_USAGE_LIMIT_BYTES),
                            })}
                      </span>
                    </div>
                    <div className="repo-usage-bar">
                      <div
                        className="repo-usage-bar-fill"
                        style={{ width: `${repoUsageBytes === null ? 0 : repoUsagePercent(repoUsageBytes)}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="settings-row-hint">{t('settings.noProfile')}</p>
              )}
            </div>
          )}

          {section === 'plugins' && (
            <div className="settings-section">
              <h3>{t('settings.plugins')}</h3>
              <p className="settings-row-hint plugins-hint">{t('settings.pluginsHint')}</p>

              {PLUGIN_IDS.map((id) => (
                <div className="settings-row settings-row-inline plugin-row" key={id}>
                  <div className="settings-row-label">
                    <span>{t(`plugins.${id}.name`)}</span>
                    <span className="settings-row-hint">{t(`plugins.${id}.description`)}</span>
                  </div>
                  <label className="plugin-switch">
                    <input
                      type="checkbox"
                      checked={pluginConfig.plugins[id]}
                      onChange={(e) => setPluginEnabled(id, e.target.checked)}
                    />
                    <span className="plugin-switch-track" />
                  </label>
                </div>
              ))}

              {pluginConfig.plugins.pomodoro && (
                <div className="plugin-settings">
                  <div className="settings-row settings-row-inline">
                    <div className="settings-row-label">
                      <span>{t('pomodoroBar.work')}</span>
                    </div>
                    <div className="pomodoro-duration-field">
                      <input
                        type="number"
                        min={1}
                        max={180}
                        className="settings-number"
                        value={pomodoroDurations.work}
                        onChange={(e) => setPomodoroDuration('work', Number(e.target.value))}
                      />
                      <span className="pomodoro-duration-unit">{t('settings.minutesShort')}</span>
                    </div>
                  </div>
                  <div className="settings-row settings-row-inline">
                    <div className="settings-row-label">
                      <span>{t('pomodoroBar.break')}</span>
                    </div>
                    <div className="pomodoro-duration-field">
                      <input
                        type="number"
                        min={1}
                        max={180}
                        className="settings-number"
                        value={pomodoroDurations.break}
                        onChange={(e) => setPomodoroDuration('break', Number(e.target.value))}
                      />
                      <span className="pomodoro-duration-unit">{t('settings.minutesShort')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {section === 'about' && (
            <div className="settings-section">
              <h3>{t('settings.about')}</h3>

              <div className="about-app">
                <AppLogo size={40} />
                <div>
                  <div className="about-app-name">{t('app.title')}</div>
                  <div className="about-app-version">
                    {t('settings.version')} {APP_VERSION} · {PROJECT_INFO.license}
                  </div>
                </div>
              </div>

              <p className="settings-row-hint about-description">{t('settings.aboutDescription')}</p>

              <div className="about-links">
                <a
                  className="about-link"
                  href={PROJECT_INFO.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitBranch size={16} strokeWidth={1.75} />
                  {t('settings.viewOnGithub')}
                </a>
                <a
                  className="about-link"
                  href={PROJECT_INFO.issuesUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageSquareWarning size={16} strokeWidth={1.75} />
                  {t('settings.reportIssue')}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}