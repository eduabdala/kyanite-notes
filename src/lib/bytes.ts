/** Limite de referência usado para calcular o percentual de uso do repositório.
 * O GitHub não impõe um limite rígido de tamanho para repositórios privados, mas 10GB
 * é um valor de referência razoável para exibir "quanto do espaço típico já foi usado". */
export const REPO_USAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1
  do {
    value /= 1024
    unitIndex++
  } while (value >= 1024 && unitIndex < units.length - 1)
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`
}

export function repoUsagePercent(bytes: number): number {
  return Math.min(100, (bytes / REPO_USAGE_LIMIT_BYTES) * 100)
}
