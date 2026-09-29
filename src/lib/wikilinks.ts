import type { LinkGraph, Note } from './types'

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g

/** Extrai os nomes de nota referenciados em um texto via [[wikilinks]] */
export function extractLinks(content: string): string[] {
  const links: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(WIKILINK_RE)
  while ((match = re.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

/** Constrói o grafo de links (outgoing) e backlinks (incoming) a partir de todas as notas */
export function buildLinkGraph(notes: Note[]): LinkGraph {
  const byName = new Map<string, string>() // nome da nota -> path
  for (const note of notes) byName.set(note.name, note.path)

  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()

  for (const note of notes) {
    const linkedNames = extractLinks(note.content)
    const targets = new Set<string>()

    for (const name of linkedNames) {
      const targetPath = byName.get(name)
      if (!targetPath || targetPath === note.path) continue
      targets.add(targetPath)

      if (!incoming.has(targetPath)) incoming.set(targetPath, new Set())
      incoming.get(targetPath)!.add(note.path)
    }

    outgoing.set(note.path, targets)
  }

  return { outgoing, incoming }
}

/** Renderiza wikilinks como HTML clicável (usado no preview) */
export function renderWikilinksAsHtml(content: string, existingNames: Set<string>): string {
  return content.replace(WIKILINK_RE, (_match, name: string) => {
    const trimmed = name.trim()
    const exists = existingNames.has(trimmed)
    const cls = exists ? 'wikilink' : 'wikilink wikilink-missing'
    return `<a class="${cls}" data-note-name="${trimmed}">${trimmed}</a>`
  })
}
