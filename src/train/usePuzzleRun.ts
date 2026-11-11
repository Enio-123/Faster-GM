// Execução de um problema no tabuleiro: o adversário abre, você responde, o app confere.
// Nos problemas de mate, um lance diferente do gabarito vale se o motor confirmar que ele
// ainda força mate no mesmo número de lances (ou menos). A partir daí a defesa é do motor.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Arrow } from '../board/Board'
import type { MoveIntent } from '../board/useBoard'
import { getAnalysisEngine } from '../engine/engine'
import { uciToMove, type Puzzle } from '../lib/puzzles'
import { playSound, soundForSan } from '../lib/sound'

export type RunPhase = 'opening' | 'play' | 'reply' | 'checking' | 'solved' | 'failed'

export interface RunEntry { san: string; me: boolean; ok?: boolean }

/** Um erro guardado para a revisão no fim da rodada. */
export interface Miss {
  key: string
  puzzle: Puzzle
  /** Posição antes do erro (vez de quem resolve). */
  fen: string
  /** Seu lance, em UCI e SAN. */
  played: string
  playedSan: string
  /** Lance do gabarito; null quando o motor já tinha assumido a defesa (outro caminho de mate). */
  expected: string | null
  /** Resto da solução a partir de `fen`, começando pelo lance certo (vazio quando expected é null). */
  line: string[]
  /** Lances de quem resolve que ainda faltavam, contando o do erro. */
  remaining: number
  /** Lances já jogados neste problema antes do erro (SAN). */
  before: string[]
}

export interface RunOptions {
  /** false: no erro, não mostra o lance certo (a explicação fica para o fim). Padrão: true. */
  reveal?: boolean
}

export interface RunView {
  fen: string
  lastMove: { from: string; to: string } | null
  phase: RunPhase
  done: number
  marks: Record<string, 'good' | 'bad' | 'hint'>
  arrows: Arrow[]
  failedOnce: boolean
  startedAt: number
  endedAt: number | null
  history: RunEntry[]
  showing: boolean
}

const GOOD = '#3cc47c'

function initial(p: Puzzle): RunView {
  return { fen: p.fen, lastMove: null, phase: 'opening', done: 0, marks: {}, arrows: [], failedOnce: false, startedAt: 0, endedAt: null, history: [], showing: false }
}

export function usePuzzleRun(puzzle: Puzzle | null, onResolved?: (ok: boolean, ms: number, miss?: Miss) => void, opts: RunOptions = {}) {
  const [view, setView] = useState<RunView | null>(puzzle ? initial(puzzle) : null)
  const ply = useRef(1)
  const offline = useRef(false)
  const resolved = useRef(false)
  const timers = useRef<number[]>([])
  const viewRef = useRef(view)
  viewRef.current = view
  const cb = useRef(onResolved)
  cb.current = onResolved
  const reveal = useRef(opts.reveal !== false)
  reveal.current = opts.reveal !== false
  const token = useRef(0)

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms)
    timers.current.push(t)
  }
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  const startFrom = useCallback((p: Puzzle, failedOnce: boolean) => {
    clearTimers()
    token.current++
    ply.current = 1
    offline.current = false
    setView({ ...initial(p), failedOnce })
    later(() => {
      const c = new Chess(p.fen)
      const m = c.move(uciToMove(p.moves[0]))
      soundForSan(m.san)
      setView((v) => (v ? { ...v, fen: c.fen(), lastMove: { from: m.from, to: m.to }, phase: 'play', startedAt: Date.now(), history: [{ san: m.san, me: false }] } : v))
    }, 550)
  }, [])

  useEffect(() => {
    if (!puzzle) {
      setView(null)
      return
    }
    resolved.current = false
    startFrom(puzzle, false)
    return clearTimers
  }, [puzzle, startFrom])

  const resolve = (ok: boolean, miss?: Miss) => {
    if (resolved.current) return
    resolved.current = true
    const v = viewRef.current
    const ms = v ? Date.now() - v.startedAt : 0
    cb.current?.(ok, ms, miss)
  }

  const finishSolved = () => {
    playSound('success')
    setView((v) => (v ? { ...v, phase: 'solved', endedAt: Date.now() } : v))
    const v = viewRef.current
    if (!v?.failedOnce) resolve(true)
  }

  const opponentReply = (fen: string, uci: string) => {
    const tk = token.current
    later(() => {
      if (tk !== token.current) return
      const c = new Chess(fen)
      let m
      try {
        m = c.move(uciToMove(uci))
      } catch {
        return
      }
      soundForSan(m.san)
      setView((v) => (v ? { ...v, fen: c.fen(), lastMove: { from: m.from, to: m.to }, phase: 'play', history: [...v.history, { san: m.san, me: false }] } : v))
    }, 320)
  }

  const fail = (prev: RunView, wrong: { from: string; to: string; san: string; uci: string }) => {
    playSound('error')
    const prevFen = prev.fen
    const tk = token.current
    const expected = !offline.current && puzzle ? puzzle.moves[ply.current] ?? null : null
    const miss: Miss | undefined = puzzle
      ? {
          key: `${puzzle.id}:${ply.current}:${Date.now()}`,
          puzzle,
          fen: prevFen,
          played: wrong.uci,
          playedSan: wrong.san,
          expected,
          line: expected ? puzzle.moves.slice(ply.current) : [],
          remaining: puzzle.length - prev.done,
          before: prev.history.map((h) => h.san),
        }
      : undefined
    setView((v) =>
      v
        ? {
            ...v,
            phase: 'failed',
            marks: { [wrong.from]: 'bad', [wrong.to]: 'bad' },
            history: [...v.history, { san: wrong.san, me: true, ok: false }],
            failedOnce: true,
            endedAt: Date.now(),
          }
        : v,
    )
    resolve(false, miss)
    // Nos modos com revisão no fim, o lance errado fica marcado até o próximo problema.
    if (!reveal.current) return
    // Volta a posição e aponta o lance certo.
    later(() => {
      if (tk !== token.current) return
      const correct = !offline.current && puzzle ? puzzle.moves[ply.current] : null
      if (correct) {
        setView((v) => (v ? { ...v, fen: prevFen, marks: {}, arrows: [{ from: correct.slice(0, 2), to: correct.slice(2, 4), color: GOOD }] } : v))
      } else {
        setView((v) => (v ? { ...v, fen: prevFen, marks: {} } : v))
        getAnalysisEngine()
          .analyze(prevFen, { depth: 16 })
          .result.then((r) => {
            if (tk !== token.current || !r.bestmove) return
            const b = r.bestmove
            setView((v) => (v ? { ...v, arrows: [{ from: b.slice(0, 2), to: b.slice(2, 4), color: GOOD }] } : v))
          })
      }
    }, 650)
  }

  const onMove = useCallback(
    (m: MoveIntent): boolean => {
      const v = viewRef.current
      if (!v || !puzzle || v.phase !== 'play') return false
      const c = new Chess(v.fen)
      let mv
      try {
        mv = c.move({ from: m.from, to: m.to, promotion: m.promotion })
      } catch {
        return false
      }
      const uci = mv.from + mv.to + (mv.promotion ?? '')
      const expected = offline.current ? null : puzzle.moves[ply.current]
      const remainingAfter = puzzle.length - (v.done + 1)
      soundForSan(mv.san)
      const accept = (reply: string | null) => {
        setView((x) =>
          x
            ? { ...x, fen: c.fen(), lastMove: { from: mv.from, to: mv.to }, done: x.done + 1, arrows: [], marks: {}, phase: 'play', history: [...x.history, { san: mv.san, me: true, ok: true }] }
            : x,
        )
        if (c.isCheckmate() || (!offline.current && ply.current >= puzzle.moves.length) || remainingAfter <= 0) {
          finishSolved()
          return
        }
        if (reply) {
          setView((x) => (x ? { ...x, phase: 'reply' } : x))
          opponentReply(c.fen(), reply)
        }
      }

      if (c.isCheckmate()) {
        accept(null)
        return true
      }
      if (uci === expected) {
        const reply = puzzle.moves[ply.current + 1] ?? null
        ply.current += 2
        accept(reply)
        return true
      }
      if (!puzzle.mate || remainingAfter <= 0) {
        // Lance diferente do gabarito: mostra o lance errado e conta como erro.
        setView((x) => (x ? { ...x, fen: c.fen(), lastMove: { from: mv.from, to: mv.to } } : x))
        fail(v, { from: mv.from, to: mv.to, san: mv.san, uci })
        return true
      }
      // Mate por outro caminho? O motor confere.
      const tk = token.current
      setView((x) => (x ? { ...x, fen: c.fen(), lastMove: { from: mv.from, to: mv.to }, phase: 'checking' } : x))
      getAnalysisEngine()
        .analyze(c.fen(), { depth: Math.min(26, 2 * remainingAfter + 8) })
        .result.then((r) => {
          if (tk !== token.current) return
          const top = r.lines[0]
          const ok = !r.cancelled && top && top.score.kind === 'mate' && top.score.winner === puzzle.color && top.score.moves <= remainingAfter
          if (ok && r.bestmove) {
            offline.current = true
            accept(r.bestmove)
          } else {
            fail(v, { from: mv.from, to: mv.to, san: mv.san, uci })
          }
        })
      return true
    },
    [puzzle],
  )

  /** Recomeça o mesmo problema (não conta para o rating). */
  const retry = useCallback(() => {
    if (puzzle) startFrom(puzzle, true)
  }, [puzzle, startFrom])

  /** Mostra o resto da solução lance a lance. */
  const showSolution = useCallback(() => {
    const v = viewRef.current
    if (!v || !puzzle) return
    const tk = ++token.current
    clearTimers()
    setView((x) => (x ? { ...x, showing: true, arrows: [], marks: {}, phase: 'failed' } : x))
    const play = (fen: string, line: string[]) => {
      let cur = fen
      line.forEach((u, i) => {
        later(() => {
          if (tk !== token.current) return
          const c = new Chess(cur)
          let m
          try {
            m = c.move(uciToMove(u))
          } catch {
            return
          }
          cur = c.fen()
          soundForSan(m.san)
          const mine = c.turn() !== puzzle.color
          setView((x) => (x ? { ...x, fen: cur, lastMove: { from: m.from, to: m.to }, history: [...x.history, { san: m.san, me: mine, ok: mine ? true : undefined }] } : x))
        }, 500 + i * 700)
      })
    }
    if (!offline.current) {
      play(v.fen, puzzle.moves.slice(ply.current))
    } else {
      getAnalysisEngine()
        .analyze(v.fen, { depth: 18 })
        .result.then((r) => {
          if (tk !== token.current) return
          const pv = r.lines[0]?.pv ?? []
          play(v.fen, pv.slice(0, 2 * (puzzle.length - v.done) - 1))
        })
    }
  }, [puzzle])

  return { view, onMove, retry, showSolution }
}
