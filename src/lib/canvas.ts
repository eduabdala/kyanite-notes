/** Plugin Canvas: quadros infinitos com cartões livres (texto ou nota do vault) ligados por setas,
 * no estilo do Canvas do Obsidian. Mesma estratégia do Kanban: toda a coleção num único arquivo
 * versionado (`.kyanite/canvas.json`), para o pull custar uma chamada só. */

export const CANVAS_PATH = '.kyanite/canvas.json'

export const NODE_COLORS: string[] = ['', '#d15b5b', '#d1913c', '#d1c23c', '#68b06a', '#4ea1a1', '#5b83d1', '#8a63d1']

export type NodeType = 'text' | 'note' | 'image' | 'link'
/** formato do cartão: retângulo, pílula (bom para mapa mental) ou elipse */
export type NodeShape = 'rect' | 'pill' | 'ellipse'
export const NODE_SHAPES: NodeShape[] = ['rect', 'pill', 'ellipse']

export interface CanvasNode {
  id: string
  type: NodeType
  x: number
  y: number
  width: number
  height: number
  /** conteúdo markdown (type = text) */
  text?: string
  /** path da nota referenciada (type = note) */
  notePath?: string
  /** nome do anexo em `_attachments/` (type = image) */
  file?: string
  /** endereço http(s) (type = link) */
  url?: string
  /** cor da borda; vazio = padrão do tema */
  color?: string
  shape?: NodeShape
}

export interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  label?: string
}

/** traço do desenho livre: pontos achatados [x0, y0, x1, y1, ...] em coordenadas do mundo */
export interface CanvasStroke {
  id: string
  points: number[]
  /** vazio = cor do texto do tema */
  color: string
  width: number
}

export interface Canvas {
  id: string
  name: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  strokes: CanvasStroke[]
}

export const STROKE_WIDTHS = [2, 4, 8]

/** só aceita http(s): evita `javascript:` e afins em links clicáveis */
export function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** caminho SVG de um traço */
export function strokePath(points: number[]): string {
  if (points.length < 2) return ''
  let d = `M${points[0]} ${points[1]}`
  for (let i = 2; i < points.length; i += 2) d += ` L${points[i]} ${points[i + 1]}`
  // um clique sem arrastar vira um ponto visível
  if (points.length === 2) d += ` L${points[0] + 0.1} ${points[1]}`
  return d
}

/** distância do ponto (px, py) ao traço, para a borracha */
export function strokeDistance(s: CanvasStroke, px: number, py: number): number {
  let best = Infinity
  const p = s.points
  if (p.length === 2) return Math.hypot(px - p[0], py - p[1])
  for (let i = 0; i + 3 < p.length; i += 2) {
    const [x1, y1, x2, y2] = [p[i], p[i + 1], p[i + 2], p[i + 3]]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = dx * dx + dy * dy
    const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0
    best = Math.min(best, Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)))
  }
  return best
}

export interface CanvasCollection {
  canvases: Canvas[]
  activeCanvasId: string
}

let counter = 0
export function newId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export function newCanvas(name: string): Canvas {
  return { id: newId('canvas'), name: name.trim() || 'Canvas', nodes: [], edges: [], strokes: [] }
}

export function emptyCanvasCollection(): CanvasCollection {
  const c = newCanvas('Canvas')
  return { canvases: [c], activeCanvasId: c.id }
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

function sanitizeNode(raw: unknown): CanvasNode | null {
  const n = (raw ?? {}) as Partial<CanvasNode>
  if (typeof n.id !== 'string') return null
  const types: NodeType[] = ['text', 'note', 'image', 'link']
  return {
    id: n.id,
    type: types.includes(n.type as NodeType) ? (n.type as NodeType) : 'text',
    x: num(n.x, 0),
    y: num(n.y, 0),
    width: Math.max(40, num(n.width, 240)),
    height: Math.max(30, num(n.height, 120)),
    text: str(n.text),
    notePath: str(n.notePath),
    file: str(n.file),
    url: n.url ? (safeUrl(n.url) ?? undefined) : undefined,
    color: str(n.color),
    shape: NODE_SHAPES.includes(n.shape as NodeShape) ? n.shape : undefined,
  }
}

function sanitizeStroke(raw: unknown): CanvasStroke | null {
  const s = (raw ?? {}) as Partial<CanvasStroke>
  if (typeof s.id !== 'string' || !Array.isArray(s.points)) return null
  const points = s.points.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (points.length < 2) return null
  return { id: s.id, points: points.slice(0, points.length - (points.length % 2)), color: str(s.color) ?? '', width: num(s.width, 2) }
}

export function parseCanvasCollection(raw: string): CanvasCollection {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.canvases) || parsed.canvases.length === 0) return emptyCanvasCollection()
    const canvases: Canvas[] = parsed.canvases.map((c: Partial<Canvas>) => {
      const nodes = Array.isArray(c.nodes) ? c.nodes.map(sanitizeNode).filter((n): n is CanvasNode => !!n) : []
      const ids = new Set(nodes.map((n) => n.id))
      const edges = Array.isArray(c.edges)
        ? c.edges
            .filter(
              (e): e is CanvasEdge =>
                !!e && typeof e.id === 'string' && ids.has(e.fromNode) && ids.has(e.toNode)
            )
            .map((e) => ({ id: e.id, fromNode: e.fromNode, toNode: e.toNode, label: str(e.label) || undefined }))
        : []
      const strokes = Array.isArray(c.strokes)
        ? c.strokes.map(sanitizeStroke).filter((s): s is CanvasStroke => !!s)
        : []
      return { id: str(c.id) ?? newId('canvas'), name: str(c.name) ?? 'Canvas', nodes, edges, strokes }
    })
    const activeCanvasId = canvases.some((c) => c.id === parsed.activeCanvasId)
      ? parsed.activeCanvasId
      : canvases[0].id
    return { canvases, activeCanvasId }
  } catch {
    return emptyCanvasCollection()
  }
}

export function serializeCanvasCollection(collection: CanvasCollection): string {
  return JSON.stringify(collection, null, 2) + '\n'
}

export function getActiveCanvas(collection: CanvasCollection): Canvas {
  return collection.canvases.find((c) => c.id === collection.activeCanvasId) ?? collection.canvases[0]
}

/** substitui o canvas de mesmo id na coleção */
export function putCanvas(collection: CanvasCollection, canvas: Canvas): CanvasCollection {
  return { ...collection, canvases: collection.canvases.map((c) => (c.id === canvas.id ? canvas : c)) }
}

export function addCanvas(collection: CanvasCollection, name: string): CanvasCollection {
  const c = newCanvas(name)
  return { canvases: [...collection.canvases, c], activeCanvasId: c.id }
}

export function removeCanvas(collection: CanvasCollection, id: string): CanvasCollection {
  const rest = collection.canvases.filter((c) => c.id !== id)
  if (rest.length === 0) return emptyCanvasCollection()
  return { canvases: rest, activeCanvasId: collection.activeCanvasId === id ? rest[0].id : collection.activeCanvasId }
}

/** remove nós (e as setas ligadas a eles) */
export function removeNodes(canvas: Canvas, ids: Set<string>): Canvas {
  return {
    ...canvas,
    nodes: canvas.nodes.filter((n) => !ids.has(n.id)),
    edges: canvas.edges.filter((e) => !ids.has(e.fromNode) && !ids.has(e.toNode)),
  }
}

export function addEdge(canvas: Canvas, fromNode: string, toNode: string): Canvas {
  if (fromNode === toNode) return canvas
  const exists = canvas.edges.some((e) => e.fromNode === fromNode && e.toNode === toNode)
  if (exists) return canvas
  return { ...canvas, edges: [...canvas.edges, { id: newId('edge'), fromNode, toNode }] }
}

/** mantém os cartões de nota apontando para o path certo após renomear/mover notas */
export function retargetCanvasNotes(collection: CanvasCollection, from: string, to: string): CanvasCollection {
  let changed = false
  const canvases = collection.canvases.map((c) => ({
    ...c,
    nodes: c.nodes.map((n) => {
      if (n.notePath !== from) return n
      changed = true
      return { ...n, notePath: to }
    }),
  }))
  return changed ? { ...collection, canvases } : collection
}

/** ponto na borda do retângulo `n` na direção do ponto (tx, ty), para a seta não entrar no cartão */
export function borderPoint(n: CanvasNode, tx: number, ty: number): { x: number; y: number } {
  const cx = n.x + n.width / 2
  const cy = n.y + n.height / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const rx = n.width / 2
  const ry = n.height / 2
  // elipse: interseção exata; retângulo/pílula: borda da caixa (diferença imperceptível na pílula)
  const scale =
    n.shape === 'ellipse'
      ? 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
      : 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

/** caixa que envolve todos os nós e traços (para enquadrar a tela e exportar) */
export function canvasBounds(canvas: Canvas, pad = 40) {
  const xs: number[] = []
  const ys: number[] = []
  for (const n of canvas.nodes) {
    xs.push(n.x, n.x + n.width)
    ys.push(n.y, n.y + n.height)
  }
  for (const s of canvas.strokes) {
    for (let i = 0; i < s.points.length; i += 2) {
      xs.push(s.points[i])
      ys.push(s.points[i + 1])
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, width: 800, height: 600 }
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  return { x: minX, y: minY, width: Math.max(...xs) + pad - minX, height: Math.max(...ys) + pad - minY }
}

const CHILD_GAP_X = 80
const CHILD_GAP_Y = 24

/** Mapa mental: cria um filho à direita do nó, abaixo dos filhos que ele já tem, ligado por seta */
export function addChildNode(canvas: Canvas, parentId: string): { canvas: Canvas; node: CanvasNode } | null {
  const parent = canvas.nodes.find((n) => n.id === parentId)
  if (!parent) return null
  const childIds = new Set(canvas.edges.filter((e) => e.fromNode === parentId).map((e) => e.toNode))
  const children = canvas.nodes.filter((n) => childIds.has(n.id))
  const width = 200
  const height = 60
  const x = children.length ? Math.min(...children.map((c) => c.x)) : parent.x + parent.width + CHILD_GAP_X
  const y = children.length
    ? Math.max(...children.map((c) => c.y + c.height)) + CHILD_GAP_Y
    : parent.y + parent.height / 2 - height / 2
  const node: CanvasNode = {
    id: newId('node'),
    type: 'text',
    text: '',
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
    shape: 'pill',
    color: parent.color,
  }
  const next = addEdge({ ...canvas, nodes: [...canvas.nodes, node] }, parentId, node.id)
  return { canvas: next, node }
}

/** Mapa mental: cria um irmão (mesmo pai) logo abaixo; sem pai, vira um filho do próprio nó */
export function addSiblingNode(canvas: Canvas, nodeId: string): { canvas: Canvas; node: CanvasNode } | null {
  const parentEdge = canvas.edges.find((e) => e.toNode === nodeId)
  return addChildNode(canvas, parentEdge ? parentEdge.fromNode : nodeId)
}
