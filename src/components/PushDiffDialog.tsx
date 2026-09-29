import { useTranslation } from 'react-i18next'
import { usePushConfirmStore } from '../store/usePushConfirmStore'
import './PushDiffDialog.css'

/** Diálogo exibido antes de um push quando o arquivo remoto foi alterado desde o último
 * sync local, mostrando o diff linha a linha e deixando o usuário decidir se sobrescreve. */
export function PushDiffDialog() {
  const { t } = useTranslation()
  const pending = usePushConfirmStore((s) => s.pending)
  const resolveWith = usePushConfirmStore((s) => s.resolveWith)

  if (!pending) return null

  return (
    <div className="modal-overlay" onClick={() => resolveWith(false)}>
      <div className="modal-content push-diff-content" onClick={(e) => e.stopPropagation()}>
        <h3>{t('pushDiff.title')}</h3>
        <p className="modal-hint">{t('pushDiff.hint', { path: pending.path })}</p>

        <div className="push-diff-lines">
          {pending.lines.map((line, idx) => (
            <div key={idx} className={`push-diff-line push-diff-${line.type}`}>
              <span className="push-diff-marker">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span className="push-diff-text">{line.text || '\u00A0'}</span>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => resolveWith(false)}>
            {t('pushDiff.cancel')}
          </button>
          <button className="btn-danger" onClick={() => resolveWith(true)}>
            {t('pushDiff.overwrite')}
          </button>
        </div>
      </div>
    </div>
  )
}
