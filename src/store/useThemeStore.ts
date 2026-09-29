import { create } from 'zustand'

export type Theme = 'dark' | 'light' | 'system'

const THEME_KEY = 'kyanite:theme'

function resolveSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? resolveSystemTheme() : theme
  document.documentElement.setAttribute('data-theme', resolved)
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialTheme = (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'dark'
applyTheme(initialTheme)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
}))

// mantém o tema em dia se o usuário mudar a preferência do OS enquanto "system" está ativo
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (useThemeStore.getState().theme === 'system') applyTheme('system')
})
