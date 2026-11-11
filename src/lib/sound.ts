// Sons do Faster GM. Lance, captura, xeque, mate e início vêm de gravações (src/assets/sons):
// madeira batendo no tabuleiro. Acerto, erro, fim e tempo acabando são sintetizados com Web Audio.
import captura from '../assets/sons/captura.wav'
import inicio from '../assets/sons/inicio.wav'
import lance1 from '../assets/sons/lance-1.wav'
import lance2 from '../assets/sons/lance-2.wav'
import lance3 from '../assets/sons/lance-3.wav'
import xeque from '../assets/sons/xeque.wav'
import { getState } from './state'

export type SoundName = 'move' | 'capture' | 'check' | 'mate' | 'start' | 'success' | 'error' | 'end' | 'low'

type Recorded = 'move' | 'capture' | 'check' | 'start'
const FILES: Record<Recorded, string[]> = {
  move: [lance1, lance2, lance3],
  capture: [captura],
  check: [xeque],
  start: [inicio],
}

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

const buffers: Partial<Record<Recorded, AudioBuffer[]>> = {}
let loading: Promise<void> | null = null

function decode(c: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Forma com callbacks: funciona também no Safari antigo.
  return new Promise((resolve, reject) => c.decodeAudioData(data, resolve, reject))
}

function load(c: AudioContext): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      (Object.keys(FILES) as Recorded[]).map(async (k) => {
        try {
          buffers[k] = await Promise.all(FILES[k].map(async (url) => decode(c, await (await fetch(url)).arrayBuffer())))
        } catch {
          /* fica o som sintetizado */
        }
      }),
    ).then(() => undefined)
  }
  return loading
}

// Prepara os sons no primeiro toque ou tecla (o navegador só libera áudio depois de um gesto).
if (typeof window !== 'undefined') {
  const warm = () => {
    window.removeEventListener('pointerdown', warm)
    window.removeEventListener('keydown', warm)
    if (!getState().settings.sound) return
    const c = audio()
    if (c) void load(c)
  }
  window.addEventListener('pointerdown', warm, { passive: true })
  window.addEventListener('keydown', warm)
}

/** Até quando um som gravado ainda está tocando (para o acerto e o fim não caírem em cima do mate). */
let busyUntil = 0

function play(c: AudioContext, buf: AudioBuffer, delay = 0, vol = 1) {
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.value = vol
  src.connect(g).connect(c.destination)
  const at = c.currentTime + delay
  src.start(at)
  busyUntil = Math.max(busyUntil, at + buf.duration)
}

function tone(c: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.02)
}

function knock(c: AudioContext, vol: number, freq: number, dur: number) {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = 1.4
  const g = c.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(c.destination)
  src.start()
}

let lastMove = -1
function pickMove(list: AudioBuffer[]): AudioBuffer {
  // Varia entre as gravações, sem repetir a mesma duas vezes seguidas.
  let i = Math.floor(Math.random() * list.length)
  if (list.length > 1 && i === lastMove) i = (i + 1) % list.length
  lastMove = i
  return list[i]
}

export function playSound(name: SoundName) {
  if (!getState().settings.sound) return
  const c = audio()
  if (!c) return
  void load(c)
  const b = buffers
  const wait = Math.max(0, busyUntil - c.currentTime)
  switch (name) {
    case 'move':
      if (b.move?.length) play(c, pickMove(b.move))
      else knock(c, 1.2, 900, 0.07)
      break
    case 'capture':
      if (b.capture?.length) play(c, b.capture[0])
      else {
        knock(c, 1.6, 520, 0.11)
        tone(c, 180, 0, 0.08, 0.07)
      }
      break
    case 'check':
      if (b.check?.length) play(c, b.check[0])
      else {
        tone(c, 660, 0, 0.12, 0.1, 'triangle')
        tone(c, 880, 0.09, 0.14, 0.09, 'triangle')
      }
      break
    case 'mate':
      // A batida do xeque, duas vezes.
      if (b.check?.length) {
        play(c, b.check[0])
        play(c, b.check[0], b.check[0].duration + 0.04)
      } else {
        tone(c, 660, 0, 0.12, 0.1, 'triangle')
        tone(c, 880, 0.09, 0.14, 0.09, 'triangle')
        tone(c, 660, 0.3, 0.12, 0.1, 'triangle')
        tone(c, 880, 0.39, 0.14, 0.09, 'triangle')
      }
      break
    case 'start':
      if (b.start?.length) play(c, b.start[0])
      break
    case 'success':
      ;[523, 659, 784].forEach((f, i) => tone(c, f, wait + i * 0.07, 0.2, 0.09, 'triangle'))
      break
    case 'error':
      tone(c, 220, 0, 0.16, 0.09, 'square')
      break
    case 'end':
      ;[392, 494, 587, 784].forEach((f) => tone(c, f, wait, 0.6, 0.05, 'sine'))
      break
    case 'low':
      tone(c, 1046, 0, 0.06, 0.06, 'square')
      break
  }
}

/** Qual som um lance faz, pela SAN: mate, xeque, captura ou lance. */
export function sanSound(san: string): 'mate' | 'check' | 'capture' | 'move' {
  if (san.includes('#')) return 'mate'
  if (san.includes('+')) return 'check'
  if (san.includes('x')) return 'capture'
  return 'move'
}

/** Som de lance a partir da SAN. */
export function soundForSan(san: string) {
  playSound(sanSound(san))
}
