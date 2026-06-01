import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const BET_PRESETS = [10, 25, 50, 100, 250]
const BETTING_SECS = 10

export default function Crash() {
  const { conn, isAuthed, tokens, setTokens } = useHub()
  const navigate = useNavigate()

  const [phase,      setPhase]    = useState('idle')
  const [bet,        setBet]      = useState(50)
  const [customBet,  setCustBet]  = useState('')
  const [acInput,    setAcInput]  = useState('')
  const [hasBet,     setHasBet]   = useState(false)
  const [currentMult,setMult]     = useState(1.00)
  const [countdown,  setCountdown] = useState(null)   // null | number (seconds left)
  const [result,     setResult]   = useState(null)

  // Refs so SignalR callbacks always see current values (avoid stale closures)
  const phaseRef      = useRef('idle')
  const hasBetRef     = useRef(false)
  const betRef        = useRef(50)

  const canvasRef        = useRef(null)
  const multHist         = useRef([])
  const startTs          = useRef(0)
  const countdownTimer   = useRef(null)

  // Keep refs in sync with state
  function _setPhase(p)  { phaseRef.current  = p; setPhase(p)  }
  function _setHasBet(v) { hasBetRef.current = v; setHasBet(v) }

  useEffect(() => { betRef.current = bet }, [bet])
  useEffect(() => { if (!isAuthed) navigate('/') }, [isAuthed])

  useEffect(() => {
    if (!conn) return
    conn.invoke('CrashJoin').catch(() => {})
    conn.on('CrashPhase',  onPhase)
    conn.on('CrashTick',   onTick)
    conn.on('CrashResult', onCashResult)
    return () => {
      conn.invoke('CrashLeave').catch(() => {})
      conn.off('CrashPhase',  onPhase)
      conn.off('CrashTick',   onTick)
      conn.off('CrashResult', onCashResult)
      clearCountdown()
    }
  }, [conn])

  function clearCountdown() {
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null }
    setCountdown(null)
  }

  function startCountdown() {
    clearCountdown()
    let secs = BETTING_SECS
    setCountdown(secs)
    countdownTimer.current = setInterval(() => {
      secs--
      if (secs <= 0) { clearCountdown() }
      else           { setCountdown(secs) }
    }, 1000)
  }

  function onPhase(p) {
    if (p === 'betting') {
      _setPhase('betting')
      _setHasBet(false)
      setResult(null)
      setMult(1.00)
      multHist.current = []
      startTs.current  = Date.now()
      drawCurve(false, 1, false)
      startCountdown()
    } else if (p === 'running') {
      clearCountdown()
      _setPhase('running')
      startTs.current = Date.now()
    }
  }

  function onTick(update) {
    // ── Mid-game join: first tick while still idle ───────────────
    if (phaseRef.current === 'idle') {
      // Back-calculate when this round started:  mult = e^(elapsed/8000)
      const estimatedElapsed = 8000 * Math.log(Math.max(update.multiplier, 1.001))
      startTs.current  = Date.now() - estimatedElapsed
      multHist.current = []
      clearCountdown()
      _setPhase('running')
    }

    const elapsed = Date.now() - startTs.current
    multHist.current.push({ elapsed, mult: update.multiplier })
    setMult(update.multiplier)
    drawCurve(false, update.multiplier, update.crashed)

    if (update.crashed) {
      _setPhase('crashed')
      if (hasBetRef.current) {
        setResult({ type: 'lose', text: `CRASHED  ${update.multiplier.toFixed(2)}×` })
      }
    }
  }

  function onCashResult(msg) {
    setTokens(msg.newBalance)
    const sign = msg.net >= 0 ? '+' : ''
    setResult({ type: 'win', text: `CASHED OUT  ${msg.cashedOutAt.toFixed(2)}×  ${sign}${msg.net}` })
    _setHasBet(false)
  }

  function placeBet() {
    if (phaseRef.current !== 'betting' || hasBetRef.current || tokens < bet) return
    conn.invoke('CrashBet', bet)
    _setHasBet(true)
    setTokens(t => t - bet)  // server deducts on bet placement, no further event on crash
  }

  function cashOut() {
    if (phaseRef.current !== 'running' || !hasBetRef.current) return
    conn.invoke('CrashCashout')
  }

  function drawCurve(clear, currentM, crashed) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width  = canvas.offsetWidth
    const H = canvas.height = canvas.offsetHeight
    if (!W || !H) return

    const hist     = multHist.current
    const mult     = currentM ?? (hist.length ? hist[hist.length - 1].mult : 1)
    const elapsedMs = hist.length ? hist[hist.length - 1].elapsed : 0
    const maxTime  = Math.max(elapsedMs * 1.15, 4000)
    const maxMult  = Math.max(mult * 1.25, 3.0)

    const tx = t => (t / maxTime) * W * 0.92 + W * 0.02
    const ty = m => H - 18 - Math.max(0, ((m - 1) / (maxMult - 1)) * (H - 36))

    ctx.clearRect(0, 0, W, H)

    ctx.font = '9px Space Mono, monospace'
    for (const gm of [2, 3, 5, 10, 20, 50, 100]) {
      if (gm > maxMult * 1.05) break
      const y = ty(gm)
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillText(gm + '×', 4, y - 3)
    }

    if (!hist.length) return

    const color = crashed ? '#FF4500' : mult >= 5 ? '#FF4500' : mult >= 2 ? '#FF9500' : '#00D4FF'

    ctx.beginPath()
    ctx.strokeStyle = color; ctx.lineWidth = 2.5
    ctx.shadowColor = color; ctx.shadowBlur  = 10
    ctx.moveTo(tx(0), ty(1.00))
    hist.forEach(({ elapsed, mult: m }) => ctx.lineTo(tx(elapsed), ty(m)))
    ctx.stroke(); ctx.shadowBlur = 0

    if (!crashed && hist.length) {
      const last = hist[hist.length - 1]
      ctx.beginPath()
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18
      ctx.arc(tx(last.elapsed), ty(last.mult), 5, 0, Math.PI * 2)
      ctx.fill(); ctx.shadowBlur = 0
    }
  }

  function multCls(m) {
    if (phase === 'crashed') return 'crashed'
    return m >= 5 ? 'danger' : m >= 2 ? 'warning' : phase === 'running' ? 'safe' : 'idle'
  }

  const acVal = parseFloat(acInput)

  return (
    <div className="game-page">
      <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,69,0,.04) 0%, transparent 55%), radial-gradient(ellipse at 70% 70%, rgba(0,212,255,.04) 0%, transparent 55%)' }} />
      <Stars count={60} />
      <div className="app-wrapper">
        <GameHeader title="Crash" tagline="Cash Out Before It Crashes" accentColor="#FF4500" gradient="linear-gradient(135deg,#00D4FF,#FF9500,#FF4500)" />

        <div className="crash-display">
          <canvas ref={canvasRef} id="crashCanvas" />

          <div className="mult-overlay">
            {phase === 'betting' ? (
              <>
                <div
                  className="mult-value"
                  style={{ color: countdown <= 3 ? '#FF4500' : 'var(--gold)', transition: 'color 0.3s' }}
                >
                  {countdown ?? '—'}
                </div>
                <div className="mult-sub">LAUNCHING IN</div>
              </>
            ) : (
              <>
                <div className={`mult-value ${multCls(currentMult)}`}>
                  {phase === 'idle' ? '—' : currentMult.toFixed(2) + '×'}
                </div>
                {phase === 'running' && hasBet && acVal > 1 && (
                  <div className="mult-sub">AUTO: {acVal.toFixed(2)}×</div>
                )}
              </>
            )}
          </div>

          {result && <div className={`crash-result-pill ${result.type}`}>{result.text}</div>}
        </div>

        {/* Phase badge */}
        {phase !== 'idle' && (
          <div className="phase-badge" style={{
            color: phase === 'betting'
              ? (countdown <= 3 ? '#FF4500' : 'var(--gold)')
              : phase === 'running' ? '#00D4FF' : '#FF4500'
          }}>
            {phase === 'betting' && `🕐 BETTING PHASE${countdown !== null ? ` · ${countdown}s` : ''}`}
            {phase === 'running'  && '🚀 IN FLIGHT'}
            {phase === 'crashed'  && '💥 CRASHED'}
          </div>
        )}

        {/* Bet + auto-cashout controls — only during betting window and not yet bet */}
        {phase === 'betting' && !hasBet && (
          <>
            <div className="controls-bar">
              <span className="bet-label">Bet</span>
              {BET_PRESETS.map(v => (
                <button key={v} className={`bet-btn${bet === v && !customBet ? ' active' : ''}`}
                  onClick={() => { setBet(v); setCustBet('') }}>{v}</button>
              ))}
              <input className="bet-custom" placeholder="Custom" value={customBet}
                onChange={e => { setCustBet(e.target.value); const v = parseInt(e.target.value); if (v >= 10) setBet(v) }} />
              <div className="cur-bet">BET <span>{bet}</span></div>
            </div>
            <div className="auto-cashout-bar">
              <span className="ac-label">Auto cash out</span>
              <input className="ac-input" type="number" placeholder="2.00" min="1.01" step="0.01"
                value={acInput} onChange={e => setAcInput(e.target.value)} />
              <span className="ac-suffix">×</span>
            </div>
          </>
        )}

        <div className="action-bar">
          {(phase === 'idle' || phase === 'crashed') && (
            <button className="btn-primary" disabled>Waiting for next round...</button>
          )}
          {phase === 'betting' && !hasBet && (
            <button className="btn-primary" disabled={tokens < bet} onClick={placeBet}>
              {tokens < bet ? `Need ${bet} tokens` : `BET · ${bet}`}
            </button>
          )}
          {phase === 'betting' && hasBet && (
            <button className="btn-primary" disabled>Bet placed — waiting for launch</button>
          )}
          {phase === 'running' && hasBet && (
            <button className="btn-green" onClick={cashOut}>
              CASH OUT · {Math.floor(bet * currentMult)}
            </button>
          )}
          {phase === 'running' && !hasBet && (
            <button className="btn-primary" disabled>In flight — no active bet</button>
          )}
        </div>

        {tokens <= 0 && <div className="no-tokens-msg">Out of tokens!</div>}

        <div className="rules-strip">
          <div className="rule"><span className="c-gold">10s</span>Betting window</div>
          <div className="rule"><span className="c-blue">0.99</span>House edge</div>
          <div className="rule"><span className="c-green">∞</span>Max multiplier</div>
        </div>
      </div>
    </div>
  )
}
