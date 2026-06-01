import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function CardEl({ card }) {
    if (!card) {
        return null
    }
    const red = card.suit === '♥' || card.suit === '♦'
    return (
        <div className={`card ${red ? 'red' : 'black'}`}>
            <div className="card-rank-top">{card.rank}</div>
            <div className="card-suit-top">{card.suit}</div>
            <div className="card-suit-center">{card.suit}</div>
            <div className="card-suit-bot">{card.suit}</div>
            <div className="card-rank-bot">{card.rank}</div>
        </div>
    )
}

const BET_PRESETS = [1, 5, 10, 25, 50]

export default function Baccarat() {
    const { conn, isAuthed, tokens, setTokens } = useHub()
    const navigate = useNavigate()

    const [phase, setPhase] = useState('idle')
    const [betType, setBetType] = useState('player')
    const [bet, setBet] = useState(1)
    const [customBet, setCustomBet] = useState('')
    const [playerHand, setPlayerHand] = useState([])
    const [bankerHand, setBankerHand] = useState([])
    const [pScore, setPScore] = useState(null)
    const [bScore, setBScore] = useState(null)
    const [result, setResult] = useState('')
    const [net, setNet] = useState(0)

    useEffect(() => {
        if (!isAuthed) navigate('/')
    }, [isAuthed])

    useEffect(() => {
        if (!conn) {
            return
        }
        conn.on('BaccaratResult', onResult)
        return () => conn.off('BaccaratResult', onResult)
    }, [conn])

    async function onResult(msg) {
        // Animate dealing: P1 B1 P2 B2 [P3] [B3]
        const seq = [
            { side: 'p', idx: 0 }, { side: 'b', idx: 0 },
            { side: 'p', idx: 1 }, { side: 'b', idx: 1 },
            ...(msg.playerHand[2] ? [{ side: 'p', idx: 2 }] : []),
            ...(msg.bankerHand[2] ? [{ side: 'b', idx: 2 }] : []),
        ]
        setPlayerHand([]); setBankerHand([]); setPScore(null); setBScore(null)

        let ph = [], bh = []
        for (const step of seq) {
            await sleep(300)
            if (step.side === 'p') {
                ph = [...ph, msg.playerHand[step.idx]]; setPlayerHand([...ph])
            }
            else {
                bh = [...bh, msg.bankerHand[step.idx]]; setBankerHand([...bh])
            }
        }

        await sleep(200)
        const pNat = msg.playerHand.length === 2 && (msg.playerHand.reduce((a, c) => a + cardVal(c), 0) % 10) >= 8
        const bNat = msg.bankerHand.length === 2 && (msg.bankerHand.reduce((a, c) => a + cardVal(c), 0) % 10) >= 8
        const pt = msg.playerHand.reduce((a, c) => a + cardVal(c), 0) % 10
        const bt = msg.bankerHand.reduce((a, c) => a + cardVal(c), 0) % 10
        setPScore({ val: pt, nat: pNat })
        setBScore({ val: bt, nat: bNat })
        setResult(msg.outcome)
        setNet(msg.net)
        setTokens(msg.newBalance)
        setPhase('over')
    }

    function cardVal(c) {
        if (c.rank === 'A') {
            return 1
        }
        if (['10', 'J', 'Q', 'K'].includes(c.rank)) {
            return 0
        }
        return parseInt(c.rank)
    }

    function deal() {
        if (phase !== 'idle' || tokens < bet) {
            return
        }
        setPhase('dealing')
        setPlayerHand([]); setBankerHand([]); setPScore(null); setBScore(null); setResult(''); setNet(0)
        conn.invoke('BaccaratBet', betType, bet)
    }

    function resultLabel() {
        const abs = Math.abs(net)
        if (net > 0) {
            if (result === 'tie') {
                return `TIE! +${net}`
            }
            return result === 'player' ? `PLAYER WINS  +${net}` : `BANKER WINS  +${net}`
        }
        if (net === 0) {
            return 'PUSH — BET RETURNED'
        }
        return result === 'player' ? `Player Wins  −${abs}` : result === 'banker' ? `Banker Wins  −${abs}` : `Tie  −${abs}`
    }
    function resultCls() {
        if (result === 'player') {
            return 'player-win'
        }
        if (result === 'banker') {
            return 'banker-win'
        }
        return 'tie-result'
    }

    return (
        <div className="game-page">
            <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(198,136,255,.04) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(255,45,85,.04) 0%, transparent 55%)' }} />
            <Stars count={60} />
            <div className="app-wrapper">
                <GameHeader title="Baccarat" tagline="Player · Banker · Tie" accentColor="var(--purple)" gradient="linear-gradient(135deg,var(--purple),var(--blue))" />

                <div className="baccarat-table">
                    <div className="bacc-hands">
                        <div className="bacc-side">
                            <div className="bacc-label">
                                PLAYER
                                {pScore && <span className={`side-score${pScore.nat ? ' natural' : ''}`}>{pScore.val}</span>}
                            </div>
                            <div className="cards-row">{playerHand.map((c, i) => <CardEl key={i} card={c} />)}</div>
                        </div>
                        <div className="bacc-side">
                            <div className="bacc-label">
                                BANKER
                                {bScore && <span className={`side-score${bScore.nat ? ' natural' : ''}`}>{bScore.val}</span>}
                            </div>
                            <div className="cards-row">{bankerHand.map((c, i) => <CardEl key={i} card={c} />)}</div>
                        </div>
                    </div>
                    {phase === 'over' && (
                        <div className={`result-bar ${resultCls()}`} style={{ marginTop: 16 }}>{resultLabel()}</div>
                    )}
                </div>

                {/* Bet type */}
                <div className="bet-type-row">
                    {['player', 'tie', 'banker'].map(t => (
                        <button key={t} className={`bet-type-btn ${t}${betType === t ? ' selected' : ''}`}
                            disabled={phase !== 'idle'}
                            onClick={() => setBetType(t)}>
                            {t.toUpperCase()}
                        </button>
                    ))}
                </div>

                {/* Bet amount */}
                <div className="controls-bar">
                    <span className="bet-label">Bet</span>
                    {BET_PRESETS.map(v => (
                        <button key={v} className={`bet-btn${bet === v && !customBet ? ' active' : ''}`}
                            disabled={phase !== 'idle'}
                            onClick={() => { setBet(v); setCustomBet('') }}>{v}</button>
                    ))}
                    <input className="bet-custom" placeholder="Custom" value={customBet}
                        disabled={phase !== 'idle'}
                        onChange={e => { setCustomBet(e.target.value); const v = parseInt(e.target.value); if (v > 0) setBet(v) }} />
                    <div className="cur-bet">BET <span>{bet}</span></div>
                </div>

                <div className="action-bar">
                    {phase === 'idle' && (
                        <button className="btn-primary" disabled={tokens < bet} onClick={deal}>
                            {tokens < bet ? `Need ${bet} tokens` : `DEAL · ${bet}`}
                        </button>
                    )}
                    {phase === 'dealing' && <button className="btn-primary" disabled>DEALING...</button>}
                    {phase === 'over' && (
                        <button className="btn-primary" onClick={() => setPhase('idle')}>PLAY AGAIN</button>
                    )}
                </div>

                {tokens <= 0 && phase === 'idle' && <div className="no-tokens-msg">Out of tokens!</div>}

                <div className="rules-strip">
                    <div className="rule"><span className="c-green">1:1</span>Player pays</div>
                    <div className="rule"><span className="c-gold">0.95:1</span>Banker pays</div>
                    <div className="rule"><span className="c-blue">8:1</span>Tie pays</div>
                </div>
            </div>
        </div>
    )
}
