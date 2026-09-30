import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderPlus, FilePlus, X, PanelLeftClose, Settings, Tag, Folder, Pen } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useCreationStore } from '../store/useCreationStore'
//import { useEditionStore } from '../store/useEditeStore'
import { useConfirmStore } from '../store/useConfirmStore'
import { FolderTree } from './FolderTree'
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
  const renameNote = useVaultStore((s) => s.renameNote)
  const getFolderTree = useVaultStore((s) => s.getFolderTree)
  const getTagTree = useVaultStore((s) => s.getTagTree)
  const emptyFolders = useVaultStore((s) => s.emptyFolders)
  const activePath = useTabsStore((s) => s.activePath)
  const openTab = useTabsStore((s) => s.openTab)
  const moveNote = useVaultStore((s) => s.moveNote)
  const creation = useCreationStore()
  //const edition = useEditionStore()
  const confirm = useConfirmStore((s) => s.confirm)
  const [query, setQuery] = useState('')
  const [rootDragOver, setRootDragOver] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [panel, setPanel] = useState<'folders' | 'tags'>('folders')

  const filtered = useMemo(() => {
    if (!query.trim()) return null
    const q = query.toLowerCase()
    return notes.filter(
      (n) => n.name.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
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

  async function handleRename(e: React.MouseEvent, path: string, newPath: string) {
    e.stopPropagation()
    if (!(await confirm(t('sidebar.deleteNoteConfirm')))) return
    await renameNote(path, newPath)
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

  return (
    <aside className="sidebar">
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
          title={t('sidebar.newNote')}
        >
          <FilePlus size={16} strokeWidth={1.75} />
        </button>
        <button className="icon-btn" onClick={onCollapse} title={t('sidebar.collapse')}>
          <PanelLeftClose size={16} strokeWidth={1.75} />
        </button>
      </div>

      {!filtered && (
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
                className="btn-edit-note"
                onClick={(e) => handleRename(e, note.path, '')}
                title={t('sidebar.delete')}
              >
                <X size={14} strokeWidth={1} />
              </button>
              <button
                className="btn-delete-note"
                onClick={(e) => handleDelete(e, note.path)}
                title={t('AAAA')}
              >
                <Pen size={14} strokeWidth={1.75} />
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

      <div className="sidebar-footer">
        <button
          className="settings-trigger"
          onClick={() => setShowSettings(true)}
          title={t('settings.title')}
        >
          <Settings size={14} strokeWidth={1.75} />
          <span>{t('settings.title')}</span>
        </button>
        <span className="version-tag">v{APP_VERSION}</span>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </aside>
  )
}
