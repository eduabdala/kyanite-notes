import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useVaultStore } from '../store/useVaultStore'
import './GitHubConnectModal.css'

interface Props {
  onClose: () => void
}

export function GitHubConnectModal({ onClose }: Props) {
  const { t } = useTranslation()
  const connectGitHub = useVaultStore((s) => s.connectGitHub)
  const pullFromGitHub = useVaultStore((s) => s.pullFromGitHub)
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function buildErrorMessage(rawError?: string): string {
    if (!rawError) return t('githubModal.errors.generic')
    const lower = rawError.toLowerCase()
    if (lower.includes('not found')) return t('githubModal.errors.notFound')
    if (lower.includes('bad credentials')) return t('githubModal.errors.badCredentials')
    return rawError
  }

  async function handleConnect() {
    if (!owner.trim() || !repo.trim() || !token.trim()) {
      setError(t('githubModal.errors.missingFields'))
      return
    }
    setLoading(true)
    setError(null)
    const result = await connectGitHub({
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
      token: token.trim(),
    })
    setLoading(false)

    if (!result.ok) {
      setError(buildErrorMessage(result.error))
      return
    }

    await pullFromGitHub()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{t('githubModal.title')}</h3>
        <p className="modal-hint">
          <Trans
            i18nKey="githubModal.hint"
            components={{
              tokenLink: (
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noreferrer"
                />
              ),
            }}
          />
        </p>

        <label>{t('githubModal.ownerLabel')}</label>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder={t('githubModal.ownerPlaceholder')}
        />

        <label>{t('githubModal.repoLabel')}</label>
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder={t('githubModal.repoPlaceholder')}
        />

        <label>{t('githubModal.branchLabel')}</label>
        <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />

        <label>{t('githubModal.tokenLabel')}</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_..."
        />

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            {t('githubModal.cancel')}
          </button>
          <button className="btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? t('githubModal.connecting') : t('githubModal.connect')}
          </button>
        </div>
      </div>
    </div>
  )
}
