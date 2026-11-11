// Estado do app: um único objeto salvo neste aparelho (localStorage) e, quando o app roda
// dentro do Claude, também na conta do usuário (capacidade db, pasta privada dele).
import { useSyncExternalStore } from 'react'
import { INITIAL_RATING, type Rating } from './rating'
import type { Schedule } from './srs'
import { dayKey } from './time'

export type ThemePref = 'system' | 'dark' | 'light'
export type BoardThemeId = 'madeira' | 'aco' | 'torneio'

export interface Settings {
  theme: ThemePref
  boardTheme: BoardThemeId
  sound: boolean
  coordinates: boolean
  showLegal: boolean
  autoQueen: boolean
  premove: boolean
  intro: boolean
  dailyMinutes: number
}

export interface LevelStats {
  tries: number
  solved: number
  totalMs: number
  bestMs: number
  /** Últimos resultados (1 acerto, 0 erro), do mais antigo ao mais novo, no máximo 20. */
  recent: number[]
}

export interface ReviewCard extends Schedule {
  id: string
  kind: 'jogo' | 'problema'
  fen: string
  /** Lances UCI da solução a partir de `fen` (no erro de partida, só o melhor lance). */
  line: string[]
  /** Avaliação (chance de vitória, -1 a 1) do melhor lance, para aceitar alternativas equivalentes. */
  bestWc?: number
  played?: string
  note: string
  created: number
  bucket?: string
  rating?: number
}

export interface GameRecord {
  id: string
  date: number
  tc: string
  color: 'w' | 'b'
  botElo: number
  result: '1-0' | '0-1' | '1/2-1/2'
  reason: string
  moves: string[]
  startFen?: string
  /** Avaliações (chance de vitória das brancas, -100 a 100) por posição, quando analisada. */
  evals?: number[]
  blunders?: number
  mistakes?: number
  inaccuracies?: number
}

export interface AppState {
  v: 1
  /** Revisão dos padrões. 2: a madeira virou o tabuleiro padrão (2026-11). */
  rev?: number
  updatedAt: number
  settings: Settings
  profile: { created: number; chesscom?: number; otb?: number; onboarded?: boolean }
  puzzle: Rating
  ratingHistory: [string, number][]
  levels: Record<string, LevelStats>
  seen: Record<string, string[]>
  seenSig: Record<string, string>
  /** Segundos de treino por dia e por bloco da rotina. */
  days: Record<string, Record<string, number>>
  /** Recordes. `pressure`: acertos por formato da Pressão de tempo ("mate4-10" = mate em 4, 10 minutos). */
  records: { seqBest: number; seqBestLevel: number; stormBest: number; calcBest: number; pressure: Record<string, number> }
  bot: { ladder: number; games: number }
  review: ReviewCard[]
  games: GameRecord[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  boardTheme: 'madeira',
  sound: true,
  coordinates: true,
  showLegal: true,
  autoQueen: false,
  premove: true,
  intro: true,
  dailyMinutes: 120,
}

export function initialState(now = Date.now()): AppState {
  return {
    v: 1,
    rev: 2,
    updatedAt: 0,
    settings: { ...DEFAULT_SETTINGS },
    profile: { created: now },
    puzzle: { ...INITIAL_RATING },
    ratingHistory: [],
    levels: {},
    seen: {},
    seenSig: {},
    days: {},
    records: { seqBest: 0, seqBestLevel: 0, stormBest: 0, calcBest: 0, pressure: {} },
    bot: { ladder: 1200, games: 0 },
    review: [],
    games: [],
  }
}

/** Completa campos que faltam (dados de versões antigas ou importados). */
export function normalize(raw: unknown): AppState {
  const base = initialState()
  if (!raw || typeof raw !== 'object') return base
  const s = raw as Partial<AppState>
  const settings = { ...base.settings, ...(s.settings ?? {}) }
  // Quem ainda estava no tabuleiro padrão antigo (aço) passa uma vez para a madeira.
  if ((s.rev ?? 0) < 2 && settings.boardTheme === 'aco') settings.boardTheme = 'madeira'
  return {
    ...base,
    ...s,
    v: 1,
    rev: 2,
    settings,
    profile: { ...base.profile, ...(s.profile ?? {}) },
    puzzle: { ...base.puzzle, ...(s.puzzle ?? {}) },
    records: { ...base.records, ...(s.records ?? {}), pressure: { ...(s.records?.pressure ?? {}) } },
    bot: { ...base.bot, ...(s.bot ?? {}) },
    levels: s.levels ?? {},
    seen: s.seen ?? {},
    seenSig: s.seenSig ?? {},
    days: s.days ?? {},
    review: Array.isArray(s.review) ? s.review : [],
    games: Array.isArray(s.games) ? s.games : [],
    ratingHistory: Array.isArray(s.ratingHistory) ? s.ratingHistory : [],
  }
}

const KEY = 'faster-gm:v1'
const listeners = new Set<() => void>()
let state: AppState = loadLocal()

function loadLocal(): AppState {
  try {
    const txt = localStorage.getItem(KEY)
    if (txt) return normalize(JSON.parse(txt))
  } catch {
    /* sem armazenamento: começa do zero */
  }
  return initialState()
}

let localTimer: number | undefined
function persistLocal() {
  window.clearTimeout(localTimer)
  localTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* armazenamento cheio ou bloqueado */
    }
  }, 250)
}

export function getState(): AppState {
  return state
}

export function setState(fn: (s: AppState) => AppState, opts: { remote?: boolean } = {}) {
  const next = fn(state)
  if (next === state) return
  state = opts.remote ? next : { ...next, updatedAt: Date.now() }
  persistLocal()
  if (!opts.remote) scheduleRemote()
  listeners.forEach((l) => l())
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function useSettings(): Settings {
  return useAppState().settings
}

// ---------- Sincronização com a conta (somente dentro do Claude) ----------

export type SyncStatus = 'local' | 'connecting' | 'synced' | 'saving' | 'error'
let syncStatus: SyncStatus = 'local'
const syncListeners = new Set<() => void>()
function setSync(s: SyncStatus) {
  syncStatus = s
  syncListeners.forEach((l) => l())
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (fn) => {
      syncListeners.add(fn)
      return () => syncListeners.delete(fn)
    },
    () => syncStatus,
    () => syncStatus,
  )
}

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>
  set(d: Record<string, unknown>): Promise<void>
}
let remoteDoc: DocRef | null = null
let remoteTimer: number | undefined
let writing: Promise<void> | null = null
let dirty = false

function scheduleRemote() {
  if (!remoteDoc) return
  dirty = true
  window.clearTimeout(remoteTimer)
  remoteTimer = window.setTimeout(() => void flushRemote(), 4000)
}

export async function flushRemote() {
  if (!remoteDoc || !dirty) return
  if (writing) await writing
  if (!dirty) return
  dirty = false
  setSync('saving')
  const snapshot = state
  writing = remoteDoc
    .set({ v: 1, updatedAt: snapshot.updatedAt, json: compactJson(snapshot) })
    .then(() => setSync('synced'))
    .catch(() => {
      dirty = true
      setSync('error')
    })
    .finally(() => {
      writing = null
    })
  await writing
}

/**
 * A cópia na conta tem limite de tamanho por documento. Se o progresso crescer demais,
 * a cópia remota perde primeiro o que pode ser refeito: avaliações de partidas antigas
 * e a lista de problemas já vistos. A cópia neste aparelho continua completa.
 */
const REMOTE_LIMIT = 240_000
/** Tamanho real no documento: o texto vai escapado dentro de um campo, em UTF-8. */
function remoteBytes(txt: string): number {
  return new TextEncoder().encode(JSON.stringify(txt)).length
}
export function compactJson(s: AppState): string {
  let txt = JSON.stringify(s)
  if (remoteBytes(txt) <= REMOTE_LIMIT) return txt
  const games = s.games.map((g, i) => (i < 10 ? g : { ...g, evals: undefined }))
  const seen = Object.fromEntries(Object.entries(s.seen).map(([k, v]) => [k, v.slice(-300)]))
  txt = JSON.stringify({ ...s, games, seen })
  if (remoteBytes(txt) <= REMOTE_LIMIT) return txt
  return JSON.stringify({ ...s, games: games.slice(0, 20).map((g) => ({ ...g, evals: undefined })), seen: {}, seenSig: {}, review: s.review.slice(0, 250) })
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>
}

/** Conecta ao armazenamento da conta, se o app estiver rodando dentro do Claude. */
export async function connectAccountStorage() {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude
  if (!claude?.use) return
  setSync('connecting')
  try {
    const [user, db] = (await Promise.all([claude.use('user'), claude.use('db')])) as [
      { id(): Promise<string | null> } | null,
      { doc(path: string): DocRef } | null,
    ]
    const uid = user ? await user.id() : null
    if (!db || !uid) {
      setSync('local')
      return
    }
    const ref = db.doc(`data/users/${uid}/save`)
    const snap = await ref.get()
    const data = snap.exists ? snap.data() : undefined
    if (data && typeof data.json === 'string' && Number(data.updatedAt) > state.updatedAt) {
      try {
        const remote = normalize(JSON.parse(data.json))
        setState(() => remote, { remote: true })
      } catch {
        /* cópia remota ilegível: mantém a local */
      }
    }
    remoteDoc = ref
    setSync('synced')
    if (!data || Number(data.updatedAt) < state.updatedAt) {
      dirty = true
      void flushRemote()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushRemote()
    })
  } catch {
    setSync('local')
  }
}

// ---------- Utilidades de atualização ----------

export function today() {
  return dayKey()
}

export function addTrainingSeconds(block: string, seconds: number) {
  if (seconds <= 0) return
  const key = dayKey()
  setState((s) => {
    const day = { ...(s.days[key] ?? {}) }
    day[block] = (day[block] ?? 0) + seconds
    return { ...s, days: { ...s.days, [key]: day } }
  })
}

export function exportJson(): string {
  return JSON.stringify(state, null, 1)
}

export function importJson(txt: string): boolean {
  try {
    const parsed = normalize(JSON.parse(txt))
    setState(() => parsed)
    return true
  } catch {
    return false
  }
}

export function resetAll() {
  setState(() => ({ ...initialState(), settings: state.settings }))
}
