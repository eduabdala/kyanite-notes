import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'

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

    const names = getNoteNames()
    const options = names
      .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
      .map((name) => ({
        label: name,
        type: 'text',
        apply: `${name}]]`,
      }))

    if (options.length === 0 && query.length > 0) {
      options.push({
        label: `Criar nota "${query}"`,
        type: 'text',
        apply: `${query}]]`,
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
