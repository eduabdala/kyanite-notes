import { useTranslation } from 'react-i18next'
import type { DayPoint } from '../store/usePomodoroStore'

interface PomodoroChartProps {
  points: DayPoint[]
}

/** Mini gráfico de linha (SVG puro) dos minutos de foco por dia — últimos N dias.
 * X = dia da semana, Y = minutos. Sem dependências externas; usa as CSS vars do tema. */
export function PomodoroChart({ points }: PomodoroChartProps) {
  const { t } = useTranslation()

  const width = 228
  const height = 74
  const padLeft = 6
  const padRight = 6
  const padTop = 8
  const padBottom = 16

  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  const maxMinutes = Math.max(1, ...points.map((p) => p.minutes))
  const n = points.length

  // coordenadas de cada ponto
  const coords = points.map((p, i) => {
    const x = n === 1 ? padLeft + plotW / 2 : padLeft + (plotW * i) / (n - 1)
    const y = padTop + plotH * (1 - p.minutes / maxMinutes)
    return { x, y, ...p }
  })

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ')

  // área sob a linha (preenchimento suave)
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} ` +
        `L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : ''

  const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  const allZero = points.every((p) => p.minutes === 0)

  return (
    <svg
      className="pomodoro-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
    >
      {/* linha de base */}
      <line
        className="pomodoro-chart-axis"
        x1={padLeft}
        y1={padTop + plotH}
        x2={width - padRight}
        y2={padTop + plotH}
      />

      {!allZero && (
        <>
          <path className="pomodoro-chart-area" d={areaPath} />
          <path className="pomodoro-chart-line" d={linePath} fill="none" />
        </>
      )}

      {coords.map((c) => (
        <g key={c.date}>
          {!allZero && (
            <circle className="pomodoro-chart-dot" cx={c.x} cy={c.y} r={2.5}>
              <title>
                {c.minutes} {t('pomodoro.minShort')}
              </title>
            </circle>
          )}
          <text
            className="pomodoro-chart-label"
            x={c.x}
            y={height - 4}
            textAnchor="middle"
          >
            {t(`pomodoro.weekdays.${weekdayKeys[c.weekday]}`)}
          </text>
        </g>
      ))}
    </svg>
  )
}