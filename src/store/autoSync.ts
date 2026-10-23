/** Sync em background enquanto o app está aberto:
 * - pull periódico (barato: 1 request quando nada mudou no remoto)
 * - pull + push ao voltar para a aba/janela e quando a conexão volta
 * O push após edições é agendado pelo próprio useVaultStore (schedulePush).
 * Importado uma vez em main.tsx. */

import { pendingChangesCount, useVaultStore } from './useVaultStore'

const PULL_INTERVAL_MS = 60_000

function canSync(): boolean {
  const { githubConfig, syncStatus } = useVaultStore.getState()
  return Boolean(githubConfig) && syncStatus !== 'auth-error' && syncStatus !== 'syncing'
}

function syncInBackground() {
  if (!canSync()) return
  const state = useVaultStore.getState()
  if (state.autoSync && pendingChangesCount(state) > 0) state.syncNow()
  else state.pullFromGitHub()
}

setInterval(() => {
  if (document.visibilityState === 'visible' && useVaultStore.getState().autoSync) syncInBackground()
}, PULL_INTERVAL_MS)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncInBackground()
})

window.addEventListener('online', syncInBackground)

window.addEventListener('offline', () => {
  if (useVaultStore.getState().githubConfig) {
    useVaultStore.setState({ syncStatus: 'offline', syncError: 'Sem conexão' })
  }
})
