/** Plugin Agenda: lista de tarefas com data, visualizável por mês ou semana — à parte das
 * notas, no mesmo espírito do Kanban (dados próprios do vault, não dentro de um arquivo .md).
 *
 * Persistência: um único arquivo JSON versionado no repo (`.kyanite/agenda.json`).
 *
 * Cada tarefa tem uma data obrigatória (é o que a ancora num dia do calendário) e pode,
 * opcionalmente, ter horário, descrição, urgência e apontar para uma nota do vault (igual
 * os cartões do Kanban). */

export const AGENDA_PATH = '.kyanite/agenda.json'

/** mesma escala do Kanban: 0 = nenhuma, 1 = baixa, 2 = média, 3 = alta, 4 = crítica */
export type Urgency = 0 | 1 | 2 | 3 | 4
export const URGENCY_LEVELS: Urgency[] = [0, 1, 2, 3, 4]

export interface AgendaTask {
  id: string
  text: string
  /** data ISO (YYYY-MM-DD) à qual a tarefa pertence */
  date: string
  /** horário opcional no formato HH:MM (24h); sem horário = tarefa do dia, sem hora marcada */
  time?: string
  /** duração em minutos (só tem efeito visual/prático se `time` também estiver definido) */
  durationMinutes?: number
  /** notas/detalhes adicionais, livre */
  description?: string
  urgency?: Urgency
  done: boolean
  /** path opcional de uma nota do vault que a tarefa referencia */
  notePath?: string
  /** se true, já disparamos a notificação do navegador para esta tarefa (evita repetir) */
  notified?: boolean
  createdAt: number
}

export interface AgendaCollection {
  tasks: AgendaTask[]
}

let counter = 0
function newId(): string {
  counter += 1
  return `task-${Date.now().toString(36)}-${counter}`
}

export function emptyCollection(): AgendaCollection {
  return { tasks: [] }
}

function sanitizeTask(raw: unknown): AgendaTask | null {
  const t = raw as Partial<AgendaTask>
  if (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return null
  const urgency =
    typeof t.urgency === 'number' && t.urgency >= 0 && t.urgency <= 4
      ? (Math.round(t.urgency) as Urgency)
      : undefined
  return {
    id: typeof t.id === 'string' ? t.id : newId(),
    text: typeof t.text === 'string' ? t.text : '',
    date: t.date,
    time: typeof t.time === 'string' && /^\d{2}:\d{2}$/.test(t.time) ? t.time : undefined,
    durationMinutes:
      typeof t.durationMinutes === 'number' && t.durationMinutes > 0
        ? Math.round(t.durationMinutes)
        : undefined,
    description: typeof t.description === 'string' ? t.description : undefined,
    urgency,
    done: Boolean(t.done),
    notePath: typeof t.notePath === 'string' ? t.notePath : undefined,
    notified: Boolean(t.notified),
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
  }
}

/** Parseia o JSON bruto do repo, tolerando arquivo ausente/corrompido/parcial */
export function parseCollection(raw: string): AgendaCollection {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.tasks)) return emptyCollection()
    const tasks = parsed.tasks
      .map(sanitizeTask)
      .filter((t: AgendaTask | null): t is AgendaTask => t !== null)
    return { tasks }
  } catch {
    return emptyCollection()
  }
}

export function serializeCollection(collection: AgendaCollection): string {
  return JSON.stringify(collection, null, 2) + '\n'
}

export interface NewTaskInput {
  time?: string
  durationMinutes?: number
  description?: string
  urgency?: Urgency
  notePath?: string
}

export function addTask(
  collection: AgendaCollection,
  date: string,
  text: string,
  extra?: NewTaskInput
): AgendaCollection {
  const trimmed = text.trim()
  if (!trimmed) return collection
  const task: AgendaTask = {
    id: newId(),
    text: trimmed,
    date,
    time: extra?.time,
    durationMinutes: extra?.time ? extra?.durationMinutes : undefined,
    description: extra?.description,
    urgency: extra?.urgency,
    done: false,
    notePath: extra?.notePath,
    createdAt: Date.now(),
  }
  return { ...collection, tasks: [...collection.tasks, task] }
}

export function updateTask(
  collection: AgendaCollection,
  taskId: string,
  patch: Partial<
    Pick<
      AgendaTask,
      'text' | 'date' | 'time' | 'durationMinutes' | 'description' | 'urgency' | 'done' | 'notePath' | 'notified'
    >
  >
): AgendaCollection {
  return {
    ...collection,
    tasks: collection.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            text: patch.text !== undefined ? patch.text.trim() : t.text,
            date: patch.date ?? t.date,
            time: 'time' in patch ? patch.time || undefined : t.time,
            durationMinutes:
              'durationMinutes' in patch ? patch.durationMinutes || undefined : t.durationMinutes,
            description: 'description' in patch ? patch.description || undefined : t.description,
            urgency: 'urgency' in patch ? patch.urgency : t.urgency,
            done: patch.done ?? t.done,
            notePath: 'notePath' in patch ? patch.notePath || undefined : t.notePath,
            notified: patch.notified ?? t.notified,
          }
        : t
    ),
  }
}

export function removeTask(collection: AgendaCollection, taskId: string): AgendaCollection {
  return { ...collection, tasks: collection.tasks.filter((t) => t.id !== taskId) }
}

export function toggleTaskDone(collection: AgendaCollection, taskId: string): AgendaCollection {
  return {
    ...collection,
    tasks: collection.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
  }
}

export function tasksForDate(collection: AgendaCollection, dateIso: string): AgendaTask[] {
  return collection.tasks.filter((t) => t.date === dateIso)
}

/** true se a tarefa não está concluída e sua data (+ horário, se houver) já passou */
export function isTaskOverdue(task: AgendaTask, now: Date = new Date()): boolean {
  if (task.done) return false
  const todayNow = formatIso(now)
  if (task.date < todayNow) return true
  if (task.date > todayNow) return false
  if (!task.time) return false // tarefa de hoje sem horário: não considera atrasada por horário
  const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return task.time < nowHm
}

/** todas as tarefas pendentes (não concluídas) já atrasadas, em toda a coleção */
export function overdueTasks(collection: AgendaCollection, now: Date = new Date()): AgendaTask[] {
  return collection.tasks.filter((t) => isTaskOverdue(t, now))
}

/** tarefas pendentes com data de hoje (atrasadas ou não) */
export function todayTasks(collection: AgendaCollection, now: Date = new Date()): AgendaTask[] {
  const iso = formatIso(now)
  return collection.tasks.filter((t) => !t.done && t.date === iso)
}

// ---- posicionamento na timeline (visão diária/semanal com blocos proporcionais) ----

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Dados de layout de uma tarefa posicionada na timeline: topo/altura em minutos desde
 * 00:00, e a coluna (para lado a lado quando há sobreposição de horários). */
export interface TimelineBlock {
  task: AgendaTask
  startMinutes: number
  durationMinutes: number
  column: number
  columnCount: number
}

const DEFAULT_BLOCK_MINUTES = 30

/** Calcula o layout (coluna/largura) das tarefas com horário de um dia, para desenhar como
 * blocos numa timeline — tarefas com horários sobrepostos ficam lado a lado, nunca empilhadas. */
export function layoutTimelineBlocks(tasks: AgendaTask[]): TimelineBlock[] {
  const timed = tasks
    .filter((t): t is AgendaTask & { time: string } => Boolean(t.time))
    .map((t) => ({
      task: t,
      startMinutes: timeToMinutes(t.time),
      durationMinutes: t.durationMinutes ?? DEFAULT_BLOCK_MINUTES,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes)

  const blocks: TimelineBlock[] = []
  let cluster: typeof timed = []

  function flushCluster() {
    if (cluster.length === 0) return
    // dentro do cluster, atribui colunas gulosamente (primeira coluna livre no momento do início)
    const columnEnds: number[] = []
    for (const item of cluster) {
      let col = columnEnds.findIndex((end) => end <= item.startMinutes)
      if (col === -1) {
        col = columnEnds.length
        columnEnds.push(item.startMinutes + item.durationMinutes)
      } else {
        columnEnds[col] = item.startMinutes + item.durationMinutes
      }
      blocks.push({ ...item, column: col, columnCount: 0 })
    }
    const columnCount = columnEnds.length
    for (const b of blocks.slice(blocks.length - cluster.length)) b.columnCount = columnCount
    cluster = []
  }

  let clusterEnd = -1
  for (const item of timed) {
    if (cluster.length > 0 && item.startMinutes >= clusterEnd) {
      flushCluster()
      clusterEnd = -1
    }
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.startMinutes + item.durationMinutes)
  }
  flushCluster()

  return blocks
}

// ---- helpers de data (sem dependências externas) ----

export function todayIso(): string {
  return formatIso(new Date())
}

export function formatIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso)
  date.setDate(date.getDate() + days)
  return formatIso(date)
}

/** início da semana (domingo) que contém a data dada */
export function startOfWeek(iso: string): string {
  const date = parseIso(iso)
  date.setDate(date.getDate() - date.getDay())
  return formatIso(date)
}

/** As 7 datas (ISO) da semana que contém `iso`, começando no domingo */
export function weekDates(iso: string): string[] {
  const start = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Matriz de semanas (6 semanas x 7 dias) cobrindo o mês de `iso`, incluindo dias de
 * meses adjacentes para completar as semanas (igual a maioria dos calendários visuais) */
export function monthGrid(iso: string): string[][] {
  const date = parseIso(iso)
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const gridStart = startOfWeek(formatIso(firstOfMonth))

  const weeks: string[][] = []
  let cursor = gridStart
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i))
    weeks.push(week)
    cursor = addDays(cursor, 7)
  }
  return weeks
}

export function isSameMonth(iso: string, referenceIso: string): boolean {
  const a = parseIso(iso)
  const b = parseIso(referenceIso)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function addMonths(iso: string, months: number): string {
  const date = parseIso(iso)
  date.setMonth(date.getMonth() + months)
  return formatIso(date)
}
