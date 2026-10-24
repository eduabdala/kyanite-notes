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
  /** workspaces de código: conteúdo ainda não baixado (é buscado ao abrir o arquivo) */
  unloaded?: boolean
  /** workspaces de código: binário ou texto grande demais; aparece na árvore mas não é editável */
  binary?: boolean
  /** renomeado/movido sem baixar o conteúdo: o push reaproveita esse blob pelo sha */
  copyOf?: string
  /** path anterior, enquanto um rename/move ainda não foi enviado (para o painel de alterações) */
  movedFrom?: string
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
