/** Liga as preferências locais (tema, idioma, fonte, ícones, Pomodoro) ao campo `preferences`
 * do `.kyanite/config.json`:
 * - mudança feita pelo usuário → grava no config (debounced, para o slider de fonte não gerar
 *   um commit por pixel)
 * - config novo vindo do repo (pull) → aplica nas stores locais
 * Importado uma vez em main.tsx. */

import i18n from '../i18n'
import type { Preferences } from '../lib/preferences'
import { useVaultStore } from './useVaultStore'
import { buildPreset, splitPreset, useThemeStore } from './useThemeStore'
import { useAppearanceStore } from './useAppearanceStore'
import { usePomodoroStore } from './usePomodoroStore'

const SAVE_DEBOUNCE_MS = 1500

function collect(): Preferences {
  const { preset, followSystem } = useThemeStore.getState()
  const { stone, mode } = splitPreset(preset)
  const { fontSize, iconSize } = useAppearanceStore.getState()
  const { work, break: brk } = usePomodoroStore.getState().durations
  return {
    stone,
    mode: followSystem ? 'system' : mode,
    language: i18n.language === 'pt' ? 'pt' : 'en',
    fontSize,
    iconSize,
    pomodoro: { work, break: brk },
  }
}

// enquanto aplicamos preferências vindas do repo, as mudanças nas stores não devem ser
// tratadas como edição do usuário (senão o pull geraria um push de volta)
let applying = false

function apply(prefs: Partial<Preferences> | undefined) {
  if (!prefs) return
  applying = true
  try {
    const theme = useThemeStore.getState()
    const current = splitPreset(theme.preset)
    const stone = prefs.stone ?? current.stone
    if (prefs.mode === 'system') {
      theme.setPreset(buildPreset(stone, current.mode))
      theme.setFollowSystem(true)
    } else if (prefs.mode || prefs.stone) {
      if (prefs.mode && theme.followSystem) theme.setFollowSystem(false)
      theme.setPreset(buildPreset(stone, prefs.mode ?? current.mode))
    }

    if (prefs.language && prefs.language !== i18n.language) i18n.changeLanguage(prefs.language)

    const appearance = useAppearanceStore.getState()
    if (prefs.fontSize !== undefined) appearance.setFontSize(prefs.fontSize)
    if (prefs.iconSize) appearance.setIconSize(prefs.iconSize)

    if (prefs.pomodoro) {
      const pomodoro = usePomodoroStore.getState()
      pomodoro.setDuration('work', prefs.pomodoro.work)
      pomodoro.setDuration('break', prefs.pomodoro.break)
    }
  } finally {
    applying = false
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (applying) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const prefs = collect()
    const stored = useVaultStore.getState().pluginConfig.preferences
    if (JSON.stringify(prefs) === JSON.stringify(stored)) return
    useVaultStore.getState().savePreferences(prefs)
  }, SAVE_DEBOUNCE_MS)
}

// no boot, alinha as stores com o que foi salvo no último sync
apply(useVaultStore.getState().pluginConfig.preferences)

useVaultStore.subscribe((state, prev) => {
  if (state.pluginConfig !== prev.pluginConfig) apply(state.pluginConfig.preferences)
})

useThemeStore.subscribe((state, prev) => {
  if (state.preset !== prev.preset || state.followSystem !== prev.followSystem) scheduleSave()
})

useAppearanceStore.subscribe(scheduleSave)

usePomodoroStore.subscribe((state, prev) => {
  if (state.durations !== prev.durations) scheduleSave()
})

i18n.on('languageChanged', scheduleSave)
