import { useTranslation } from 'react-i18next'
import { useConflictStore } from '../store/useConflictStore'
import './ConflictDialog.css'

/** Diálogo de resolução de conflito local vs remoto, mostrando o diff linha a linha.
 * Usado em dois momentos:
 * - push: o remoto mudou desde o último sync local -> perguntar se sobrescreve
 * - pull: a nota está dirty localmente E o remoto também mudou -> perguntar qual versão manter
 */
export function ConflictDialog() {
  const { t } = useTranslation()
  const pending = useConflictStore((s) => s.pending)
  const resolvePushWith = useConflictStore((s) => s.resolvePushWith)
  const resolvePullWith = useConflictStore((s) => s.resolvePullWith)

  if (!pending) return null

  const isPull = pending.direction === 'pull'

  return (
    <div className="modal-overlay" onClick={() => (isPull ? resolvePullWith('keep-local') : resolvePushWith(false))}>
      <div className="modal-content conflict-dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3>{isPull ? t('conflict.pullTitle') : t('conflict.pushTitle')}</h3>
        <p className="modal-hint">
          {isPull ? t('conflict.pullHint', { path: pending.path }) : t('conflict.pushHint', { path: pending.path })}
        </p>

        <div className="conflict-diff-lines">
          {pending.lines.map((line, idx) => (
            <div key={idx} className={`conflict-diff-line conflict-diff-${line.type}`}>
              <span className="conflict-diff-marker">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span className="conflict-diff-text">{line.text || '\u00A0'}</span>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          {isPull ? (
            <>
              <button className="btn-secondary" onClick={() => resolvePullWith('keep-local')}>
                {t('conflict.keepLocal')}
              </button>
              <button className="btn-danger" onClick={() => resolvePullWith('use-remote')}>
                {t('conflict.useRemote')}
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => resolvePushWith(false)}>
                {t('conflict.cancel')}
              </button>
              <button className="btn-danger" onClick={() => resolvePushWith(true)}>
                {t('conflict.overwriteRemote')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
