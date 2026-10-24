import type { Note, TreeNode } from './types'
import { IS_CODE_WORKSPACE, wsKey } from './workspace'

const NOTES_KEY = wsKey('notes')

/** Persistência local das notas (cache offline-first). Sync com GitHub é feito separadamente. */
export function loadLocalNotes(): Note[] {
  const raw = localStorage.getItem(NOTES_KEY)
  return raw ? JSON.parse(raw) : []
}

export function saveLocalNotes(notes: Note[]) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
  } catch (err) {
    // cota do localStorage estourada (repo muito grande): mantém em memória e avisa no console
    console.warn('Não foi possível salvar as notas localmente', err)
  }
}

export function pathToName(path: string): string {
  const fileName = path.split('/').pop() ?? path
  return fileName.replace(/\.md$/, '')
}

/** em workspaces de código o nome já inclui a extensão (ex: "index.ts"); em notas, vira "nome.md" */
export function nameToPath(name: string, folder = ''): string {
  const safe = name.trim()
  const file = IS_CODE_WORKSPACE ? safe : `${safe}.md`
  return folder ? `${folder}/${file}` : file
}

/** nome do arquivo (com extensão) de um path */
export function fileNameOf(path: string): string {
  return path.split('/').pop() ?? path
}

const FOLDERS_KEY = wsKey('folders')
/** nome do arquivo marcador usado para pastas vazias sobreviverem no git (que não versiona diretórios vazios) */
export const FOLDER_MARKER = '.folder'

/** Persistência local da lista de pastas conhecidas (inclusive vazias). Pastas com notas dentro
 * são inferidas automaticamente pelos paths, então só precisamos rastrear as vazias aqui. */
export function loadLocalFolders(): string[] {
  const raw = localStorage.getItem(FOLDERS_KEY)
  return raw ? JSON.parse(raw) : []
}

export function saveLocalFolders(folders: string[]) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

/** Constrói uma árvore de pastas/notas a partir dos paths das notas e da lista de pastas vazias conhecidas */
export function buildFolderTree(notes: Note[], emptyFolders: string[]): TreeNode[] {
  const root: TreeNode = { type: 'folder', name: '', path: '', children: [] }
  const folderMap = new Map<string, TreeNode>([['', root]])

  function ensureFolder(path: string): TreeNode {
    const existing = folderMap.get(path)
    if (existing) return existing

    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
    const parent = ensureFolder(parentPath)

    const node: TreeNode = { type: 'folder', name, path, children: [] }
    parent.children!.push(node)
    folderMap.set(path, node)
    return node
  }

  for (const folder of emptyFolders) {
    ensureFolder(folder)
  }

  for (const note of notes) {
    const folderPath = note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : ''
    const parent = ensureFolder(folderPath)
    parent.children!.push({ type: 'note', name: note.name, path: note.path })
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
