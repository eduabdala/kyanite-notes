import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'

/**
 * Live preview estilo Obsidian: aplica estilo rico (negrito, itálico, headings, código,
 * wikilinks) diretamente no CodeMirror e esconde os marcadores de sintaxe markdown
 * (`**`, `#`, `[[`/`]]`, etc) nas linhas onde o cursor não está. Ao mover o cursor para
 * dentro de uma linha formatada, a sintaxe reaparece para permitir edição normal.
 *
 * Implementado com base na árvore de sintaxe do Lezer que o `@codemirror/lang-markdown`
 * já expõe via `syntaxTree`, em vez de regex sobre o texto — isso evita decorar marcadores
 * dentro de blocos de código, por exemplo.
 */

/** Nomes de nó do Lezer cujo texto completo deve virar <strong>/<em>/etc, e os marcadores
 * de abertura/fechamento (os primeiros/últimos filhos) devem ser escondidos fora do cursor. */
// nota: a config `markdown()` do projeto usa o parser base (CommonMark), sem a extensão GFM,
// então strikethrough (~~texto~~) não gera um nó próprio na árvore de sintaxe aqui
const WRAPPED_MARKS: Record<string, string> = {
  StrongEmphasis: 'cm-live-strong',
  Emphasis: 'cm-live-em',
  InlineCode: 'cm-live-code',
}

const HEADING_MARK_RE = /^(ATXHeading)([1-6])$/

class HiddenWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.style.display = 'none'
    return span
  }
  eq() {
    return true
  }
}
const hiddenWidget = new HiddenWidget()
const hide = Decoration.replace({ widget: hiddenWidget })

/** true se a seleção/cursor atual tem alguma extremidade dentro de [from, to] (a linha do nó) */
function cursorInRange(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const tree = syntaxTree(view.state)

  for (const { from: viewFrom, to: viewTo } of view.visibleRanges) {
    tree.iterate({
      from: viewFrom,
      to: viewTo,
      enter(node) {
        // --- wikilinks [[nome]] e embeds ![[nome]] ---
        // o lezer-markdown padrão não conhece wikilinks; eles aparecem como texto normal.
        // tratamos via regex, mas escopados ao texto do nó de parágrafo/inline (evita casar
        // dentro de blocos de código, já filtrados pelos nós FencedCode/CodeBlock do lezer).
        if (node.name === 'Paragraph' || node.name === 'Document') return true
        if (node.type.isError) return true

        const headingMatch = node.name.match(HEADING_MARK_RE)
        if (headingMatch) {
          const line = view.state.doc.lineAt(node.from)
          const active = cursorInRange(view, line.from, line.to)
          decorations.push(
            Decoration.mark({ class: `cm-live-heading cm-live-heading-${headingMatch[2]}` }).range(
              node.from,
              node.to
            )
          )
          // o filho HeaderMark é só o "#"*n; soma o espaço em branco logo depois dele
          const headerMark = node.node.firstChild
          if (!active && headerMark && headerMark.name === 'HeaderMark') {
            let markTo = headerMark.to
            while (markTo < node.to && /\s/.test(view.state.doc.sliceString(markTo, markTo + 1))) {
              markTo++
            }
            decorations.push(hide.range(headerMark.from, markTo))
          }
          return true
        }

        const cls = WRAPPED_MARKS[node.name]
        if (cls) {
          const active = cursorInRange(view, node.from, node.to)
          decorations.push(Decoration.mark({ class: cls }).range(node.from, node.to))

          // os marcadores (**, *, ~~, `) são sempre os filhos de borda do nó
          const first = node.node.firstChild
          const last = node.node.lastChild
          if (!active && first && last && first !== last) {
            decorations.push(hide.range(first.from, first.to))
            decorations.push(hide.range(last.from, last.to))
          }
          return true
        }

        return true
      },
    })

    // wikilinks: [[nome]], [[nome|alias]], ![[anexo]] — regex escopada à viewport
    const text = view.state.doc.sliceString(viewFrom, viewTo)
    const WIKILINK_RE = /(!)?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g
    let match: RegExpExecArray | null
    while ((match = WIKILINK_RE.exec(text)) !== null) {
      const from = viewFrom + match.index
      const to = from + match[0].length
      const line = view.state.doc.lineAt(from)
      const active = cursorInRange(view, line.from, line.to)
      const isEmbed = Boolean(match[1])
      const openLen = isEmbed ? 3 : 2 // "![[" ou "[["
      const hasAlias = match[3] !== undefined
      // o label visível é o alias se houver, senão o nome (sem o "#heading" opcional, que
      // deve ficar sempre escondido já que não faz parte do texto exibido no Obsidian)
      const label = hasAlias ? match[3]! : match[2]
      const labelStart = hasAlias ? from + match[0].lastIndexOf('|') + 1 : from + openLen
      const labelEnd = labelStart + label.length

      decorations.push(
        Decoration.mark({
          class: isEmbed ? 'cm-live-embed' : 'cm-live-wikilink',
          attributes: { 'data-wikilink-name': match[2].trim() },
        }).range(from, to)
      )

      if (!active) {
        // esconde "[[" (ou "![[") + o que vier antes do label (nome, quando há alias, e/ou
        // "#heading"); esconde o que vier depois do label (resto do "#heading" sem alias) e "]]"
        decorations.push(hide.range(from, labelStart))
        if (labelEnd < to - 2) decorations.push(hide.range(labelEnd, to - 2))
        decorations.push(hide.range(to - 2, to))
      }
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(decorations, true)
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

export const livePreviewTheme = EditorView.baseTheme({
  '.cm-live-heading': { fontWeight: '700', color: 'var(--text-primary)' },
  '.cm-live-heading-1': { fontSize: '1.6em' },
  '.cm-live-heading-2': { fontSize: '1.4em' },
  '.cm-live-heading-3': { fontSize: '1.2em' },
  '.cm-live-heading-4': { fontSize: '1.1em' },
  '.cm-live-heading-5': { fontSize: '1.05em' },
  '.cm-live-heading-6': { fontSize: '1em' },
  '.cm-live-strong': { fontWeight: '700' },
  '.cm-live-em': { fontStyle: 'italic' },
  '.cm-live-code': {
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg-hover)',
    borderRadius: '4px',
    padding: '0 3px',
  },
  '.cm-live-wikilink': { color: 'var(--accent)', cursor: 'pointer' },
  '.cm-live-embed': { color: 'var(--accent)', opacity: '0.85', cursor: 'pointer' },
})

/** Extensão completa de live preview: decorações + tema. Export único para simplificar o uso no Editor. */
export function livePreview() {
  return [livePreviewPlugin, livePreviewTheme]
}
