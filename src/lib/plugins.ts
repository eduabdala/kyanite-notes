/** Configuração de plugins do vault: um arquivo `.kyanite/config.json` versionado no próprio
 * repositório, para que as preferências (quais plugins ficam ativos) sejam compartilhadas entre
 * todos os dispositivos que sincronizam aquele repo — diferente do resto das preferências do
 * Kyanite, que hoje vivem só no localStorage de cada dispositivo. */

export const PLUGIN_CONFIG_PATH = '.kyanite/config.json'

export type PluginId = 'kanban' | 'pomodoro'

export interface PluginConfig {
  plugins: Record<PluginId, boolean>
}

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  plugins: {
    kanban: false,
    pomodoro: false,
  },
}

const LOCAL_KEY = 'kyanite:plugin-config'

/** Config local (usada como fallback quando não há repo conectado, ou antes do primeiro pull) */
export function loadLocalPluginConfig(): PluginConfig {
  const raw = localStorage.getItem(LOCAL_KEY)
  if (!raw) return DEFAULT_PLUGIN_CONFIG
  try {
    const parsed = JSON.parse(raw)
    return { plugins: { ...DEFAULT_PLUGIN_CONFIG.plugins, ...parsed.plugins } }
  } catch {
    return DEFAULT_PLUGIN_CONFIG
  }
}

export function saveLocalPluginConfig(config: PluginConfig) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(config))
}

/** Parseia o conteúdo bruto do config.json do repo, com defaults para campos ausentes
 * (config antigo ou parcialmente escrito manualmente por um usuário não deve quebrar o app) */
export function parsePluginConfig(raw: string): PluginConfig {
  try {
    const parsed = JSON.parse(raw)
    return { plugins: { ...DEFAULT_PLUGIN_CONFIG.plugins, ...parsed.plugins } }
  } catch {
    return DEFAULT_PLUGIN_CONFIG
  }
}

export function serializePluginConfig(config: PluginConfig): string {
  return JSON.stringify(config, null, 2) + '\n'
}
