/** Parsing e serialização de frontmatter YAML simples (chave: valor), sem dependências externas.
 * Suporta os tipos usados pelo Kyanite: string, número, booleano, data (ISO) e listas
 * (`[a, b]` inline ou `- item` em múltiplas linhas). Não é um parser YAML completo. */

export interface Frontmatter {
  [key: string]: string | number | boolean | string[]
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Separa o frontmatter (se houver) do corpo da nota */
export function splitFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(FRONTMATTER_RE)
  if (!match) return { frontmatter: {}, body: content }

  const frontmatter = parseYaml(match[1])
  const body = content.slice(match[0].length)
  return { frontmatter, body }
}

/** Reconstrói o conteúdo completo da nota a partir do frontmatter + corpo */
export function joinFrontmatter(frontmatter: Frontmatter, body: string): string {
  if (Object.keys(frontmatter).length === 0) return body
  return `---\n${stringifyYaml(frontmatter)}\n---\n${body}`
}

function parseYaml(raw: string): Frontmatter {
  const result: Frontmatter = {}
  const lines = raw.split(/\r?\n/)

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!keyMatch) {
      i++
      continue
    }

    const [, key, rest] = keyMatch

    if (rest.trim() === '') {
      // possível lista em múltiplas linhas: linhas seguintes começando com "- "
      const items: string[] = []
      let j = i + 1
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(parseScalar(lines[j].replace(/^\s*-\s+/, '')) as string)
        j++
      }
      if (items.length > 0) {
        result[key] = items
        i = j
        continue
      }
      result[key] = ''
      i++
      continue
    }

    result[key] = parseScalar(rest.trim())
    i++
  }

  return result
}

function parseScalar(value: string): string | number | boolean | string[] {
  const trimmed = value.trim()

  // array inline: [a, b, c]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((v) => unquote(v.trim()))
  }

  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)

  return unquote(trimmed)
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function stringifyYaml(frontmatter: Frontmatter): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}:`)
        for (const item of value) lines.push(`  - ${stringifyScalar(item)}`)
      }
    } else {
      lines.push(`${key}: ${stringifyScalar(value)}`)
    }
  }
  return lines.join('\n')
}

function stringifyScalar(value: string | number | boolean): string {
  if (typeof value === 'string' && /[:#[\]{}]|^\s|\s$/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`
  }
  return String(value)
}

/** Data no formato usado por padrão no campo `created` (ISO 8601, sem horário) */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Garante que o conteúdo de uma nota nova tenha `created` no frontmatter */
export function withCreatedDate(content: string): string {
  const { frontmatter, body } = splitFrontmatter(content)
  if (frontmatter.created) return content
  return joinFrontmatter({ created: todayIso(), ...frontmatter }, body)
}
