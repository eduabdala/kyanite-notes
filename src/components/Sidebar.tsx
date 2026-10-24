import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderPlus, FilePlus, X, PanelLeftClose, Settings, Tag, Folder, Files, Search, GitCommitVertical } from 'lucide-react'
import { SearchPanel } from './SearchPanel'
import { ChangesPanel } from './ChangesPanel'
import { useIdeStore, type IdePanel } from '../store/useIdeStore'
import { listPendingChanges } from '../store/useVaultStore'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useCreationStore } from '../store/useCreationStore'
import { useConfirmStore } from '../store/useConfirmStore'
import { FolderTree } from './FolderTree'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { IS_CODE_WORKSPACE } from '../lib/workspace'
import { TagTree } from './TagTree'
import { SettingsPanel } from './SettingsPanel'
import { APP_VERSION } from '../lib/version'
import './Sidebar.css'

const DRAG_MIME = 'application/x-kyanite-note-path'

interface SidebarProps {
  onCollapse: () => void
}

export function Sidebar({ onCollapse }: SidebarProps) {
  const { t } = useTranslation()
  const notes = useVaultStore((s) => s.notes)
  const deleteNote = useVaultStore((s) => s.deleteNote)
  const getFolderTree = useVaultStore((s) => s.getFolderTree)
  const getTagTree = useVaultStore((s) => s.getTagTree)
  const emptyFolders = useVaultStore((s) => s.emptyFolders)
  const activePath = useTabsStore((s) => s.activePath)
  const openTab = useTabsStore((s) => s.openTab)
  const moveNote = useVaultStore((s) => s.moveNote)
  const creation = useCreationStore()
  const confirm = useConfirmStore((s) => s.confirm)
  const [query, setQuery] = useState('')
  const [rootDragOver, setRootDragOver] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [panel, setPanel] = useState<'folders' | 'tags'>('folders')
  const idePanel = useIdeStore((s) => s.panel)
  const setIdePanel = useIdeStore((s) => s.setPanel)
  const pendingDeletes = useVaultStore((s) => s.pendingDeletes)
  const changeCount = useMemo(
    () => (IS_CODE_WORKSPACE ? listPendingChanges({ notes, pendingDeletes }).length : 0),
    [notes, pendingDeletes]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return null
    const q = query.toLowerCase()
    // em código, busca também pelo caminho (ex: "components/button"); conteúdo só dos arquivos já baixados
    return notes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        (IS_CODE_WORKSPACE && n.path.toLowerCase().includes(q)) ||
        n.content.toLowerCase().includes(q)
    )
  }, [notes, query])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula quando notes/emptyFolders mudam
  const tree = useMemo(() => getFolderTree(), [getFolderTree, notes, emptyFolders])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula quando notes muda
  const tagTree = useMemo(() => getTagTree(), [getTagTree, notes])

  async function handleDelete(e: React.MouseEvent, path: string) {
    e.stopPropagation()
    if (!(await confirm(t('sidebar.deleteNoteConfirm')))) return
    await deleteNote(path)
  }

  function handleRootDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    setRootDragOver(true)
  }

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault()
    setRootDragOver(false)
    const path = e.dataTransfer.getData(DRAG_MIME)
    if (path) moveNote(path, '')
  }

  const idePanels: { id: IdePanel; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'explorer', label: t('ide.explorer'), icon: <Files size={15} strokeWidth={1.75} /> },
    { id: 'search', label: t('ide.search'), icon: <Search size={15} strokeWidth={1.75} /> },
    {
      id: 'changes',
      label: t('ide.sourceControl'),
      icon: <GitCommitVertical size={15} strokeWidth={1.75} />,
      badge: changeCount,
    },
  ]

  const footer = (
    <div className="sidebar-footer">
      <button className="settings-trigger" onClick={() => setShowSettings(true)} title={t('settings.title')}>
        <Settings size={14} strokeWidth={1.75} />
        <span>{t('settings.title')}</span>
      </button>
      <span className="version-tag">v{APP_VERSION}</span>
    </div>
  )

  if (IS_CODE_WORKSPACE && idePanel !== 'explorer') {
    return (
      <aside className="sidebar">
        <WorkspaceSwitcher />
        <IdeTabs panels={idePanels} active={idePanel} onSelect={setIdePanel} onCollapse={onCollapse} />
        {idePanel === 'search' ? <SearchPanel /> : <ChangesPanel />}
        {footer}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <WorkspaceSwitcher />
      {IS_CODE_WORKSPACE && (
        <IdeTabs panels={idePanels} active={idePanel} onSelect={setIdePanel} onCollapse={onCollapse} />
      )}
      <div className="sidebar-header">
        <input
          className="sidebar-search"
          placeholder={t('sidebar.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="icon-btn"
          onClick={() => creation.start('folder', '')}
          title={t('sidebar.newFolder')}
        >
          <FolderPlus size={16} strokeWidth={1.75} />
        </button>
        <button
          className="icon-btn"
          onClick={() => creation.start('note', '')}
          title={IS_CODE_WORKSPACE ? t('sidebar.newFile') : t('sidebar.newNote')}
        >
          <FilePlus size={16} strokeWidth={1.75} />
        </button>
        {!IS_CODE_WORKSPACE && (
          <button className="icon-btn" onClick={onCollapse} title={t('sidebar.collapse')}>
            <PanelLeftClose size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {!filtered && !IS_CODE_WORKSPACE && (
        <div className="sidebar-panel-toggle">
          <button
            className={panel === 'folders' ? 'active' : ''}
            onClick={() => setPanel('folders')}
          >
            <Folder size={13} strokeWidth={1.75} />
            {t('sidebar.folders')}
          </button>
          <button className={panel === 'tags' ? 'active' : ''} onClick={() => setPanel('tags')}>
            <Tag size={13} strokeWidth={1.75} />
            {t('sidebar.tags')}
          </button>
        </div>
      )}

      {filtered ? (
        <ul className="note-list">
          {filtered.map((note) => (
            <li
              key={note.path}
              className={`note-item ${note.path === activePath ? 'active' : ''}`}
              onClick={() => openTab(note.path)}
            >
              <span className="note-name">
                {note.name}
                {note.dirty && <span className="dirty-dot" title={t('sidebar.notSynced')} />}
              </span>
              <button
                className="btn-delete-note"
                onClick={(e) => handleDelete(e, note.path)}
                title={t('sidebar.delete')}
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="note-empty">{t('sidebar.noNotesFound')}</li>}
        </ul>
      ) : panel === 'folders' ? (
        <div
          className={`tree-container ${rootDragOver ? 'drag-over' : ''}`}
          onDragOver={handleRootDragOver}
          onDragLeave={() => setRootDragOver(false)}
          onDrop={handleRootDrop}
        >
          <FolderTree nodes={tree} />
          {tree.length === 0 && creation.parent === null && (
            <p className="note-empty">{t('sidebar.noNotesFound')}</p>
          )}
        </div>
      ) : (
        <div className="tree-container">
          <TagTree nodes={tagTree} />
          {tagTree.length === 0 && <p className="note-empty">{t('sidebar.noTagsFound')}</p>}
        </div>
      )}

      {footer}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </aside>
  )
}

/** abas Explorer / Busca / Alterações do workspace de código */
function IdeTabs({
  panels,
  active,
  onSelect,
  onCollapse,
}: {
  panels: { id: IdePanel; label: string; icon: React.ReactNode; badge?: number }[]
  active: IdePanel
  onSelect: (panel: IdePanel) => void
  onCollapse: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="ide-tabs" role="tablist">
      {panels.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={active === p.id}
          className={`ide-tab ${active === p.id ? 'active' : ''}`}
          onClick={() => onSelect(p.id)}
          title={p.label}
          aria-label={p.label}
        >
          {p.icon}
          {!!p.badge && <span className="ide-tab-badge">{p.badge}</span>}
        </button>
      ))}
      <button type="button" className="ide-tab ide-tab-collapse" onClick={onCollapse} title={t('sidebar.collapse')}>
        <PanelLeftClose size={15} strokeWidth={1.75} />
      </button>
    </div>
  )
}
