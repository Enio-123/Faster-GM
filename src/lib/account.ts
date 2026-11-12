// Conta do Faster GM: nome de usuário e senha, e o mesmo progresso em todos os aparelhos.
//
// O site guarda o progresso no aparelho (localStorage). Com a conta, cada mudança também vai
// para o banco (Supabase; as funções fgm_* estão em supabase/migrations). Cada versão salva tem
// um número. Quem tenta salvar em cima de uma versão velha recebe a atual, junta com a sua
// (lib/merge.ts) e salva de novo: o que foi feito no computador e no celular soma.
// Dentro do Claude a conta não aparece: lá o progresso já vai para a conta Claude.
import { useSyncExternalStore } from 'react'
import { emptyBase, merge3, slimBase } from './merge'
import { clearDeviceProgress, compactJson, getState, normalize, onLocalChange, replaceState, type AppState } from './state'

const API = (import.meta.env.VITE_CONTA_URL ?? '').replace(/\/+$/, '')
const KEY = import.meta.env.VITE_CONTA_KEY ?? ''
const SESSION_KEY = 'faster-gm:conta'
const BASE_KEY = 'faster-gm:conta-base'
const PUSH_DELAY = 3000
/** No máximo um envio a cada 45 s enquanto treina (o tempo de treino muda a cada 15 s). */
const PUSH_GAP = 45_000
const POLL_MS = 90_000
const MAX_BYTES = 2_900_000

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,19}$/
export const PASSWORD_MIN = 6

export type AccountStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'expired' | 'error'

interface Saved {
  usuario: string
  /** null: a sessão acabou; o aparelho continua ligado a esta conta até entrar de novo. */
  token: string | null
  /** Última versão da conta que este aparelho conhece. */
  versao: number
  /** Tem mudança deste aparelho que ainda não foi para a conta. */
  pendente: boolean
  /** O progresso foi trocado aqui (backup ou apagar): substitui o da conta em vez de juntar. */
  substituir: boolean
}

export interface AccountView {
  enabled: boolean
  usuario: string | null
  loggedIn: boolean
  expired: boolean
  pending: boolean
  status: AccountStatus
  lastSync: number
}

class Offline extends Error {}

interface Reply {
  ok: boolean
  erro?: string
  token?: string
  usuario?: string
  versao?: number
  dados?: unknown
}

const MESSAGES: Record<string, string> = {
  usuario_invalido: 'O nome precisa ter de 3 a 20 letras ou números, sem espaço (pode usar ponto, hífen e _).',
  senha_invalida: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`,
  usuario_em_uso: 'Esse nome já tem conta. Escolha outro, ou use Entrar se a conta é sua.',
  muitas_contas: 'Muitas contas novas agora. Tente de novo daqui a pouco.',
  senha_errada: 'Nome ou senha errados.',
  muitas_tentativas: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.',
  sessao: 'Sua sessão acabou. Entre de novo.',
  offline: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
}

export function errorText(code?: string): string {
  return MESSAGES[code ?? ''] ?? 'Algo deu errado. Tente de novo.'
}

function insideClaude(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { claude?: unknown }).claude
}

/** A conta existe neste build (endereço e chave do banco) e o app não está dentro do Claude. */
export function accountsEnabled(): boolean {
  return !!API && !!KEY && !insideClaude()
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<Reply> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(`${API}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Offline(`HTTP ${res.status}`)
    return (await res.json()) as Reply
  } catch (e) {
    throw e instanceof Offline ? e : new Offline(String(e))
  } finally {
    window.clearTimeout(timer)
  }
}

// ---------- O que fica guardado no aparelho ----------

function readSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Partial<Saved> | null
    if (v && typeof v.usuario === 'string' && typeof v.versao === 'number') {
      return { usuario: v.usuario, token: typeof v.token === 'string' ? v.token : null, versao: v.versao, pendente: !!v.pendente, substituir: !!v.substituir }
    }
  } catch {
    /* sem armazenamento */
  }
  return null
}

function writeSaved() {
  try {
    if (saved) localStorage.setItem(SESSION_KEY, JSON.stringify(saved))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* sem armazenamento */
  }
}

function readBase(): AppState {
  try {
    const txt = localStorage.getItem(BASE_KEY)
    if (txt) return normalize(JSON.parse(txt))
  } catch {
    /* base ilegível: trata como aparelho novo na conta */
  }
  return emptyBase()
}

function writeBase(s: AppState) {
  base = slimBase(s)
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base))
  } catch {
    /* sem armazenamento */
  }
}

function clearBase() {
  base = emptyBase()
  try {
    localStorage.removeItem(BASE_KEY)
  } catch {
    /* sem armazenamento */
  }
}

let saved: Saved | null = typeof localStorage === 'undefined' ? null : readSaved()
let base: AppState = typeof localStorage === 'undefined' ? emptyBase() : readBase()
let status: AccountStatus = saved ? (saved.token ? 'syncing' : 'expired') : 'off'
let lastSync = 0
const subs = new Set<() => void>()

function makeView(): AccountView {
  return {
    enabled: accountsEnabled(),
    usuario: saved?.usuario ?? null,
    loggedIn: !!saved?.token,
    expired: !!saved && !saved.token,
    pending: !!saved?.pendente,
    status,
    lastSync,
  }
}
let view = makeView()

function emit(next?: AccountStatus) {
  if (next) status = next
  view = makeView()
  subs.forEach((f) => f())
}

export function useAccount(): AccountView {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => view,
    () => view,
  )
}

// ---------- Sincronização ----------

let running: Promise<void> | null = null
let again = false
let pushTimer: number | undefined
let lastPushAt = 0

/** Traz o que os outros aparelhos salvaram e manda o que mudou aqui. Uma de cada vez. */
export function syncNow(): Promise<void> {
  if (!saved?.token || !accountsEnabled()) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await syncOnce()
      } while (again && saved?.token)
    } finally {
      running = null
    }
  })()
  return running
}

function payload(s: AppState): unknown {
  const txt = JSON.stringify(s)
  if (new TextEncoder().encode(txt).length <= MAX_BYTES) return s
  return JSON.parse(compactJson(s))
}

/** Junta a versão da conta com o que está neste aparelho. */
function absorb(s: Saved, remote: AppState, versao: number, from: AppState) {
  replaceState(merge3(from, getState(), remote))
  writeBase(remote)
  s.versao = versao
  writeSaved()
}

async function syncOnce() {
  const s = saved
  if (!s?.token) return
  const live = () => saved === s && !!s.token
  emit('syncing')
  try {
    if (!s.substituir) {
      const got = await rpc('fgm_carregar', { p_token: s.token, p_desde: s.versao })
      if (!live()) return
      if (!got.ok) return expire(s)
      const v = got.versao ?? 0
      if (v > s.versao && got.dados) absorb(s, normalize(got.dados), v, base)
      else if (v < s.versao) {
        // A conta voltou para trás (banco restaurado): tudo daqui volta para ela.
        s.versao = v
        s.pendente = true
        writeSaved()
      }
    }
    for (let i = 0; i < 6 && live() && s.pendente; i++) {
      const snapshot = getState()
      lastPushAt = Date.now()
      const res = await rpc('fgm_salvar', { p_token: s.token, p_dados: payload(snapshot), p_versao: s.versao })
      if (!live()) return
      if (res.ok) {
        s.versao = res.versao ?? s.versao + 1
        writeBase(snapshot)
        if (getState() === snapshot) {
          s.pendente = false
          s.substituir = false
        }
        writeSaved()
        continue
      }
      if (res.erro === 'sessao') return expire(s)
      if (res.erro !== 'conflito') throw new Error(res.erro)
      const v = res.versao ?? 0
      if (s.substituir || !res.dados) {
        // Substituir, ou a conta está vazia: o deste aparelho vale como está.
        s.versao = v
        writeSaved()
        continue
      }
      absorb(s, normalize(res.dados), v, base)
    }
    lastSync = Date.now()
    emit(s.pendente ? 'syncing' : 'synced')
  } catch (e) {
    if (live()) emit(e instanceof Offline ? 'offline' : 'error')
  }
}

function expire(s: Saved) {
  s.token = null
  writeSaved()
  emit('expired')
}

function onChange(replace: boolean) {
  const s = saved
  if (!s) return
  const changed = !s.pendente || (replace && !s.substituir)
  s.pendente = true
  if (replace) s.substituir = true
  if (changed) {
    writeSaved()
    emit()
  }
  if (!s.token) return
  window.clearTimeout(pushTimer)
  const wait = replace ? 0 : Math.max(PUSH_DELAY, lastPushAt + PUSH_GAP - Date.now())
  pushTimer = window.setTimeout(() => void syncNow(), wait)
}

let started = false

/** Liga a conta: sincroniza ao abrir, ao voltar para o app, quando a internet volta e a cada 90 s. */
export function initAccount() {
  if (started || !accountsEnabled()) return
  started = true
  onLocalChange(onChange)
  view = makeView()
  if (saved?.token) void syncNow()
  // Saindo do app: manda já o que falta. Voltando: traz o que os outros aparelhos fizeram.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' || saved?.pendente) void syncNow()
  })
  window.addEventListener('online', () => void syncNow())
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, POLL_MS)
}

// ---------- Entrar, criar, sair ----------

function begin(token: string, usuario: string) {
  const sameAccount = saved?.usuario === usuario
  if (saved && !sameAccount) {
    // O aparelho estava ligado a outra conta (sessão vencida): o progresso dela não vem junto.
    clearDeviceProgress()
  }
  if (!sameAccount) clearBase()
  saved = {
    usuario,
    token,
    versao: sameAccount && saved ? saved.versao : 0,
    pendente: true,
    substituir: sameAccount && saved ? saved.substituir : false,
  }
  writeSaved()
  emit('syncing')
  void syncNow()
}

/** Cria a conta e já entra. Devolve a mensagem de erro, ou null quando deu certo. */
export async function createAccount(usuario: string, senha: string): Promise<string | null> {
  try {
    const r = await rpc('fgm_criar_conta', { p_usuario: usuario, p_senha: senha })
    if (!r.ok || !r.token || !r.usuario) return errorText(r.erro)
    begin(r.token, r.usuario)
    return null
  } catch {
    return errorText('offline')
  }
}

/** Entra numa conta. O progresso deste aparelho é juntado com o da conta. */
export async function login(usuario: string, senha: string): Promise<string | null> {
  try {
    const r = await rpc('fgm_entrar', { p_usuario: usuario, p_senha: senha })
    if (!r.ok || !r.token || !r.usuario) return errorText(r.erro)
    begin(r.token, r.usuario)
    return null
  } catch {
    return errorText('offline')
  }
}

/**
 * Sai da conta: o progresso some deste aparelho e continua na conta. Sem `force`, antes manda
 * o que falta; se não der (sem internet), devolve 'pending' e não sai.
 */
export async function logout(force = false): Promise<'ok' | 'pending'> {
  const s = saved
  if (!s) return 'ok'
  if (!force && s.pendente && s.token) {
    await syncNow()
    if (saved === s && s.pendente) return 'pending'
  }
  window.clearTimeout(pushTimer)
  saved = null
  writeSaved()
  clearBase()
  clearDeviceProgress()
  emit('off')
  if (s.token) void rpc('fgm_sair', { p_token: s.token }).catch(() => {})
  return 'ok'
}

export async function changePassword(atual: string, nova: string): Promise<string | null> {
  const s = saved
  if (!s?.token) return errorText('sessao')
  try {
    const r = await rpc('fgm_trocar_senha', { p_token: s.token, p_senha_atual: atual, p_senha_nova: nova })
    if (r.ok) return null
    if (r.erro === 'sessao') expire(s)
    return r.erro === 'senha_errada' ? 'A senha atual não confere.' : errorText(r.erro)
  } catch {
    return errorText('offline')
  }
}

/** Apaga a conta e o progresso salvo nela. O progresso deste aparelho fica. */
export async function deleteAccount(senha: string): Promise<string | null> {
  const s = saved
  if (!s?.token) return errorText('sessao')
  try {
    const r = await rpc('fgm_apagar_conta', { p_token: s.token, p_senha: senha })
    if (!r.ok) {
      if (r.erro === 'sessao') expire(s)
      return r.erro === 'senha_errada' ? 'Senha errada.' : errorText(r.erro)
    }
    window.clearTimeout(pushTimer)
    saved = null
    writeSaved()
    clearBase()
    emit('off')
    return null
  } catch {
    return errorText('offline')
  }
}
