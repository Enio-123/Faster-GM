// Stockfish (WASM) em Web Worker.
// - Um trabalho por vez: o próximo "go" só sai depois do "bestmove" do anterior,
//   então linhas "info" atrasadas nunca caem na posição errada.
// - Cancelar envia "stop" e marca o resultado como obsoleto.
// - Avaliações sempre convertidas para o ponto de vista das brancas (score.ts).
import { fromUci, type Color, type Score } from './score'

export interface EngineLine {
  multipv: number
  depth: number
  score: Score
  pv: string[]
}

export interface AnalysisResult {
  fen: string
  bestmove: string | null
  lines: EngineLine[]
  depth: number
  cancelled: boolean
}

export interface AnalyzeOptions {
  depth?: number
  movetime?: number
  nodes?: number
  multipv?: number
  /** Força limitada pela escala UCI_Elo do Stockfish (1320 a 3190). */
  limitElo?: number
  onUpdate?: (lines: EngineLine[], depth: number) => void
}

export interface WorkerLike {
  postMessage(msg: string): void
  terminate(): void
  onmessage: ((e: { data: unknown }) => void) | null
  onerror: ((e: unknown) => void) | null
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

interface Job {
  fen: string
  opts: AnalyzeOptions
  lines: Map<number, EngineLine>
  depth: number
  cancelled: boolean
  resolve: (r: AnalysisResult) => void
}

export const ENGINE_NAME = 'Stockfish 18 lite (WASM, 1 thread)'

export function parseInfo(line: string, sideToMove: Color): EngineLine | null {
  if (!line.startsWith('info') || !line.includes(' pv ') || !line.includes(' score ')) return null
  if (line.includes(' lowerbound') || line.includes(' upperbound')) return null
  const t = line.trim().split(/\s+/)
  const at = (k: string) => t.indexOf(k)
  const num = (k: string) => (at(k) >= 0 ? Number(t[at(k) + 1]) : undefined)
  const si = at('score')
  const type = t[si + 1] as 'cp' | 'mate'
  const value = Number(t[si + 2])
  if (type !== 'cp' && type !== 'mate') return null
  return { multipv: num('multipv') ?? 1, depth: num('depth') ?? 0, score: fromUci(sideToMove, type, value), pv: t.slice(at('pv') + 1) }
}

export class Engine {
  status: EngineStatus = 'idle'
  private worker: WorkerLike | null = null
  private queue: Job[] = []
  private current: Job | null = null
  private readyWaiters: Array<(ok: boolean) => void> = []
  private createWorker: () => WorkerLike

  constructor(createWorker: () => WorkerLike) {
    this.createWorker = createWorker
  }

  init(): Promise<boolean> {
    if (this.status === 'ready') return Promise.resolve(true)
    if (this.status === 'error') return Promise.resolve(false)
    const p = new Promise<boolean>((res) => this.readyWaiters.push(res))
    if (this.status === 'loading') return p
    this.status = 'loading'
    try {
      this.worker = this.createWorker()
    } catch {
      this.fail()
      return p
    }
    this.worker.onmessage = (e) => this.handle(String(e.data))
    this.worker.onerror = () => this.fail()
    this.worker.postMessage('uci')
    return p
  }

  private fail() {
    this.status = 'error'
    this.readyWaiters.splice(0).forEach((r) => r(false))
    const pending = [...this.queue, ...(this.current ? [this.current] : [])]
    this.queue = []
    this.current = null
    pending.forEach((j) => j.resolve({ fen: j.fen, bestmove: null, lines: [], depth: 0, cancelled: true }))
  }

  private handle(line: string) {
    if (line === 'uciok') {
      this.worker!.postMessage('setoption name Hash value 32')
      this.worker!.postMessage('isready')
      return
    }
    if (line === 'readyok') {
      if (this.status === 'loading') {
        this.status = 'ready'
        this.readyWaiters.splice(0).forEach((r) => r(true))
      }
      this.pump()
      return
    }
    const job = this.current
    if (!job) return
    if (line.startsWith('info')) {
      const parsed = parseInfo(line, job.fen.split(' ')[1] as Color)
      if (!parsed) return
      job.lines.set(parsed.multipv, parsed)
      if (parsed.multipv === 1) job.depth = parsed.depth
      if (!job.cancelled && parsed.multipv === (job.opts.multipv ?? 1)) job.opts.onUpdate?.(this.sorted(job), job.depth)
      return
    }
    if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1]
      this.current = null
      job.resolve({ fen: job.fen, bestmove: best && best !== '(none)' ? best : null, lines: this.sorted(job), depth: job.depth, cancelled: job.cancelled })
      this.pump()
    }
  }

  private sorted(job: Job) {
    return [...job.lines.values()].sort((a, b) => a.multipv - b.multipv)
  }

  private pump() {
    if (this.current || this.status !== 'ready' || !this.worker) return
    const job = this.queue.shift()
    if (!job) return
    if (job.cancelled) {
      job.resolve({ fen: job.fen, bestmove: null, lines: [], depth: 0, cancelled: true })
      this.pump()
      return
    }
    this.current = job
    const w = this.worker
    const o = job.opts
    w.postMessage(`setoption name MultiPV value ${o.multipv ?? 1}`)
    if (o.limitElo) {
      w.postMessage('setoption name UCI_LimitStrength value true')
      w.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, Math.round(o.limitElo)))}`)
    } else {
      w.postMessage('setoption name UCI_LimitStrength value false')
    }
    w.postMessage(`position fen ${job.fen}`)
    if (o.movetime) w.postMessage(`go movetime ${Math.round(o.movetime)}`)
    else if (o.nodes) w.postMessage(`go nodes ${Math.round(o.nodes)}`)
    else w.postMessage(`go depth ${o.depth ?? 14}`)
  }

  analyze(fen: string, opts: AnalyzeOptions = {}): { result: Promise<AnalysisResult>; cancel: () => void } {
    let resolve!: (r: AnalysisResult) => void
    const result = new Promise<AnalysisResult>((r) => (resolve = r))
    const job: Job = { fen, opts, lines: new Map(), depth: 0, cancelled: false, resolve }
    this.queue.push(job)
    this.init().then((ok) => {
      if (ok) this.pump()
    })
    const cancel = () => {
      if (job.cancelled) return
      job.cancelled = true
      if (this.current === job) this.worker?.postMessage('stop')
    }
    return { result, cancel }
  }

  stopAll() {
    this.queue.forEach((j) => (j.cancelled = true))
    if (this.current) {
      this.current.cancelled = true
      this.worker?.postMessage('stop')
    }
  }

  newGame() {
    if (this.status === 'ready' && !this.current) this.worker?.postMessage('ucinewgame')
  }
}

function browserWorker(): WorkerLike {
  const url = new URL('engine/stockfish-18-lite-single.js', document.baseURI)
  return new Worker(url.href) as unknown as WorkerLike
}

let analysisEngine: Engine | null = null
let botEngine: Engine | null = null

/** Motor para conferir lances alternativos e analisar partidas. */
export function getAnalysisEngine(): Engine {
  if (!analysisEngine) analysisEngine = new Engine(browserWorker)
  return analysisEngine
}

/** Motor exclusivo do bot, para a análise nunca atrasar o lance dele. */
export function getBotEngine(): Engine {
  if (!botEngine) botEngine = new Engine(browserWorker)
  return botEngine
}
