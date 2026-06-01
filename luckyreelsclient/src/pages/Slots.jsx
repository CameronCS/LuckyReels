import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const SYMBOLS = ['💎', '7️⃣', '🍀', '⭐', '🍒', '🍋', '🍇', '🔔']
const PAYOUTS = { '💎': 50, '7️⃣': 20, '🍀': 15, '⭐': 10, '🍒': 5, '🍋': 3, '🍇': 2, '🔔': 2 }
const MAX = 6
const BET_PRESETS = [1, 5, 10, 25]

function colCount(n) {
    return n <= 1 ? 1 : n === 2 ? 2 : 3
}

let idSeq = 0

export default function Slots() {
    const { conn, isAuthed, tokens, setTokens } = useHub()
    const navigate = useNavigate()
    const pendingRef = useRef([])               // FIFO queue of resolve fns
    const [machines, setMachines] = useState(() => [{ id: ++idSeq, symbols: ['🎰', '🎰', '🎰'], spinning: false, msg: 'Ready to spin', msgCls: 'neutral', winners: [] }])
    const [bet, setBetAmt] = useState(1)
    const [customBet, setCustomBet] = useState('')
    const [globalSpin, setGlobal] = useState(false)
    const [message, setMessage] = useState('')
    const [msgCls, setMsgCls] = useState('neutral')
    const [paytable, setPaytable] = useState(false)

    useEffect(() => { if (!isAuthed) navigate('/') }, [isAuthed])

    useEffect(() => {
        if (!conn) {
            return
        }
        conn.on('SlotResult', msg => {
            const resolve = pendingRef.current.shift()
            if (resolve) {
                resolve(msg)
            }
        })
        return () => conn.off('SlotResult')
    }, [conn])

    function updateMachine(id, patch) {
        setMachines(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m))
    }

    async function spinMachine(id, machineNum) {
        const DURS = [700, 900, 1100]
        updateMachine(id, { spinning: true, winners: [], msg: 'Spinning...', msgCls: 'neutral' })

        // Animate reels while waiting for server
        const animPromises = DURS.map((dur, ri) => new Promise(res => {
            let n = 0, total = Math.floor(dur / 80)
            const iv = setInterval(() => {
                setMachines(ms => ms.map(m => {
                    if (m.id !== id) {
                        return m
                    }
                    const syms = [...m.symbols]
                    syms[ri] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
                    return { ...m, symbols: syms }
                }))
                if (++n >= total) { clearInterval(iv); res() }
            }, 80)
        }))

        const serverPromise = new Promise(res => pendingRef.current.push(res))
        const [, serverMsg] = await Promise.all([Promise.all(animPromises), serverPromise])

        setTokens(serverMsg.newBalance)
        const { symbols, resultType, winAmount } = serverMsg
        const winners = resultType === 'jackpot' ? [0, 1, 2]
            : resultType === 'match' ? ([symbols[0] === symbols[1] ? [0, 1] : [], symbols[1] === symbols[2] ? [1, 2] : [], symbols[0] === symbols[2] ? [0, 2] : []].flat()) : []

        updateMachine(id, {
            spinning: false, symbols,
            winners,
            msg: resultType === 'jackpot' ? `🎉 JACKPOT! +${winAmount}` : resultType === 'match' ? `✨ Match! +${winAmount}` : `No match  −${bet}`,
            msgCls: resultType !== 'loss' ? 'win' : 'lose',
        })

        if (winAmount > 0) {
            confetti()
        }
        return serverMsg
    }

    function confetti() {
        const colors = ['#FFD700', '#FF2D55', '#00FF87', '#7F5AF0', '#FFA500']
        for (let i = 0; i < 20; i++) {
            const c = document.createElement('div')
            c.className = 'confetti-piece'
            const dur = 1 + Math.random()
            c.style.cssText = `left:${20 + Math.random() * 60}%;top:20%;background:${colors[Math.floor(Math.random() * colors.length)]};border-radius:${Math.random() > .5 ? '50%' : '2px'};--dur:${dur}s;animation-delay:${Math.random() * .3}s`
            document.body.appendChild(c)
            setTimeout(() => c.remove(), (dur + .4) * 1000)
        }
    }

    async function spinOne(id) {
        const idx = machines.findIndex(m => m.id === id)
        if (machines[idx].spinning || globalSpin || tokens < bet) {
            return
        }
        conn.invoke('SpinSlots', idx + 1, bet)
        await spinMachine(id, idx + 1)
    }

    async function spinAll() {
        if (globalSpin || tokens < bet * machines.length) {
            return
        }
        setGlobal(true)
        setMessage('Spinning all...'); setMsgCls('neutral')
        const results = await Promise.all(machines.map((m, i) => {
            conn.invoke('SpinSlots', i + 1, bet)
            return spinMachine(m.id, i + 1)
        }))
        setGlobal(false)
        const totalNet = results.reduce((s, r) => s + (r.winAmount - bet), 0)
        if (totalNet > 0) {
            setMessage(`Total: +${totalNet}`);
            setMsgCls('win')
        }
        else {
            setMessage('');
            setMsgCls('neutral')
        }
    }

    function addMachine() {
        if (machines.length >= MAX) {
            return
        }
        setMachines(ms => [...ms, { id: ++idSeq, symbols: ['🎰', '🎰', '🎰'], spinning: false, msg: 'Ready to spin', msgCls: 'neutral', winners: [] }])
    }

    function removeMachine(id) {
        if (machines.length <= 1) {
            return
        }
        setMachines(ms => ms.filter(m => m.id !== id))
    }

    const cost = bet * machines.length

    return (
        <div className="game-page">
            <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,215,0,.05) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(255,45,85,.04) 0%, transparent 55%)' }} />
            <Stars count={80} />
            <div className="app-wrapper wide">
                <GameHeader title="Lucky Reels" tagline="Slots" accentColor="var(--gold)" gradient="linear-gradient(135deg,var(--gold2),var(--gold))" />

                {/* Global controls */}
                <div className="controls-bar">
                    <span className="bet-label">Bet</span>
                    {BET_PRESETS.map(v => (
                        <button key={v} className={`bet-btn${bet === v && !customBet ? ' active' : ''}`}
                            onClick={() => { setBetAmt(v); setCustomBet('') }}>{v}</button>
                    ))}
                    <input className="bet-custom" placeholder="Custom" value={customBet}
                        onChange={e => { setCustomBet(e.target.value); const v = parseInt(e.target.value); if (v > 0) setBetAmt(v) }} />
                    <div className="cur-bet" style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="machine-count-label">{machines.length === 1 ? '1 MACHINE' : `${machines.length} MACHINES`}</span>
                        <button className="add-machine-btn" onClick={addMachine} disabled={machines.length >= MAX}>+ MACHINE</button>
                    </div>
                </div>

                {/* Machines grid */}
                <div className={`machines-grid cols-${colCount(machines.length)}`}>
                    {machines.map((m, idx) => (
                        <div key={m.id} className={`slot-card${m.spinning ? ' spinning' : ''}`}>
                            <div className="slot-header">
                                <span className="slot-title">Machine {idx + 1}</span>
                                {machines.length > 1 && (
                                    <button className="remove-slot-btn" onClick={() => removeMachine(m.id)}>×</button>
                                )}
                            </div>
                            <div className="slot-reels">
                                {m.symbols.map((s, ri) => (
                                    <div key={ri} className={`slot-symbol${m.winners.includes(ri) ? ' winner' : ''}`}>{s}</div>
                                ))}
                            </div>
                            <div className={`slot-msg ${m.msgCls}`}>{m.msg}</div>
                            <button className="slot-spin-btn"
                                disabled={m.spinning || globalSpin || tokens < bet}
                                onClick={() => spinOne(m.id)}>
                                SPIN
                            </button>
                        </div>
                    ))}
                </div>

                {message && <div className={`message-bar ${msgCls}`}>{message}</div>}

                <div className="action-bar">
                    {tokens <= 0
                        ? <div className="no-tokens-msg">Out of tokens!</div>
                        : <button className="btn-primary" disabled={globalSpin || tokens < cost} onClick={spinAll}>
                            {machines.length > 1 ? `SPIN ALL · ${cost}` : 'SPIN ALL'}
                        </button>
                    }
                </div>

                {/* Paytable */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="paytable-toggle-btn" onClick={() => setPaytable(p => !p)}>
                        {paytable ? 'Paytable ▴' : 'Paytable ▾'}
                    </button>
                </div>
                <div className={`paytable-content${paytable ? ' open' : ''}`}>
                    {Object.entries(PAYOUTS).map(([sym, mult]) => (
                        <div key={sym} className="paytable-row">
                            <span className="paytable-sym">{sym}</span>
                            <span className="paytable-val">{mult}×</span>
                            <span style={{ color: '#555', fontSize: 10 }}>jackpot</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
