import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'

export default function GameHeader({ title, tagline, accentColor, gradient }) {
    const { tokens, playerName } = useHub()
    const navigate = useNavigate()
    const [bump, setBump] = useState(false)
    const [delta, setDelta] = useState(null)
    const prevRef = useRef(tokens)

    useEffect(() => {
        const diff = tokens - prevRef.current
        prevRef.current = tokens
        if (diff !== 0) setDelta(diff)
        setBump(true)
        const t = setTimeout(() => setBump(false), 400)
        return () => clearTimeout(t)
    }, [tokens])

    useEffect(() => {
        if (delta === null) return
        const t = setTimeout(() => setDelta(null), 1400)
        return () => clearTimeout(t)
    }, [delta])

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
                    <div style={{ position: 'relative' }}>
                        <div className={`tokens-value${bump ? ' bump' : ''}`}>{tokens.toLocaleString()}</div>
                        {delta !== null && delta !== 0 && (
                            <div className={`tokens-delta${delta > 0 ? ' delta-pos' : ' delta-neg'}`}>
                                {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
