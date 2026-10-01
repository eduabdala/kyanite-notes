/** Divide o corpo de uma nota markdown em blocos editáveis individualmente (parágrafo, heading,
 * lista, citação, código, tabela, linha em branco). Usado pelo modo "clique para editar": cada
 * bloco é renderizado como HTML normal e, ao ser clicado, vira um textarea com o markdown bruto
 * daquele trecho — editando e salvando só aquele pedaço, sem afetar o resto da nota. */

export type BlockKind = 'heading' | 'code' | 'list' | 'quote' | 'table' | 'blank' | 'paragraph'

export interface Block {
  kind: BlockKind
  /** markdown bruto do bloco, incluindo a quebra de linha final (exceto o último bloco do documento) */
  raw: string
}

const FENCE_RE = /^(```|~~~)/
const HEADING_RE = /^#{1,6}\s/
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s/
const QUOTE_RE = /^\s*>/
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/
const BLANK_RE = /^\s*$/

/** Divide o conteúdo em linhas preservando a informação de quebra, para poder remontar o
 * texto exatamente igual ao original ao juntar os blocos de volta. */
function splitLines(body: string): string[] {
  // mantém a quebra de linha presa à linha anterior, exceto a última (sem \n no final)
  const lines = body.split('\n')
  return lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line))
}

function lineKind(line: string): BlockKind {
  if (BLANK_RE.test(line)) return 'blank'
  if (FENCE_RE.test(line)) return 'code'
  if (HEADING_RE.test(line)) return 'heading'
  if (LIST_ITEM_RE.test(line)) return 'list'
  if (QUOTE_RE.test(line)) return 'quote'
  if (TABLE_ROW_RE.test(line)) return 'table'
  return 'paragraph'
}

/** Agrupa linhas em blocos. Regras de continuação (quando uma linha "junta" ao bloco anterior
 * em vez de iniciar um novo):
 * - code: tudo até a linha de fechamento da fence (``` ou ~~~)
 * - list: linhas consecutivas que são item de lista OU continuação indentada de um item
 * - quote: linhas consecutivas que começam com ">"
 * - table: linhas consecutivas no formato de linha de tabela
 * - paragraph: linhas consecutivas de texto comum (sem linha em branco entre elas)
 * - heading e blank: sempre um bloco de uma linha só
 */
export function splitIntoBlocks(body: string): Block[] {
  if (body === '') return []
  const lines = splitLines(body)
  const blocks: Block[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const stripped = line.endsWith('\n') ? line.slice(0, -1) : line
    const kind = lineKind(stripped)

    if (kind === 'code') {
      const fenceMatch = stripped.match(FENCE_RE)!
      const fence = fenceMatch[1]
      let j = i + 1
      let raw = line
      while (j < lines.length) {
        const current = lines[j]
        raw += current
        const currentStripped = current.endsWith('\n') ? current.slice(0, -1) : current
        j++
        if (currentStripped.trim().startsWith(fence)) break
      }
      blocks.push({ kind: 'code', raw })
      i = j
      continue
    }

    if (kind === 'heading' || kind === 'blank') {
      blocks.push({ kind, raw: line })
      i++
      continue
    }

    // list/quote/table/paragraph: consome linhas seguintes do mesmo tipo (ou continuação)
    let raw = line
    let j = i + 1
    while (j < lines.length) {
      const current = lines[j]
      const currentStripped = current.endsWith('\n') ? current.slice(0, -1) : current
      const currentKind = lineKind(currentStripped)

      const continues =
        currentKind === kind ||
        // continuação indentada de um item de lista (texto que pertence ao item anterior)
        (kind === 'list' && currentKind === 'paragraph' && /^\s{2,}\S/.test(currentStripped))

      if (!continues) break
      raw += current
      j++
    }
    blocks.push({ kind, raw })
    i = j
  }

  return blocks
}

/** Reconstrói o corpo original a partir dos blocos (concatenação simples, já que cada `raw`
 * preserva sua própria quebra de linha). */
export function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.raw).join('')
}
