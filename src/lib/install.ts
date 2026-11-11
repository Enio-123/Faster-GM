// Instalar o Faster GM como app pelo próprio app.
// O Chrome do Android, desde a versão 154, erra no menu "Instalar app": se outro app do mesmo
// endereço (enio-123.github.io) já está instalado, ele diz que este também está, e "Abrir" falha.
// O evento beforeinstallprompt passa por outra conferência, feita pelo escopo de cada app,
// então o botão "Instalar" daqui funciona mesmo com o erro do menu.
import { useSyncExternalStore } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** installed: rodando como app instalado. available: o navegador liberou a instalação. */
export type InstallState = 'installed' | 'available' | 'unavailable'

let deferred: InstallPromptEvent | null = null
let acceptedNow = false
let state: InstallState = 'unavailable'
const subs = new Set<() => void>()

/** Rodando como app instalado (tela cheia, sem a barra do navegador). */
export function standalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

function refresh() {
  state = standalone() || acceptedNow ? 'installed' : deferred ? 'available' : 'unavailable'
  subs.forEach((f) => f())
}

let started = false

/** Começa a ouvir o navegador. Chamar cedo, antes de o evento de instalação chegar. */
export function initInstall() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('beforeinstallprompt', (e) => {
    // Guarda o evento para o botão do app (e tira a barrinha automática do Chrome).
    e.preventDefault()
    deferred = e as InstallPromptEvent
    refresh()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    acceptedNow = true
    refresh()
  })
  refresh()
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
    () => 'unavailable' as InstallState,
  )
}

/** Abre a janela de instalação do navegador. Cada aviso do navegador só pode ser usado uma vez. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred
  if (!e) return 'unavailable'
  deferred = null
  refresh()
  try {
    await e.prompt()
    const choice = await e.userChoice
    if (choice.outcome === 'accepted') acceptedNow = true
    refresh()
    return choice.outcome
  } catch {
    refresh()
    return 'unavailable'
  }
}

/** Só no site (GitHub Pages) dá para instalar; dentro do Claude, não. */
export function isSite(): boolean {
  return typeof location !== 'undefined' && location.hostname.endsWith('github.io')
}

export const SITE_URL = 'https://enio-123.github.io/Faster-GM/'
