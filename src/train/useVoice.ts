import { useCallback, useEffect } from 'react'
import { canSpeak, speak, stopSpeaking } from '../lib/speak'
import { usePrefs } from '../ui/hooks'

/** Voz dos lances no treino às cegas (ligada por padrão; a escolha vale para todas as telas às cegas). */
export function useVoice() {
  const [p, setP] = usePrefs('faster-gm:cegas-voz', { on: true })
  const available = canSpeak()
  const on = p.on && available
  const say = useCallback((text: string) => {
    if (on) speak(text)
  }, [on])
  useEffect(() => stopSpeaking, [])
  return { on, available, setOn: (v: boolean) => { if (!v) stopSpeaking(); setP({ on: v }) }, say }
}
