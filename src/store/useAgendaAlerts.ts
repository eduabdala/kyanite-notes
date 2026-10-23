import { useEffect } from 'react'
import { useVaultStore } from './useVaultStore'
import { updateTask } from '../lib/agenda'
import { notify } from '../lib/notifications'

const CHECK_INTERVAL_MS = 30_000

/** Checa periodicamente (enquanto o app está aberto) se há tarefas de hoje cujo horário já
 * chegou e ainda não foram notificadas, disparando uma notificação do navegador para cada uma.
 * Só funciona com o plugin Agenda habilitado e permissão de notificação concedida; sem isso,
 * a tarefa simplesmente não dispara alerta (mas continua visível normalmente no calendário). */
export function useAgendaAlerts() {
  const agendaEnabled = useVaultStore((s) => s.isPluginEnabled('agenda'))

  useEffect(() => {
    if (!agendaEnabled) return
    if (typeof Notification === 'undefined') return

    function checkDueTasks() {
      if (Notification.permission !== 'granted') return

      const now = new Date()
      const todayIso = now.toISOString().slice(0, 10)
      const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      // lê o estado atual via getState() (não via hook) para sempre considerar a versão mais
      // recente da coleção sem precisar recriar o interval a cada mudança de tarefa
      const { agendaCollection, saveAgendaCollection } = useVaultStore.getState()
      const due = agendaCollection.tasks.filter(
        (t) => !t.done && !t.notified && t.time && t.date === todayIso && t.time <= nowHm
      )
      if (due.length === 0) return

      let updated = agendaCollection
      for (const task of due) {
        notify(task.text, { body: task.description || undefined, tag: task.id })
        updated = updateTask(updated, task.id, { notified: true })
      }
      saveAgendaCollection(updated)
    }

    checkDueTasks()
    const interval = setInterval(checkDueTasks, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [agendaEnabled])
}
