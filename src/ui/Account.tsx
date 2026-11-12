// Conta do Faster GM: bloco no topo de Ajustes e aviso na tela Hoje.
import { useState, type FormEvent } from 'react'
import {
  changePassword,
  createAccount,
  deleteAccount,
  login,
  logout,
  PASSWORD_MIN,
  syncNow,
  useAccount,
  USERNAME_RE,
  type AccountView,
} from '../lib/account'
import { IconUser } from './icons'

const HIDE_KEY = 'faster-gm:conta-aviso'
const HIDE_DAYS = 14

function hiddenNow(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(HIDE_KEY) || 0) < HIDE_DAYS * 86400000
  } catch {
    return false
  }
}

export function statusText(v: AccountView): string {
  if (v.expired) return 'A sessão acabou. Entre de novo para continuar sincronizando.'
  switch (v.status) {
    case 'syncing':
      return 'Sincronizando com a conta...'
    case 'synced':
      return 'Tudo salvo na conta.'
    case 'offline':
      return v.pending
        ? 'Sem conexão agora. O progresso fica neste aparelho e vai para a conta quando a internet voltar.'
        : 'Sem conexão agora. Quando a internet voltar, o app confere a conta de novo.'
    case 'error':
      return 'Não deu para salvar na conta. O progresso continua neste aparelho.'
    default:
      return ''
  }
}

/** Aviso na tela Hoje: criar conta ou entrar, ou entrar de novo quando a sessão acabou. */
export function AccountCard() {
  const v = useAccount()
  const [hidden, setHidden] = useState(hiddenNow)
  if (!v.enabled || v.loggedIn || (hidden && !v.expired)) return null
  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now()))
    } catch {
      /* sem armazenamento */
    }
  }
  return (
    <section className="panel install-card" aria-label="Conta">
      <span className="install-icon" aria-hidden="true">
        <IconUser />
      </span>
      <div className="stack" style={{ gap: 2 }}>
        <span style={{ fontWeight: 600 }}>{v.expired ? `Entre de novo na conta ${v.usuario}` : 'O mesmo progresso no celular e no computador'}</span>
        <span className="muted" style={{ fontSize: 14 }}>
          {v.expired
            ? 'A sessão acabou. O que você fizer aqui continua salvo e vai para a conta quando você entrar.'
            : 'Crie uma conta com nome e senha, ou entre na sua. O que você já fez neste aparelho vai junto.'}
        </span>
      </div>
      <div className="row install-actions">
        <a className="btn btn-primary" href="#ajustes">
          {v.expired ? 'Entrar' : 'Criar conta ou entrar'}
        </a>
        {!v.expired && (
          <button className="btn btn-ghost" onClick={hide}>
            Agora não
          </button>
        )}
      </div>
    </section>
  )
}

/** Bloco em Ajustes: entrar, criar conta, e depois a conta conectada. */
export function AccountPanel() {
  const v = useAccount()
  if (!v.enabled) return null
  return (
    <section className="panel stack account-panel" id="conta" aria-labelledby="conta-titulo">
      <span className="eyebrow" id="conta-titulo">
        Conta
      </span>
      {v.loggedIn ? <Connected v={v} /> : <SignIn v={v} />}
    </section>
  )
}

function cleanName(raw: string): string {
  return raw.trim().toLowerCase()
}

function SignIn({ v }: { v: AccountView }) {
  const [mode, setMode] = useState<'entrar' | 'criar'>(v.expired ? 'entrar' : 'criar')
  const [name, setName] = useState(v.usuario ?? '')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const usuario = cleanName(name)
    if (!USERNAME_RE.test(usuario)) return setError('O nome precisa ter de 3 a 20 letras ou números, sem espaço (pode usar ponto, hífen e _).')
    if (pass.length < PASSWORD_MIN) return setError(`A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
    if (mode === 'criar' && pass !== pass2) return setError('As duas senhas não são iguais.')
    setError(null)
    setBusy(true)
    const err = mode === 'criar' ? await createAccount(usuario, pass) : await login(usuario, pass)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <>
      <p style={{ fontSize: 14 }}>
        {v.expired
          ? `A sessão da conta ${v.usuario} acabou. Entre de novo: o que você fez aqui nesse meio tempo vai junto.`
          : 'Com uma conta, o mesmo progresso aparece no celular e no computador. O que você já fez neste aparelho vai junto para a conta.'}
      </p>
      <div className="seg" role="group" aria-label="Entrar ou criar conta" style={{ alignSelf: 'flex-start' }}>
        <button type="button" aria-pressed={mode === 'criar'} onClick={() => (setMode('criar'), setError(null))}>
          Criar conta
        </button>
        <button type="button" aria-pressed={mode === 'entrar'} onClick={() => (setMode('entrar'), setError(null))}>
          Entrar
        </button>
      </div>
      <form className="stack account-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="conta-usuario">Nome de usuário</label>
          <input
            id="conta-usuario"
            className="input"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {mode === 'criar' && <span className="muted account-hint">De 3 a 20 letras ou números, sem espaço. Pode usar ponto, hífen e _.</span>}
        </div>
        <div className="field">
          <label htmlFor="conta-senha">Senha</label>
          <input
            id="conta-senha"
            className="input"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
            maxLength={72}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </div>
        {mode === 'criar' && (
          <div className="field">
            <label htmlFor="conta-senha2">Repita a senha</label>
            <input
              id="conta-senha2"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              maxLength={72}
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
          </div>
        )}
        <label className="row" style={{ gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar a senha
        </label>
        {error && (
          <div className="notice notice-bad" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>
          {busy ? (mode === 'criar' ? 'Criando...' : 'Entrando...') : mode === 'criar' ? 'Criar conta' : 'Entrar'}
        </button>
        {mode === 'criar' && <p className="muted account-hint">Sem e-mail: só nome e senha. Anote a senha, porque não tem como recuperar por e-mail.</p>}
      </form>
    </>
  )
}

function Connected({ v }: { v: AccountView }) {
  const [panel, setPanel] = useState<'none' | 'senha' | 'sair' | 'apagar'>('none')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [senha, setSenha] = useState('')

  const open = (p: typeof panel) => {
    setPanel(p)
    setMsg(null)
    setAtual('')
    setNova('')
    setSenha('')
  }

  const doLogout = async (force: boolean) => {
    setBusy(true)
    const r = await logout(force)
    setBusy(false)
    if (r === 'pending') open('sair')
  }

  const doChange = async (e: FormEvent) => {
    e.preventDefault()
    if (nova.length < PASSWORD_MIN) return setMsg({ bad: true, text: `A senha nova precisa ter pelo menos ${PASSWORD_MIN} caracteres.` })
    setBusy(true)
    const err = await changePassword(atual, nova)
    setBusy(false)
    if (err) return setMsg({ bad: true, text: err })
    setPanel('none')
    setMsg({ bad: false, text: 'Senha trocada. Os outros aparelhos vão pedir a senha nova.' })
  }

  const doDelete = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const err = await deleteAccount(senha)
    setBusy(false)
    if (err) setMsg({ bad: true, text: err })
  }

  return (
    <>
      <div className="account-head">
        <span className="install-icon" aria-hidden="true">
          <IconUser />
        </span>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="account-name">{v.usuario}</span>
          <span className="muted" style={{ fontSize: 14 }} role="status">
            {statusText(v)}
          </span>
        </div>
      </div>
      <div className="row">
        <button className="btn" onClick={() => void syncNow()} disabled={v.status === 'syncing'}>
          Sincronizar agora
        </button>
        <button className="btn" onClick={() => open(panel === 'senha' ? 'none' : 'senha')} aria-expanded={panel === 'senha'}>
          Trocar senha
        </button>
        <button className="btn btn-ghost" onClick={() => void doLogout(false)} disabled={busy}>
          Sair
        </button>
      </div>
      {msg && (
        <div className={`notice${msg.bad ? ' notice-bad' : ''}`} role={msg.bad ? 'alert' : 'status'}>
          {msg.text}
        </div>
      )}
      {panel === 'senha' && (
        <form className="stack account-form" onSubmit={doChange}>
          <div className="field">
            <label htmlFor="conta-atual">Senha atual</label>
            <input id="conta-atual" className="input" type="password" autoComplete="current-password" maxLength={72} value={atual} onChange={(e) => setAtual(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="conta-nova">Senha nova</label>
            <input id="conta-nova" className="input" type="password" autoComplete="new-password" maxLength={72} value={nova} onChange={(e) => setNova(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Trocar senha
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => open('none')}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {panel === 'sair' && (
        <div className="notice stack" role="alert">
          <span>Tem progresso deste aparelho que ainda não foi para a conta (sem conexão). Se sair agora, ele se perde.</span>
          <div className="row">
            <button className="btn btn-danger" onClick={() => void doLogout(true)} disabled={busy}>
              Sair mesmo assim
            </button>
            <button className="btn btn-ghost" onClick={() => open('none')}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <p className="muted account-hint">Ao sair, o progresso some deste aparelho e continua guardado na conta.</p>
      <hr className="divider" />
      {panel === 'apagar' ? (
        <form className="stack account-form" onSubmit={doDelete}>
          <span style={{ fontSize: 14 }}>Apagar a conta e o progresso guardado nela? Não tem volta. O progresso deste aparelho fica.</span>
          <div className="field">
            <label htmlFor="conta-apagar">Sua senha</label>
            <input id="conta-apagar" className="input" type="password" autoComplete="current-password" maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-danger" type="submit" disabled={busy || !senha}>
              Apagar conta
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => open('none')}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-ghost btn-danger" onClick={() => open('apagar')} style={{ alignSelf: 'flex-start' }}>
          Apagar conta
        </button>
      )}
    </>
  )
}
