
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Pause, RotateCcw, X, FileText, ListTodo } from 'lucide-react'
import {
  usePomodoroStore,
  formatClock,
  phaseDurationSeconds,
  metricsForToday,
  topNotesByFocus,
  focusByDay,
} from '../store/usePomodoroStore'
import { useVaultStore } from '../store/useVaultStore'
import { PomodoroChart } from './PomodoroChart'
import './PomodoroWidget.css'
/** Widget compacto do Pomodoro (centro da TopBar): anel de progresso + timer + botões pequenos.
 * Clicar no relógio abre um balão com config rápida, seletor de nota, cartão em foco e métricas. */
export function PomodoroWidget() {
  const { t } = useTranslation()
  const open = usePomodoroStore((s) => s.open)
  const phase = usePomodoroStore((s) => s.phase)
  const running = usePomodoroStore((s) => s.running)
  const secondsLeft = usePomodoroStore((s) => s.secondsLeft)
  const start = usePomodoroStore((s) => s.start)
  const pause = usePomodoroStore((s) => s.pause)
  const reset = usePomodoroStore((s) => s.reset)
  const setPhase = usePomodoroStore((s) => s.setPhase)
  const hide = usePomodoroStore((s) => s.hide)
  const durations = usePomodoroStore((s) => s.durations)
  const justFinished = usePomodoroStore((s) => s.justFinished)
  const setDuration = usePomodoroStore((s) => s.setDuration)
  const activeNotePath = usePomodoroStore((s) => s.activeNotePath)
  const setActiveNotePath = usePomodoroStore((s) => s.setActiveNotePath)
  const activeCardId = usePomodoroStore((s) => s.activeCardId)
  const activeCardLabel = usePomodoroStore((s) => s.activeCardLabel)
  const clearActiveCard = usePomodoroStore((s) => s.clearActiveCard)
  const sessions = usePomodoroStore((s) => s.sessions)
  const notes = useVaultStore((s) => s.notes)
  const [panelOpen, setPanelOpen] = useState(false)
  const [draftNote, setDraftNote] = useState('')
  const widgetRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => metricsForToday(sessions), [sessions])
  const topNotes = useMemo(() => topNotesByFocus(sessions, 5), [sessions])
  const weekPoints = useMemo(() => focusByDay(sessions, 7), [sessions])
  useEffect(() => {
    if (!panelOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [panelOpen])
  if (!open) return null
  const total = phaseDurationSeconds(durations, phase)
  const elapsed = total - secondsLeft
  const fraction = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0
  const size = 30
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - fraction)
  const activeNoteName = activeNotePath
    ? activeNotePath.replace(/\.md$/, '').split('/').pop()
    : null
  function commitNote() {
    const q = draftNote.trim().toLowerCase()
    if (q === '') {
      setActiveNotePath(null)
      return
    }
    const match = notes.find((n) => n.path.toLowerCase() === q || n.name.toLowerCase() === q)
    setActiveNotePath(match ? match.path : null)
  }
  function noteLabel(notePath: string | null): string {
    if (!notePath) return t('pomodoro.noNote')
    return notePath.replace(/\.md$/, '').split('/').pop() ?? notePath
  }
  return (
    <div className={`pomodoro-widget phase-${phase} ${justFinished ? 'finished' : ''}`} ref={widgetRef}>
      <button
        className="pomodoro-ring-btn"
        onClick={() => setPhase(phase === 'work' ? 'break' : 'work')}
        title={phase === 'work' ? t('pomodoroBar.work') : t('pomodoroBar.break')}
      >
        <svg width={size} height={size} className="pomodoro-ring">
          <circle
            className="pomodoro-ring-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            className="pomodoro-ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span className="pomodoro-ring-dot" />
      </button>
      <button
        className="pomodoro-widget-clock"
        onClick={() => setPanelOpen((o) => !o)}
        title={t('pomodoro.openPanel')}
      >
        {formatClock(secondsLeft)}
      </button>
      {running ? (
        <button className="pomodoro-mini-btn" onClick={pause} title={t('pomodoroBar.pause')}>
          <Pause size={13} strokeWidth={2} />
        </button>
      ) : (
        <button className="pomodoro-mini-btn primary" onClick={start} title={t('pomodoroBar.start')}>
          <Play size={13} strokeWidth={2} />
        </button>
      )}
      <button className="pomodoro-mini-btn" onClick={reset} title={t('pomodoroBar.reset')}>
        <RotateCcw size={12} strokeWidth={2} />
      </button>
      <button className="pomodoro-mini-btn" onClick={hide} title={t('pomodoroBar.close')}>
        <X size={13} strokeWidth={2} />
      </button>
      {panelOpen && (
        <div className="pomodoro-panel">
          <div className="pomodoro-panel-arrow" />
          {/* cartão do Kanban em foco (definido pelo botão 'focar' no cartão) */}
          {activeCardId && (
            <div className="pomodoro-panel-section">
              <label className="pomodoro-panel-label">{t('pomodoro.focusingCard')}</label>
              <div className="pomodoro-card-chip">
                <ListTodo size={13} strokeWidth={1.75} />
                <span className="pomodoro-card-chip-label" title={activeCardLabel ?? ''}>
                  {activeCardLabel}
                </span>
                <button
                  className="pomodoro-card-chip-clear"
                  onClick={clearActiveCard}
                  title={t('pomodoro.clearCard')}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
          {/* nota associada */}
          <div className="pomodoro-panel-section">
            <label className="pomodoro-panel-label">{t('pomodoro.linkedNote')}</label>
            <div className="pomodoro-note-field">
              <FileText size={13} strokeWidth={1.75} />
              <input
                list="pomodoro-note-options"
                className="pomodoro-panel-input"
                defaultValue={activeNoteName ?? ''}
                placeholder={t('pomodoro.notePlaceholder')}
                onBlur={(e) => {
                  setDraftNote(e.target.value)
                  commitNote()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setDraftNote((e.target as HTMLInputElement).value)
                    commitNote()
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
              />
              <datalist id="pomodoro-note-options">
                {notes.map((n) => (
                  <option key={n.path} value={n.name} />
                ))}
              </datalist>
            </div>
          </div>
          {/* config rápida de durações */}
          <div className="pomodoro-panel-section pomodoro-panel-durations">
            <div className="pomodoro-duration">
              <label className="pomodoro-panel-label">{t('pomodoroBar.work')}</label>
              <input
                type="number"
                min={1}
                max={180}
                className="pomodoro-panel-number"
                value={durations.work}
                onChange={(e) => setDuration('work', Number(e.target.value))}
              />
            </div>
            <div className="pomodoro-duration">
              <label className="pomodoro-panel-label">{t('pomodoroBar.break')}</label>
              <input
                type="number"
                min={1}
                max={180}
                className="pomodoro-panel-number"
                value={durations.break}
                onChange={(e) => setDuration('break', Number(e.target.value))}
              />
            </div>
          </div>
          {/* métricas do dia */}
          <div className="pomodoro-panel-section">
            <label className="pomodoro-panel-label">{t('pomodoro.today')}</label>
            <div className="pomodoro-metrics">
              <div className="pomodoro-metric">
                <span className="pomodoro-metric-value">{today.cycles}</span>
                <span className="pomodoro-metric-label">{t('pomodoro.cycles')}</span>
              </div>
              <div className="pomodoro-metric">
                <span className="pomodoro-metric-value">{today.minutes}</span>
                <span className="pomodoro-metric-label">{t('pomodoro.minutes')}</span>
              </div>
            </div>
          </div>
          {/* gráfico: minutos de foco nos últimos 7 dias */}
          <div className="pomodoro-panel-section">
            <label className="pomodoro-panel-label">{t('pomodoro.last7days')}</label>
            <PomodoroChart points={weekPoints} />
          </div>
          {/* top notas por tempo de foco */}
          <div className="pomodoro-panel-section">
            <label className="pomodoro-panel-label">{t('pomodoro.topNotes')}</label>
            {topNotes.length === 0 ? (
              <p className="pomodoro-panel-empty">{t('pomodoro.noData')}</p>
            ) : (
              <ul className="pomodoro-top-list">
                {topNotes.map((nf, i) => (
                  <li key={nf.notePath ?? `none-${i}`} className="pomodoro-top-item">
                    <span className="pomodoro-top-name" title={nf.notePath ?? ''}>
                      {noteLabel(nf.notePath)}
                    </span>
                    <span className="pomodoro-top-minutes">
                      {nf.minutes} {t('pomodoro.minShort')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

