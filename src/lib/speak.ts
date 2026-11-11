// Voz do app (síntese de fala do navegador, em português do Brasil).
// Usada no treino às cegas para anunciar lances. Sem voz no aparelho, fica só o texto.
let voice: SpeechSynthesisVoice | null = null
let voicesReady = false

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

function pickVoice() {
  try {
    const all = window.speechSynthesis.getVoices()
    if (!all.length) return
    voicesReady = true
    voice = all.find((v) => v.lang === 'pt-BR') ?? all.find((v) => v.lang.replace('_', '-').toLowerCase() === 'pt-br') ?? all.find((v) => v.lang.toLowerCase().startsWith('pt')) ?? null
  } catch {
    /* sem vozes */
  }
}

if (canSpeak()) {
  pickVoice()
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
  } catch {
    /* navegador antigo */
  }
}

/** Fala o texto, cortando o que estiver sendo falado. */
export function speak(text: string) {
  if (!canSpeak() || !text) return
  try {
    if (!voicesReady) pickVoice()
    const s = window.speechSynthesis
    s.cancel()
    const u = new window.SpeechSynthesisUtterance(text)
    u.lang = 'pt-BR'
    if (voice) u.voice = voice
    u.rate = 1
    s.speak(u)
  } catch {
    /* fala indisponível */
  }
}

export function stopSpeaking() {
  if (!canSpeak()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* nada */
  }
}
