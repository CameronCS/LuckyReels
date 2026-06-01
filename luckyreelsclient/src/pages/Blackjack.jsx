import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function CardEl({ card }) {
  if (!card) return null
  if (card.hidden || card.rank == null) return <div className="card face-down" />
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

export default function Blackjack() {
  const { conn, isAuthed, tokens, setTokens } = useHub()
  const navigate = useNavigate()

  const [phase,       setPhase]       = useState('idle')  // idle | waiting | player | over
  const [bet,         setBetAmt]      = useState(1)
  const [activeBet,   setActiveBet]   = useState(1)
  const [playerHand,  setPlayerHand]  = useState([])
  const [dealerCards, setDealerCards] = useState([])
  const [playerTotal, setPlayerTotal] = useState(0)
  const [dealerTotal, setDealerTotal] = useState(0)
  const [dealerSub,   setDealerSub]   = useState(0)
  const [result,      setResult]      = useState('')
  const [net,         setNet]         = useState(0)
  const [customBet,   setCustomBet]   = useState('')

  useEffect(() => { if (!isAuthed) navigate('/') }, [isAuthed])

  useEffect(() => {
    if (!conn) return
    conn.on('BlackjackState', onState)
    conn.on('BlackjackResult', onResult)
    return () => { conn.off('BlackjackState', onState); conn.off('BlackjackResult', onResult) }
  }, [conn])

  function onState(s) {
    setTokens(s.balance)
    setPlayerHand(s.playerHand)
    setDealerCards([s.dealerVisible])
    setPlayerTotal(s.playerTotal)
    setDealerSub(s.dealerVisibleTotal)
    setPhase('player')
  }

  async function onResult(msg) {
    const nb = msg.newBalance ?? msg.balance
    setPlayerHand(msg.playerHand)
    setPlayerTotal(msg.playerTotal)
    // Show first two dealer cards immediately, then animate extra cards
    setDealerCards(msg.dealerHand.slice(0, 2))
    for (let i = 2; i < msg.dealerHand.length; i++) {
      await sleep(500)
      setDealerCards(h => [...msg.dealerHand.slice(0, i + 1)])
    }
    setDealerTotal(msg.dealerTotal)
    setResult(msg.result)
    setNet(msg.net)
    setTokens(nb)
    setPhase('over')
  }

  function deal() {
    if (phase !== 'idle' || tokens < bet) return
    setPhase('waiting')
    setPlayerHand([]); setDealerCards([]); setResult(''); setNet(0); setDealerTotal(0)
    conn.invoke('BlackjackDeal', bet)
    setActiveBet(bet)
  }

  function resultText() {
    const abs = Math.abs(net)
    switch (result) {
      case 'blackjack':   return `🃏 BLACKJACK! +${net}`
      case 'win':         return `You Win! +${net}`
      case 'dealer_bust': return `Dealer Busts! +${net}`
      case 'push':        return 'Push — Bet Returned'
      case 'bust':        return `Bust! −${abs}`
      default:            return `Dealer Wins −${abs}`
    }
  }
  function resultCls() {
    if (result === 'blackjack') return 'blackjack'
    if (result === 'win' || result === 'dealer_bust') return 'win'
    if (result === 'push') return 'push'
    return 'loss'
  }

  function totalCls(val, len, isDeal) {
    if (isDeal) return val > 21 ? 'bust' : val === 21 && len === 2 ? 'bj' : ''
    return val > 21 ? 'bust' : val >= 17 ? 'good' : ''
  }

  return (
    <div className="game-page">
      <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(10,245,245,.04) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(255,45,85,.04) 0%, transparent 55%)' }} />
      <Stars count={60} />
      <div className="app-wrapper">
        <GameHeader title="Blackjack" tagline="Beat the Dealer" accentColor="var(--blue)" gradient="linear-gradient(135deg,var(--blue),var(--gold))" />

        <div className="bj-table">
          <div className="bj-side dealer-side">
            <div className="side-label">
              DEALER
              {dealerCards.length > 0 && (
                <span className={`side-total ${totalCls(phase === 'over' ? dealerTotal : dealerSub, dealerCards.length, false)}`}>
                  {phase === 'over' ? dealerTotal : dealerSub}
                </span>
              )}
            </div>
            <div className="cards-row">
              {dealerCards.map((c, i) => <CardEl key={i} card={c} />)}
              {phase === 'player' && <div className="card face-down" />}
            </div>
          </div>
          <div className="bj-side player-side">
            <div className="side-label">
              YOU
              {playerHand.length > 0 && (
                <span className={`side-total ${totalCls(playerTotal, playerHand.length, true)}`}>{playerTotal}</span>
              )}
            </div>
            <div className="cards-row">
              {playerHand.map((c, i) => <CardEl key={i} card={c} />)}
            </div>
          </div>

          {phase === 'over' && (
            <div className={`result-bar ${resultCls()}`}>{resultText()}</div>
          )}
        </div>

        {/* Controls */}
        <div className="controls-bar">
          <span className="bet-label">Bet</span>
          {BET_PRESETS.map(v => (
            <button key={v} className={`bet-btn${bet === v && !customBet ? ' active' : ''}`}
              disabled={phase !== 'idle'}
              onClick={() => { setBetAmt(v); setCustomBet('') }}>
              {v}
            </button>
          ))}
          <input className="bet-custom" placeholder="Custom" value={customBet}
            disabled={phase !== 'idle'}
            onChange={e => { setCustomBet(e.target.value); const v = parseInt(e.target.value); if (v > 0) setBetAmt(v) }} />
          <div className="cur-bet">BET <span>{bet}</span></div>
        </div>

        <div className="action-bar">
          {phase === 'idle' && (
            <button className="btn-primary" disabled={tokens < bet} onClick={deal}>
              {tokens < bet ? `Need ${bet} tokens` : `DEAL · ${bet}`}
            </button>
          )}
          {phase === 'waiting' && (
            <button className="btn-primary" disabled>DEALING...</button>
          )}
          {phase === 'player' && (
            <>
              <button className="action-btn btn-hit"    onClick={() => { setPhase('waiting'); conn.invoke('BlackjackHit') }}>HIT</button>
              <button className="action-btn btn-stand"  onClick={() => { setPhase('waiting'); conn.invoke('BlackjackStand') }}>STAND</button>
              <button className="action-btn btn-double" disabled={tokens < activeBet}
                onClick={() => { setPhase('waiting'); conn.invoke('BlackjackDouble') }}>DOUBLE</button>
            </>
          )}
          {phase === 'over' && (
            <button className="btn-primary" onClick={() => { setPhase('idle'); setPlayerHand([]); setDealerCards([]) }}>PLAY AGAIN</button>
          )}
        </div>

        {tokens <= 0 && phase === 'idle' && <div className="no-tokens-msg">Out of tokens!</div>}

        <div className="rules-strip">
          <div className="rule"><span className="c-gold">3:2</span>Blackjack pays</div>
          <div className="rule"><span className="c-blue">2:1</span>Win pays</div>
          <div className="rule"><span className="c-gold">16</span>Dealer stands on</div>
        </div>
      </div>
    </div>
  )
}
