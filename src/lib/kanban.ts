/** Plugin Kanban: quadros próprios do vault, à parte das notas — espaços para organizar
 * cartões em colunas. Suporta MÚLTIPLOS quadros nomeados (ex: "Trabalho", "Pessoal").
 *
 * Persistência: um único arquivo JSON versionado no repo (`.kyanite/kanban.json`) guarda a
 * coleção inteira de quadros. Um arquivo só (em vez de um por quadro) mantém o pull barato —
 * apenas uma chamada à API do GitHub — coerente com a preocupação de rate limit da arquitetura.
 *
 * Cada cartão é texto livre e PODE, opcionalmente: apontar para uma nota (`notePath`), ter
 * urgência, um prazo (`dueDate`) e acumular tempo de foco do Pomodoro (`focusMinutes`). */

export const KANBAN_BOARD_PATH = '.kyanite/kanban.json'

/** Urgência do cartão: 0 = nenhuma, 1 = baixa, 2 = média, 3 = alta, 4 = crítica */
export type Urgency = 0 | 1 | 2 | 3 | 4
export const URGENCY_LEVELS: Urgency[] = [0, 1, 2, 3, 4]

/** Uma tag reutilizável definida no nível do quadro (paleta do board) */
export interface BoardTag {
  id: string
  name: string
  /** cor do chip (hex ou nome CSS) */
  color: string
}

/** Cores sugeridas para novas tags (cicla conforme se criam tags) */
export const TAG_COLORS: string[] = [
  '#d15b5b', '#d1913c', '#d1c23c', '#68b06a', '#4ea1a1', '#5b83d1', '#8a63d1', '#c065a8',
]

export interface KanbanCard {
  id: string
  text: string
  /** path opcional de uma nota do vault que o cartão referencia (clicar abre a nota) */
  notePath?: string
  /** timestamp (ms) de criação do cartão */
  createdAt: number
  /** prazo/tempo limite opcional, data ISO (YYYY-MM-DD) */
  dueDate?: string
  /** nível de urgência (0–4); ausente/0 = nenhuma */
  urgency?: Urgency
  /** timestamp (ms) de quando o cartão entrou na coluna "Done" — base da exclusão automática */
  doneAt?: number
  /** minutos de foco (Pomodoro) acumulados neste cartão */
  focusMinutes?: number
  /** ids das tags (da paleta do quadro) aplicadas a este cartão */
  tagIds?: string[]
}

export interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

/** Um quadro nomeado dentro da coleção */
export interface KanbanBoard {
  id: string
  name: string
  columns: KanbanColumn[]
  /** paleta de tags reutilizáveis do quadro */
  tags?: BoardTag[]
}

/** A coleção completa persistida no repo */
export interface KanbanCollection {
  boards: KanbanBoard[]
  /** id do quadro atualmente selecionado */
  activeBoardId: string
  /** dias para excluir automaticamente cartões parados em "Done" (0 = desativado) */
  autoDeleteDoneDays: number
}

const DEFAULT_AUTO_DELETE_DAYS = 7

let counter = 0
function newId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

/** heurística: uma coluna conta como "concluído" se o título parece Done/Concluído */
export function isDoneColumn(title: string): boolean {
  return /\b(done|conclu|finaliz|completo|complete)/i.test(title.trim())
}

/** Colunas padrão de um quadro novo */
function defaultColumns(): KanbanColumn[] {
  return [
    { id: newId('col'), title: 'To do', cards: [] },
    { id: newId('col'), title: 'Doing', cards: [] },
    { id: newId('col'), title: 'Done', cards: [] },
  ]
}

export function newBoard(name: string): KanbanBoard {
  return { id: newId('board'), name: name.trim() || 'Quadro', columns: defaultColumns() }
}

/** Coleção inicial com um quadro padrão */
export function emptyCollection(): KanbanCollection {
  const board = newBoard('Quadro')
  return { boards: [board], activeBoardId: board.id, autoDeleteDoneDays: DEFAULT_AUTO_DELETE_DAYS }
}

/** Parseia o JSON bruto do repo em uma coleção válida, tolerando arquivo ausente/parcial
 * ou o formato antigo (um único board com `columns` no topo, sem `boards`). */
export function parseCollection(raw: string): KanbanCollection {
  try {
    const parsed = JSON.parse(raw)

    // formato antigo: { columns: [...] } sem 'boards' — migra para um quadro só
    if (parsed && Array.isArray(parsed.columns) && !Array.isArray(parsed.boards)) {
      const board: KanbanBoard = {
        id: newId('board'),
        name: 'Quadro',
        columns: sanitizeColumns(parsed.columns),
      }
      return { boards: [board], activeBoardId: board.id, autoDeleteDoneDays: DEFAULT_AUTO_DELETE_DAYS }
    }

    if (!parsed || !Array.isArray(parsed.boards) || parsed.boards.length === 0) {
      return emptyCollection()
    }

    const boards: KanbanBoard[] = parsed.boards.map((b: unknown) => {
      const bd = b as Partial<KanbanBoard>
      return {
        id: typeof bd.id === 'string' ? bd.id : newId('board'),
        name: typeof bd.name === 'string' ? bd.name : 'Quadro',
        columns: Array.isArray(bd.columns) ? sanitizeColumns(bd.columns) : defaultColumns(),
        tags: Array.isArray(bd.tags) ? sanitizeTags(bd.tags) : undefined,
      }
    })

    const activeBoardId =
      typeof parsed.activeBoardId === 'string' && boards.some((b) => b.id === parsed.activeBoardId)
        ? parsed.activeBoardId
        : boards[0].id

    const autoDeleteDoneDays =
      typeof parsed.autoDeleteDoneDays === 'number' && parsed.autoDeleteDoneDays >= 0
        ? Math.round(parsed.autoDeleteDoneDays)
        : DEFAULT_AUTO_DELETE_DAYS

    return { boards, activeBoardId, autoDeleteDoneDays }
  } catch {
    return emptyCollection()
  }
}

function sanitizeCard(card: unknown): KanbanCard {
  const cd = card as Partial<KanbanCard>
  const urgency =
    typeof cd.urgency === 'number' && cd.urgency >= 0 && cd.urgency <= 4
      ? (Math.round(cd.urgency) as Urgency)
      : undefined
  return {
    id: typeof cd.id === 'string' ? cd.id : newId('card'),
    text: typeof cd.text === 'string' ? cd.text : '',
    notePath: typeof cd.notePath === 'string' ? cd.notePath : undefined,
    createdAt: typeof cd.createdAt === 'number' ? cd.createdAt : Date.now(),
    dueDate: typeof cd.dueDate === 'string' ? cd.dueDate : undefined,
    urgency,
    doneAt: typeof cd.doneAt === 'number' ? cd.doneAt : undefined,
    focusMinutes: typeof cd.focusMinutes === 'number' ? cd.focusMinutes : undefined,
    tagIds: Array.isArray(cd.tagIds) ? cd.tagIds.filter((x): x is string => typeof x === 'string') : undefined,
  }
}

function sanitizeTags(tags: unknown[]): BoardTag[] {
  return tags
    .map((tg) => {
      const t = tg as Partial<BoardTag>
      if (typeof t.id !== 'string' || typeof t.name !== 'string') return null
      return { id: t.id, name: t.name, color: typeof t.color === 'string' ? t.color : TAG_COLORS[0] }
    })
    .filter((t): t is BoardTag => t !== null)
}

function sanitizeColumns(cols: unknown[]): KanbanColumn[] {
  return cols.map((col) => {
    const c = col as Partial<KanbanColumn>
    return {
      id: typeof c.id === 'string' ? c.id : newId('col'),
      title: typeof c.title === 'string' ? c.title : '',
      cards: Array.isArray(c.cards) ? c.cards.map(sanitizeCard) : [],
    }
  })
}

export function serializeCollection(collection: KanbanCollection): string {
  return JSON.stringify(collection, null, 2) + '\n'
}

/** Retorna o quadro ativo da coleção (ou o primeiro como fallback) */
export function getActiveBoard(collection: KanbanCollection): KanbanBoard {
  return collection.boards.find((b) => b.id === collection.activeBoardId) ?? collection.boards[0]
}

/** Aplica uma transformação apenas no quadro ativo, retornando uma nova coleção */
export function updateActiveBoard(
  collection: KanbanCollection,
  fn: (board: KanbanBoard) => KanbanBoard
): KanbanCollection {
  return {
    ...collection,
    boards: collection.boards.map((b) => (b.id === collection.activeBoardId ? fn(b) : b)),
  }
}

// ---- operações de gestão de quadros ----

export function addBoard(collection: KanbanCollection, name: string): KanbanCollection {
  const board = newBoard(name)
  return { ...collection, boards: [...collection.boards, board], activeBoardId: board.id }
}

export function renameBoard(collection: KanbanCollection, boardId: string, name: string): KanbanCollection {
  const trimmed = name.trim()
  if (!trimmed) return collection
  return {
    ...collection,
    boards: collection.boards.map((b) => (b.id === boardId ? { ...b, name: trimmed } : b)),
  }
}

export function removeBoard(collection: KanbanCollection, boardId: string): KanbanCollection {
  const remaining = collection.boards.filter((b) => b.id !== boardId)
  if (remaining.length === 0) return emptyCollection()
  const activeBoardId = collection.activeBoardId === boardId ? remaining[0].id : collection.activeBoardId
  return { ...collection, boards: remaining, activeBoardId }
}

export function selectBoard(collection: KanbanCollection, boardId: string): KanbanCollection {
  if (!collection.boards.some((b) => b.id === boardId)) return collection
  return { ...collection, activeBoardId: boardId }
}

export function setAutoDeleteDoneDays(collection: KanbanCollection, days: number): KanbanCollection {
  const safe = Number.isFinite(days) && days >= 0 ? Math.round(days) : 0
  return { ...collection, autoDeleteDoneDays: safe }
}

// ---- tags do quadro (paleta reutilizável) ----

export function boardTags(board: KanbanBoard): BoardTag[] {
  return board.tags ?? []
}

/** Cria uma tag na paleta do quadro (cor auto-atribuída ciclando TAG_COLORS) */
export function addBoardTag(board: KanbanBoard, name: string, color?: string): KanbanBoard {
  const trimmed = name.trim()
  if (!trimmed) return board
  const tags = board.tags ?? []
  const chosen = color ?? TAG_COLORS[tags.length % TAG_COLORS.length]
  const tag: BoardTag = { id: newId('tag'), name: trimmed, color: chosen }
  return { ...board, tags: [...tags, tag] }
}

export function updateBoardTag(board: KanbanBoard, tagId: string, patch: Partial<Pick<BoardTag, 'name' | 'color'>>): KanbanBoard {
  return {
    ...board,
    tags: (board.tags ?? []).map((tg) =>
      tg.id === tagId
        ? { ...tg, name: patch.name !== undefined ? patch.name.trim() || tg.name : tg.name, color: patch.color ?? tg.color }
        : tg
    ),
  }
}

/** Remove uma tag da paleta e de todos os cartões do quadro */
export function removeBoardTag(board: KanbanBoard, tagId: string): KanbanBoard {
  return {
    ...board,
    tags: (board.tags ?? []).filter((tg) => tg.id !== tagId),
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.map((c) =>
        c.tagIds ? { ...c, tagIds: c.tagIds.filter((id) => id !== tagId) } : c
      ),
    })),
  }
}

/** Alterna uma tag em um cartão (adiciona se ausente, remove se presente) */
export function toggleCardTag(board: KanbanBoard, cardId: string, tagId: string): KanbanBoard {
  return mapCard(board, cardId, (c) => {
    const current = c.tagIds ?? []
    const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    return { ...c, tagIds: next.length ? next : undefined }
  })
}

// ---- operações de colunas/cartões (sobre um único board) ----


export function moveCard(
  board: KanbanBoard,
  cardId: string,
  toColumnId: string,
  toIndex: number
): KanbanBoard {
  let moved: KanbanCard | null = null

  const stripped = board.columns.map((col) => {
    const idx = col.cards.findIndex((c) => c.id === cardId)
    if (idx === -1) return col
    moved = col.cards[idx]
    return { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
  })
  if (!moved) return board

  // variável local com tipo já narrowed — resolve o 'never'
  const found: KanbanCard = moved

  const targetCol = board.columns.find((c) => c.id === toColumnId)
  const enteringDone = targetCol ? isDoneColumn(targetCol.title) : false
  const movedCard: KanbanCard = {
    ...found,
    doneAt: enteringDone ? (found.doneAt ?? Date.now()) : undefined,
  }

  const columns = stripped.map((col) => {
    if (col.id !== toColumnId) return col
    const cards = [...col.cards]
    const clampedIndex = Math.max(0, Math.min(toIndex, cards.length))
    cards.splice(clampedIndex, 0, movedCard)
    return { ...col, cards }
  })

  return { ...board, columns }
}



export function addCard(board: KanbanBoard, columnId: string, text: string, notePath?: string): KanbanBoard {
  const trimmed = text.trim()
  if (!trimmed) return board
  const col = board.columns.find((c) => c.id === columnId)
  const card: KanbanCard = {
    id: newId('card'),
    text: trimmed,
    notePath,
    createdAt: Date.now(),
    doneAt: col && isDoneColumn(col.title) ? Date.now() : undefined,
  }
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, card] } : c)),
  }
}

export function updateCard(
  board: KanbanBoard,
  cardId: string,
  patch: Partial<Pick<KanbanCard, 'text' | 'notePath' | 'dueDate' | 'urgency'>>
): KanbanBoard {
  return mapCard(board, cardId, (c) => ({
    ...c,
    text: patch.text !== undefined ? patch.text.trim() : c.text,
    notePath: 'notePath' in patch ? patch.notePath || undefined : c.notePath,
    dueDate: 'dueDate' in patch ? patch.dueDate || undefined : c.dueDate,
    urgency: 'urgency' in patch ? patch.urgency : c.urgency,
  }))
}

export function removeCard(board: KanbanBoard, cardId: string): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.filter((c) => c.id !== cardId),
    })),
  }
}

export function addColumn(board: KanbanBoard, title: string): KanbanBoard {
  const trimmed = title.trim()
  if (!trimmed) return board
  return { ...board, columns: [...board.columns, { id: newId('col'), title: trimmed, cards: [] }] }
}

export function renameColumn(board: KanbanBoard, columnId: string, title: string): KanbanBoard {
  const trimmed = title.trim()
  if (!trimmed) return board
  return {
    ...board,
    columns: board.columns.map((col) => (col.id === columnId ? { ...col, title: trimmed } : col)),
  }
}

export function removeColumn(board: KanbanBoard, columnId: string): KanbanBoard {
  return { ...board, columns: board.columns.filter((col) => col.id !== columnId) }
}

function mapCard(board: KanbanBoard, cardId: string, fn: (c: KanbanCard) => KanbanCard): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.map((c) => (c.id === cardId ? fn(c) : c)),
    })),
  }
}

// ---- foco (Pomodoro) por cartão ----

/** Localiza um cartão (e o quadro dono) pelo id, em toda a coleção */
export function findCard(
  collection: KanbanCollection,
  cardId: string
): { board: KanbanBoard; card: KanbanCard } | null {
  for (const board of collection.boards) {
    for (const col of board.columns) {
      const card = col.cards.find((c) => c.id === cardId)
      if (card) return { board, card }
    }
  }
  return null
}

/** Soma minutos de foco a um cartão (em qualquer quadro), retornando nova coleção */
export function addFocusToCard(collection: KanbanCollection, cardId: string, minutes: number): KanbanCollection {
  return {
    ...collection,
    boards: collection.boards.map((b) => ({
      ...b,
      columns: b.columns.map((col) => ({
        ...col,
        cards: col.cards.map((c) =>
          c.id === cardId ? { ...c, focusMinutes: (c.focusMinutes ?? 0) + minutes } : c
        ),
      })),
    })),
  }
}

// ---- exclusão automática de cartões concluídos ----

/** Remove cartões que estão em coluna "Done" há mais de `autoDeleteDoneDays` dias.
 * Retorna a mesma coleção (por referência) se nada mudou, para o chamador evitar salvar à toa. */
export function pruneDoneCards(collection: KanbanCollection, now = Date.now()): KanbanCollection {
  const days = collection.autoDeleteDoneDays
  if (!days || days <= 0) return collection
  const cutoff = now - days * 24 * 60 * 60 * 1000

  let changed = false
  const boards = collection.boards.map((b) => ({
    ...b,
    columns: b.columns.map((col) => {
      if (!isDoneColumn(col.title)) return col
      const kept = col.cards.filter((c) => !(c.doneAt !== undefined && c.doneAt < cutoff))
      if (kept.length !== col.cards.length) changed = true
      return { ...col, cards: kept }
    }),
  }))

  return changed ? { ...collection, boards } : collection
}

// ---- sincronização de links de cartões com renomear/excluir de notas ----

export function retargetNoteLinks(
  collection: KanbanCollection,
  oldPath: string,
  newPath: string
): KanbanCollection {
  return mapAllCards(collection, (card) =>
    card.notePath === oldPath ? { ...card, notePath: newPath } : card
  )
}

export function clearNoteLinks(collection: KanbanCollection, deletedPath: string): KanbanCollection {
  return mapAllCards(collection, (card) =>
    card.notePath === deletedPath ? { ...card, notePath: undefined } : card
  )
}

export function hasNoteLink(collection: KanbanCollection, notePath: string): boolean {
  return collection.boards.some((b) =>
    b.columns.some((col) => col.cards.some((c) => c.notePath === notePath))
  )
}

function mapAllCards(
  collection: KanbanCollection,
  fn: (card: KanbanCard) => KanbanCard
): KanbanCollection {
  return {
    ...collection,
    boards: collection.boards.map((b) => ({
      ...b,
      columns: b.columns.map((col) => ({ ...col, cards: col.cards.map(fn) })),
    })),
  }
}

// ---- helpers de prazo ----

/** true se o cartão tem prazo e ele já passou (comparado ao dia de hoje) */
export function isOverdue(card: KanbanCard, todayIso: string): boolean {
  return !!card.dueDate && card.dueDate < todayIso
}
