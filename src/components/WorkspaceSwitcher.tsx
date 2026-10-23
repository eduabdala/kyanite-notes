import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Code2, NotebookText, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  ACTIVE_WORKSPACE,
  DEFAULT_WORKSPACE_ID,
  createWorkspace,
  deleteWorkspace,
  loadWorkspaces,
  renameWorkspace,
  setConnectHint,
  switchWorkspace,
  workspaceRepoLabel,
  type Workspace,
  type WorkspaceKind,
} from '../lib/workspace'
import { useVaultStore } from '../store/useVaultStore'
import { useConfirmStore } from '../store/useConfirmStore'
import './WorkspaceSwitcher.css'

/** Seletor de workspace no topo da sidebar: troca, cria, renomeia e remove workspaces.
 * Cada workspace aponta para um repositório e tem notas/abas/estado de sync próprios. */
export function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const confirm = useConfirmStore((s) => s.confirm)
  const [open, setOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces)
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const label = (w: Workspace) => w.name || t('workspace.defaultName')

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function close() {
    setOpen(false)
    setCreating(false)
    setRenamingId(null)
  }

  function handleCreate(name: string, kind: WorkspaceKind, reuseToken: boolean) {
    const ws = createWorkspace(name, kind)
    // abre o modal de conexão ao entrar no workspace novo, reaproveitando o token atual se pedido
    setConnectHint(reuseToken && githubConfig ? githubConfig.token : null)
    switchWorkspace(ws.id)
  }

  function handleRename(id: string, name: string) {
    if (name.trim()) renameWorkspace(id, name)
    setRenamingId(null)
    setWorkspaces(loadWorkspaces())
  }

  async function handleDelete(w: Workspace) {
    if (!(await confirm(t('workspace.deleteConfirm', { name: label(w) })))) return
    deleteWorkspace(w.id)
    setWorkspaces(loadWorkspaces())
  }

  return (
    <div className="workspace-switcher" ref={ref}>
      <button
        type="button"
        className="workspace-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('workspace.switch')}
      >
        <KindIcon kind={ACTIVE_WORKSPACE.kind} />
        <span className="workspace-trigger-name">{label(ACTIVE_WORKSPACE)}</span>
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="workspace-menu" role="menu">
          {workspaces.map((w) => {
            const repo = workspaceRepoLabel(w.id)
            const isActive = w.id === ACTIVE_WORKSPACE.id
            if (renamingId === w.id) {
              return (
                <NameInput
                  key={w.id}
                  initial={label(w)}
                  onSubmit={(name) => handleRename(w.id, name)}
                  onCancel={() => setRenamingId(null)}
                />
              )
            }
            return (
              <div key={w.id} className={`workspace-item ${isActive ? 'active' : ''}`}>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-item-main"
                  onClick={() => (isActive ? close() : switchWorkspace(w.id))}
                >
                  <KindIcon kind={w.kind} />
                  <span className="workspace-item-text">
                    <span className="workspace-item-name">{label(w)}</span>
                    <span className="workspace-item-repo">{repo ?? t('workspace.notConnected')}</span>
                  </span>
                  {isActive && <Check size={14} strokeWidth={2} />}
                </button>
                <button
                  type="button"
                  className="workspace-item-action"
                  onClick={() => setRenamingId(w.id)}
                  title={t('sidebar.rename')}
                  aria-label={t('sidebar.rename')}
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
                {w.id !== DEFAULT_WORKSPACE_ID && (
                  <button
                    type="button"
                    className="workspace-item-action"
                    onClick={() => handleDelete(w)}
                    title={t('workspace.delete')}
                    aria-label={t('workspace.delete')}
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )
          })}

          {creating ? (
            <CreateForm
              canReuseToken={Boolean(githubConfig)}
              onSubmit={handleCreate}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <button type="button" className="workspace-add" onClick={() => setCreating(true)}>
              <Plus size={14} strokeWidth={1.75} />
              {t('workspace.new')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function KindIcon({ kind }: { kind: WorkspaceKind }) {
  return kind === 'code' ? <Code2 size={14} strokeWidth={1.75} /> : <NotebookText size={14} strokeWidth={1.75} />
}

function NameInput({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      className="workspace-name-input"
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit(value)
        else if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      onBlur={() => onSubmit(value)}
    />
  )
}

function CreateForm({
  canReuseToken,
  onSubmit,
  onCancel,
}: {
  canReuseToken: boolean
  onSubmit: (name: string, kind: WorkspaceKind, reuseToken: boolean) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<WorkspaceKind>('notes')
  const [reuseToken, setReuseToken] = useState(true)

  return (
    <form
      className="workspace-create"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit(name, kind, reuseToken)
      }}
    >
      <input
        className="workspace-name-input"
        placeholder={t('workspace.namePlaceholder')}
        aria-label={t('workspace.namePlaceholder')}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="workspace-kind" role="radiogroup" aria-label={t('workspace.kind')}>
        {(['notes', 'code'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={kind === k ? 'active' : ''}
            onClick={() => setKind(k)}
            title={t(`workspace.kindHint.${k}`)}
          >
            <KindIcon kind={k} />
            {t(`workspace.kinds.${k}`)}
          </button>
        ))}
      </div>
      <p className="workspace-kind-hint">{t(`workspace.kindHint.${kind}`)}</p>
      {canReuseToken && (
        <label className="workspace-reuse">
          <input type="checkbox" checked={reuseToken} onChange={(e) => setReuseToken(e.target.checked)} />
          {t('workspace.reuseToken')}
        </label>
      )}
      <div className="workspace-create-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {t('githubModal.cancel')}
        </button>
        <button type="submit" className="btn-primary" disabled={!name.trim()}>
          {t('workspace.create')}
        </button>
      </div>
    </form>
  )
}
