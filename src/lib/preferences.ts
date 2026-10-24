/** Preferências do usuário sincronizadas via `.kyanite/config.json` (campo `preferences`).
 * Só entra aqui o que faz sentido ser igual em todos os dispositivos; estado de layout
 * (larguras de painéis, painéis recolhidos, modo de visualização) continua só no localStorage. */

import { STONES, type StoneName } from '../store/useThemeStore'

export type ThemeModePreference = 'dark' | 'light' | 'system'
export type IconSizePreference = 'small' | 'normal' | 'large' | 'xlarge'

export interface Preferences {
  stone: StoneName
  /** 'system' = acompanha o tema do sistema operacional de cada dispositivo */
  mode: ThemeModePreference
  language: 'pt' | 'en'
  fontSize: number
  iconSize: IconSizePreference
  pomodoro: { work: number; break: number }
}

const MODES: ThemeModePreference[] = ['dark', 'light', 'system']
const LANGUAGES: Preferences['language'][] = ['pt', 'en']
const ICON_SIZES: IconSizePreference[] = ['small', 'normal', 'large', 'xlarge']

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

/** Valida campo a campo; campos inválidos ou ausentes são descartados (o dispositivo mantém o valor local).
 * Assim um config.json editado à mão ou de uma versão antiga não quebra o app. */
export function parsePreferences(raw: unknown): Partial<Preferences> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: Partial<Preferences> = {}

  if (STONES.includes(r.stone as StoneName)) out.stone = r.stone as StoneName
  if (MODES.includes(r.mode as ThemeModePreference)) out.mode = r.mode as ThemeModePreference
  if (LANGUAGES.includes(r.language as Preferences['language'])) out.language = r.language as Preferences['language']
  if (isPositiveInt(r.fontSize)) out.fontSize = r.fontSize
  if (ICON_SIZES.includes(r.iconSize as IconSizePreference)) out.iconSize = r.iconSize as IconSizePreference

  const p = r.pomodoro as Record<string, unknown> | undefined
  if (p && isPositiveInt(p.work) && isPositiveInt(p.break)) out.pomodoro = { work: p.work, break: p.break }

  return Object.keys(out).length > 0 ? out : undefined
}
