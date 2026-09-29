import { marked } from 'marked'
import DOMPurify from 'dompurify'

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g

marked.setOptions({ breaks: true, gfm: true })

/**
 * Protege os [[wikilinks]] antes do marked processar o texto (senão os `[[` `]]`
 * podem colidir com a sintaxe de links `[texto](url)` do markdown), convertendo
 * cada ocorrência num placeholder, e substitui de volta por <a> depois.
 */
export function renderMarkdown(content: string, existingNames: Set<string>): string {
  const placeholders: string[] = []

  const withPlaceholders = content.replace(WIKILINK_RE, (_match, name: string, alias?: string) => {
    const trimmed = name.trim()
    const label = alias?.trim() || trimmed
    const exists = existingNames.has(trimmed)
    const cls = exists ? 'wikilink' : 'wikilink wikilink-missing'
    const html = `<a class="${cls}" data-note-name="${trimmed}">${escapeHtml(label)}</a>`
    placeholders.push(html)
    return `\u0000${placeholders.length - 1}\u0000`
  })

  const rawHtml = marked.parse(withPlaceholders, { async: false }) as string

  const finalHtml = rawHtml.replace(/\u0000(\d+)\u0000/g, (_match, idx: string) => placeholders[Number(idx)])

  return DOMPurify.sanitize(finalHtml, { ADD_ATTR: ['data-note-name', 'target'] })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
