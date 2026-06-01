import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useHub, API } from '../hub'
import Stars from '../components/Stars'

const GAMES = [
  { cls: 'slots',    path: '/slots',     icon: '🎰', name: 'Lucky Reels',  desc: 'Spin the reels and match symbols.\nJackpot pays up to 50× your bet.' },
  { cls: 'bj',       path: '/blackjack', icon: '🃏', name: 'Blackjack',    desc: 'Beat the dealer without going over 21.\nBlackjack pays 3 to 2.' },
  { cls: 'roulette', path: '/roulette',  icon: '🎡', name: 'Roulette',     desc: 'Bet on numbers, colors, or groups.\nStraight up pays 35 to 1.' },
  { cls: 'horse',    path: '/horse',     icon: '🏇', name: 'Horse Racing', desc: 'Pick your horse and watch the race.\nWinner pays 4 to 1.' },
  { cls: 'baccarat', path: '/baccarat',  icon: '🎴', name: 'Baccarat',     desc: 'Bet on Player, Banker, or Tie.\nBanker pays 0.95:1 · Tie pays 8:1.' },
  { cls: 'mines',    path: '/mines',     icon: '💣', name: 'Mines',        desc: 'Reveal gems, avoid the bombs.\nCash out anytime before you explode.' },
  { cls: 'crash',    path: '/crash',     icon: '🚀', name: 'Crash',        desc: 'Watch the multiplier climb.\nCash out before it crashes.' },
  { cls: 'plinko',   path: '/plinko',    icon: '🎯', name: 'Plinko',       desc: 'Drop the ball through 8 rows of pegs.\nLow, Medium, or High risk.' },
]

export default function Home() {
  const { isAuthed, tokens, playerName, connect, disconnect } = useHub()
  const [mode,     setMode]     = useState('register')
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  function switchTab(m) { setMode(m); setError('') }

  async function submit() {
    setError('')
    if (mode === 'register') {
      if (!name.trim())     return setError('Enter a name.')
      if (!email.trim())    return setError('Enter an email.')
      if (!password)        return setError('Enter a password.')
      if (password.length < 4) return setError('Password must be at least 4 characters.')
    } else {
      if (!username.trim()) return setError('Enter a username.')
      if (!password)        return setError('Enter a password.')
    }

    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await fetch(`${API}/api/v1/Auth/Register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Name: name.trim(), Email: email.trim(), Password: password }),
        })
        if (!res.ok) { setError('Username already taken.'); return }
        const data = await res.json()
        await connect(data.token, data.userName)
      } else {
        const res = await fetch(`${API}/api/v1/Auth/LoginPlayer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Username: username.trim(), Password: password }),
        })
        if (!res.ok) { setError('Invalid username or password.'); return }
        const data = await res.json()
        await connect(data.token, data.userName)
      }
    } catch {
      setError('Connection failed — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  function onKey(e) { if (e.key === 'Enter') submit() }

  if (!isAuthed) {
    return (
      <>
        <Stars count={100} />
        <div className="page-bg" />
        <div className="lobby">
          <div className="lobby-card">
            <div className="lobby-logo">Lucky Reels</div>
            <p className="lobby-tagline">Casino · Est. Tonight</p>
            <div className="lobby-tabs">
              <button className={`lobby-tab${mode === 'register' ? ' active' : ''}`} onClick={() => switchTab('register')}>Register</button>
              <button className={`lobby-tab${mode === 'login'    ? ' active' : ''}`} onClick={() => switchTab('login'   )}>Login</button>
            </div>
            {mode === 'register' ? (
              <>
                <input className="lobby-input" placeholder="Name..."     maxLength={20} value={name}     onChange={e => setName(e.target.value)}     onKeyDown={onKey} />
                <input className="lobby-input" placeholder="Email..."    type="email"   value={email}    onChange={e => setEmail(e.target.value)}    onKeyDown={onKey} />
              </>
            ) : (
              <input className="lobby-input" placeholder="Username..." maxLength={20} value={username} onChange={e => setUsername(e.target.value)} onKeyDown={onKey} />
            )}
            <input className="lobby-input" placeholder="Password..." type="password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} />
            <div className="lobby-error">{error}</div>
            <button className="lobby-btn" onClick={submit} disabled={loading}>
              {loading ? '...' : mode === 'register' ? 'CREATE ACCOUNT' : 'LOGIN'}
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Stars count={100} />
      <div className="page-bg" />
      <div className="hub-page">
        <div className="hub-inner">
          <div className="hub-header">
            <div>
              <div className="hub-title">Lucky Reels Casino</div>
              <div className="hub-sub">Choose your game</div>
            </div>
            <div className="hub-player">
              <div className="hub-name-pill">
                <div className="hub-online-dot" />
                <span>{playerName}</span>
              </div>
              <div className="hub-tokens">
                <div className="hub-tokens-label">🪙 Tokens</div>
                <div className="hub-tokens-value">{tokens}</div>
              </div>
              <button className="hub-logout-btn" onClick={disconnect}>Logout</button>
            </div>
          </div>

          <div className="game-select-label">Select a game</div>

          <div className="game-cards">
            {GAMES.map(g => (
              <Link key={g.path} className={`game-card ${g.cls}`} to={g.path}>
                <div className="game-icon">{g.icon}</div>
                <div className="game-name">{g.name}</div>
                <div className="game-desc">{g.desc.split('\n').map((l, i) => <span key={i}>{l}{i === 0 && <br />}</span>)}</div>
                <button className="game-play-btn">PLAY</button>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
