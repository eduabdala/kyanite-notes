/** Estado persistido do sync com o GitHub (além das notas em si):
 * - remoteHead: commit da branch no último pull completo; se o remoto ainda estiver nele,
 *   o pull termina sem baixar nada
 * - metaShas: sha dos arquivos `.kyanite/*.json` já aplicados localmente
 * - pendingDeletes: arquivos apagados/renomeados localmente que ainda precisam sair do repo
 * - pendingFolders: pastas vazias criadas localmente cujo marcador ainda não foi enviado */

import { statusOf } from './github'
import { wsKey } from './workspace'

export interface PendingDelete {
  path: string
  /** sha conhecido do arquivo; se o remoto tiver outro sha, ele foi editado em outro lugar e não é apagado */
  sha?: string
}

const HEAD_KEY = wsKey('remote-head')
const META_KEY = wsKey('meta-shas')
const DELETES_KEY = wsKey('pending-deletes')
const FOLDERS_KEY = wsKey('pending-folders')
const META_PENDING_KEY = wsKey('pending-meta')
// no workspace padrão continua sendo a chave de antes ("kyanite:auto-sync")
const AUTO_SYNC_KEY = wsKey('auto-sync')

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const loadRemoteHead = () => localStorage.getItem(HEAD_KEY)
export function saveRemoteHead(sha: string | null) {
  if (sha) localStorage.setItem(HEAD_KEY, sha)
  else localStorage.removeItem(HEAD_KEY)
}

export const loadMetaShas = () => loadJson<Record<string, string>>(META_KEY, {})
export const saveMetaShas = (shas: Record<string, string>) => localStorage.setItem(META_KEY, JSON.stringify(shas))

export const loadPendingDeletes = () => loadJson<PendingDelete[]>(DELETES_KEY, [])
export const savePendingDeletes = (list: PendingDelete[]) => localStorage.setItem(DELETES_KEY, JSON.stringify(list))

export const loadPendingFolders = () => loadJson<string[]>(FOLDERS_KEY, [])
export const savePendingFolders = (list: string[]) => localStorage.setItem(FOLDERS_KEY, JSON.stringify(list))

/** arquivos `.kyanite/*.json` alterados localmente que ainda não foram enviados */
export const loadPendingMeta = () => loadJson<string[]>(META_PENDING_KEY, [])
export const savePendingMeta = (list: string[]) => localStorage.setItem(META_PENDING_KEY, JSON.stringify(list))

/** por workspace: desligado por padrão. Quando ligado, envia poucos segundos após parar de
 * digitar e puxa do remoto periodicamente; desligado, só sincroniza com Ctrl+S / botão de sync. */
export function loadAutoSync(): boolean {
  const raw = localStorage.getItem(AUTO_SYNC_KEY)
  return raw === null ? false : raw !== 'false'
}
export const saveAutoSync = (on: boolean) => localStorage.setItem(AUTO_SYNC_KEY, String(on))

/** Esquece o vínculo com o repo atual (ao conectar/desconectar), mantendo as notas locais */
export function resetRemoteTracking() {
  saveRemoteHead(null)
  saveMetaShas({})
}

export type SyncErrorKind = 'auth' | 'offline' | 'rate-limit' | 'other'

export interface ClassifiedError {
  kind: SyncErrorKind
  message: string
  /** rate limit: timestamp (ms) a partir do qual vale tentar de novo */
  retryAt?: number
}

/** Diferencia erro de autenticação, falta de rede e rate limit da API dos demais erros */
export function classifyError(err: unknown, fallback: string): ClassifiedError {
  const message = err instanceof Error ? err.message : fallback
  const status = statusOf(err)
  const headers = (err as { response?: { headers?: Record<string, string | undefined> } } | null)?.response
    ?.headers

  if (status === 401 || /bad credentials|requires authentication/i.test(message)) {
    return { kind: 'auth', message }
  }

  if (status === 429 || (status === 403 && headers?.['x-ratelimit-remaining'] === '0')) {
    const reset = Number(headers?.['x-ratelimit-reset'])
    const retryAt = Number.isFinite(reset) && reset > 0 ? reset * 1000 : Date.now() + 60_000
    const time = new Date(retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return { kind: 'rate-limit', message: `Limite da API do GitHub atingido. Nova tentativa às ${time}.`, retryAt }
  }

  if (!navigator.onLine || /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(message)) {
    return { kind: 'offline', message: 'Sem conexão' }
  }

  return { kind: 'other', message }
}
