import { useMemo } from 'react'
import { Chess } from 'chess.js'
import type { BoardInteraction } from './useBoard'

export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'

/** Tabuleiro que só responde a cliques em casas (exercícios sem lances). */
export function usePickBoard(onPick: (sq: string) => void): BoardInteraction {
  return useMemo(() => {
    let chess: Chess
    try {
      chess = new Chess(EMPTY_FEN, { skipValidation: true })
    } catch {
      chess = new Chess()
    }
    return {
      chess,
      selected: null,
      targets: [],
      onSquare: onPick,
      onDrop: (_from: string, to: string) => onPick(to),
      pendingPromotion: null,
      choosePromotion: () => {},
      invalid: null,
      checkSquare: null,
      canPick: () => false,
    }
  }, [onPick])
}
