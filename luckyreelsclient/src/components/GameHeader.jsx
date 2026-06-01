import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'

export default function GameHeader({ title, tagline, accentColor, gradient }) {
  const { tokens, playerName } = useHub()
  const navigate = useNavigate()
  const [bump, setBump] = useState(false)
  const prev = useState(tokens)[0]

  useEffect(() => {
    setBump(true)
    const t = setTimeout(() => setBump(false), 400)
    return () => clearTimeout(t)
  }, [tokens])

  return (
    <div className="game-header" style={{ '--accent': accentColor }}>
      <style>{`.game-header::before { background: ${gradient ?? `linear-gradient(90deg,transparent,${accentColor},transparent)`}; }`}</style>
      <button className="back-btn" style={{ '--hov': accentColor }} onClick={() => navigate('/')}>← LOBBY</button>
      <div className="header-center">
        <h1 style={{ background: gradient ?? accentColor, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          {title}
        </h1>
        {tagline && <div className="tagline">{tagline}</div>}
      </div>
      <div className="header-right">
        <div className="player-pill" style={{ color: accentColor }}>{playerName}</div>
        <div className="tokens-box">
          <div className="tokens-box-label">🪙 Tokens</div>
          <div className={`tokens-value${bump ? ' bump' : ''}`}>{tokens}</div>
        </div>
      </div>
    </div>
  )
}
