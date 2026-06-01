import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const BET_PRESETS = [5, 10, 25, 50, 100]
const MC_OPTS = [3, 5, 10, 15, 20]

export default function Mines() {
    const { conn, isAuthed, tokens, setTokens } = useHub()
    const navigate = useNavigate()

    const [phase, setPhase] = useState('idle')  // idle | playing | over
    const [bet, setBet] = useState(10)
    const [customBet, setCustBet] = useState('')
    const [mineCount, setMC] = useState(3)
    const [revealed, setRevealed] = useState(new Set())
    const [grid, setGrid] = useState(new Array(25).fill(null))  // null | 'gem' | 'mine' | 'mine-clicked'
    const [multiplier, setMult] = useState(1)
    const [cashoutVal, setCashout] = useState(0)
    const [banner, setBanner] = useState('')
    const [bannerCls, setBannerCls] = useState('')
    const lastClickedRef = useRef(null)

    useEffect(() => { if (!isAuthed) navigate('/') }, [isAuthed])

    useEffect(() => {
        if (!conn) return
        conn.on('MinesState', onState)
        conn.on('MinesResult', onResult)
        return () => { conn.off('MinesState', onState); conn.off('MinesResult', onResult) }
    }, [conn])

    function onState(s) {
        if (s.isGameOver) return  // handled as MinesResult
        setTokens(s.balance)
        if (s.revealed.length === 0 && s.bet > 0) {
            // fresh start
            setPhase('playing')
            setRevealed(new Set())
            setGrid(new Array(25).fill(null))
            setMult(1)
            setCashout(s.bet)
            setBanner(''); setBannerCls('')
        } else {
            // safe reveal
            setRevealed(new Set(s.revealed))
            setGrid(g => {
                const ng = [...g]
                s.revealed.forEach(i => { ng[i] = 'gem' })
                return ng
            })
            setMult(s.multiplier)
            setCashout(Math.floor(s.multiplier * s.bet))
        }
    }

    function onResult(msg) {
        // Mine hit (MinesState format) OR cashout (MinesResult format)
        if (msg.hitMine) {
            // hit mine — use lastClickedRef for the exploded cell, not msg.revealed
            const clickedIdx = lastClickedRef.current
            setGrid(g => {
                const ng = [...g]
                msg.grid.forEach((isMine, i) => { if (isMine) ng[i] = 'mine' })
                if (clickedIdx !== null) ng[clickedIdx] = 'mine-clicked'
                return ng
            })
            setTokens(msg.balance)
            setBanner(`💥 BOOM!  ${msg.net}`)
            setBannerCls('banner-lose')
            setPhase('over')
        } else {
            // cashout
            setGrid(g => {
                const ng = [...g]
                msg.grid.forEach((isMine, i) => { if (isMine) ng[i] = 'mine' })
                return ng
            })
            setTokens(msg.newBalance)
            const sign = msg.net >= 0 ? '+' : ''
            setBanner(`💎 Cashed Out  ${sign}${msg.net}`)
            setBannerCls('banner-win')
            setPhase('over')
        }
    }

    function startGame() {
        if (phase !== 'idle' || tokens < bet) return
        setPhase('playing')
        setRevealed(new Set())
        setGrid(new Array(25).fill(null))
        setBanner(''); setBannerCls('')
        conn.invoke('MinesStart', mineCount, bet)
    }

    function revealCell(idx) {
        if (phase !== 'playing') return
        if (revealed.has(idx) || grid[idx] !== null) return
        lastClickedRef.current = idx
        conn.invoke('MinesReveal', idx)
    }

    function cashOut() {
        if (phase !== 'playing' || revealed.size === 0) return
        conn.invoke('MinesCashout')
    }

    function cellContent(g) {
        if (g === 'gem') return '💎'
        if (g === 'mine' || g === 'mine-clicked') return '💣'
        return ''
    }
    function cellCls(g, isRevealed) {
        if (g === 'mine-clicked') return 'mine-cell mine clicked'
        if (g === 'mine') return 'mine-cell mine'
        if (g === 'gem' || isRevealed) return 'mine-cell safe'
        return 'mine-cell'
    }

    return (
        <div className="game-page">
            <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,149,0,.04) 0%, transparent 55%)' }} />
            <Stars count={60} />
            <div className="app-wrapper">
                <GameHeader title="Mines" tagline="Reveal Gems · Avoid Bombs" accentColor="#FF9500" gradient="linear-gradient(135deg,#FF9500,#FF4500)" />

                {/* Mine count selector */}
                {phase === 'idle' && (
                    <div className="controls-bar">
                        <span className="bet-label">Mines</span>
                        {MC_OPTS.map(v => (
                            <button key={v} className={`mc-btn${mineCount === v ? ' active' : ''}`} onClick={() => setMC(v)}>{v}</button>
                        ))}
                    </div>
                )}

                {/* Bet */}
                {phase === 'idle' && (
                    <div className="controls-bar">
                        <span className="bet-label">Bet</span>
                        {BET_PRESETS.map(v => (
                            <button key={v} className={`bet-btn${bet === v && !customBet ? ' active' : ''}`}
                                onClick={() => { setBet(v); setCustBet('') }}>{v}</button>
                        ))}
                        <input className="bet-custom" placeholder="Custom" value={customBet}
                            onChange={e => { setCustBet(e.target.value); const v = parseInt(e.target.value); if (v > 0) setBet(v) }} />
                    </div>
                )}

                {/* Game status */}
                {phase === 'playing' && (
                    <div className="mines-game-status">
                        <div className="stat-item">
                            <div className="stat-label">Mines</div>
                            <div className="stat-value">{mineCount} 💣</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-label">Multiplier</div>
                            <div className="stat-value green">{multiplier.toFixed(2)}×</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-label">Cashout</div>
                            <div className="stat-value">{cashoutVal} 🪙</div>
                        </div>
                    </div>
                )}

                {/* Grid */}
                <div className={`mines-grid${phase === 'playing' ? ' playing' : ''}`}>
                    {grid.map((g, i) => (
                        <div key={i} className={cellCls(g, revealed.has(i))} onClick={() => revealCell(i)}>
                            {cellContent(g)}
                        </div>
                    ))}
                </div>

                {banner && <div className={`result-banner ${bannerCls}`}>{banner}</div>}

                <div className="action-bar">
                    {phase === 'idle' && (
                        <button className="btn-primary" disabled={tokens < bet} onClick={startGame}>
                            {tokens < bet ? `Need ${bet} tokens` : `START GAME · ${bet}`}
                        </button>
                    )}
                    {phase === 'playing' && (
                        <button className="btn-green" disabled={revealed.size === 0} onClick={cashOut}>
                            {revealed.size === 0 ? 'Reveal a cell first' : `CASH OUT · ${cashoutVal}`}
                        </button>
                    )}
                    {phase === 'over' && (
                        <button className="btn-primary" onClick={() => { setPhase('idle'); setGrid(new Array(25).fill(null)); setBanner('') }}>
                            PLAY AGAIN
                        </button>
                    )}
                </div>

                {tokens <= 0 && phase === 'idle' && <div className="no-tokens-msg">Out of tokens!</div>}

                <div className="rules-strip">
                    <div className="rule"><span style={{ color: '#FF9500' }}>25</span>Cells</div>
                    <div className="rule"><span className="c-gold">0.97</span>House edge</div>
                    <div className="rule"><span className="c-green">∞</span>Cash out anytime</div>
                </div>
            </div>
        </div>
    )
}
