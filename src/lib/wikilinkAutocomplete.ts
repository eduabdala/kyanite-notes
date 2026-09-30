import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'

/** Insere o nome escolhido e garante exatamente um "]]" depois dele: o closeBrackets()
 * do editor já fecha "[[" automaticamente com "]]" ao digitar, então o "]]" logo após o
 * cursor (se houver) é reaproveitado em vez de duplicado. */
function applyWikilink(view: EditorView, _completion: unknown, from: number, to: number, name: string) {
  const doc = view.state.doc
  const afterTo = doc.sliceString(to, to + 2)
  const consumedClosing = afterTo === ']]'

  view.dispatch({
    changes: {
      from,
      to: consumedClosing ? to + 2 : to,
      insert: `${name}]]`,
    },
    selection: { anchor: from + name.length + 2 },
  })
}

/**
 * Extensão de autocomplete que dispara ao digitar `[[`, sugerindo nomes de notas existentes.
 * `getNoteNames` é uma função (não uma lista fixa) para sempre refletir o vault atual.
 */
export function wikilinkAutocomplete(getNoteNames: () => string[]) {
  function completeWikilink(context: CompletionContext): CompletionResult | null {
    // casa com "[[" seguido de qualquer texto (sem "]]" ainda) até o cursor
    const match = context.matchBefore(/\[\[([^\]]*)$/)
    if (!match) return null

    const query = match.text.slice(2) // remove o "[[" do início
    const from = match.from + 2

    // remove duplicatas: notas em pastas diferentes podem ter o mesmo nome
    const names = Array.from(new Set(getNoteNames()))
    const options = names
      .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
      .map((name) => ({
        label: name,
        type: 'text',
        apply: (view: EditorView, completion: unknown, applyFrom: number, applyTo: number) =>
          applyWikilink(view, completion, applyFrom, applyTo, name),
      }))

    if (options.length === 0 && query.length > 0) {
      options.push({
        label: `Criar nota "${query}"`,
        type: 'text',
        apply: (view: EditorView, completion: unknown, applyFrom: number, applyTo: number) =>
          applyWikilink(view, completion, applyFrom, applyTo, query),
      })
    }

    return {
      from,
      to: match.to,
      options,
      filter: false,
    }
  }

  return autocompletion({ override: [completeWikilink] })
}
