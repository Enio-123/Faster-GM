// Partidas de bullet e blitz contra o Tempo (Stockfish com força limitada).
// Relógio com incremento, pré-lance, queda de bandeira e análise automática no fim:
// os erros viram cartões da revisão. Com `blind`, a mesma partida às cegas: peças invisíveis,
// lances do Tempo falados e escritos, lance digitado, espiada contada e cadências mais lentas.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, type Arrow } from '../board/Board'
import { useBoard, type MoveIntent } from '../board/useBoard'
import { Coach, COACH_NAME, type Mood } from '../coach/Coach'
import { getAnalysisEngine, getBotEngine, type AnalysisResult } from '../engine/engine'
import type { Score } from '../engine/score'
import { judge, JUDGEMENT_LABEL, winChance, type Judgement } from '../lib/analysis'
import { BLIND_TIME_CONTROLS, BOT_MAX, BOT_MIN, ladderAfter, pickWeighted, recommend, searchFor, thinkTime, TIME_CONTROLS, type TimeControl } from '../lib/bot'
import { sanSpeech, sanWords } from '../lib/blind'
import { flagged, newClock, press, remaining, start as startClock, stop as stopClock, type Clock } from '../lib/clock'
import { line } from '../lib/coach'
import { addCards } from '../lib/progress'
import { firstSchedule } from '../lib/srs'
import { setState, useAppState, useSettings, type GameRecord, type ReviewCard } from '../lib/state'
import { playSound, soundForSan } from '../lib/sound'
import { uciToMove } from '../lib/puzzles'
import { formatClock } from '../lib/time'
import { go, useNow, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconArrowRight, IconEye, IconFlag, IconFlip, IconRetry } from '../ui/icons'
import { MoveInput } from '../train/MoveInput'
import { useVoice } from '../train/useVoice'

type Side = 'w' | 'b'
type ColorPick = 'w' | 'b' | 'random'
/** Ajuda na partida às cegas: tabuleiro vazio com a lista de lances, só o tabuleiro vazio, ou nada. */
export type BlindHelp = 'lista' | 'vazio' | 'nada'
const HELP: { id: BlindHelp; label: string; text: string }[] = [
  { id: 'lista', label: 'Tabuleiro vazio e lances', text: 'Casas sem peças e a lista de lances à vista. O melhor jeito de começar.' },
  { id: 'vazio', label: 'Só o tabuleiro vazio', text: 'Casas sem peças, sem lista de lances: a partida fica só na cabeça.' },
  { id: 'nada', label: 'Sem tabuleiro', text: 'Nada na tela além dos lances anunciados. Você joga digitando, como às cegas de verdade.' },
]
const PEEK_MS = 3000

interface GameState {
  chess: Chess
  clock: Clock
  me: Side
  bot: Side
  elo: number
  tc: TimeControl
  status: 'playing' | 'over'
  result: GameRecord['result'] | null
  reason: string
  premove: MoveIntent | null
  token: number
  id: string
  started: number
  blind: boolean
  help: BlindHelp
  peeks: number
}

interface PlyAnalysis {
  score: Score
  best: string | null
}

const SETUP_KEY = 'faster-gm:play-setup'
const BLIND_SETUP_KEY = 'faster-gm:play-setup-cegas'
const GOOD = '#3cc47c'
const BAD = '#f0524f'

interface Setup {
  tc: string
  color: ColorPick
  elo: number | null
  help: BlindHelp
}

function loadSetup(blind: boolean): Setup {
  const list = blind ? BLIND_TIME_CONTROLS : TIME_CONTROLS
  const base: Setup = { tc: blind ? '15+10' : '3+2', color: 'random', elo: null, help: 'lista' }
  try {
    const v = JSON.parse(localStorage.getItem(blind ? BLIND_SETUP_KEY : SETUP_KEY) ?? '')
    if (v && typeof v.tc === 'string') {
      const out = { ...base, ...v }
      if (!list.some((t) => t.id === out.tc)) out.tc = base.tc
      if (!HELP.some((h) => h.id === out.help)) out.help = 'lista'
      return out
    }
  } catch {
    /* sem armazenamento */
  }
  return base
}

/** Sem peças para dar mate (só rei, ou rei com um cavalo ou um bispo). */
function cannotMate(chess: Chess, side: Side): boolean {
  const pieces = chess.board().flat().filter((p) => p && p.color === side) as { type: string }[]
  const others = pieces.filter((p) => p.type !== 'k')
  if (others.length === 0) return true
  return others.length === 1 && (others[0].type === 'n' || others[0].type === 'b')
}

function scoreAt(fen: string, r: AnalysisResult | null): Score {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { kind: 'mate', winner: c.turn() === 'w' ? 'b' : 'w', moves: 0 }
  if (c.isDraw() || c.isStalemate()) return { kind: 'cp', cp: 0 }
  return r?.lines[0]?.score ?? { kind: 'cp', cp: 0 }
}

function sanOf(fen: string, uci: string | null): string {
  if (!uci) return ''
  try {
    return new Chess(fen).move(uciToMove(uci)).san
  } catch {
    return uci
  }
}

export function Play({ blind = false }: { blind?: boolean } = {}) {
  const s = useAppState()
  const settings = useSettings()
  const voice = useVoice()
  const [screen, setScreen] = useState<'setup' | 'game'>('setup')
  const [setup, setSetup] = useState(() => loadSetup(blind))
  const rec = recommend(s.puzzle.r, s.puzzle.n, s.bot.ladder)
  // Às cegas o nível sugerido começa 300 abaixo do recomendado para as partidas normais.
  const recElo = blind ? Math.max(BOT_MIN, rec.elo - 300) : rec.elo
  const elo = setup.elo ?? recElo
  const tcList = blind ? BLIND_TIME_CONTROLS : TIME_CONTROLS
  const [peekUntil, setPeekUntil] = useState(0)
  const [said, setSaid] = useState<{ me?: string; bot?: string; botSan?: string }>({})
  // O lance do bot é aplicado por uma função criada no primeiro render: a voz vai por referência.
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const g = useRef<GameState | null>(null)
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)
  const [thinking, setThinking] = useState(false)
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [flip, setFlip] = useState(false)
  const [analysis, setAnalysis] = useState<{ done: number; total: number; plies: PlyAnalysis[] } | null>(null)
  const [mood, setMood] = useState<Mood>('idle')
  const [speech, setSpeech] = useState('')
  const lowWarned = useRef(false)
  const botBusy = useRef(false)

  const game = g.current
  useTrainingTimer(blind ? 'calculo' : 'partidas', game?.status === 'playing')

  useEffect(() => {
    try {
      localStorage.setItem(blind ? BLIND_SETUP_KEY : SETUP_KEY, JSON.stringify(setup))
    } catch {
      /* sem armazenamento */
    }
  }, [setup, blind])

  // ---------- Fim de jogo ----------
  const finish = useCallback((result: GameRecord['result'], reason: string) => {
    const gs = g.current
    if (!gs || gs.status !== 'playing') return
    gs.status = 'over'
    gs.result = result
    gs.reason = reason
    gs.premove = null
    gs.clock = stopClock(gs.clock, Date.now())
    gs.token++
    getBotEngine().stopAll()
    setThinking(false)
    playSound('end')
    const myScore: 0 | 0.5 | 1 = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (gs.me === 'w') ? 1 : 0
    setMood(myScore === 1 ? 'sad' : myScore === 0 ? 'happy' : 'idle')
    setSpeech(myScore === 1 ? line('youWin') : myScore === 0 ? line('youLose') : line('draw'))
    const moves = gs.chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
    const record: GameRecord = { id: gs.id, date: gs.started, tc: gs.tc.id, color: gs.me, botElo: gs.elo, result, reason, moves, ...(gs.blind ? { blind: true, peeks: gs.peeks } : {}) }
    // Partida às cegas não mexe no desempenho contra o bot que define o nível das partidas normais.
    const counts = moves.length >= 2 && !gs.blind
    setState((st) => ({
      ...st,
      games: [record, ...st.games].slice(0, 60),
      bot: { ladder: counts ? ladderAfter(st.bot.ladder, myScore, gs.elo, st.bot.games) : st.bot.ladder, games: st.bot.games + (counts ? 1 : 0) },
    }))
    bump()
  }, [])

  const checkEnd = useCallback(
    (gs: GameState) => {
      const c = gs.chess
      if (c.isCheckmate()) finish(c.turn() === 'w' ? '0-1' : '1-0', 'Xeque-mate')
      else if (c.isStalemate()) finish('1/2-1/2', 'Afogamento')
      else if (c.isInsufficientMaterial()) finish('1/2-1/2', 'Material insuficiente')
      else if (c.isThreefoldRepetition()) finish('1/2-1/2', 'Repetição tripla')
      else if (c.isDrawByFiftyMoves()) finish('1/2-1/2', 'Regra dos 50 lances')
    },
    [finish],
  )

  /** Aplica um lance e aperta o relógio de quem jogou. */
  const apply = useCallback(
    (gs: GameState, m: MoveIntent, now: number) => {
      let mv
      try {
        mv = gs.chess.move({ from: m.from, to: m.to, promotion: m.promotion })
      } catch {
        return null
      }
      const ply = gs.chess.history().length
      // O relógio só começa a correr depois do primeiro lance de cada lado (e não existe na partida livre).
      if (gs.tc.base > 0) {
        if (ply === 2) gs.clock = startClock(gs.clock, 'w', now)
        else if (ply > 2) gs.clock = press(gs.clock, mv.color as Side, now)
      }
      soundForSan(mv.san)
      checkEnd(gs)
      return mv
    },
    [checkEnd],
  )

  // ---------- Lance do bot ----------
  const botMove = useCallback(async () => {
    const gs = g.current
    if (!gs || gs.status !== 'playing' || gs.chess.turn() !== gs.bot || botBusy.current) return
    botBusy.current = true
    try {
      await botTurn(gs)
    } finally {
      botBusy.current = false
    }
  }, [])

  const botTurn = async (gs: GameState) => {
    const tk = gs.token
    const fen = gs.chess.fen()
    const ply = gs.chess.history().length
    const started = Date.now()
    setThinking(true)
    setMood('think')
    const left = remaining(gs.clock, gs.bot, started)
    const budget = ply < 2 ? 400 + Math.random() * 600 : gs.tc.base === 0 ? 700 + Math.random() * 1300 : thinkTime(left, gs.tc.inc * 1000, ply)
    const search = searchFor(gs.elo)
    const engine = getBotEngine()
    let uci: string | null = null
    if (search.limitElo) {
      const r = await engine.analyze(fen, { movetime: Math.max(60, budget - 40), limitElo: search.limitElo }).result
      uci = r.bestmove
    } else {
      const r = await engine.analyze(fen, { depth: search.depth, multipv: search.multipv }).result
      uci = pickWeighted(r.lines, gs.bot, search.temperature ?? 100) ?? r.bestmove
    }
    const spent = Date.now() - started
    if (spent < budget) await new Promise((res) => window.setTimeout(res, budget - spent))
    const cur = g.current
    if (!cur || cur.token !== tk || cur.status !== 'playing') return
    setThinking(false)
    setMood('focus')
    if (!uci) {
      // Sem resposta do motor: lance legal qualquer, para o jogo não travar.
      const legal = cur.chess.moves({ verbose: true })
      if (!legal.length) return
      uci = legal[0].from + legal[0].to + (legal[0].promotion ?? '')
    }
    const now = Date.now()
    const played = apply(cur, uciToMove(uci), now)
    if (played && cur.blind) {
      setSaid((x) => ({ ...x, bot: sanWords(played.san), botSan: played.san }))
      voiceRef.current.say(sanSpeech(played.san))
    }
    // Pré-lance guardado: sai na hora, se ainda for legal.
    if (cur.status === 'playing' && cur.premove) {
      const pm = cur.premove
      cur.premove = null
      apply(cur, pm, now)
    }
    bump()
  }

  useEffect(() => {
    const gs = g.current
    if (screen === 'game' && gs && gs.status === 'playing' && gs.chess.turn() === gs.bot && !thinking) void botMove()
  })

  // ---------- Relógio ----------
  const now = useNow(100, screen === 'game' && game?.status === 'playing')
  useEffect(() => {
    const gs = g.current
    if (!gs || gs.status !== 'playing') return
    const side = flagged(gs.clock, now)
    if (side) {
      const opp: Side = side === 'w' ? 'b' : 'w'
      if (cannotMate(gs.chess, opp)) finish('1/2-1/2', 'Tempo esgotado sem material para mate')
      else finish(side === 'w' ? '0-1' : '1-0', 'Tempo esgotado')
      return
    }
    const mine = remaining(gs.clock, gs.me, now)
    if (gs.clock.running === gs.me && mine < 10000 && !lowWarned.current && gs.tc.base > 60) {
      lowWarned.current = true
      playSound('low')
    }
  }, [now, finish])

  // ---------- Início ----------
  const startGame = () => {
    const tc = tcList.find((t) => t.id === setup.tc) ?? tcList[blind ? 1 : 3]
    const me: Side = setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color
    g.current = {
      chess: new Chess(),
      clock: newClock(tc.base * 1000, tc.inc * 1000),
      me,
      bot: me === 'w' ? 'b' : 'w',
      elo,
      tc,
      status: 'playing',
      result: null,
      reason: '',
      premove: null,
      token: (g.current?.token ?? 0) + 1,
      id: Date.now().toString(36),
      started: Date.now(),
      blind,
      help: setup.help,
      peeks: 0,
    }
    setPeekUntil(0)
    setSaid({})
    lowWarned.current = false
    analysisToken.current++
    getAnalysisEngine().stopAll()
    getBotEngine().newGame()
    setAnalysis(null)
    setViewPly(null)
    setFlip(false)
    setThinking(false)
    setMood('focus')
    setSpeech(line(blind ? 'blindGame' : 'gameStart'))
    setScreen('game')
    playSound('start')
    bump()
  }

  const onMove = useCallback(
    (m: MoveIntent) => {
      const gs = g.current
      if (!gs || gs.status !== 'playing' || gs.chess.turn() !== gs.me) return false
      const mv = apply(gs, m, Date.now())
      if (mv && gs.blind) setSaid((x) => ({ ...x, me: sanWords(mv.san) }))
      bump()
      return !!mv
    },
    [apply],
  )

  const peek = () => {
    const gs = g.current
    if (!gs || gs.status !== 'playing') return
    gs.peeks++
    setPeekUntil(Date.now() + PEEK_MS)
    bump()
  }
  const onPremove = useCallback((m: MoveIntent | null) => {
    const gs = g.current
    if (!gs || gs.status !== 'playing') return
    gs.premove = m
    bump()
  }, [])

  const resign = () => {
    const gs = g.current
    if (!gs || gs.status !== 'playing') return
    finish(gs.me === 'w' ? '0-1' : '1-0', 'Desistência')
  }

  // ---------- Análise depois da partida ----------
  const analysisToken = useRef(0)
  const runAnalysis = useCallback(async () => {
    const gs = g.current
    if (!gs) return
    const tk = ++analysisToken.current
    const hist = gs.chess.history({ verbose: true })
    const fens = [hist.length ? hist[0].before : gs.chess.fen(), ...hist.map((h) => h.after)]
    const plies: PlyAnalysis[] = []
    setAnalysis({ done: 0, total: fens.length, plies: [] })
    const engine = getAnalysisEngine()
    for (let i = 0; i < fens.length; i++) {
      const c = new Chess(fens[i])
      let r: AnalysisResult | null = null
      if (!c.isGameOver()) r = await engine.analyze(fens[i], { nodes: 150000 }).result
      if (tk !== analysisToken.current) return
      plies.push({ score: scoreAt(fens[i], r), best: r?.bestmove ?? null })
      setAnalysis({ done: i + 1, total: fens.length, plies: [...plies] })
    }
    // Erros e erros graves viram cartões de revisão.
    const cards: ReviewCard[] = []
    let blunders = 0
    let mistakes = 0
    let inaccuracies = 0
    hist.forEach((h, i) => {
      if (h.color !== gs.me) return
      const before = winChance(plies[i].score, gs.me)
      const after = winChance(plies[i + 1].score, gs.me)
      const j = judge(before, after)
      if (j === 'blunder') blunders++
      if (j === 'mistake') mistakes++
      if (j === 'inaccuracy') inaccuracies++
      if ((j === 'blunder' || j === 'mistake') && plies[i].best) {
        const moveNo = Math.floor(i / 2) + 1
        cards.push({
          ...firstSchedule(),
          id: `g:${gs.id}:${i}`,
          kind: 'jogo',
          fen: h.before,
          line: [plies[i].best!],
          bestWc: before,
          played: h.from + h.to + (h.promotion ?? ''),
          note: `${JUDGEMENT_LABEL[j]} no lance ${moveNo}${gs.me === 'b' ? '...' : '.'} ${h.san} (partida ${gs.blind ? 'às cegas ' : ''}${gs.tc.id})`,
          created: Date.now(),
        })
      }
    })
    addCards(cards)
    const evals = plies.map((p) => Math.round(winChance(p.score, 'w') * 100))
    setState((st) => ({ ...st, games: st.games.map((x) => (x.id === gs.id ? { ...x, evals, blunders, mistakes, inaccuracies } : x)) }))
  }, [])

  useEffect(() => {
    if (game?.status === 'over' && !analysis && game.chess.history().length >= 2) void runAnalysis()
  }, [game?.status, analysis, runAnalysis, game])

  // ---------- Tabuleiro ----------
  const hist = useMemo(() => (game ? game.chess.history({ verbose: true }) : []), [game, game?.chess.history().length])
  const shownFen = viewPly === null || !game ? game?.chess.fen() ?? new Chess().fen() : viewPly === 0 ? hist[0]?.before ?? game.chess.fen() : hist[viewPly - 1].after
  const last = viewPly === null ? hist[hist.length - 1] : viewPly > 0 ? hist[viewPly - 1] : undefined
  const ix = useBoard({
    fen: shownFen,
    interactive: !!game && game.status === 'playing' && viewPly === null,
    color: game?.me ?? 'w',
    autoQueen: settings.autoQueen,
    onMove,
    allowPremove: settings.premove && !blind,
    onPremove,
    flagEmpty: blind,
  })

  const judgements = useMemo(() => {
    if (!game || !analysis || analysis.done < analysis.total) return [] as { i: number; j: Judgement; san: string; best: string }[]
    const out: { i: number; j: Judgement; san: string; best: string }[] = []
    hist.forEach((h, i) => {
      if (h.color !== game.me) return
      const j = judge(winChance(analysis.plies[i].score, game.me), winChance(analysis.plies[i + 1].score, game.me))
      if (j) out.push({ i, j, san: h.san, best: sanOf(h.before, analysis.plies[i].best) })
    })
    return out
  }, [analysis, hist, game])

  const arrows: Arrow[] = []
  if (game?.status === 'over' && viewPly !== null && viewPly > 0 && analysis && analysis.done >= viewPly) {
    const i = viewPly - 1
    const jd = judgements.find((x) => x.i === i)
    const best = analysis.plies[i]?.best
    if (jd && best) {
      arrows.push({ from: best.slice(0, 2), to: best.slice(2, 4), color: GOOD })
      arrows.push({ from: hist[i].from, to: hist[i].to, color: BAD })
    }
  }

  // ---------- Telas ----------
  if (screen === 'setup' || !game) {
    const tcNow = tcList.find((t) => t.id === setup.tc) ?? tcList[0]
    const recent = s.games.filter((x) => !!x.blind === blind)
    return (
      <div className="page">
        <div className="row">
          {blind && (
            <button className="icon-btn" onClick={() => go('cegas')} aria-label="Voltar para às cegas">
              <IconArrowLeft />
            </button>
          )}
          <h1>{blind ? 'Partida às cegas' : 'Jogar'}</h1>
        </div>
        <div className="grid-2">
          <div className="panel stack-lg">
            <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
              <Coach mood="idle" />
              <div className="stack" style={{ gap: 4 }}>
                <h3>{COACH_NAME}</h3>
                <p className="muted" style={{ fontSize: 14 }}>
                  {blind
                    ? 'As peças ficam invisíveis do começo ao fim. O Tempo fala e escreve os lances dele; você joga clicando nas casas do tabuleiro vazio ou digitando o lance.'
                    : 'O bot do Faster GM. Joga com o Stockfish limitado ao nível que você escolher.'}
                </p>
              </div>
            </div>
            <div className="field">
              <span className="label">Cadência</span>
              <div className={`seg seg-grid${blind ? ' seg-grid-2' : ''}`} role="group" aria-label="Cadência">
                {tcList.map((t) => (
                  <button key={t.id} aria-pressed={setup.tc === t.id} onClick={() => setSetup({ ...setup, tc: t.id })}>
                    <span className="num">{t.label}</span> <span className="muted" style={{ fontWeight: 500 }}>{t.kind}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">Suas peças</span>
              <div className="seg" role="group" aria-label="Cor">
                {(
                  [
                    ['w', 'Brancas'],
                    ['random', 'Sorteio'],
                    ['b', 'Pretas'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} aria-pressed={setup.color === id} onClick={() => setSetup({ ...setup, color: id })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="row-between">
                <label htmlFor="bot-level">Nível do {COACH_NAME}</label>
                <span className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28 }}>
                  {elo}
                </span>
              </div>
              <input id="bot-level" type="range" min={BOT_MIN} max={BOT_MAX} step={50} value={elo} onChange={(e) => setSetup({ ...setup, elo: Number(e.target.value) })} />
              <div className="row-between muted" style={{ fontSize: 12 }}>
                <span>{BOT_MIN}</span>
                <span>{BOT_MAX}</span>
              </div>
            </div>
            {blind && (
              <div className="field">
                <span className="label">Ajuda</span>
                <div className="seg" role="group" aria-label="Ajuda">
                  {HELP.map((h) => (
                    <button key={h.id} aria-pressed={setup.help === h.id} onClick={() => setSetup({ ...setup, help: h.id })}>
                      {h.label}
                    </button>
                  ))}
                </div>
                <span className="muted" style={{ fontSize: 13 }}>
                  {HELP.find((h) => h.id === setup.help)?.text}
                </span>
                {voice.available && (
                  <label className="row" style={{ gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={voice.on} onChange={(e) => voice.setOn(e.target.checked)} /> Falar os lances do {COACH_NAME} em voz alta
                  </label>
                )}
              </div>
            )}
            <button className="btn btn-primary btn-lg" onClick={startGame}>
              {blind ? `Jogar às cegas ${tcNow.base ? tcNow.label : 'sem relógio'}` : `Jogar ${setup.tc}`}
            </button>
          </div>
          <div className="panel stack">
            <span className="eyebrow">Nível recomendado</span>
            <div className="row-between">
              <span className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40, lineHeight: 1 }}>
                {recElo}
              </span>
              <button className="btn btn-sm" onClick={() => setSetup({ ...setup, elo: null })} disabled={setup.elo === null}>
                Usar o recomendado
              </button>
            </div>
            {blind && (
              <p className="muted" style={{ fontSize: 14 }}>
                Às cegas o app sugere começar 300 abaixo do nível recomendado para as partidas normais ({rec.elo}). As partidas às cegas não mexem nesse nível.
              </p>
            )}
            <p className="muted" style={{ fontSize: 14 }}>
              {rec.fromPuzzles === null
                ? `Por enquanto vem só do seu desempenho contra o ${COACH_NAME} (${rec.fromGames}). Depois de 10 problemas da escada, metade passa a vir do seu rating de problemas.`
                : `Metade vem do seu rating de problemas (${Math.round(s.puzzle.r)} − 300 = ${rec.fromPuzzles}) e metade do seu desempenho contra o ${COACH_NAME} (${rec.fromGames}).`}
            </p>
            <hr className="divider" />
            <p className="muted" style={{ fontSize: 13 }}>
              A escala segue o UCI_Elo do Stockfish a partir de 1320; abaixo disso o bot escolhe entre os melhores lances com erros calculados. É aproximada e não equivale ao rating do chess.com nem da FIDE.
            </p>
            {recent.length > 0 && (
              <>
                <hr className="divider" />
                <span className="eyebrow">{blind ? 'Últimas partidas às cegas' : 'Últimas partidas'}</span>
                <div className="list">
                  {recent.slice(0, 5).map((x) => {
                    const sc = x.result === '1/2-1/2' ? 'Empate' : (x.result === '1-0') === (x.color === 'w') ? 'Vitória' : 'Derrota'
                    return (
                      <div key={x.id} className="list-row" style={{ padding: '10px 0' }}>
                        <span className={`pill ${sc === 'Vitória' ? 'pill-good' : sc === 'Derrota' ? 'pill-bad' : ''}`}>{sc}</span>
                        <div className="grow">
                          <div className="title" style={{ fontSize: 14 }}>
                            {x.tc === 'livre' ? 'Sem relógio' : x.tc} contra nível {x.botElo}
                            {x.blind && !blind ? ' · às cegas' : ''}
                          </div>
                          <div className="sub">
                            {x.reason}
                            {x.blunders !== undefined ? ` · ${x.blunders} ${x.blunders === 1 ? 'erro grave' : 'erros graves'}` : ''}
                            {x.blind ? ` · ${x.peeks ?? 0} ${x.peeks === 1 ? 'espiada' : 'espiadas'}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const orientation: Side = flip ? (game.me === 'w' ? 'b' : 'w') : game.me
  const top: Side = orientation === 'w' ? 'b' : 'w'
  const bottom: Side = orientation
  const clockOf = (side: Side) => remaining(game.clock, side, now)
  const myScore = game.result === null ? null : game.result === '1/2-1/2' ? 0.5 : (game.result === '1-0') === (game.me === 'w') ? 1 : 0

  const playerRow = (side: Side) => {
    const isBot = side === game.bot
    const t = clockOf(side)
    const run = game.status === 'playing' && game.clock.running === side
    return (
      <div className="player">
        <div className="avatar">{isBot ? <Coach mood={mood} /> : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Você</span>}</div>
        <div style={{ minWidth: 0 }}>
          <div className="name">{isBot ? `${COACH_NAME} · ${game.elo}` : 'Você'}</div>
          <div className="sub">{isBot ? (thinking ? 'pensando...' : side === 'w' ? 'brancas' : 'pretas') : side === 'w' ? 'brancas' : 'pretas'}</div>
        </div>
        {game.tc.base > 0 && <div className={`clock${run ? ' run' : ''}${t < 10000 ? ' low' : ''}`}>{formatClock(t)}</div>}
      </div>
    )
  }

  const peeking = peekUntil > now
  const hide = game.blind && game.status === 'playing' && !peeking
  const noBoard = hide && game.help === 'nada'
  const myTurn = game.chess.turn() === game.me
  const showMoves = !game.blind || game.status === 'over' || game.help === 'lista'

  const total = hist.length
  const pairs: { n: number; w?: string; b?: string; wi: number; bi: number }[] = []
  const startBlack = hist[0]?.color === 'b'
  hist.forEach((h, i) => {
    const idx = startBlack ? i + 1 : i
    const n = Math.floor(idx / 2)
    if (!pairs[n]) pairs[n] = { n: n + 1, wi: n * 2, bi: n * 2 + 1 }
    if (h.color === 'w') pairs[n].w = h.san
    else pairs[n].b = h.san
  })
  const jMap = new Map(judgements.map((x) => [x.i, x.j]))

  return (
    <div className="page page-train">
      <div className="train train-play">
        <div className="train-board">
          {playerRow(top)}
          {noBoard ? (
            <div className="blind-screen" aria-live="polite">
              <span className="eyebrow">{myTurn ? 'Sua vez' : `Vez do ${COACH_NAME}`}</span>
              <span className="big">{said.bot ?? (game.me === 'w' ? 'Você começa' : `${COACH_NAME} começa`)}</span>
              {said.bot && <span className="muted">último lance do {COACH_NAME}</span>}
              {said.me && <span className="mine">Seu último lance: {said.me}</span>}
            </div>
          ) : (
          <div className="board-frame">
            <Board
              fen={shownFen}
              orientation={orientation}
              ix={ix}
              hidePieces={hide}
              blind={hide}
              lastMove={last ? { from: last.from, to: last.to } : null}
              premove={game.premove}
              arrows={arrows}
              overlay={
                game.status === 'over' && viewPly === null ? (
                  <div className="result-box">
                    <span className="eyebrow">{game.reason}</span>
                    <span className="big">{myScore === 1 ? 'Vitória' : myScore === 0 ? 'Derrota' : 'Empate'}</span>
                    <span className="muted num">{game.result?.replace('1/2-1/2', '½-½')}</span>
                    {game.blind && (
                      <span className="muted">
                        Às cegas · {game.peeks} {game.peeks === 1 ? 'espiada' : 'espiadas'}
                      </span>
                    )}
                    <div className="row" style={{ justifyContent: 'center' }}>
                      <button className="btn btn-primary" onClick={startGame}>
                        <IconRetry /> Revanche
                      </button>
                      <button className="btn" onClick={() => setViewPly(total)}>
                        Rever
                      </button>
                    </div>
                  </div>
                ) : undefined
              }
            />
          </div>
          )}
          {playerRow(bottom)}
        </div>
        <aside className="train-side">
          <div className="coach-line">
            <Coach mood={mood} />
            <div className="bubble">{thinking ? '...' : speech}</div>
          </div>
          {game.blind && game.status === 'playing' && (
            <div className="panel panel-tight stack" style={{ gap: 10 }}>
              <div className="row-between">
                <span className="eyebrow">{myTurn ? 'Sua vez' : `Vez do ${COACH_NAME}`}</span>
                {said.botSan && voice.on && (
                  <button className="btn btn-ghost btn-sm" onClick={() => voice.say(sanSpeech(said.botSan!))}>
                    Repetir o lance
                  </button>
                )}
              </div>
              {noBoard ? (
                !said.bot && <span className="muted" style={{ fontSize: 14 }}>{game.me === 'w' ? 'Você começa. Digite o lance.' : `O ${COACH_NAME} começa. O lance dele aparece em cima e é falado.`}</span>
              ) : said.bot ? (
                <div className="announce" aria-live="polite">
                  {COACH_NAME}: {said.bot}
                </div>
              ) : (
                <span className="muted" style={{ fontSize: 14 }}>
                  {game.me === 'w' ? 'Você começa. Clique na casa da peça e na casa de destino, ou digite o lance.' : `O ${COACH_NAME} começa. O lance dele aparece aqui e é falado.`}
                </span>
              )}
              {said.me && !noBoard && (
                <span className="muted" style={{ fontSize: 14 }}>
                  Seu último lance: {said.me}
                </span>
              )}
              <MoveInput fen={game.chess.fen()} disabled={!myTurn} onMove={onMove} autoFocus={game.help === 'nada'} />
              <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={peek} disabled={peeking}>
                <IconEye /> Espiar 3 s{game.peeks ? ` (${game.peeks})` : ''}
              </button>
            </div>
          )}
          {game.status === 'playing' ? (
            <div className="row">
              <button className="btn btn-danger" onClick={resign}>
                <IconFlag /> Desistir
              </button>
              <button className="btn btn-ghost" onClick={() => setFlip((f) => !f)} aria-label="Girar tabuleiro">
                <IconFlip />
              </button>
              {game.premove && (
                <button className="btn btn-ghost btn-sm" onClick={() => onPremove(null)}>
                  Cancelar pré-lance
                </button>
              )}
            </div>
          ) : (
            <div className="row">
              <button className="btn btn-primary" onClick={startGame}>
                <IconRetry /> Revanche
              </button>
              <button className="btn" onClick={() => setScreen('setup')}>
                Nova partida
              </button>
              <button className="btn btn-ghost" onClick={() => setFlip((f) => !f)} aria-label="Girar tabuleiro">
                <IconFlip />
              </button>
            </div>
          )}

          {showMoves && (
          <div className="panel panel-tight stack" style={{ gap: 8 }}>
            <div className="row-between">
              <span className="eyebrow">Lances</span>
              {game.status === 'over' && (
                <div className="row" style={{ gap: 4 }}>
                  <button className="icon-btn" onClick={() => setViewPly(0)} aria-label="Início" disabled={viewPly === 0}>
                    <IconArrowLeft />
                  </button>
                  <button className="icon-btn" onClick={() => setViewPly((v) => Math.max(0, (v ?? total) - 1))} aria-label="Lance anterior">
                    <span style={{ fontWeight: 700 }}>‹</span>
                  </button>
                  <button className="icon-btn" onClick={() => setViewPly((v) => (v === null ? null : v + 1 >= total ? null : v + 1))} aria-label="Próximo lance">
                    <span style={{ fontWeight: 700 }}>›</span>
                  </button>
                  <button className="icon-btn" onClick={() => setViewPly(null)} aria-label="Fim">
                    <IconArrowRight />
                  </button>
                </div>
              )}
            </div>
            <div className="moves" style={{ maxHeight: 180 }}>
              {pairs.map((p) => (
                <span key={p.n}>
                  <span className="mn">{p.n}.</span>{' '}
                  {p.w && (
                    <span
                      className={`mv${jMap.get(p.wi) === 'blunder' || jMap.get(p.wi) === 'mistake' ? ' bad' : ''}`}
                      onClick={() => game.status === 'over' && setViewPly(p.wi + 1)}
                      style={{ cursor: game.status === 'over' ? 'pointer' : 'default', textDecoration: viewPly === p.wi + 1 ? 'underline' : 'none' }}
                    >
                      {p.w}
                    </span>
                  )}{' '}
                  {p.b && (
                    <span
                      className={`mv${jMap.get(p.bi) === 'blunder' || jMap.get(p.bi) === 'mistake' ? ' bad' : ''}`}
                      onClick={() => game.status === 'over' && setViewPly(p.bi + 1)}
                      style={{ cursor: game.status === 'over' ? 'pointer' : 'default', textDecoration: viewPly === p.bi + 1 ? 'underline' : 'none' }}
                    >
                      {p.b}
                    </span>
                  )}
                </span>
              ))}
              {!pairs.length && <span className="muted">{game.me === 'w' ? (game.tc.base > 0 ? 'Sua vez. O relógio começa depois do primeiro lance de cada lado.' : 'Sua vez.') : `${COACH_NAME} começa.`}</span>}
            </div>
          </div>
          )}

          {game.status === 'over' && analysis && (
            <div className="panel panel-tight stack">
              <div className="row-between">
                <span className="eyebrow">Análise</span>
                {analysis.done < analysis.total && (
                  <span className="muted num" style={{ fontSize: 13 }}>
                    {analysis.done}/{analysis.total} posições
                  </span>
                )}
              </div>
              {analysis.done < analysis.total ? (
                <div className="bar">
                  <span style={{ width: `${(analysis.done / analysis.total) * 100}%` }} />
                </div>
              ) : (
                <>
                  <EvalGraph plies={analysis.plies} marks={judgements.filter((x) => x.j !== 'inaccuracy').map((x) => x.i + 1)} onPick={(i) => setViewPly(i)} />
                  {judgements.filter((x) => x.j !== 'inaccuracy').length === 0 ? (
                    <p className="muted" style={{ fontSize: 14 }}>
                      Nenhum erro ou erro grave seu nesta partida.
                    </p>
                  ) : (
                    <div className="list">
                      {judgements
                        .filter((x) => x.j !== 'inaccuracy')
                        .map((x) => (
                          <button key={x.i} className="mistake" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', width: '100%' }} onClick={() => setViewPly(x.i + 1)}>
                            <span className={`pill ${x.j === 'blunder' ? 'pill-bad' : 'pill-accent'}`}>{JUDGEMENT_LABEL[x.j]}</span>
                            <span>
                              {Math.floor(x.i / 2) + 1}
                              {x.i % 2 === 1 ? '...' : '.'} {x.san} <span className="muted">· melhor {x.best}</span>
                            </span>
                            <IconArrowRight />
                          </button>
                        ))}
                    </div>
                  )}
                  <p className="muted" style={{ fontSize: 13 }}>
                    Erros e erros graves foram para a revisão. Imprecisões ficam só aqui.
                  </p>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function EvalGraph({ plies, marks, onPick }: { plies: PlyAnalysis[]; marks: number[]; onPick: (ply: number) => void }) {
  const w = 300
  const h = 90
  const n = Math.max(1, plies.length - 1)
  const pts = plies.map((p, i) => [(i / n) * w, h / 2 - (winChance(p.score, 'w') * (h / 2 - 4))] as const)
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${path} L${w},${h / 2} L0,${h / 2} Z`
  return (
    <svg className="eval-graph" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Gráfico da avaliação ao longo da partida">
      <rect x="0" y="0" width={w} height={h} fill="var(--surface-2)" />
      <path d={area} fill="var(--text)" opacity="0.18" />
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="var(--line)" strokeWidth="1" />
      <path d={path} fill="none" stroke="var(--text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {marks.map((m) => (
        <circle key={m} cx={pts[m]?.[0] ?? 0} cy={pts[m]?.[1] ?? 0} r="3.5" fill="var(--bad)" style={{ cursor: 'pointer' }} onClick={() => onPick(m)} />
      ))}
    </svg>
  )
}
