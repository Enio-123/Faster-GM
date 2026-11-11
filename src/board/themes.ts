import type { BoardThemeId } from '../lib/state'
import marfim from '../assets/board/marfim.webp'
import pauRosa from '../assets/board/pau-rosa.webp'

export interface BoardTheme {
  id: BoardThemeId
  name: string
  light: string
  dark: string
  /** Textura das casas (madeira). A cor fica por baixo enquanto a imagem carrega. */
  lightTex?: string
  darkTex?: string
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'madeira', name: 'Madeira', light: '#e9d1ab', dark: '#86442b', lightTex: marfim, darkTex: pauRosa },
  { id: 'aco', name: 'Aço', light: '#e3e0d6', dark: '#7f92a3' },
  { id: 'torneio', name: 'Torneio', light: '#ebecd0', dark: '#739552' },
]

export function getTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0]
}

/** Fundo de uma casa. Na madeira, cada casa mostra um pedaço diferente do veio. */
export function squareBackground(t: BoardTheme, light: boolean, file: number, rank: number): string {
  const color = light ? t.light : t.dark
  const tex = light ? t.lightTex : t.darkTex
  if (!tex) return color
  const x = ((file * 37 + rank * 17) % 11) * 10
  const y = ((file * 13 + rank * 29) % 11) * 10
  return `${color} url(${tex}) ${x}% ${y}% / 300% 300% no-repeat`
}

/** Amostra pequena (botões de escolha do tabuleiro). */
export function swatchBackground(t: BoardTheme, light: boolean): string {
  const color = light ? t.light : t.dark
  const tex = light ? t.lightTex : t.darkTex
  return tex ? `${color} url(${tex}) center / 400% 400%` : color
}
