import { useThemeStore, splitPreset, STONE_ACCENT, type StoneName } from '../store/useThemeStore'

interface AppLogoProps {
  size?: number
  /** força a cor de uma pedra específica, ignorando o tema ativo (usado em previews) */
  stone?: StoneName
}

/** Logo em forma de cristal, colorido dinamicamente com o accent da pedra/tema ativo */
export function AppLogo({ size = 20, stone: forcedStone }: AppLogoProps) {
  const preset = useThemeStore((s) => s.preset)
  const { stone: activeStone } = splitPreset(preset)
  const color = STONE_ACCENT[forcedStone ?? activeStone]

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <polygon points="16,2 27,12 22,30 10,30 5,12" fill={color} />
      <polygon points="16,2 27,12 16,16" fill={color} opacity="0.55" />
      <polygon points="5,12 16,16 10,30" fill={color} opacity="0.35" />
    </svg>
  )
}
