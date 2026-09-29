import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { splitFrontmatter } from './frontmatter'

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g
// `![[nome]]` (embed estilo Obsidian) — precisa ser processado antes do WIKILINK_RE, senão o
// `[[nome]]` interno seria capturado como wikilink normal e o `!` sobraria solto no texto
const IMAGE_EMBED_RE = /!\[\[([^\]|#]+)\]\]/g
const MERMAID_BLOCK_RE = /```mermaid\n([\s\S]*?)```/g
export const MERMAID_PLACEHOLDER_CLASS = 'mermaid-block'

marked.setOptions({ breaks: true, gfm: true })

/**
 * Protege os [[wikilinks]] antes do marked processar o texto (senão os `[[` `]]`
 * podem colidir com a sintaxe de links `[texto](url)` do markdown), convertendo
 * cada ocorrência num placeholder, e substitui de volta por <a> depois.
 *
 * `resolveAttachmentUrl` transforma o nome de um anexo (`![[foto.webp]]`) na URL final
 * usada no `src` da `<img>` (ex: raw.githubusercontent.com/... quando conectado ao GitHub).
 */
export function renderMarkdown(
  content: string,
  existingNames: Set<string>,
  resolveAttachmentUrl?: (fileName: string) => string | null
): string {
  const placeholders: string[] = []

  // o frontmatter é metadado, não aparece no preview renderizado (igual Obsidian)
  const { body } = splitFrontmatter(content)

  // extrai blocos ```mermaid``` antes do marked processar, para renderizá-los depois via JS
  const withMermaidPlaceholders = body.replace(MERMAID_BLOCK_RE, (_match, code: string) => {
    const encoded = encodeURIComponent(code.trim())
    return `<div class="${MERMAID_PLACEHOLDER_CLASS}" data-mermaid-code="${encoded}"></div>\n`
  })

  const withImageEmbeds = withMermaidPlaceholders.replace(IMAGE_EMBED_RE, (_match, name: string) => {
    const trimmed = name.trim()
    const url = resolveAttachmentUrl?.(trimmed)
    let html: string
    if (url) {
      html = `<img class="note-attachment" src="${escapeHtml(url)}" alt="${escapeHtml(trimmed)}" loading="lazy" />`
    } else if (url === '') {
      html = `<span class="attachment-loading">${escapeHtml(trimmed)}</span>`
    } else {
      html = `<span class="wikilink wikilink-missing">${escapeHtml(trimmed)}</span>`
    }
    placeholders.push(html)
    return `\uE000${placeholders.length - 1}\uE000`
  })

  const withPlaceholders = withImageEmbeds.replace(WIKILINK_RE, (_match, name: string, alias?: string) => {
    const trimmed = name.trim()
    const label = alias?.trim() || trimmed
    const exists = existingNames.has(trimmed)
    const cls = exists ? 'wikilink' : 'wikilink wikilink-missing'
    const html = `<a class="${cls}" data-note-name="${trimmed}">${escapeHtml(label)}</a>`
    placeholders.push(html)
    return `\uE000${placeholders.length - 1}\uE000`
  })

  const rawHtml = marked.parse(withPlaceholders, { async: false }) as string

  const finalHtml = rawHtml.replace(/\uE000(\d+)\uE000/g, (_match, idx: string) => placeholders[Number(idx)])

  return DOMPurify.sanitize(finalHtml, {
    ADD_ATTR: ['data-note-name', 'data-mermaid-code', 'target', 'loading'],
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
