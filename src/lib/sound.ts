// Sons sintetizados com Web Audio: nenhum arquivo externo.
import { getState } from './state'

type SoundName = 'move' | 'capture' | 'check' | 'success' | 'error' | 'end' | 'low'

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

export function playSound(name: SoundName) {
  if (!getState().settings.sound) return
  const c = audio()
  if (!c) return
  switch (name) {
    case 'move': knock(c, 1.2, 900, 0.07); break
    case 'capture': knock(c, 1.6, 520, 0.11); tone(c, 180, 0, 0.08, 0.07); break
    case 'check': tone(c, 660, 0, 0.12, 0.1, 'triangle'); tone(c, 880, 0.09, 0.14, 0.09, 'triangle'); break
    case 'success': [523, 659, 784].forEach((f, i) => tone(c, f, i * 0.07, 0.2, 0.09, 'triangle')); break
    case 'error': tone(c, 220, 0, 0.16, 0.09, 'square'); break
    case 'end': [392, 494, 587, 784].forEach((f) => tone(c, f, 0, 0.6, 0.05, 'sine')); break
    case 'low': tone(c, 1046, 0, 0.06, 0.06, 'square'); break
  }
}

/** Som de lance a partir da SAN. */
export function soundForSan(san: string) {
  if (san.includes('#') || san.includes('+')) playSound('check')
  else if (san.includes('x')) playSound('capture')
  else playSound('move')
}
