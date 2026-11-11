import type { BoardThemeId } from '../lib/state'

export interface BoardTheme { id: BoardThemeId; name: string; light: string; dark: string }

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'aco', name: 'Aço', light: '#e3e0d6', dark: '#7f92a3' },
  { id: 'torneio', name: 'Torneio', light: '#ebecd0', dark: '#739552' },
  { id: 'madeira', name: 'Madeira', light: '#f0d9b5', dark: '#b58863' },
]

export function getTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0]
}
