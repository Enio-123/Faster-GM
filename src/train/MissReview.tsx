// Revisão no fim da rodada: cada erro com o seu lance, o lance certo e o porquê.
// O motor analisa um erro por vez (o que está na tela primeiro); enquanto isso, a parte
// que vem das regras já aparece.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, type Arrow } from '../board/Board'
import { useBoard } from '../board/useBoard'
import { getAnalysisEngine } from '../engine/engine'
import type { Score } from '../engine/score'
import { explain, VERDICT_LABEL, type Tagged, type Verdict } from '../lib/explain'
import { numberedLine, uciToMove } from '../lib/puzzles'
import { soundForSan } from '../lib/sound'
import { useSettings } from '../lib/state'
import { IconArrowLeft, IconArrowRight } from '../ui/icons'
import type { Miss } from './usePuzzleRun'

const RED = '#f0524f'
const GREEN = '#3cc47c'

interface MissAnalysis {
  bestLine: string[]
  played: { score: Score; pv: string[] } | null
  best: { score: Score } | null
  failed: boolean
}

function after(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen)
    c.move(uciToMove(uci))
    return c.fen()
  } catch {
    return null
  }
}

async function analyzeMiss(m: Miss, track: (cancel: () => void) => void): Promise<MissAnalysis> {
  const eng = getAnalysisEngine()
  const run = async (fen: string, movetime: number) => {
    const job = eng.analyze(fen, { movetime })
    track(job.cancel)
    const r = await job.result
    return r.cancelled || !r.lines.length ? null : r
  }
  let failed = false
  let bestLine = m.line
  // Sem gabarito (o motor já tinha assumido a defesa): o motor acha o lance certo.
  if (!bestLine.length) {
    const r = await run(m.fen, 1500)
    if (r?.lines[0]?.pv.length) bestLine = r.lines[0].pv.slice(0, Math.max(1, 2 * m.remaining - 1))
    else failed = true
  }
  let played: MissAnalysis['played'] = null
  const ap = after(m.fen, m.played)
  if (ap && !new Chess(ap).isGameOver()) {
    const r = await run(ap, 1000)
    if (r) {
      // Quando o adversário dá mate, a linha vai até o mate; senão, só o começo da refutação.
      const sc = r.lines[0].score
      const plies = sc.kind === 'mate' && sc.winner !== m.puzzle.color ? 2 * sc.moves - 1 : 4
      played = { score: sc, pv: r.lines[0].pv.slice(0, Math.max(1, Math.min(12, plies))) }
    }
    else failed = true
  }
  let best: MissAnalysis['best'] = null
  if (!m.puzzle.mate && bestLine.length) {
    const bp = after(m.fen, bestLine[0])
    if (bp) {
      const c = new Chess(bp)
      if (c.isCheckmate()) best = { score: { kind: 'mate', winner: m.puzzle.color, moves: 0 } }
      else if (!c.isGameOver()) {
        const r = await run(bp, 800)
        if (r) best = { score: r.lines[0].score }
        else failed = true
      }
    }
  }
  return { bestLine, played, best, failed }
}

/** Analisa os erros em fila, um de cada vez, sempre começando pelo que está na tela. */
function useMissAnalysis(misses: Miss[], current: number): Map<string, MissAnalysis> {
  const [done, setDone] = useState<Map<string, MissAnalysis>>(() => new Map())
  const cur = useRef(current)
  cur.current = current
  useEffect(() => {
    let alive = true
    const cancels: (() => void)[] = []
    const results = new Map<string, MissAnalysis>()
    setDone(new Map())
    void (async () => {
      const pending = new Set(misses.map((m) => m.key))
      while (alive && pending.size) {
        const now = misses[cur.current]
        const m = now && pending.has(now.key) ? now : misses.find((x) => pending.has(x.key))!
        pending.delete(m.key)
        const a = await analyzeMiss(m, (c) => cancels.push(c))
        if (!alive) return
        results.set(m.key, a)
        setDone(new Map(results))
      }
    })()
    return () => {
      alive = false
      cancels.forEach((c) => c())
    }
  }, [misses])
  return done
}

const VERDICT_PILL: Record<Verdict, string> = {
  grave: 'pill-bad',
  erro: 'pill-bad',
  imprecisao: 'pill-accent',
  semMate: 'pill-accent',
  lento: 'pill-accent',
  bom: 'pill-good',
}

function LineNotes({ fen, line, step, me, onPick }: { fen: string; line: Tagged[]; step: number; me: 'w' | 'b'; onPick: (k: number) => void }) {
  const nums = numberedLine(fen, line.map((t) => t.san))
  return (
    <ol className="line-notes">
      {line.map((t, k) => (
        <li key={k}>
          <button type="button" aria-current={step === k + 1 ? 'true' : undefined} onClick={() => onPick(k + 1)} className={t.color === me ? 'me' : ''}>
            <span className="mn num">{nums[k]?.n}</span>
            <span className="san">{t.san}</span>
            <span className="tags">{t.tags.join(', ')}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

export function MissReview({ misses, title = 'Erros explicados' }: { misses: Miss[]; title?: string }) {
  const settings = useSettings()
  const [i, setI] = useState(0)
  const [mode, setMode] = useState<'certo' | 'seu'>('certo')
  const [step, setStep] = useState(0)
  const analyses = useMissAnalysis(misses, i)
  const m = misses[Math.min(i, misses.length - 1)]
  const a = m ? analyses.get(m.key) : undefined
  const me = m?.puzzle.color ?? 'w'

  const ex = useMemo(
    () =>
      m
        ? explain({ fen: m.fen, me: m.puzzle.color, mate: m.puzzle.mate, remaining: m.remaining, played: m.played, best: a?.bestLine ?? m.line }, a ? { played: a.played, best: a.best } : null)
        : null,
    [m, a],
  )

  useEffect(() => {
    setStep(0)
  }, [i, mode])

  const line = ex ? (mode === 'certo' ? ex.bestLine : ex.playedLine) : []
  const last = line.length
  const shown = step === 0 || !line[step - 1] ? null : line[step - 1]
  const fen = shown?.fen ?? m?.fen ?? ''

  const go = (k: number) => {
    const next = Math.max(0, Math.min(last, k))
    if (next > step && line[next - 1]) soundForSan(line[next - 1].san)
    setStep(next)
  }

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowRight') go(step + 1)
      else if (e.key === 'ArrowLeft') go(step - 1)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  const ix = useBoard({ fen, interactive: false, color: me, autoQueen: settings.autoQueen, onMove: () => false })
  if (!m || !ex) return null

  const arrows: Arrow[] = []
  if (step === 0) {
    const p = ex.playedLine[0]
    const b = ex.bestLine[0]
    if (p) arrows.push({ from: p.from, to: p.to, color: RED })
    if (b && b.uci !== p?.uci) arrows.push({ from: b.from, to: b.to, color: GREEN })
  }
  const pending = !a
  const who = me === 'w' ? 'Brancas jogam' : 'Pretas jogam'
  const before = m.before.length > 1 ? numberedLine(m.puzzle.fen, m.before) : []

  return (
    <section className="stack-lg" aria-label={title}>
      <div className="row-between">
        <h2>{title}</h2>
        {misses.length > 1 && (
          <div className="seg" role="group" aria-label="Escolher erro">
            {misses.map((x, k) => (
              <button key={x.key} type="button" aria-pressed={k === i} onClick={() => setI(k)}>
                {k + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="train">
        <div className="train-board">
          <div className="board-frame">
            <Board fen={fen} orientation={me} ix={ix} lastMove={shown ? { from: shown.from, to: shown.to } : null} arrows={arrows} />
          </div>
          <div className="row-between">
            <div className="seg" role="group" aria-label="Linha no tabuleiro">
              <button type="button" aria-pressed={mode === 'certo'} onClick={() => setMode('certo')}>
                Linha certa
              </button>
              <button type="button" aria-pressed={mode === 'seu'} onClick={() => setMode('seu')}>
                Seu lance
              </button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-sm" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Lance anterior">
                <IconArrowLeft />
              </button>
              <span className="num muted" style={{ minWidth: 44, textAlign: 'center', fontSize: 14 }}>
                {step}/{last}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => go(step + 1)} disabled={step >= last} aria-label="Próximo lance">
                <IconArrowRight />
              </button>
            </div>
          </div>
        </div>

        <aside className="train-side">
          <div className="row-between">
            <span className="eyebrow">
              Erro {i + 1} de {misses.length}
            </span>
            {ex.verdict && <span className={`pill ${VERDICT_PILL[ex.verdict]}`}>{VERDICT_LABEL[ex.verdict]}</span>}
          </div>
          <p className="muted" style={{ fontSize: 14 }}>
            {who} · {m.puzzle.mate ? `mate em ${m.puzzle.length}` : `linha de ${m.puzzle.length} ${m.puzzle.length === 1 ? 'lance' : 'lances'}`} · problema {m.puzzle.rating}
          </p>
          <p className="miss-head">
            Você jogou <b className="bad">{ex.playedSan}</b>.{' '}
            {ex.bestSan ? (
              <>
                O certo era <b className="good">{ex.bestSan}</b>.
              </>
            ) : pending ? (
              'Procurando o lance certo com o motor...'
            ) : (
              'O motor não achou o lance certo a tempo.'
            )}
          </p>
          {before.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Antes do erro: {before.map((x) => `${x.n ? x.n + ' ' : ''}${x.san}`).join(' ')}
            </p>
          )}
          {ex.bestSan && (
            <div className="miss-sec">
              <h4>Por que {ex.bestSan}</h4>
              {ex.why.length ? (
                <ul>
                  {ex.why.map((w, k) => (
                    <li key={k}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{pending ? 'O motor está avaliando a linha...' : 'Siga a linha certa no tabuleiro.'}</p>
              )}
            </div>
          )}
          <div className="miss-sec">
            <h4>Por que não {ex.playedSan}</h4>
            {ex.whyNot.length ? (
              <ul>
                {ex.whyNot.map((w, k) => (
                  <li key={k}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">{pending ? 'O motor está analisando o seu lance...' : 'O motor não respondeu. Veja a linha certa no tabuleiro.'}</p>
            )}
          </div>
          {line.length > 0 && (
            <div className="miss-sec">
              <h4>{mode === 'certo' ? 'Linha certa' : 'Seu lance e a melhor resposta'}</h4>
              <LineNotes fen={m.fen} line={line} step={step} me={me} onPick={go} />
            </div>
          )}
          {misses.length > 1 && (
            <div className="row">
              <button type="button" className="btn" onClick={() => setI(i - 1)} disabled={i === 0}>
                <IconArrowLeft /> Anterior
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)} disabled={i >= misses.length - 1}>
                Próximo erro <IconArrowRight />
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
