import { create } from 'zustand'
import { isTauri } from '@tauri-apps/api/core'

export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 24
export const FONT_SIZE_DEFAULT = 15

export type IconSize = 'small' | 'normal' | 'large' | 'xlarge'
export const ICON_SIZES: IconSize[] = ['small', 'normal', 'large', 'xlarge']
const ICON_SCALE: Record<IconSize, number> = { small: 0.85, normal: 1, large: 1.2, xlarge: 1.4 }

/** níveis de zoom da interface (mesma escala usada pelos navegadores com Ctrl +/-) */
export const ZOOM_LEVELS = [0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
export const ZOOM_DEFAULT = 1

const FONT_SIZE_KEY = 'kyanite:font-size'
const ICON_SIZE_KEY = 'kyanite:icon-size'
const ZOOM_KEY = 'kyanite:ui-zoom'

function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return FONT_SIZE_DEFAULT
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)))
}

/** aproxima para o nível de zoom válido mais próximo */
function snapZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT
  return ZOOM_LEVELS.reduce((best, z) => (Math.abs(z - value) < Math.abs(best - value) ? z : best))
}

// as variáveis ficam no :root, então editor, live preview e preview reagem sem re-render
function applyFontSize(size: number) {
  document.documentElement.style.setProperty('--note-font-size', `${size}px`)
}

function applyIconSize(size: IconSize) {
  document.documentElement.style.setProperty('--icon-scale', String(ICON_SCALE[size]))
}

/** Desktop (Tauri): zoom nativo do webview, idêntico ao Ctrl +/- de um navegador.
 * Web: CSS `zoom` no #root (ver index.css), já que a página não controla o zoom do navegador. */
function applyZoom(zoom: number) {
  if (isTauri()) {
    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(zoom))
      .catch(() => {
        // sem permissão/sem suporte: cai para o zoom via CSS
        document.documentElement.style.setProperty('--ui-zoom', String(zoom))
      })
  } else {
    document.documentElement.style.setProperty('--ui-zoom', String(zoom))
  }
}

interface AppearanceState {
  fontSize: number
  iconSize: IconSize
  /** zoom da interface inteira; preferência do dispositivo (não sincroniza, depende da tela) */
  zoom: number
  setFontSize: (size: number) => void
  setIconSize: (size: IconSize) => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
}

const storedIcon = localStorage.getItem(ICON_SIZE_KEY) as IconSize | null
const initialFontSize = clampFontSize(Number(localStorage.getItem(FONT_SIZE_KEY) ?? FONT_SIZE_DEFAULT))
const initialIconSize: IconSize = storedIcon && ICON_SIZES.includes(storedIcon) ? storedIcon : 'normal'
const initialZoom = snapZoom(Number(localStorage.getItem(ZOOM_KEY) ?? ZOOM_DEFAULT))
applyFontSize(initialFontSize)
applyIconSize(initialIconSize)
applyZoom(initialZoom)

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  fontSize: initialFontSize,
  iconSize: initialIconSize,
  zoom: initialZoom,
  setFontSize: (size) => {
    const value = clampFontSize(size)
    localStorage.setItem(FONT_SIZE_KEY, String(value))
    applyFontSize(value)
    set({ fontSize: value })
  },
  setIconSize: (size) => {
    localStorage.setItem(ICON_SIZE_KEY, size)
    applyIconSize(size)
    set({ iconSize: size })
  },
  setZoom: (zoom) => {
    const value = snapZoom(zoom)
    localStorage.setItem(ZOOM_KEY, String(value))
    applyZoom(value)
    set({ zoom: value })
  },
  zoomIn: () => {
    const idx = ZOOM_LEVELS.indexOf(get().zoom)
    get().setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, idx + 1)])
  },
  zoomOut: () => {
    const idx = ZOOM_LEVELS.indexOf(get().zoom)
    get().setZoom(ZOOM_LEVELS[Math.max(0, idx - 1)])
  },
}))

// atalhos Ctrl/Cmd + "+", "-", "0" em qualquer lugar do app; no navegador, substituem o zoom
// nativo para o valor ficar salvo e aparecer nas Configurações
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  const store = useAppearanceStore.getState()
  if (e.key === '=' || e.key === '+') store.zoomIn()
  else if (e.key === '-') store.zoomOut()
  else if (e.key === '0') store.setZoom(ZOOM_DEFAULT)
  else return
  e.preventDefault()
})
