import type { Note, TreeNode } from './types'
import { splitFrontmatter } from './frontmatter'

const INLINE_TAG_RE = /(?:^|\s)#([a-zA-Z0-9_/-]+)/g

/** Extrai tags de uma nota: `#tag` inline no corpo + `tags:` do frontmatter.
 * Tags com `/` (ex: `projeto/frontend`) formam hierarquia, igual ao Tag Folder do Obsidian. */
export function extractTags(content: string): string[] {
  const { frontmatter, body } = splitFrontmatter(content)
  const tags = new Set<string>()

  const fromFrontmatter = frontmatter.tags
  if (Array.isArray(fromFrontmatter)) {
    for (const tag of fromFrontmatter) if (tag) tags.add(String(tag).trim())
  } else if (typeof fromFrontmatter === 'string' && fromFrontmatter.trim()) {
    tags.add(fromFrontmatter.trim())
  }

  let match: RegExpExecArray | null
  const re = new RegExp(INLINE_TAG_RE)
  while ((match = re.exec(body)) !== null) {
    tags.add(match[1])
  }

  return Array.from(tags)
}

/** Mapa tag -> paths das notas que a possuem */
export function buildTagIndex(notes: Note[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const note of notes) {
    for (const tag of extractTags(note.content)) {
      if (!index.has(tag)) index.set(tag, new Set())
      index.get(tag)!.add(note.path)
    }
  }
  return index
}

/** Monta uma árvore de tags (estilo Tag Folder): tags com `/` formam pastas aninhadas,
 * e cada tag folha lista as notas marcadas com ela. */
export function buildTagTree(notes: Note[]): TreeNode[] {
  const index = buildTagIndex(notes)
  const notesByPath = new Map(notes.map((n) => [n.path, n]))

  const root: TreeNode = { type: 'folder', name: '', path: '', children: [] }
  const nodeMap = new Map<string, TreeNode>([['', root]])

  function ensureTagFolder(path: string): TreeNode {
    const existing = nodeMap.get(path)
    if (existing) return existing

    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
    const parent = ensureTagFolder(parentPath)

    const node: TreeNode = { type: 'folder', name: `#${name}`, path: `tag:${path}`, children: [] }
    parent.children!.push(node)
    nodeMap.set(path, node)
    return node
  }

  const sortedTags = Array.from(index.keys()).sort()
  for (const tag of sortedTags) {
    const tagNode = ensureTagFolder(tag)
    const notePaths = Array.from(index.get(tag) ?? [])
    for (const path of notePaths) {
      const note = notesByPath.get(path)
      if (!note) continue
      tagNode.children!.push({ type: 'note', name: note.name, path: note.path })
    }
  }

  function sortTree(node: TreeNode) {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortTree)
  }
  sortTree(root)

  return root.children ?? []
}
