/** Busca fuzzy simples para o Quick Open: as letras da consulta precisam aparecer em ordem.
 * Pontua mais alto quem casa no nome do arquivo, em sequência e no início de palavras. */
export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const nameStart = t.lastIndexOf('/') + 1

  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (found === prev + 1) score += 5 // letras consecutivas
    if (found >= nameStart) score += 3 // dentro do nome do arquivo
    if (found === 0 || '/._-'.includes(t[found - 1])) score += 4 // início de palavra
    score -= Math.min(found - ti, 10) * 0.1 // lacunas custam pouco
    prev = found
    ti = found + 1
  }
  // caminhos mais curtos desempatam
  return score - t.length * 0.01
}
