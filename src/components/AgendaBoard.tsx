import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Plus, X, FileText, Clock, Flag,
  ChevronDown, ChevronUp, Bell, BellOff, AlertTriangle,
} from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useConfirmStore } from '../store/useConfirmStore'
import {
  addTask,
  updateTask,
  removeTask,
  toggleTaskDone,
  tasksForDate,
  isTaskOverdue,
  todayIso,
  monthGrid,
  weekDates,
  isSameMonth,
  addMonths,
  addDays,
  parseIso,
  URGENCY_LEVELS,
  type AgendaTask,
  type Urgency,
} from '../lib/agenda'
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../lib/notifications'
import { AgendaTimeline } from './AgendaTimeline'
import './AgendaBoard.css'

interface AgendaBoardProps {
  onClose: () => void
}

type ViewMode = 'month' | 'week' | 'day'

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240]

function formatDurationLabel(minutes: number, t: TFunction): string {
  if (minutes < 60) return t('agenda.durationMinutes', { count: minutes })
  const hours = minutes / 60
  return t('agenda.durationHours', { count: hours })
}

export function AgendaBoard({ onClose }: AgendaBoardProps) {
  const { t, i18n } = useTranslation()
  const collection = useVaultStore((s) => s.agendaCollection)
  const save = useVaultStore((s) => s.saveAgendaCollection)
  const notes = useVaultStore((s) => s.notes)
  const openTab = useTabsStore((s) => s.openTab)
  const confirm = useConfirmStore((s) => s.confirm)

  const today = todayIso()
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)

  const [draftText, setDraftText] = useState('')
  const [draftTime, setDraftTime] = useState('')
  const [draftDuration, setDraftDuration] = useState(30)
  const [draftDescription, setDraftDescription] = useState('')
  const [draftUrgency, setDraftUrgency] = useState<Urgency>(0)
  const [draftNote, setDraftNote] = useState('')
  const [showMoreFields, setShowMoreFields] = useState(false)

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)

  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>(
    getNotificationPermission
  )

  useEffect(() => {
    // o navegador não emite evento de mudança de permissão; refletimos ao reabrir a view
    setNotifPermission(getNotificationPermission())
  }, [])

  function commit(fn: (c: typeof collection) => typeof collection) {
    save(fn(collection))
  }

  function resetDraft() {
    setDraftText('')
    setDraftTime('')
    setDraftDuration(30)
    setDraftDescription('')
    setDraftUrgency(0)
    setDraftNote('')
    setShowMoreFields(false)
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!draftText.trim()) return
    const notePath = resolveNotePath(draftNote)
    commit((c) =>
      addTask(c, selectedDate, draftText, {
        time: draftTime || undefined,
        durationMinutes: draftDuration,
        description: draftDescription || undefined,
        urgency: draftUrgency || undefined,
        notePath,
      })
    )
    resetDraft()
  }

  async function handleRemoveTask(task: AgendaTask) {
    if (!(await confirm(t('agenda.deleteConfirm')))) return
    commit((c) => removeTask(c, task.id))
    if (editingTaskId === task.id) setEditingTaskId(null)
  }

  function resolveNotePath(query: string): string | undefined {
    const trimmed = query.trim()
    if (!trimmed) return undefined
    const match = notes.find((n) => n.name.toLowerCase() === trimmed.toLowerCase())
    return match?.path
  }

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission()
    setNotifPermission(result)
  }

  function goToday() {
    setCursor(today)
    setSelectedDate(today)
  }

  function goPrev() {
    const next =
      view === 'month' ? addMonths(cursor, -1) : view === 'week' ? addDays(cursor, -7) : addDays(cursor, -1)
    setCursor(next)
    if (view === 'day') setSelectedDate(next)
  }

  function goNext() {
    const next =
      view === 'month' ? addMonths(cursor, 1) : view === 'week' ? addDays(cursor, 7) : addDays(cursor, 1)
    setCursor(next)
    if (view === 'day') setSelectedDate(next)
  }

  const weeks = useMemo(() => (view === 'month' ? monthGrid(cursor) : [weekDates(cursor)]), [view, cursor])
  const timelineDates = useMemo(() => (view === 'day' ? [cursor] : weekDates(cursor)), [view, cursor])
  const monthLabel = useMemo(() => {
    const date = parseIso(cursor)
    return date.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
  }, [cursor, i18n.language])

  const selectedTasks = useMemo(
    () =>
      tasksForDate(collection, selectedDate).sort((a, b) => {
        if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0
        if (a.time) return -1
        if (b.time) return 1
        return a.createdAt - b.createdAt
      }),
    [collection, selectedDate]
  )

  const overdueCount = useMemo(
    () => collection.tasks.filter((t) => isTaskOverdue(t)).length,
    [collection]
  )

  function findNoteName(path: string | undefined): string | null {
    if (!path) return null
    const note = notes.find((n) => n.path === path)
    return note?.name ?? null
  }

  return (
    <div className="agenda-view">
      <div className="agenda-view-header">
        <button className="agenda-back-btn" onClick={onClose}>
          <ArrowLeft size={14} strokeWidth={1.75} />
          {t('kanban.backToNotes')}
        </button>
        <span className="agenda-view-title">{t('plugins.agenda.name')}</span>

        {overdueCount > 0 && (
          <span className="agenda-overdue-badge" title={t('agenda.overdueHint', { count: overdueCount })}>
            <AlertTriangle size={12} strokeWidth={2} />
            {overdueCount}
          </span>
        )}

        <div className="agenda-view-toggle">
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
            {t('agenda.month')}
          </button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
            {t('agenda.week')}
          </button>
          <button
            className={view === 'day' ? 'active' : ''}
            onClick={() => {
              setView('day')
              setCursor(selectedDate)
            }}
          >
            {t('agenda.day')}
          </button>
        </div>

        <div className="agenda-nav">
          <button className="agenda-icon-btn" onClick={goPrev} title={t('agenda.previous')}>
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <button className="agenda-today-btn" onClick={goToday}>
            {t('agenda.today')}
          </button>
          <button className="agenda-icon-btn" onClick={goNext} title={t('agenda.next')}>
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
        </div>

        <span className="agenda-month-label">{monthLabel}</span>

        {notifPermission !== 'unsupported' && (
          <button
            className={`agenda-icon-btn ${notifPermission === 'granted' ? 'active' : ''}`}
            onClick={notifPermission === 'default' ? handleEnableNotifications : undefined}
            disabled={notifPermission === 'denied'}
            title={
              notifPermission === 'granted'
                ? t('agenda.notificationsOn')
                : notifPermission === 'denied'
                  ? t('agenda.notificationsBlocked')
                  : t('agenda.enableNotifications')
            }
          >
            {notifPermission === 'granted' ? (
              <Bell size={15} strokeWidth={1.75} />
            ) : (
              <BellOff size={15} strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>

      <div className="agenda-body">
        {view === 'month' ? (
          <div className="agenda-calendar month">
            <div className="agenda-weekday-row">
              {WEEKDAY_KEYS.map((key) => (
                <div className="agenda-weekday" key={key}>
                  {t(`pomodoro.weekdays.${key}`)}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div className="agenda-week-row" key={wi}>
                {week.map((dateIso) => {
                  const dayTasks = tasksForDate(collection, dateIso)
                  const dayNumber = parseIso(dateIso).getDate()
                  const outsideMonth = !isSameMonth(dateIso, cursor)
                  const isToday = dateIso === today
                  const isSelected = dateIso === selectedDate
                  const visibleTasks = dayTasks.slice(0, 3)
                  const hiddenCount = dayTasks.length - visibleTasks.length
                  const hasOverdue = dayTasks.some((task) => isTaskOverdue(task))

                  return (
                    <button
                      key={dateIso}
                      className={`agenda-day ${outsideMonth ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedDate(dateIso)}
                    >
                      <span className="agenda-day-number-row">
                        <span className="agenda-day-number">{dayNumber}</span>
                        {hasOverdue && <span className="agenda-day-overdue-dot" />}
                      </span>
                      <span className="agenda-day-tasks">
                        {visibleTasks.map((task) => (
                          <span
                            key={task.id}
                            className={`agenda-day-task-chip ${task.done ? 'done' : ''} ${isTaskOverdue(task) ? 'overdue' : ''} urgency-${task.urgency ?? 0}`}
                          >
                            {task.time && <span className="agenda-chip-time">{task.time}</span>}
                            {task.text}
                          </span>
                        ))}
                        {hiddenCount > 0 && (
                          <span className="agenda-day-task-more">+{hiddenCount}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <AgendaTimeline
            dates={timelineDates}
            collection={collection}
            selectedDate={selectedDate}
            onSelectTask={(task) => setEditingTaskId(task.id)}
            onSelectDate={setSelectedDate}
            dateLabel={(dateIso) => {
              const date = parseIso(dateIso)
              const isToday = dateIso === today
              return `${date.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric' })}${isToday ? ' •' : ''}`
            }}
          />
        )}

        <div className="agenda-day-panel">
          <h4 className="agenda-day-panel-title">
            {parseIso(selectedDate).toLocaleDateString(i18n.language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h4>

          <ul className="agenda-task-list">
            {selectedTasks.map((task) => {
              const noteName = findNoteName(task.notePath)
              const overdue = isTaskOverdue(task)
              const isEditing = editingTaskId === task.id

              if (isEditing) {
                return (
                  <TaskEditForm
                    key={task.id}
                    task={task}
                    noteNames={notes.map((n) => n.name)}
                    onCancel={() => setEditingTaskId(null)}
                    onSave={(patch) => {
                      commit((c) => updateTask(c, task.id, patch))
                      setEditingTaskId(null)
                    }}
                  />
                )
              }

              return (
                <li
                  className={`agenda-task-item ${task.done ? 'done' : ''} ${overdue ? 'overdue' : ''} urgency-${task.urgency ?? 0}`}
                  key={task.id}
                >
                  <label className="agenda-task-checkbox">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => commit((c) => toggleTaskDone(c, task.id))}
                    />
                    <span />
                  </label>
                  <div className="agenda-task-main" onClick={() => setEditingTaskId(task.id)}>
                    <div className="agenda-task-top">
                      {task.time && (
                        <span className="agenda-task-time">
                          <Clock size={11} strokeWidth={1.75} />
                          {task.time}
                        </span>
                      )}
                      {!!task.urgency && (
                        <span className={`agenda-task-urgency urgency-${task.urgency}`}>
                          <Flag size={10} strokeWidth={2} />
                          {t(`kanban.urgencyLevels.${task.urgency}`)}
                        </span>
                      )}
                      {overdue && <span className="agenda-task-overdue-label">{t('agenda.overdue')}</span>}
                    </div>
                    <span className="agenda-task-text">{task.text}</span>
                    {task.description && (
                      <span className="agenda-task-description">{task.description}</span>
                    )}
                    {noteName && (
                      <button
                        className="agenda-task-note"
                        onClick={(e) => {
                          e.stopPropagation()
                          openTab(task.notePath!)
                        }}
                      >
                        <FileText size={11} strokeWidth={1.75} />
                        {noteName}
                      </button>
                    )}
                  </div>
                  <button
                    className="agenda-task-remove"
                    onClick={() => handleRemoveTask(task)}
                    title={t('agenda.deleteTask')}
                  >
                    <X size={13} strokeWidth={1.75} />
                  </button>
                </li>
              )
            })}
            {selectedTasks.length === 0 && (
              <li className="agenda-task-empty">{t('agenda.noTasks')}</li>
            )}
          </ul>

          <form className="agenda-add-task" onSubmit={handleAddTask}>
            <div className="agenda-add-task-row">
              <input
                className="agenda-add-task-input"
                placeholder={t('agenda.addTaskPlaceholder')}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
              <button
                type="button"
                className="agenda-icon-btn"
                onClick={() => setShowMoreFields((s) => !s)}
                title={t('agenda.moreDetails')}
              >
                {showMoreFields ? (
                  <ChevronUp size={14} strokeWidth={1.75} />
                ) : (
                  <ChevronDown size={14} strokeWidth={1.75} />
                )}
              </button>
              <button type="submit" className="agenda-add-task-btn" title={t('agenda.addTask')}>
                <Plus size={14} strokeWidth={1.75} />
              </button>
            </div>

            {showMoreFields && (
              <div className="agenda-add-task-extra">
                <label className="agenda-field">
                  <span>{t('agenda.time')}</span>
                  <input
                    type="time"
                    className="agenda-field-input"
                    value={draftTime}
                    onChange={(e) => setDraftTime(e.target.value)}
                  />
                </label>
                {draftTime && (
                  <label className="agenda-field">
                    <span>{t('agenda.duration')}</span>
                    <select
                      className="agenda-field-input"
                      value={draftDuration}
                      onChange={(e) => setDraftDuration(Number(e.target.value))}
                    >
                      {DURATION_OPTIONS.map((min) => (
                        <option key={min} value={min}>
                          {formatDurationLabel(min, t)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="agenda-field">
                  <span>{t('kanban.urgency')}</span>
                  <select
                    className="agenda-field-input"
                    value={draftUrgency}
                    onChange={(e) => setDraftUrgency(Number(e.target.value) as Urgency)}
                  >
                    {URGENCY_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {t(`kanban.urgencyLevels.${lvl}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="agenda-field agenda-field-wide">
                  <span>{t('kanban.linkNote')}</span>
                  <input
                    className="agenda-field-input"
                    list="agenda-note-options"
                    placeholder={t('kanban.linkPlaceholder')}
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                  />
                  <datalist id="agenda-note-options">
                    {notes.map((n) => (
                      <option key={n.path} value={n.name} />
                    ))}
                  </datalist>
                </label>
                <label className="agenda-field agenda-field-wide">
                  <span>{t('agenda.description')}</span>
                  <textarea
                    className="agenda-field-input agenda-field-textarea"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                  />
                </label>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

interface TaskEditFormProps {
  task: AgendaTask
  noteNames: string[]
  onCancel: () => void
  onSave: (
    patch: Partial<
      Pick<AgendaTask, 'text' | 'time' | 'durationMinutes' | 'description' | 'urgency' | 'notePath'>
    >
  ) => void
}

/** Formulário inline de edição de uma tarefa existente, substituindo o item na lista */
function TaskEditForm({ task, onCancel, onSave }: TaskEditFormProps) {
  const { t } = useTranslation()
  const notes = useVaultStore((s) => s.notes)
  const [text, setText] = useState(task.text)
  const [time, setTime] = useState(task.time ?? '')
  const [duration, setDuration] = useState(task.durationMinutes ?? 30)
  const [description, setDescription] = useState(task.description ?? '')
  const [urgency, setUrgency] = useState<Urgency>(task.urgency ?? 0)
  const [noteQuery, setNoteQuery] = useState(() => {
    const note = notes.find((n) => n.path === task.notePath)
    return note?.name ?? ''
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const match = notes.find((n) => n.name.toLowerCase() === noteQuery.trim().toLowerCase())
    onSave({
      text,
      time: time || undefined,
      durationMinutes: time ? duration : undefined,
      description: description || undefined,
      urgency: urgency || undefined,
      notePath: match?.path,
    })
  }

  return (
    <li className="agenda-task-item agenda-task-item-editing">
      <form className="agenda-task-edit-form" onSubmit={handleSubmit}>
        <input
          className="agenda-field-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="agenda-add-task-extra">
          <label className="agenda-field">
            <span>{t('agenda.time')}</span>
            <input
              type="time"
              className="agenda-field-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          {time && (
            <label className="agenda-field">
              <span>{t('agenda.duration')}</span>
              <select
                className="agenda-field-input"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((min) => (
                  <option key={min} value={min}>
                    {formatDurationLabel(min, t)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="agenda-field">
            <span>{t('kanban.urgency')}</span>
            <select
              className="agenda-field-input"
              value={urgency}
              onChange={(e) => setUrgency(Number(e.target.value) as Urgency)}
            >
              {URGENCY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {t(`kanban.urgencyLevels.${lvl}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="agenda-field agenda-field-wide">
            <span>{t('kanban.linkNote')}</span>
            <input
              className="agenda-field-input"
              list="agenda-note-options-edit"
              placeholder={t('kanban.linkPlaceholder')}
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
            />
            <datalist id="agenda-note-options-edit">
              {notes.map((n) => (
                <option key={n.path} value={n.name} />
              ))}
            </datalist>
          </label>
          <label className="agenda-field agenda-field-wide">
            <span>{t('agenda.description')}</span>
            <textarea
              className="agenda-field-input agenda-field-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <div className="agenda-task-edit-actions">
          <button type="button" className="agenda-today-btn" onClick={onCancel}>
            {t('confirm.cancel')}
          </button>
          <button type="submit" className="agenda-add-task-btn agenda-task-edit-save">
            {t('agenda.save')}
          </button>
        </div>
      </form>
    </li>
  )
}
