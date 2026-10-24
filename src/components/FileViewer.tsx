import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileQuestion } from 'lucide-react'
import { isImageFile } from '../lib/attachments'
import { fileNameOf } from '../lib/vault'
import { useVaultStore } from '../store/useVaultStore'
import './IdeViews.css'

/** Arquivos que não abrem no editor (binários ou grandes demais): imagens são exibidas,
 * os demais mostram nome e tamanho. */
export function FileViewer({ path }: { path: string }) {
  const { t } = useTranslation()
  const getFileDataUrl = useVaultStore((s) => s.getFileDataUrl)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const image = isImageFile(path)

  useEffect(() => {
    if (!image) return
    let cancelled = false
    setDataUrl(null)
    setError(false)
    getFileDataUrl(path).then((url) => {
      if (cancelled) return
      if (url) setDataUrl(url)
      else setError(true)
    })
    return () => {
      cancelled = true
    }
  }, [path, image, getFileDataUrl])

  return (
    <div className="file-viewer">
      {image && dataUrl ? (
        <img src={dataUrl} alt={fileNameOf(path)} className="file-viewer-image" />
      ) : image && !error ? (
        <p className="ide-muted">{t('editor.loadingFile')}</p>
      ) : (
        <div className="file-viewer-binary">
          <FileQuestion size={40} strokeWidth={1.25} aria-hidden="true" />
          <p>{fileNameOf(path)}</p>
          <p className="ide-muted">{t('ide.binaryFile')}</p>
        </div>
      )}
    </div>
  )
}
