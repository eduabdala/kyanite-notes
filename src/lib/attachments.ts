/** Anexos (imagens e outros arquivos de mídia) ficam numa pasta própria no repo,
 * fora da árvore de notas, e são referenciados nas notas via `![[nome-do-arquivo]]`
 * (mesma sintaxe de wikilink, só que com `!` na frente — igual ao Obsidian). */

export const ATTACHMENTS_FOLDER = '_attachments'

/** Extensões reconhecidas como imagem, para decidir como renderizar no preview */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'])

export function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

/** Gera um nome de arquivo único para o anexo, preservando o nome original para legibilidade
 * no repositório, mas evitando colisão entre uploads diferentes com o mesmo nome. */
export function buildAttachmentFileName(originalName: string, extension: string): string {
  const base = originalName.replace(/\.[a-zA-Z0-9]+$/, '').trim() || 'anexo'
  const safeBase = base.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'anexo'
  const unique = Date.now().toString(36)
  return `${safeBase}-${unique}.${extension}`
}

export function attachmentPath(fileName: string): string {
  return `${ATTACHMENTS_FOLDER}/${fileName}`
}
