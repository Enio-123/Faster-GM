import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { playSound } from '../lib/sound'

export type Color = 'w' | 'b'
export interface MoveIntent { from: string; to: string; promotion?: string }

export interface BoardOptions {
  /** Posição usada para as regras (no cálculo às cegas, a posição imaginada). */
  fen: string
  interactive: boolean
  /** Cor que o usuário controla. */
  color: Color
  autoQueen: boolean
  onMove: (m: MoveIntent) => boolean
  /** Pré-lance: fora da vez, permite marcar um lance que sai assim que chegar a vez. */
  allowPremove?: boolean
  onPremove?: (m: MoveIntent | null) => void
  /** Às cegas: clicar numa casa sem peça sua pisca em vermelho, como um "lance ilegal". */
  flagEmpty?: boolean
}

/** Seleção, arrastar e soltar, promoção e pré-lance. As regras vêm sempre do chess.js. */
export function useBoard({ fen, interactive, color, autoQueen, onMove, allowPremove, onPremove, flagEmpty }: BoardOptions) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string; color: Color } | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)

  const chess = useMemo(() => {
    try {
      return new Chess(fen)
    } catch {
      try {
        return new Chess(fen, { skipValidation: true })
      } catch {
        return new Chess()
      }
    }
  }, [fen])

  const myTurn = chess.turn() === color
  const premoveMode = !!allowPremove && interactive && !myTurn

  useEffect(() => {
    setSelected((sel) => {
      if (!sel) return null
      // No pré-lance, mantém a peça selecionada enquanto ela continuar lá.
      const p = chess.get(sel as Square)
      return p && p.color === color && !myTurn ? sel : null
    })
    setPendingPromotion(null)
  }, [fen, chess, color, myTurn])

  const canPick = useCallback(
    (c: Color) => interactive && c === color && (chess.turn() === color || premoveMode),
    [interactive, color, chess, premoveMode],
  )

  const targets = useMemo(() => {
    if (!selected || !myTurn) return [] as { to: string; capture: boolean }[]
    return chess.moves({ square: selected as Square, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured || m.flags.includes('e') }))
  }, [selected, chess, myTurn])

  const flashInvalid = (sq: string) => {
    setInvalid(sq)
    playSound('error')
    window.setTimeout(() => setInvalid((v) => (v === sq ? null : v)), 450)
  }

  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      if (premoveMode) {
        const piece = chess.get(from as Square)
        const promo = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined
        setSelected(null)
        onPremove?.({ from, to, promotion: promo })
        return true
      }
      const moves = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to)
      if (moves.length === 0) return false
      if (moves.some((m) => m.promotion)) {
        if (autoQueen) {
          setSelected(null)
          return onMove({ from, to, promotion: 'q' })
        }
        setPendingPromotion({ from, to, color: chess.turn() as Color })
        return true
      }
      setSelected(null)
      return onMove({ from, to })
    },
    [chess, autoQueen, onMove, premoveMode, onPremove],
  )

  const onSquare = useCallback(
    (sq: string) => {
      if (pendingPromotion) return
      const piece = chess.get(sq as Square)
      if (selected) {
        if (selected === sq) {
          setSelected(null)
          return
        }
        if (piece && piece.color === color && canPick(piece.color)) {
          setSelected(sq)
          return
        }
        if (!tryMove(selected, sq)) {
          flashInvalid(sq)
          setSelected(null)
        }
        return
      }
      if (piece && canPick(piece.color)) setSelected(sq)
      else if (premoveMode) onPremove?.(null)
      else if (flagEmpty && interactive && myTurn) flashInvalid(sq)
    },
    [chess, selected, pendingPromotion, canPick, tryMove, color, premoveMode, onPremove, flagEmpty, interactive, myTurn],
  )

  const onDrop = useCallback(
    (from: string, to: string) => {
      if (from === to) {
        setSelected(from)
        return
      }
      const piece = chess.get(from as Square)
      if (!piece || !canPick(piece.color)) return
      if (!tryMove(from, to)) {
        flashInvalid(to)
        setSelected(null)
      }
    },
    [chess, canPick, tryMove],
  )

  const choosePromotion = (p: string | null) => {
    const pend = pendingPromotion
    setPendingPromotion(null)
    setSelected(null)
    if (pend && p) onMove({ from: pend.from, to: pend.to, promotion: p })
  }

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null
    for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === chess.turn()) return p.square
    return null
  }, [chess])

  return { chess, selected, targets, onSquare, onDrop, pendingPromotion, choosePromotion, invalid, checkSquare, canPick }
}

export type BoardInteraction = ReturnType<typeof useBoard>
