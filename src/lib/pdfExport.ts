/** Exportação para PDF via diálogo de impressão do sistema ("Salvar como PDF").
 * Sem dependências: o conteúdo é montado num iframe oculto com CSS próprio de impressão, então o
 * texto sai vetorial/selecionável (diferente de soluções que rasterizam o DOM com canvas). */

import { renderMarkdown, MERMAID_PLACEHOLDER_CLASS } from './markdown'
import { borderPoint, canvasBounds, safeUrl, strokePath, type Canvas } from './canvas'
import type { KanbanBoard } from './kanban'
import type { Note } from './types'

const FRAME_ID = 'kyanite-print-frame'

const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #1b2635; }
  body { font: 14px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.5em; break-after: avoid; }
  h1.doc-title { margin-top: 0; font-size: 1.8em; }
  p, ul, ol, blockquote, pre, table { margin: 0 0 0.8em; }
  a { color: #2a5fd8; text-decoration: none; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; background: #f0f4fa; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f0f4fa; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d3ddeb; padding-left: 12px; color: #5c6b80; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #d3ddeb; padding: 4px 8px; text-align: left; }
  img, svg { max-width: 100%; break-inside: avoid; }
  .mermaid-block { text-align: center; break-inside: avoid; }
  .wikilink-missing { color: #c8531f; }
  .attachment-loading { color: #5c6b80; font-style: italic; }
`

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** renderiza os placeholders de mermaid como SVG (tema claro, que é o que faz sentido no papel) */
async function renderMermaid(html: string): Promise<string> {
  if (!html.includes(MERMAID_PLACEHOLDER_CLASS)) return html
  const root = document.createElement('div')
  root.innerHTML = html
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(`.${MERMAID_PLACEHOLDER_CLASS}`))
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' })
  for (const [i, block] of blocks.entries()) {
    const code = block.dataset.mermaidCode ? decodeURIComponent(block.dataset.mermaidCode) : ''
    if (!code) continue
    try {
      block.innerHTML = (await mermaid.render(`pdf-mermaid-${Date.now()}-${i}`, code)).svg
    } catch {
      block.textContent = code
    }
  }
  return root.innerHTML
}

/** abre o diálogo de impressão com o documento dado; o título vira o nome sugerido do arquivo */
async function printDocument(title: string, bodyHtml: string, extraCss = '', landscape = false) {
  document.getElementById(FRAME_ID)?.remove()
  const frame = document.createElement('iframe')
  frame.id = FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)

  const doc = frame.contentDocument!
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 14mm; }${BASE_CSS}${extraCss}</style>
    </head><body>${bodyHtml.replace(/ loading="lazy"/g, '')}</body></html>`)
  doc.close()

  // espera as imagens (anexos em data URL) decodificarem antes de imprimir
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? null
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true })
            img.addEventListener('error', resolve, { once: true })
          })
    )
  )

  const win = frame.contentWindow!
  // Firefox não bloqueia em print(): o iframe só pode sair depois que o diálogo fechar
  win.addEventListener('afterprint', () => frame.remove(), { once: true })
  win.focus()
  win.print()
}

type AttachmentResolver = (fileName: string) => string | null

export async function exportNotePdf(
  note: Note,
  existingNames: Set<string>,
  resolveAttachment: AttachmentResolver
) {
  const html = await renderMermaid(renderMarkdown(note.content, existingNames, resolveAttachment))
  await printDocument(note.name, `<h1 class="doc-title">${escapeHtml(note.name)}</h1>${html}`)
}

/** largura útil aproximada de uma A4 paisagem com as margens acima, em px CSS */
const LANDSCAPE_WIDTH_PX = 1040

export async function exportCanvasPdf(
  canvas: Canvas,
  notes: Note[],
  existingNames: Set<string>,
  resolveAttachment: AttachmentResolver
) {
  const b = canvasBounds(canvas)
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  const center = (id: string) => {
    const n = byId.get(id)!
    return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
  }

  const edges = canvas.edges
    .map((e) => {
      const a = byId.get(e.fromNode)
      const z = byId.get(e.toNode)
      if (!a || !z) return ''
      const p1 = borderPoint(a, center(z.id).x, center(z.id).y)
      const p2 = borderPoint(z, center(a.id).x, center(a.id).y)
      return `<line x1="${p1.x - b.x}" y1="${p1.y - b.y}" x2="${p2.x - b.x}" y2="${p2.y - b.y}" marker-end="url(#arrow)" />`
    })
    .join('')

  const labels = canvas.edges
    .map((e) => {
      const a = byId.get(e.fromNode)
      const z = byId.get(e.toNode)
      if (!a || !z || !e.label) return ''
      const p1 = borderPoint(a, center(z.id).x, center(z.id).y)
      const p2 = borderPoint(z, center(a.id).x, center(a.id).y)
      return `<text class="edge-label" x="${(p1.x + p2.x) / 2 - b.x}" y="${(p1.y + p2.y) / 2 - b.y}">${escapeHtml(e.label)}</text>`
    })
    .join('')

  const strokes = canvas.strokes
    .map((s) => {
      const pts = s.points.map((v, i) => (i % 2 === 0 ? v - b.x : v - b.y))
      const color = s.color ? escapeHtml(s.color) : '#1b2635'
      return `<path d="${strokePath(pts)}" stroke="${color}" stroke-width="${s.width}" />`
    })
    .join('')

  const radius = { rect: '8px', pill: '999px', ellipse: '50%' }

  const nodes = await Promise.all(
    canvas.nodes.map(async (n) => {
      let header = ''
      let content: string
      if (n.type === 'image') {
        const url = n.file ? resolveAttachment(n.file) : null
        content = url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(n.file ?? '')}" />` : escapeHtml(n.file ?? '')
      } else if (n.type === 'link') {
        const url = n.url ? safeUrl(n.url) : null
        content = url ? `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` : ''
      } else {
        const note = n.type === 'note' ? notes.find((x) => x.path === n.notePath) : undefined
        const md = n.type === 'note' ? (note?.content ?? '') : (n.text ?? '')
        content = await renderMermaid(renderMarkdown(md, existingNames, resolveAttachment))
        if (n.type === 'note') header = `<div class="node-title">${escapeHtml(note?.name ?? n.notePath ?? '')}</div>`
      }
      const style = `left:${n.x - b.x}px;top:${n.y - b.y}px;width:${n.width}px;height:${n.height}px;border-radius:${
        radius[n.shape ?? 'rect']
      };${n.color ? `border-color:${escapeHtml(n.color)};` : ''}`
      const cls = `node type-${n.type} ${n.shape && n.shape !== 'rect' ? 'centered' : ''}`
      return `<div class="${cls}" style="${style}">${header}<div class="node-body">${content}</div></div>`
    })
  )

  const zoom = Math.min(1, LANDSCAPE_WIDTH_PX / b.width)
  const body = `<h1 class="doc-title">${escapeHtml(canvas.name)}</h1>
    <div class="board" style="width:${b.width}px;height:${b.height}px;zoom:${zoom}">
      <svg class="edges" width="${b.width}" height="${b.height}">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#7e8b9c" /></marker></defs>${edges}${labels}
      </svg>${nodes.join('')}
      <svg class="edges strokes" width="${b.width}" height="${b.height}">${strokes}</svg>
    </div>`

  const css = `
    .board { position: relative; }
    .edges { position: absolute; inset: 0; }
    .edges line { stroke: #7e8b9c; stroke-width: 2; }
    .node { position: absolute; border: 2px solid #d3ddeb; border-radius: 8px; background: #fff; overflow: hidden; padding: 8px 12px; font-size: 13px; }
    .node-title { font-weight: 600; border-bottom: 1px solid #d3ddeb; margin: -2px 0 6px; padding-bottom: 4px; }
    .node-body > :first-child { margin-top: 0; }
    .node.centered { display: flex; align-items: center; justify-content: center; text-align: center; }
    .node.centered .node-body > * { margin: 0; }
    .node.type-image { padding: 0; border: none; background: transparent; }
    .node.type-image .node-body, .node.type-image img { width: 100%; height: 100%; object-fit: contain; }
    .node.type-link a { word-break: break-all; }
    .edge-label { font-size: 12px; text-anchor: middle; dominant-baseline: central; fill: #1b2635;
      paint-order: stroke; stroke: #fff; stroke-width: 5px; stroke-linejoin: round; }
    .strokes path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  `
  await printDocument(canvas.name, body, css, true)
}

export async function exportKanbanPdf(board: KanbanBoard) {
  const cols = board.columns
    .map(
      (col) => `<section class="col"><h2>${escapeHtml(col.title)} <small>(${col.cards.length})</small></h2>${col.cards
        .map(
          (c) => `<div class="card">${escapeHtml(c.text)}${
            c.dueDate ? `<div class="meta">${escapeHtml(c.dueDate)}</div>` : ''
          }</div>`
        )
        .join('')}</section>`
    )
    .join('')
  const css = `
    .cols { display: flex; gap: 12px; align-items: flex-start; }
    .col { flex: 1; min-width: 0; background: #f0f4fa; border-radius: 8px; padding: 8px; }
    .col h2 { font-size: 1em; margin: 0 0 8px; }
    .col small { color: #5c6b80; font-weight: normal; }
    .card { background: #fff; border: 1px solid #d3ddeb; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; white-space: pre-wrap; break-inside: avoid; }
    .meta { color: #5c6b80; font-size: 0.85em; margin-top: 2px; }
  `
  await printDocument(board.name, `<h1 class="doc-title">${escapeHtml(board.name)}</h1><div class="cols">${cols}</div>`, css, true)
}
