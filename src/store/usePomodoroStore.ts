import { create } from 'zustand'

/** Timer Pomodoro global: o estado vive aqui (não no componente) para o timer continuar
 * rodando mesmo se o widget for escondido, e para o atalho da TopBar poder abri-lo/fechá-lo.
 * As durações são configuráveis (balão do widget / Configurações) e persistidas no localStorage.
 * As sessões de foco concluídas são registradas por nota, para métricas de tempo por nota. */

export type PomodoroPhase = 'work' | 'break'

export interface PomodoroDurations {
  /** minutos de foco */
  work: number
  /** minutos de pausa */
  break: number
}

/** Uma sessão de foco concluída, para métricas */
export interface FocusSession {
  /** data ISO (YYYY-MM-DD) do término */
  date: string
  /** timestamp (ms) do término */
  at: number
  /** path da nota associada, ou null se nenhuma foi escolhida */
  notePath: string | null
  /** id do cartão do Kanban associado, ou null */
  cardId: string | null
  /** rótulo do cartão no momento da sessão (para exibir métricas mesmo se o cartão sumir) */
  cardLabel: string | null
  /** minutos de foco da sessão */
  minutes: number
}

const DEFAULT_DURATIONS: PomodoroDurations = { work: 25, break: 5 }
const DURATIONS_KEY = 'kyanite:pomodoro-durations'
const SESSIONS_KEY = 'kyanite:pomodoro-sessions'

function loadDurations(): PomodoroDurations {
  const raw = localStorage.getItem(DURATIONS_KEY)
  if (!raw) return DEFAULT_DURATIONS
  try {
    const parsed = JSON.parse(raw)
    return {
      work: clampMinutes(parsed.work, DEFAULT_DURATIONS.work),
      break: clampMinutes(parsed.break, DEFAULT_DURATIONS.break),
    }
  } catch {
    return DEFAULT_DURATIONS
  }
}

function saveDurations(d: PomodoroDurations) {
  localStorage.setItem(DURATIONS_KEY, JSON.stringify(d))
}

function loadSessions(): FocusSession[] {
  const raw = localStorage.getItem(SESSIONS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSessions(sessions: FocusSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

/** mantém a duração num intervalo sensato (1–180 min) */
function clampMinutes(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(180, Math.max(1, Math.round(n)))
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface PomodoroState {
  /** widget visível */
  open: boolean
  phase: PomodoroPhase
  running: boolean
  /** segundos restantes na fase atual */
  secondsLeft: number
  /** ciclos de trabalho concluídos (na sessão do app) */
  completedWork: number
  /** durações configuráveis, em minutos */
  durations: PomodoroDurations
  /** true por alguns segundos ao fim de uma fase — dispara o alerta visual do widget */
  justFinished: boolean
  /** nota associada ao pomodoro atual (escolhida manualmente no balão) */
  activeNotePath: string | null
  /** cartão do Kanban associado ao pomodoro atual (via botão 'focar' no cartão) */
  activeCardId: string | null
  activeCardLabel: string | null
  /** histórico de sessões de foco concluídas (métricas) */
  sessions: FocusSession[]

  show: () => void
  hide: () => void
  toggleOpen: () => void
  start: () => void
  pause: () => void
  reset: () => void
  setPhase: (phase: PomodoroPhase) => void
  setDuration: (phase: PomodoroPhase, minutes: number) => void
  setActiveNotePath: (path: string | null) => void
  /** associa um cartão do Kanban e abre o widget para focar nele */
  focusCard: (cardId: string, label: string) => void
  clearActiveCard: () => void
  clearFinishedFlag: () => void
  /** chamado internamente a cada segundo pelo interval */
  tick: () => void
}

let intervalId: ReturnType<typeof setInterval> | null = null
let finishedTimeout: ReturnType<typeof setTimeout> | null = null

function ensureInterval(get: () => PomodoroState) {
  if (intervalId !== null) return
  intervalId = setInterval(() => get().tick(), 1000)
}

function clearIntervalIfIdle() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function phaseSeconds(durations: PomodoroDurations, phase: PomodoroPhase): number {
  return durations[phase] * 60
}

function playChime() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 660
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // sem áudio disponível: silencioso
  }
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  const durations = loadDurations()
  return {
    open: false,
    phase: 'work',
    running: false,
    secondsLeft: phaseSeconds(durations, 'work'),
    completedWork: 0,
    durations,
    justFinished: false,
    activeNotePath: null,
    activeCardId: null,
    activeCardLabel: null,
    sessions: loadSessions(),

    show: () => set({ open: true }),
    hide: () => set({ open: false }),
    toggleOpen: () => set((s) => ({ open: !s.open })),

    start: () => {
      ensureInterval(get)
      set({ running: true, justFinished: false })
    },

    pause: () => {
      clearIntervalIfIdle()
      set({ running: false })
    },

    reset: () => {
      clearIntervalIfIdle()
      set((s) => ({ running: false, justFinished: false, secondsLeft: phaseSeconds(s.durations, s.phase) }))
    },

    setPhase: (phase) => {
      clearIntervalIfIdle()
      set((s) => ({ phase, running: false, justFinished: false, secondsLeft: phaseSeconds(s.durations, phase) }))
    },

    setDuration: (phase, minutes) => {
      set((s) => {
        const durations = { ...s.durations, [phase]: clampMinutes(minutes, s.durations[phase]) }
        saveDurations(durations)
        const secondsLeft =
          !s.running && s.phase === phase ? phaseSeconds(durations, phase) : s.secondsLeft
        return { durations, secondsLeft }
      })
    },

    setActiveNotePath: (path) => set({ activeNotePath: path }),

    focusCard: (cardId, label) => set({ open: true, activeCardId: cardId, activeCardLabel: label }),

    clearActiveCard: () => set({ activeCardId: null, activeCardLabel: null }),

    clearFinishedFlag: () => set({ justFinished: false }),

    tick: () => {
      const { secondsLeft, phase, completedWork, durations, sessions, activeNotePath, activeCardId, activeCardLabel } = get()
      if (secondsLeft > 1) {
        set({ secondsLeft: secondsLeft - 1 })
        return
      }

      // fim da fase: alterna work <-> break e pausa (o usuário decide continuar)
      clearIntervalIfIdle()
      const nextPhase: PomodoroPhase = phase === 'work' ? 'break' : 'work'

      // registra a sessão apenas quando uma fase de FOCO termina
      let nextSessions = sessions
      if (phase === 'work') {
        const session: FocusSession = {
          date: todayIso(),
          at: Date.now(),
          notePath: activeNotePath,
          cardId: activeCardId,
          cardLabel: activeCardLabel,
          minutes: durations.work,
        }
        nextSessions = [...sessions, session]
        saveSessions(nextSessions)
      }

      set({
        phase: nextPhase,
        secondsLeft: phaseSeconds(durations, nextPhase),
        running: false,
        completedWork: phase === 'work' ? completedWork + 1 : completedWork,
        justFinished: true,
        sessions: nextSessions,
      })

      playChime()

      if (finishedTimeout !== null) clearTimeout(finishedTimeout)
      finishedTimeout = setTimeout(() => get().clearFinishedFlag(), 4000)
    },
  }
})

/** duração total (segundos) da fase atual — usado pelo anel de progresso */
export function phaseDurationSeconds(durations: PomodoroDurations, phase: PomodoroPhase): number {
  return phaseSeconds(durations, phase)
}

/** Formata segundos como mm:ss */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}


/** Total de minutos de foco por cartão do Kanban (mapa cardId -> minutos) */
export function focusMinutesByCard(sessions: FocusSession[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    if (!s.cardId) continue
    map.set(s.cardId, (map.get(s.cardId) ?? 0) + s.minutes)
  }
  return map
}

// ---- seletores de métricas (funções puras sobre a lista de sessões) ----

export interface DayMetrics {
  /** ciclos de foco concluídos hoje */
  cycles: number
  /** minutos de foco acumulados hoje */
  minutes: number
}

export function metricsForToday(sessions: FocusSession[]): DayMetrics {
  const today = todayIso()
  const todays = sessions.filter((s) => s.date === today)
  return {
    cycles: todays.length,
    minutes: todays.reduce((acc, s) => acc + s.minutes, 0),
  }
}

export interface NoteFocus {
  notePath: string | null
  minutes: number
  cycles: number
}

/** Agrega minutos/ciclos de foco por nota, ordenado do maior para o menor.
 * Passe `days` para limitar a uma janela recente (ex: 7); omita para todo o histórico. */
export function topNotesByFocus(sessions: FocusSession[], limit = 5, days?: number): NoteFocus[] {
  let pool = sessions
  if (days && days > 0) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    pool = sessions.filter((s) => s.at >= cutoff)
  }

  const byNote = new Map<string, NoteFocus>()
  for (const s of pool) {
    const key = s.notePath ?? '__none__'
    const existing = byNote.get(key) ?? { notePath: s.notePath, minutes: 0, cycles: 0 }
    existing.minutes += s.minutes
    existing.cycles += 1
    byNote.set(key, existing)
  }

  return Array.from(byNote.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit)
}


export interface DayPoint {
  /** data ISO (YYYY-MM-DD) */
  date: string
  /** rótulo curto do dia da semana (localizável pelo índice weekday 0=Dom..6=Sáb) */
  weekday: number
  /** dia do mês (para tooltip) */
  dayOfMonth: number
  /** minutos de foco somados nesse dia */
  minutes: number
}

/** Série dos últimos `days` dias (incluindo hoje), com minutos de foco por dia.
 * Retorna sempre `days` pontos em ordem cronológica, preenchendo dias sem foco com 0. */
export function focusByDay(sessions: FocusSession[], days = 7): DayPoint[] {
  // soma minutos por data ISO
  const byDate = new Map<string, number>()
  for (const s of sessions) {
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.minutes)
  }

  const points: DayPoint[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    points.push({
      date: iso,
      weekday: d.getDay(),
      dayOfMonth: d.getDate(),
      minutes: byDate.get(iso) ?? 0,
    })
  }
  return points
}
