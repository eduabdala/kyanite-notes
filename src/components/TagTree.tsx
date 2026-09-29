import { ChevronRight } from 'lucide-react'
import { useTabsStore } from '../store/useTabsStore'
import { useFolderTreeStore } from '../store/useFolderTreeStore'
import type { TreeNode } from '../lib/types'

interface TagTreeProps {
  nodes: TreeNode[]
  depth?: number
}

/** Árvore de navegação por tags (estilo Tag Folder do Obsidian), somente leitura:
 * tags com `/` formam hierarquia, folhas listam as notas marcadas com aquela tag. */
export function TagTree({ nodes, depth = 0 }: TagTreeProps) {
  return (
    <>
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <TagFolderNode key={node.path} node={node} depth={depth} />
        ) : (
          <TagNoteNode key={`${node.path}-${depth}`} node={node} depth={depth} />
        )
      )}
    </>
  )
}

function TagFolderNode({ node, depth }: { node: TreeNode; depth: number }) {
  const expanded = useFolderTreeStore((s) => s.isExpanded(node.path))
  const toggleExpanded = useFolderTreeStore((s) => s.toggle)

  return (
    <div className="tree-folder">
      <div
        className="tree-row tree-folder-row"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => toggleExpanded(node.path)}
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className={`tree-caret ${expanded ? 'expanded' : ''}`}
        />
        <span className="tree-folder-name">{node.name}</span>
      </div>
      {expanded && <TagTree nodes={node.children ?? []} depth={depth + 1} />}
    </div>
  )
}

function TagNoteNode({ node, depth }: { node: TreeNode; depth: number }) {
  const activePath = useTabsStore((s) => s.activePath)
  const openTab = useTabsStore((s) => s.openTab)

  return (
    <div
      className={`tree-row tree-note-row ${node.path === activePath ? 'active' : ''}`}
      style={{ paddingLeft: `${depth * 14 + 24}px` }}
      onClick={() => openTab(node.path)}
    >
      <span className="tree-note-name">{node.name}</span>
    </div>
  )
}
