import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Undo2, X } from 'lucide-react'
import { diffLines, type DiffLine } from '../lib/diff'
import { listPendingChanges, useVaultStore } from '../store/useVaultStore'
import { useIdeStore } from '../store/useIdeStore'
import { useConfirmStore } from '../store/useConfirmStore'
import '../components/ConflictDialog.css'
import './IdeViews.css'

/** linhas de contexto mantidas ao redor de cada trecho alterado */
const CONTEXT = 3
/** acima disso o LCS (O(n·m)) fica lento demais no navegador */
const MAX_DIFF_LINES = 4000

type Row = DiffLine | { type: 'gap'; count: number }

/** recolhe trechos longos sem mudança, como no diff do git */
function collapse(lines: DiffLine[]): Row[] {
  const keep = lines.map(() => false)
  lines.forEach((l, i) => {
    if (l.type === 'unchanged') return
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) keep[j] = true
  })
  const rows: Row[] = []
  let hidden = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (hidden) rows.push({ type: 'gap', count: hidden })
      hidden = 0
      rows.push(l)
    } else hidden++
  })
  if (hidden) rows.push({ type: 'gap', count: hidden })
  return rows
}

/** Diff de um arquivo alterado contra a versão do último sync, aberto pelo painel de alterações */
export function DiffView({ path }: { path: string }) {
  const { t } = useTranslation()
  const note = useVaultStore((s) => s.notes.find((n) => n.path === path))
  const change = useVaultStore((s) => listPendingChanges(s).find((c) => c.path === path))
  const getRemoteContent = useVaultStore((s) => s.getRemoteContent)
  const loadFileContent = useVaultStore((s) => s.loadFileContent)
  const discardChange = useVaultStore((s) => s.discardChange)
  const closeDiff = useIdeStore((s) => s.closeDiff)
  const confirm = useConfirmStore((s) => s.confirm)
  const [remote, setRemote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const kind = change?.kind
  const binary = note?.binary || note?.copyOf

  useEffect(() => {
    if (note?.unloaded) loadFileContent(path)
  }, [note?.unloaded, path, loadFileContent])

  useEffect(() => {
    let cancelled = false
    setRemote(null)
    setError(null)
    if (kind === 'added') {
      setRemote('')
      return
    }
    getRemoteContent(path)
      .then((text) => !cancelled && setRemote(text))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [path, kind, getRemoteContent])

  // a alteração foi descartada ou commitada: fecha o diff
  useEffect(() => {
    if (!change) closeDiff()
  }, [change, closeDiff])

  async function handleDiscard() {
    if (!(await confirm(t('ide.discardConfirm', { path })))) return
    await discardChange(path)
    closeDiff()
  }

  const local = kind === 'deleted' ? '' : (note?.content ?? '')
  const ready = remote !== null && !note?.unloaded
  const tooBig = ready && (remote!.split('\n').length > MAX_DIFF_LINES || local.split('\n').length > MAX_DIFF_LINES)

  return (
    <div className="diff-view">
      <div className="diff-view-header">
        <span className={`change-badge change-${kind}`}>{kind ? t(`ide.kinds.${kind}`) : ''}</span>
        <span className="diff-view-path" title={path}>
          {change?.from ? `${change.from} → ${path}` : path}
        </span>
        <button type="button" className="ide-icon-btn" onClick={handleDiscard} title={t('ide.discard')}>
          <Undo2 size={15} strokeWidth={1.75} />
        </button>
        <button type="button" className="ide-icon-btn" onClick={closeDiff} title={t('ide.closeDiff')}>
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      <div className="diff-view-body">
        {error ? (
          <p className="ide-muted">{error}</p>
        ) : binary ? (
          <p className="ide-muted">{t('ide.binaryDiff')}</p>
        ) : !ready ? (
          <p className="ide-muted">{t('editor.loadingFile')}</p>
        ) : tooBig ? (
          <p className="ide-muted">{t('ide.diffTooBig')}</p>
        ) : remote === local ? (
          <p className="ide-muted">{t('ide.noContentChange')}</p>
        ) : (
          <div className="conflict-diff-lines diff-view-lines">
            {collapse(diffLines(remote!, local)).map((row, idx) =>
              row.type === 'gap' ? (
                <div key={idx} className="diff-gap">
                  {t('ide.hiddenLines', { count: row.count })}
                </div>
              ) : (
                <div key={idx} className={`conflict-diff-line conflict-diff-${row.type}`}>
                  <span className="conflict-diff-marker">
                    {row.type === 'added' ? '+' : row.type === 'removed' ? '-' : ' '}
                  </span>
                  <span className="conflict-diff-text">{row.text || '\u00A0'}</span>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
