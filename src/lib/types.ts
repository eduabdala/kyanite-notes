export interface Note {
  /** caminho relativo dentro do repo, ex: "pasta/nota.md" */
  path: string
  /** nome sem extensão, usado como título e para wikilinks */
  name: string
  content: string
  /** sha do blob no GitHub (necessário para updates), undefined se ainda não sincronizado */
  sha?: string
  /** timestamp local da última edição */
  updatedAt: number
  /** true se há mudanças locais não sincronizadas */
  dirty: boolean
}

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

export interface LinkGraph {
  /** path da nota -> paths das notas que ela referencia */
  outgoing: Map<string, Set<string>>
  /** path da nota -> paths das notas que a referenciam (backlinks) */
  incoming: Map<string, Set<string>>
}

/** nó de árvore de pastas/notas, construído a partir dos paths das notas + pastas vazias conhecidas */
export interface TreeNode {
  type: 'folder' | 'note'
  /** nome de exibição (pasta ou nome da nota) */
  name: string
  /** path completo (pasta: sem barra final; nota: caminho do arquivo .md) */
  path: string
  children?: TreeNode[]
}
