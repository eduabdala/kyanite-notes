import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useVaultStore } from '../store/useVaultStore'
import { exchangeOAuthCode, listUserRepos, type RemoteRepo } from '../lib/github'
import './GitHubConnectModal.css'

interface Props {
  onClose: () => void
}

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID
const WORKER_URL = import.meta.env.VITE_OAUTH_WORKER_URL
const OAUTH_STATE_KEY = 'kyanite:oauth-state'

const oauthAvailable = Boolean(CLIENT_ID && WORKER_URL)

function startOAuthLogin() {
  const state = crypto.randomUUID()
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  const redirectUri = window.location.origin + window.location.pathname
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', CLIENT_ID!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'repo')
  url.searchParams.set('state', state)
  window.location.href = url.toString()
}

export function GitHubConnectModal({ onClose }: Props) {
  const { t } = useTranslation()
  const connectGitHub = useVaultStore((s) => s.connectGitHub)
  const pullFromGitHub = useVaultStore((s) => s.pullFromGitHub)

  const [showManual, setShowManual] = useState(!oauthAvailable)
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // repos disponíveis após login OAuth, para escolher sem digitar owner/repo
  const [oauthToken, setOauthToken] = useState<string | null>(null)
  const [repos, setRepos] = useState<RemoteRepo[] | null>(null)
  const [selectedRepo, setSelectedRepo] = useState('')

  function buildErrorMessage(rawError?: string): string {
    if (!rawError) return t('githubModal.errors.generic')
    const lower = rawError.toLowerCase()
    if (lower.includes('not found')) return t('githubModal.errors.notFound')
    if (lower.includes('bad credentials')) return t('githubModal.errors.badCredentials')
    return rawError
  }

  // ao voltar do GitHub com ?code=..., troca pelo access_token via worker
  useEffect(() => {
    if (!oauthAvailable) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (!code) return

    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_STATE_KEY)

    // limpa o code/state da URL para não reprocessar em re-renders ou reloads
    window.history.replaceState({}, '', window.location.pathname)

    if (!state || state !== expectedState) {
      setError(t('githubModal.errors.generic'))
      return
    }

    setLoading(true)
    setError(null)
    exchangeOAuthCode(WORKER_URL!, code).then(async (result) => {
      if (!result.ok) {
        setLoading(false)
        setError(buildErrorMessage(result.error))
        return
      }
      setOauthToken(result.token)
      const userRepos = await listUserRepos(result.token).catch(() => null)
      setLoading(false)
      if (!userRepos || userRepos.length === 0) {
        setError(buildErrorMessage())
        return
      }
      setRepos(userRepos)
      setSelectedRepo(`${userRepos[0].owner}/${userRepos[0].repo}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConnectSelectedRepo() {
    if (!oauthToken || !selectedRepo) return
    const found = repos?.find((r) => `${r.owner}/${r.repo}` === selectedRepo)
    if (!found) return

    setLoading(true)
    setError(null)
    const result = await connectGitHub({
      owner: found.owner,
      repo: found.repo,
      branch: found.defaultBranch,
      token: oauthToken,
    })
    setLoading(false)

    if (!result.ok) {
      setError(buildErrorMessage(result.error))
      return
    }
    await pullFromGitHub()
    onClose()
  }

  async function handleConnectManual() {
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

        {repos ? (
          <>
            <label>{t('githubModal.repoLabel')}</label>
            <select value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)}>
              {repos.map((r) => (
                <option key={`${r.owner}/${r.repo}`} value={`${r.owner}/${r.repo}`}>
                  {r.owner}/{r.repo} {r.private ? '🔒' : ''}
                </option>
              ))}
            </select>

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>
                {t('githubModal.cancel')}
              </button>
              <button className="btn-primary" onClick={handleConnectSelectedRepo} disabled={loading}>
                {loading ? t('githubModal.connecting') : t('githubModal.connect')}
              </button>
            </div>
          </>
        ) : (
          <>
            {oauthAvailable && !showManual && (
              <>
                <p className="modal-hint">{t('githubModal.oauthHint')}</p>
                <button className="btn-primary btn-oauth" onClick={startOAuthLogin} disabled={loading}>
                  {loading ? t('githubModal.connecting') : t('githubModal.loginWithGitHub')}
                </button>
                {error && <p className="modal-error">{error}</p>}
                <button className="btn-link" onClick={() => setShowManual(true)}>
                  {t('githubModal.useTokenInstead')}
                </button>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={onClose}>
                    {t('githubModal.cancel')}
                  </button>
                </div>
              </>
            )}

            {showManual && (
              <>
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
                  {oauthAvailable ? (
                    <button className="btn-link" onClick={() => setShowManual(false)}>
                      {t('githubModal.backToLogin')}
                    </button>
                  ) : (
                    <button className="btn-secondary" onClick={onClose}>
                      {t('githubModal.cancel')}
                    </button>
                  )}
                  <button className="btn-primary" onClick={handleConnectManual} disabled={loading}>
                    {loading ? t('githubModal.connecting') : t('githubModal.connect')}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
