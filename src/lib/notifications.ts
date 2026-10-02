/** Wrapper fino sobre a Notification API do navegador, usado pelos alertas da Agenda.
 * Funciona só enquanto o Kyanite está aberto numa aba — não há Service Worker/Push, então
 * não há notificação agendada em background (manteria a filosofia zero-backend do projeto,
 * mas exigiria infraestrutura própria de push, fora de escopo). */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  const result = await Notification.requestPermission()
  return result
}

export function notify(title: string, options?: NotificationOptions): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, options)
  } catch {
    // alguns ambientes (ex: iframes, certas versões mobile) lançam ao instanciar; ignora
  }
}
