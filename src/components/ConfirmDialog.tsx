import { useTranslation } from 'react-i18next'
import { useConfirmStore } from '../store/useConfirmStore'
import './GitHubConnectModal.css'

/** Substitui window.confirm por um modal com a mesma identidade visual do app.
 * Montado uma vez perto da raiz; qualquer lugar do app pode disparar via useConfirmStore().confirm(msg) */
export function ConfirmDialog() {
  const { t } = useTranslation()
  const message = useConfirmStore((s) => s.message)
  const resolveWith = useConfirmStore((s) => s.resolveWith)

  if (!message) return null

  return (
    <div className="modal-overlay" onClick={() => resolveWith(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <p className="modal-hint" style={{ marginBottom: 0 }}>
          {message}
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => resolveWith(false)}>
            {t('confirm.cancel')}
          </button>
          <button className="btn-danger" onClick={() => resolveWith(true)}>
            {t('confirm.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
