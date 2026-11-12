import { useState } from 'react'
import { BOARD_THEMES, swatchBackground } from '../board/themes'
import { ENGINE_NAME } from '../engine/engine'
import { exportJson, importJson, resetAll, setState, useAppState, useSyncStatus, type Settings as S } from '../lib/state'
import { useAccount } from '../lib/account'
import { AccountPanel } from '../ui/Account'
import { InstallPanel } from '../ui/Install'

const SYNC_TEXT = {
  local: 'Salvo neste aparelho. Use o backup abaixo para não perder o progresso.',
  connecting: 'Conectando ao armazenamento da sua conta...',
  synced: 'Salvo na sua conta Claude e neste aparelho.',
  saving: 'Salvando na sua conta...',
  error: 'Não deu para salvar na conta agora. O progresso continua salvo neste aparelho.',
}

export function Settings() {
  const s = useAppState()
  const sync = useSyncStatus()
  const account = useAccount()
  const [importText, setImportText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const set = <K extends keyof S>(k: K, v: S[K]) => setState((x) => ({ ...x, settings: { ...x.settings, [k]: v } }))

  const copy = async () => {
    const txt = exportJson()
    try {
      await navigator.clipboard.writeText(txt)
      setMsg('Backup copiado. Cole num arquivo de texto e guarde.')
    } catch {
      setImportText(txt)
      setMsg('Não deu para copiar automaticamente. O backup está na caixa abaixo: selecione e copie.')
    }
  }

  const toggles: [keyof S, string, string][] = [
    ['sound', 'Sons', 'Lances, acertos, erros e relógio.'],
    ['coordinates', 'Coordenadas', 'Letras e números nas bordas do tabuleiro.'],
    ['showLegal', 'Casas possíveis', 'Pontos onde a peça selecionada pode ir (nunca no cálculo às cegas).'],
    ['premove', 'Pré-lance nas partidas', 'Marque seu lance na vez do bot; ele sai assim que o bot jogar.'],
    ['autoQueen', 'Promover direto para dama', 'Sem a janela de escolha da peça.'],
    ['intro', 'Animação de abertura', 'O cavalo coroado entrando ao abrir o app.'],
  ]

  return (
    <div className="page">
      <h1>Ajustes</h1>
      <AccountPanel />
      <div className="grid-2">
        <section className="panel stack-lg">
          <div className="field">
            <span className="label">Tema</span>
            <div className="seg" role="group" aria-label="Tema">
              {(
                [
                  ['system', 'Sistema'],
                  ['dark', 'Escuro'],
                  ['light', 'Claro'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} aria-pressed={s.settings.theme === id} onClick={() => set('theme', id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Tabuleiro</span>
            <div className="row">
              {BOARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  className="btn btn-sm"
                  aria-pressed={s.settings.boardTheme === t.id}
                  onClick={() => set('boardTheme', t.id)}
                  style={{ borderColor: s.settings.boardTheme === t.id ? 'var(--accent)' : undefined }}
                >
                  <span style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(2, 9px)', borderRadius: 2, overflow: 'hidden' }} aria-hidden="true">
                    <span style={{ width: 9, height: 9, background: swatchBackground(t, true) }} />
                    <span style={{ width: 9, height: 9, background: swatchBackground(t, false) }} />
                    <span style={{ width: 9, height: 9, background: swatchBackground(t, false) }} />
                    <span style={{ width: 9, height: 9, background: swatchBackground(t, true) }} />
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            {toggles.map(([k, label, hint]) => (
              <label key={k} className="switch" htmlFor={`opt-${k}`}>
                <span className="stack" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{label}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {hint}
                  </span>
                </span>
                <input id={`opt-${k}`} type="checkbox" checked={!!s.settings[k]} onChange={(e) => set(k, e.target.checked as never)} />
              </label>
            ))}
          </div>
        </section>

        <section className="stack-lg">
          <InstallPanel />
          <div className="panel stack">
            <span className="eyebrow">Perfil</span>
            <div className="row">
              <div className="field">
                <label htmlFor="pf-chesscom">Chess.com</label>
                <input
                  id="pf-chesscom"
                  className="input num"
                  inputMode="numeric"
                  value={s.profile.chesscom ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, '').slice(0, 4))
                    setState((x) => ({ ...x, profile: { ...x.profile, chesscom: v || undefined, onboarded: true } }))
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="pf-otb">Rating oficial</label>
                <input
                  id="pf-otb"
                  className="input num"
                  inputMode="numeric"
                  value={s.profile.otb ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, '').slice(0, 4))
                    setState((x) => ({ ...x, profile: { ...x.profile, otb: v || undefined, onboarded: true } }))
                  }}
                />
              </div>
            </div>
          </div>

          <div className="panel stack">
            <span className="eyebrow">Seus dados</span>
            <p style={{ fontSize: 14 }}>
              {account.loggedIn
                ? `Salvo na sua conta (${account.usuario}) e neste aparelho. Restaurar um backup ou apagar o progresso vale para a conta, em todos os aparelhos.`
                : SYNC_TEXT[sync]}
            </p>
            <div className="row">
              <button className="btn" onClick={copy}>
                Copiar backup
              </button>
              <button
                className="btn"
                onClick={() => {
                  const ok = importJson(importText)
                  setMsg(ok ? 'Backup restaurado.' : 'Esse texto não é um backup válido do Faster GM.')
                }}
                disabled={!importText.trim()}
              >
                Restaurar backup
              </button>
            </div>
            <textarea
              id="backup-text"
              className="input"
              style={{ minHeight: 90, padding: 10, fontSize: 12, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }}
              placeholder="Para restaurar, cole aqui o texto do backup."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            {msg && <div className="notice">{msg}</div>}
            <hr className="divider" />
            {confirmReset ? (
              <div className="row">
                <span style={{ fontSize: 14 }}>
                  {account.loggedIn ? 'Apagar todo o progresso, também na conta e nos outros aparelhos? Não tem volta.' : 'Apagar todo o progresso? Não tem volta.'}
                </span>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    resetAll()
                    setConfirmReset(false)
                    setMsg('Progresso apagado.')
                  }}
                >
                  Apagar
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-danger" onClick={() => setConfirmReset(true)} style={{ alignSelf: 'flex-start' }}>
                Apagar progresso
              </button>
            )}
          </div>

          <div className="panel stack" style={{ fontSize: 13 }}>
            <span className="eyebrow">Créditos</span>
            <p className="muted">Problemas: base de puzzles do Lichess (domínio público, CC0), conferidos lance a lance no build.</p>
            <p className="muted">Motor: {ENGINE_NAME}, licença GPL-3.0. Peças: cburnett (Colin M.L. Burnett), GPLv2+. Fontes: Barlow, SIL OFL. Sons das peças e do xeque: Pixabay.</p>
            <p className="muted">Tempo, o cavalo coroado do ícone, é o treinador e o bot do Faster GM.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
