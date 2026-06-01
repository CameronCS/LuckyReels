import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const HORSES = [
    { name: 'Thunder Bolt', color: '#FFD700' },
    { name: 'Lucky Strike', color: '#00FF87' },
    { name: 'Iron Duke', color: '#0AF5F5' },
    { name: 'Wild Fire', color: '#FF4455' },
    { name: 'Night Shadow', color: '#bb88ff' },
    { name: 'Silver Fox', color: '#cccccc' },
]
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th']
const POS_CLS = ['p1', 'p2', 'p3', '', '', '']
const CHIP_OPTS = [10, 25, 50, 100]

export default function Horse() {
    const { conn, isAuthed, tokens, setTokens } = useHub()
    const navigate = useNavigate()

    // React state — only updated at phase boundaries, not mid-animation
    const [phase, setPhase] = useState('idle')
    const [selected, setSelected] = useState(-1)
    const [bet, setBet] = useState(10)
    const [custBet, setCustBet] = useState('')
    const [status, setStatus] = useState('Pick a horse and click RACE!')
    const [statusCls, setStatusCls] = useState('')

    // DOM refs for direct updates inside the rAF loop (no React re-renders)
    const runnerRefs = useRef([])   // [i] → the 🏇 div
    const rankRefs = useRef([])   // [i] → the lane-pos div
    const statusRef = useRef(null) // the status-bar div

    // Mutable race data — all live in refs so rAF always sees current values
    const posRef = useRef(new Array(6).fill(0))
    const speedsRef = useRef(new Array(6).fill(1))
    const winnerRef = useRef(-1)
    const framesAfterWin = useRef(0)
    const finishOrder = useRef([])
    const resultRef = useRef(null)
    const selectedRef = useRef(-1)
    const rafRef = useRef(null)

    useEffect(() => {
        selectedRef.current = selected
    }, [selected])
    useEffect(() => {
        if (!isAuthed) {
            navigate('/')
        }
    }, [isAuthed])
    useEffect(() => () => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current)
        }
    }, [])

    useEffect(() => {
        if (!conn) {
            return
        }
        conn.on('HorseResult', onResult)
        return () => conn.off('HorseResult', onResult)
    }, [conn])

    // Update the status bar DOM directly (no re-render)
    function domStatus(text, cls) {
        if (!statusRef.current) {
            return
        }
        statusRef.current.textContent = text
        statusRef.current.className = `status-bar${cls ? ' ' + cls : ''}`
    }

    function onResult(msg) {
        resultRef.current = msg
        const winIdx = HORSES.findIndex(h => h.name === msg.winnerName)
        if (winIdx < 0) {
            return
        }

        // All horses start tight — winner is steered in the final stretch, not from the gate
        const speeds = HORSES.map(() => 1.0 + (Math.random() - 0.5) * 0.04)

        posRef.current = new Array(6).fill(0)
        speedsRef.current = speeds
        winnerRef.current = -1
        framesAfterWin.current = 0
        finishOrder.current = []

        const counts = ['3', '2', '1', '🏁 GO!']
        let ci = 0
        domStatus(counts[0], 'countdown')
        const tid = setInterval(() => {
            ci++
            if (ci < counts.length) {
                domStatus(counts[ci], 'countdown')
            } else {
                clearInterval(tid)
                rafRef.current = requestAnimationFrame(ts => raceLoop(ts, winIdx))
            }
        }, 620)
    }

    function raceLoop(ts, targetWinner) {
        const pos = posRef.current

        // Advance horses
        for (let i = 0; i < 6; i++) {
            if (pos[i] >= 100) {
                continue
            }
            let sp = speedsRef.current[i]
            if (winnerRef.current < 0) {
                if (i === targetWinner && pos[i] > 78) {
                    sp *= 1.20  // winner surges in the home stretch
                } else if (i !== targetWinner && pos[i] - pos[targetWinner] > 3) {
                    sp *= 0.85  // non-winner fades if it drifts too far ahead
                }
            }
            const noise = (Math.random() - 0.5) * 0.15
            pos[i] = Math.min(100, pos[i] + 0.27 * sp + noise)
            if (pos[i] >= 100 && !finishOrder.current.includes(i)) {
                finishOrder.current.push(i)
                if (winnerRef.current < 0) winnerRef.current = i
            }
        }

        // Compute rank of each horse
        const sorted = [...pos.keys()].sort((a, b) => pos[b] - pos[a])
        const rankOf = new Array(6)
        sorted.forEach((hi, rank) => { rankOf[hi] = rank })

        // ── Direct DOM updates — zero React overhead ──────────────────
        for (let i = 0; i < 6; i++) {
            const runner = runnerRefs.current[i]
            if (runner) {
                runner.style.left = `${2 + Math.min(pos[i], 100) * 0.885}%`
            }

            const rankEl = rankRefs.current[i]
            if (rankEl) {
                const r = rankOf[i]
                rankEl.textContent = ORDINALS[r]
                rankEl.className = `lane-pos${POS_CLS[r] ? ' ' + POS_CLS[r] : ''}`
            }
        }

        if (winnerRef.current < 0) {
            domStatus(`${HORSES[sorted[0]].name} leads!`, 'racing')
        }

        if (winnerRef.current >= 0) {
            framesAfterWin.current++
            if (framesAfterWin.current >= 72) {
                endRace(targetWinner)
                return
            }
        }

        rafRef.current = requestAnimationFrame(ts2 => raceLoop(ts2, targetWinner))
    }

    function endRace(targetWinner) {
        const msg = resultRef.current
        const playerWon = targetWinner === selectedRef.current
        const txt = playerWon
            ? `🏆 ${msg.winnerName} wins!  +${msg.net}`
            : `${msg.winnerName} wins  ·  −${Math.abs(msg.net)}`
        const cls = playerWon ? 'win' : 'loss'

        domStatus(txt, cls)
        setTokens(msg.newBalance)

        setTimeout(() => {
            // Reset runners to gate
            for (let i = 0; i < 6; i++) {
                if (runnerRefs.current[i]) {
                    runnerRefs.current[i].style.left = '2%'
                }
                if (rankRefs.current[i]) {
                    rankRefs.current[i].textContent = '';
                    rankRefs.current[i].className = 'lane-pos'
                }
            }
            posRef.current = new Array(6).fill(0)
            setPhase('idle')
            setStatus('Pick a horse and click RACE!')
            setStatusCls('')
        }, 2500)
    }

    function startRace() {
        if (phase !== 'idle') {
            return
        }
        if (selected < 0) {
            setStatus('Pick a horse first!'); return
        }
        if (tokens < bet) {
            setStatus('Not enough tokens!'); return
        }

        posRef.current = new Array(6).fill(0)
        for (let i = 0; i < 6; i++) {
            if (runnerRefs.current[i]) {
                runnerRefs.current[i].style.left = '2%'
            }
            if (rankRefs.current[i]) { 
                rankRefs.current[i].textContent = ''; 
                rankRefs.current[i].className = 'lane-pos'
            }
        }

        setPhase('racing')
        setStatus('Waiting for server...')
        setStatusCls('countdown')
        conn.invoke('RaceHorse', HORSES[selected].name, bet)
    }

    return (
        <div className="game-page">
            <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(0,255,135,.04) 0%, transparent 55%)' }} />
            <Stars count={60} />
            <div className="app-wrapper wide">
                <GameHeader title="Horse Racing" tagline="Pick Your Winner" accentColor="var(--green)" gradient="linear-gradient(135deg,#00cc6a,var(--green))" />

                {/* Track — runners updated via DOM refs, not React state */}
                <div className="track-section">
                    {HORSES.map((h, i) => (
                        <div key={i} className="lane">
                            <div className="lane-label">
                                <span className={`lane-num horse-c${i}`}>{i + 1}</span>
                                <span className={`lane-name${selected === i ? ' selected-horse' : ''}`}>{h.name}</span>
                            </div>
                            <div className="track-strip">
                                <div
                                    className="horse-runner"
                                    ref={el => { runnerRefs.current[i] = el }}
                                >
                                    🏇
                                </div>
                            </div>
                            {/* rank label — updated via DOM ref during race */}
                            <div
                                className="lane-pos"
                                ref={el => { rankRefs.current[i] = el }}
                            />
                        </div>
                    ))}
                </div>

                {/* Horse selection cards */}
                <div className="horse-cards-grid">
                    {HORSES.map((h, i) => (
                        <div
                            key={i}
                            className={`horse-card${selected === i ? ' selected' : ''}`}
                            style={selected === i ? { borderColor: h.color, boxShadow: `0 0 12px ${h.color}33` } : {}}
                            onClick={() => { if (phase === 'idle') setSelected(i) }}
                        >
                            <div className={`horse-badge horse-bg-${i}`} style={{ color: '#0a0a0f' }}>{i + 1}</div>
                            <div>
                                <div className="horse-name">{h.name}</div>
                                <div className="horse-payout">Pays 4×</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bet chips */}
                <div className="controls-bar">
                    <span className="bet-label">Bet</span>
                    <div className="chip-row">
                        {CHIP_OPTS.map(v => (
                            <button key={v}
                                className={`chip-selector${bet === v && !custBet ? ' active' : ''}`}
                                disabled={phase !== 'idle'}
                                onClick={() => {
                                    setBet(v);
                                    setCustBet('')
                                }}>
                                {v}
                            </button>
                        ))}
                        <input className="custom-chip-input" placeholder="Custom" value={custBet}
                            disabled={phase !== 'idle'}
                            onChange={e => {
                                setCustBet(e.target.value)
                                const v = parseInt(e.target.value)
                                if (v > 0) {
                                    setBet(v)
                                }
                            }} />
                    </div>
                    <div className="cur-bet" style={{ marginLeft: 'auto' }}>BET <span>{bet}</span></div>
                </div>

                {/* Status — DOM ref used during animation, React state used at rest */}
                <div
                    className={`status-bar ${statusCls}`}
                    ref={statusRef}
                >
                    {status}
                </div>

                <div className="action-bar">
                    {phase === 'idle'
                        ? <button className="race-btn" disabled={selected < 0 || tokens < bet} onClick={startRace}>RACE!</button>
                        : <button className="race-btn" disabled>RACING...</button>
                    }
                </div>

                {tokens <= 0 && phase === 'idle' && <div className="no-tokens-msg">Out of tokens!</div>}

                <div className="rules-strip">
                    <div className="rule"><span className="c-gold">4:1</span>Winner pays</div>
                    <div className="rule"><span className="c-green">6</span>Horses</div>
                    <div className="rule"><span style={{ color: '#888' }}>1/6</span>Odds</div>
                </div>
            </div>
        </div>
    )
}
