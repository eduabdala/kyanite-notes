import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, FilePlus, FolderPlus, X } from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useCreationStore } from '../store/useCreationStore'
import { useFolderTreeStore } from '../store/useFolderTreeStore'
import { useConfirmStore } from '../store/useConfirmStore'
import { InlineCreateInput } from './InlineCreateInput'
import type { TreeNode } from '../lib/types'

const DRAG_MIME = 'application/x-kyanite-note-path'

interface FolderTreeProps {
  nodes: TreeNode[]
  depth?: number
  /** path da pasta que contém esses nodes ('' para raiz), usado para saber onde renderizar o input inline */
  parentPath?: string
}

/** Renderiza a árvore de pastas/notas recursivamente, com collapse/expand por pasta */
export function FolderTree({ nodes, depth = 0, parentPath = '' }: FolderTreeProps) {
  const creation = useCreationStore()
  const createNote = useVaultStore((s) => s.createNote)
  const createFolder = useVaultStore((s) => s.createFolder)

  const showInlineHere = creation.parent === parentPath

  function handleConfirm(name: string) {
    if (creation.kind === 'note') createNote(name, parentPath)
    else createFolder(name, parentPath)
    creation.cancel()
  }

  return (
    <>
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <FolderNode key={node.path} node={node} depth={depth} />
        ) : (
          <NoteNode key={node.path} node={node} depth={depth} />
        )
      )}
      {showInlineHere && (
        <InlineCreateInput
          kind={creation.kind}
          depth={depth}
          onConfirm={handleConfirm}
          onCancel={creation.cancel}
        />
      )}
    </>
  )
}

function FolderNode({ node, depth }: { node: TreeNode; depth: number }) {
  const { t } = useTranslation()
  const expanded = useFolderTreeStore((s) => s.isExpanded(node.path))
  const toggleExpanded = useFolderTreeStore((s) => s.toggle)
  const [dragOver, setDragOver] = useState(false)
  const deleteFolder = useVaultStore((s) => s.deleteFolder)
  const moveNote = useVaultStore((s) => s.moveNote)
  const startCreation = useCreationStore((s) => s.start)
  const confirm = useConfirmStore((s) => s.confirm)

  function handleNewNote(e: React.MouseEvent) {
    e.stopPropagation()
    if (!expanded) toggleExpanded(node.path)
    startCreation('note', node.path)
  }

  function handleNewSubfolder(e: React.MouseEvent) {
    e.stopPropagation()
    if (!expanded) toggleExpanded(node.path)
    startCreation('folder', node.path)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!(await confirm(t('sidebar.deleteFolderConfirm')))) return
    await deleteFolder(node.path)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const path = e.dataTransfer.getData(DRAG_MIME)
    if (path) moveNote(path, node.path)
  }

  return (
    <div className="tree-folder">
      <div
        className={`tree-row tree-folder-row ${dragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => toggleExpanded(node.path)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className={`tree-caret ${expanded ? 'expanded' : ''}`}
        />
        <span className="tree-folder-name">{node.name}</span>
        <span className="tree-row-actions">
          <button onClick={handleNewNote} title={t('sidebar.newNote')}>
            <FilePlus size={14} strokeWidth={1.75} />
          </button>
          <button onClick={handleNewSubfolder} title={t('sidebar.newFolder')}>
            <FolderPlus size={14} strokeWidth={1.75} />
          </button>
          <button onClick={handleDelete} title={t('sidebar.deleteFolder')}>
            <X size={14} strokeWidth={1.75} />
          </button>
        </span>
      </div>
      {expanded && (
        <FolderTree nodes={node.children ?? []} depth={depth + 1} parentPath={node.path} />
      )}
    </div>
  )
}

function NoteNode({ node, depth }: { node: TreeNode; depth: number }) {
  const { t } = useTranslation()
  const activePath = useTabsStore((s) => s.activePath)
  const openTab = useTabsStore((s) => s.openTab)
  const deleteNote = useVaultStore((s) => s.deleteNote)
  const notes = useVaultStore((s) => s.notes)
  const confirm = useConfirmStore((s) => s.confirm)

  const note = notes.find((n) => n.path === node.path)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!(await confirm(t('sidebar.deleteNoteConfirm')))) return
    await deleteNote(node.path)
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(DRAG_MIME, node.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={`tree-row tree-note-row ${node.path === activePath ? 'active' : ''}`}
      style={{ paddingLeft: `${depth * 14 + 24}px` }}
      onClick={() => openTab(node.path)}
      draggable
      onDragStart={handleDragStart}
    >
      <span className="tree-note-name">
        {node.name}
        {note?.dirty && <span className="dirty-dot" title={t('sidebar.notSynced')} />}
      </span>
      <span className="tree-row-actions">
        <button onClick={handleDelete} title={t('sidebar.delete')}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </span>
    </div>
  )
}
