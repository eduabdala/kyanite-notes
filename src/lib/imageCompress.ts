/** Compressão de imagens no browser (Canvas API), sem dependências externas.
 * Redimensiona para um limite razoável de exibição em nota e reencoda como WebP,
 * o que tipicamente reduz 60-90% do tamanho de fotos vindas de celular/câmera. */

const MAX_DIMENSION = 1920
const WEBP_QUALITY = 0.8

/** Tipos que já são leves ou não se beneficiam de reencode (svg é vetor, gif pode ser animado) */
const SKIP_COMPRESSION_TYPES = new Set(['image/svg+xml', 'image/gif'])

export interface CompressedImage {
  blob: Blob
  /** extensão final do arquivo (pode mudar de .png/.jpg para .webp) */
  extension: string
}

/** Comprime um arquivo de imagem via Canvas, redimensionando para no máximo `MAX_DIMENSION`
 * no lado maior e reencodando como WebP. Retorna o arquivo original se não for imagem,
 * se for um tipo que pulamos (svg/gif) ou se a compressão falhar. */
export async function compressImage(file: File): Promise<CompressedImage> {
  const fallback: CompressedImage = { blob: file, extension: extensionOf(file.name) }

  if (!file.type.startsWith('image/') || SKIP_COMPRESSION_TYPES.has(file.type)) {
    return fallback
  }

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = fitDimensions(bitmap.width, bitmap.height, MAX_DIMENSION)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return fallback

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    )

    // se o navegador não suportar toBlob('image/webp', ...) o blob pode vir null ou vazio
    if (!blob || blob.size === 0) return fallback

    // só usa a versão comprimida se ela for de fato menor
    if (blob.size >= file.size) return fallback

    return { blob, extension: 'webp' }
  } catch {
    return fallback
  }
}

function fitDimensions(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height }
  const scale = width > height ? max / width : max / height
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function extensionOf(fileName: string): string {
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : 'bin'
}
