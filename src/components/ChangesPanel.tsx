import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, GitBranch, GitPullRequest, RefreshCw, Undo2 } from 'lucide-react'
import { listPendingChanges, useVaultStore } from '../store/useVaultStore'
import { useIdeStore } from '../store/useIdeStore'
import { useConfirmStore } from '../store/useConfirmStore'
import { fileNameOf } from '../lib/vault'
import './IdeViews.css'

const KIND_LETTER = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' } as const

/** Painel de alterações (estilo Source Control do VS Code): escolher arquivos, ver o diff,
 * escrever a mensagem e commitar; trocar/criar branch e abrir PR. */
export function ChangesPanel() {
  const { t } = useTranslation()
  const notes = useVaultStore((s) => s.notes)
  const pendingDeletes = useVaultStore((s) => s.pendingDeletes)
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const syncStatus = useVaultStore((s) => s.syncStatus)
  const commitChanges = useVaultStore((s) => s.commitChanges)
  const discardChange = useVaultStore((s) => s.discardChange)
  const pullFromGitHub = useVaultStore((s) => s.pullFromGitHub)
  const openDiff = useIdeStore((s) => s.openDiff)
  const diffPath = useIdeStore((s) => s.diffPath)
  const confirm = useConfirmStore((s) => s.confirm)

  const changes = useMemo(() => listPendingChanges({ notes, pendingDeletes }), [notes, pendingDeletes])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const selected = changes.filter((c) => !excluded.has(c.path))
  const allSelected = selected.length === changes.length && changes.length > 0

  function toggle(path: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleAll() {
    setExcluded(allSelected ? new Set(changes.map((c) => c.path)) : new Set())
  }

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected.length) return
    setCommitting(true)
    setLastError(null)
    const paths = new Set(selected.flatMap((c) => c.commitPaths))
    const ok = await commitChanges({ paths, message })
    setCommitting(false)
    if (ok) {
      setMessage('')
      setExcluded(new Set())
    } else {
      setLastError(useVaultStore.getState().syncError)
    }
  }

  async function handleDiscard(path: string) {
    if (!(await confirm(t('ide.discardConfirm', { path })))) return
    await discardChange(path)
  }

  return (
    <div className="ide-panel">
      {githubConfig && <BranchBar />}

      {!githubConfig ? (
        <p className="ide-muted ide-panel-note">{t('ide.connectFirst')}</p>
      ) : (
        <form className="commit-form" onSubmit={handleCommit}>
          <textarea
            className="commit-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('ide.commitPlaceholder')}
            aria-label={t('ide.commitPlaceholder')}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(e)
            }}
          />
          <div className="commit-actions">
            <button
              type="submit"
              className="btn-primary commit-btn"
              disabled={!selected.length || committing || syncStatus === 'syncing'}
            >
              {committing ? t('ide.committing') : t('ide.commit', { count: selected.length })}
            </button>
            <button
              type="button"
              className="ide-icon-btn"
              onClick={() => pullFromGitHub()}
              disabled={syncStatus === 'syncing'}
              title={t('ide.pull')}
            >
              <RefreshCw size={15} strokeWidth={1.75} className={syncStatus === 'syncing' ? 'spin' : ''} />
            </button>
          </div>
          {lastError && <p className="modal-error">{lastError}</p>}
        </form>
      )}

      <div className="changes-header">
        <label className="changes-select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!changes.length} />
          {t('ide.changes', { count: changes.length })}
        </label>
      </div>

      <div className="ide-panel-scroll">
        {changes.length === 0 && <p className="ide-muted ide-panel-note">{t('ide.noChanges')}</p>}
        {changes.map((c) => (
          <div key={c.path} className={`change-row ${diffPath === c.path ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={!excluded.has(c.path)}
              onChange={() => toggle(c.path)}
              aria-label={t('ide.includeInCommit', { path: c.path })}
            />
            <button type="button" className="change-main" onClick={() => openDiff(c.path)} title={c.path}>
              <span className={`change-name ${c.kind === 'deleted' ? 'deleted' : ''}`}>{fileNameOf(c.path)}</span>
              <span className="change-dir ide-muted">
                {c.from ? `← ${c.from}` : c.path.includes('/') ? c.path.slice(0, c.path.lastIndexOf('/')) : ''}
              </span>
            </button>
            <button
              type="button"
              className="ide-icon-btn change-discard"
              onClick={() => handleDiscard(c.path)}
              title={t('ide.discard')}
              aria-label={t('ide.discard')}
            >
              <Undo2 size={13} strokeWidth={1.75} />
            </button>
            <span className={`change-letter change-${c.kind}`} title={t(`ide.kinds.${c.kind}`)}>
              {KIND_LETTER[c.kind]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** branch atual, troca/criação de branch e PR */
function BranchBar() {
  const { t } = useTranslation()
  const githubConfig = useVaultStore((s) => s.githubConfig)!
  const listBranches = useVaultStore((s) => s.listBranches)
  const switchBranch = useVaultStore((s) => s.switchBranch)
  const openPullRequest = useVaultStore((s) => s.openPullRequest)
  const findPullRequest = useVaultStore((s) => s.findPullRequest)
  const hasPending = useVaultStore((s) => listPendingChanges(s).length > 0)
  const [branches, setBranches] = useState<string[] | null>(null)
  const [newBranch, setNewBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [prOpen, setPrOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPrUrl(null)
    findPullRequest().then((url) => !cancelled && setPrUrl(url))
    return () => {
      cancelled = true
    }
  }, [githubConfig.branch, findPullRequest])

  function explain(err?: string) {
    if (err === 'pending') return t('ide.branchPending')
    if (err === 'same-branch') return t('ide.prSameBranch')
    if (err === 'empty') return t('ide.branchEmptyRepo')
    return err ?? t('githubModal.errors.generic')
  }

  async function toggleBranches() {
    setError(null)
    if (branches) return setBranches(null)
    setBranches(await listBranches())
  }

  async function handleSwitch(branch: string, create = false) {
    setBusy(true)
    setError(null)
    const res = await switchBranch(branch, create)
    setBusy(false)
    if (!res.ok) return setError(explain(res.error))
    setBranches(null)
    setNewBranch('')
  }

  return (
    <div className="branch-bar">
      <div className="branch-row">
        <button type="button" className="branch-current" onClick={toggleBranches} disabled={busy} title={t('ide.switchBranch')}>
          <GitBranch size={14} strokeWidth={1.75} />
          <span>{githubConfig.branch}</span>
        </button>
        {prUrl ? (
          <a className="ide-icon-btn" href={prUrl} target="_blank" rel="noreferrer" title={t('ide.viewPr')}>
            <ExternalLink size={14} strokeWidth={1.75} />
          </a>
        ) : (
          <button type="button" className="ide-icon-btn" onClick={() => setPrOpen((v) => !v)} title={t('ide.openPr')}>
            <GitPullRequest size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {branches && (
        <div className="branch-list">
          {hasPending && <p className="ide-muted ide-panel-note">{t('ide.branchPending')}</p>}
          {branches.map((b) => (
            <button
              type="button"
              key={b}
              className={`branch-item ${b === githubConfig.branch ? 'active' : ''}`}
              onClick={() => handleSwitch(b)}
              disabled={busy || hasPending}
            >
              {b}
            </button>
          ))}
          <form
            className="branch-create"
            onSubmit={(e) => {
              e.preventDefault()
              if (newBranch.trim()) handleSwitch(newBranch.trim(), true)
            }}
          >
            <input
              className="search-input"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value.replace(/\s+/g, '-'))}
              placeholder={t('ide.newBranchPlaceholder', { from: githubConfig.branch })}
              aria-label={t('ide.newBranchPlaceholder', { from: githubConfig.branch })}
              disabled={busy || hasPending}
            />
          </form>
        </div>
      )}

      {prOpen && !prUrl && (
        <PullRequestForm
          onDone={(url) => {
            setPrUrl(url)
            setPrOpen(false)
          }}
          onError={(err) => setError(explain(err))}
          openPullRequest={openPullRequest}
        />
      )}

      {error && <p className="modal-error">{error}</p>}
    </div>
  )
}

function PullRequestForm({
  onDone,
  onError,
  openPullRequest,
}: {
  onDone: (url: string) => void
  onError: (err: string) => void
  openPullRequest: (title: string, body: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    const res = await openPullRequest(title.trim(), body)
    setBusy(false)
    if (res.ok) {
      onDone(res.url)
      window.open(res.url, '_blank', 'noopener')
    } else onError(res.error)
  }

  return (
    <form className="pr-form" onSubmit={submit}>
      <input
        className="search-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('ide.prTitle')}
        aria-label={t('ide.prTitle')}
        autoFocus
      />
      <textarea
        className="commit-message"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('ide.prBody')}
        aria-label={t('ide.prBody')}
        rows={3}
      />
      <button type="submit" className="btn-primary commit-btn" disabled={busy || !title.trim()}>
        {busy ? t('ide.committing') : t('ide.openPr')}
      </button>
    </form>
  )
}
