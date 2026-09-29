import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light'
export type StoneName =
  | 'kyanite'
  | 'malachite'
  | 'sardius'
  | 'amethystus'
  | 'rhodonite'
  | 'citrinus'
  | 'onyx'
  | 'beryllus'

/** Um preset de tema é a combinação pedra + modo, ex: "kyanite-dark" */
export type ThemePreset = `${StoneName}-${ThemeMode}`

export const STONES: StoneName[] = [
  'kyanite',
  'malachite',
  'sardius',
  'amethystus',
  'rhodonite',
  'citrinus',
  'onyx',
  'beryllus',
]

/** Cor de destaque (dark) de cada pedra, usada para colorir o logo conforme o tema ativo */
export const STONE_ACCENT: Record<StoneName, string> = {
  kyanite: '#3d7ff5',
  malachite: '#23a463',
  sardius: '#e0692f',
  amethystus: '#9061f0',
  rhodonite: '#e0559a',
  citrinus: '#d4b02a',
  onyx: '#9aa3ad',
  beryllus: '#22b0a8',
}

export function buildPreset(stone: StoneName, mode: ThemeMode): ThemePreset {
  return `${stone}-${mode}`
}

export function splitPreset(preset: ThemePreset): { stone: StoneName; mode: ThemeMode } {
  const [stone, mode] = preset.split('-') as [StoneName, ThemeMode]
  return { stone, mode }
}

const PRESET_KEY = 'kyanite:theme-preset'
const FOLLOW_SYSTEM_KEY = 'kyanite:theme-follow-system'

function resolveSystemMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyPreset(preset: ThemePreset) {
  const { stone, mode } = splitPreset(preset)
  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.setAttribute('data-theme-color', stone)
}

interface ThemeState {
  preset: ThemePreset
  /** quando true, o modo (dark/light) acompanha a preferência do sistema, mantendo a pedra escolhida */
  followSystem: boolean
  setPreset: (preset: ThemePreset) => void
  setFollowSystem: (follow: boolean) => void
}

const initialPreset = (localStorage.getItem(PRESET_KEY) as ThemePreset | null) ?? 'kyanite-dark'
const initialFollowSystem = localStorage.getItem(FOLLOW_SYSTEM_KEY) === 'true'

const startPreset = initialFollowSystem
  ? buildPreset(splitPreset(initialPreset).stone, resolveSystemMode())
  : initialPreset
applyPreset(startPreset)

export const useThemeStore = create<ThemeState>((set, get) => ({
  preset: startPreset,
  followSystem: initialFollowSystem,
  setPreset: (preset) => {
    localStorage.setItem(PRESET_KEY, preset)
    applyPreset(preset)
    set({ preset })
  },
  setFollowSystem: (follow) => {
    localStorage.setItem(FOLLOW_SYSTEM_KEY, String(follow))
    if (follow) {
      const { stone } = splitPreset(get().preset)
      const preset = buildPreset(stone, resolveSystemMode())
      applyPreset(preset)
      set({ followSystem: follow, preset })
    } else {
      set({ followSystem: follow })
    }
  },
}))

// se "seguir sistema" estiver ativo, atualiza o modo automaticamente ao mudar a preferência do OS
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (!useThemeStore.getState().followSystem) return
  const { stone } = splitPreset(useThemeStore.getState().preset)
  const preset = buildPreset(stone, resolveSystemMode())
  applyPreset(preset)
  useThemeStore.setState({ preset })
})
