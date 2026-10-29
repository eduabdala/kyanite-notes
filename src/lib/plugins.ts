/** Configuração do vault: um arquivo `.kyanite/config.json` versionado no próprio repositório,
 * para que plugins ativos e preferências (tema, idioma, fonte, ícones, Pomodoro) sejam
 * compartilhados entre todos os dispositivos que sincronizam aquele repo. Estado de layout
 * (larguras, painéis recolhidos, modo de visualização) continua só no localStorage. */

import { parsePreferences, type Preferences } from './preferences'
import { wsKey } from './workspace'

export const PLUGIN_CONFIG_PATH = '.kyanite/config.json'

export type PluginId = 'kanban' | 'pomodoro' | 'agenda' | 'canvas'

export interface PluginConfig {
  plugins: Record<PluginId, boolean>
  /** ausente em configs antigos; nesse caso cada dispositivo mantém suas preferências locais */
  preferences?: Partial<Preferences>
}

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  plugins: {
    kanban: false,
    pomodoro: false,
    agenda: false,
    canvas: false,
  },
}

const LOCAL_KEY = wsKey('plugin-config')

function fromParsed(parsed: unknown): PluginConfig {
  const obj = (parsed ?? {}) as { plugins?: Partial<Record<PluginId, boolean>>; preferences?: unknown }
  const preferences = parsePreferences(obj.preferences)
  return {
    plugins: { ...DEFAULT_PLUGIN_CONFIG.plugins, ...obj.plugins },
    ...(preferences ? { preferences } : {}),
  }
}

/** Config local (usada como fallback quando não há repo conectado, ou antes do primeiro pull) */
export function loadLocalPluginConfig(): PluginConfig {
  const raw = localStorage.getItem(LOCAL_KEY)
  if (!raw) return DEFAULT_PLUGIN_CONFIG
  return parsePluginConfig(raw)
}

export function saveLocalPluginConfig(config: PluginConfig) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(config))
}

/** Parseia o conteúdo bruto do config.json do repo, com defaults para campos ausentes
 * (config antigo ou parcialmente escrito manualmente por um usuário não deve quebrar o app) */
export function parsePluginConfig(raw: string): PluginConfig {
  try {
    return fromParsed(JSON.parse(raw))
  } catch {
    return DEFAULT_PLUGIN_CONFIG
  }
}

export function serializePluginConfig(config: PluginConfig): string {
  return JSON.stringify(config, null, 2) + '\n'
}
