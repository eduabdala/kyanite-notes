import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import {
  layoutTimelineBlocks,
  tasksForDate,
  isTaskOverdue,
  minutesToTime,
  type AgendaCollection,
  type AgendaTask,
} from '../lib/agenda'
import './AgendaTimeline.css'

const HOUR_HEIGHT = 48 // px por hora
const START_HOUR = 0
const END_HOUR = 24

interface AgendaTimelineProps {
  /** uma data (visão dia) ou várias (visão semana, uma coluna por data) */
  dates: string[]
  collection: AgendaCollection
  selectedDate: string
  onSelectTask: (task: AgendaTask) => void
  onSelectDate: (dateIso: string) => void
  dateLabel: (dateIso: string) => string
}

/** Timeline estilo Google Calendar: grid de horas, tarefas com horário desenhadas como blocos
 * cuja altura é proporcional à duração (durationMinutes). Tarefas sem horário não aparecem
 * aqui (ficam só na lista do painel lateral) — a timeline é especificamente para o que tem
 * um horário de início concreto. */
export function AgendaTimeline({
  dates,
  collection,
  selectedDate,
  onSelectTask,
  onSelectDate,
  dateLabel,
}: AgendaTimelineProps) {
  const { t } = useTranslation()
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const totalHeight = hours.length * HOUR_HEIGHT

  return (
    <div className="agenda-timeline">
      <div className="agenda-timeline-header">
        <div className="agenda-timeline-hour-gutter" />
        {dates.map((dateIso) => (
          <button
            key={dateIso}
            className={`agenda-timeline-day-label ${dateIso === selectedDate ? 'selected' : ''}`}
            onClick={() => onSelectDate(dateIso)}
          >
            {dateLabel(dateIso)}
          </button>
        ))}
      </div>

      <div className="agenda-timeline-scroll">
        <div className="agenda-timeline-grid" style={{ height: totalHeight }}>
          <div className="agenda-timeline-hour-gutter">
            {hours.map((h) => (
              <div className="agenda-timeline-hour-label" key={h} style={{ height: HOUR_HEIGHT }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {dates.map((dateIso) => {
            const dayTasks = tasksForDate(collection, dateIso)
            const blocks = layoutTimelineBlocks(dayTasks)

            return (
              <div className="agenda-timeline-day-column" key={dateIso}>
                {hours.map((h) => (
                  <div className="agenda-timeline-hour-line" key={h} style={{ height: HOUR_HEIGHT }} />
                ))}

                {blocks.map(({ task, startMinutes, durationMinutes, column, columnCount }) => {
                  const top = (startMinutes / 60) * HOUR_HEIGHT
                  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 18)
                  const widthPct = 100 / columnCount
                  const overdue = isTaskOverdue(task)
                  const endLabel = minutesToTime(startMinutes + durationMinutes)

                  return (
                    <button
                      key={task.id}
                      className={`agenda-timeline-block ${task.done ? 'done' : ''} ${overdue ? 'overdue' : ''} urgency-${task.urgency ?? 0}`}
                      style={{
                        top,
                        height,
                        left: `${column * widthPct}%`,
                        width: `calc(${widthPct}% - 2px)`,
                      }}
                      onClick={() => onSelectTask(task)}
                      title={task.text}
                    >
                      <span className="agenda-timeline-block-time">
                        <Clock size={10} strokeWidth={2} />
                        {task.time}–{endLabel}
                      </span>
                      <span className="agenda-timeline-block-text">{task.text}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {dates.every((d) => tasksForDate(collection, d).every((task) => !task.time)) && (
        <p className="agenda-timeline-empty-hint">{t('agenda.noTimedTasks')}</p>
      )}
    </div>
  )
}
