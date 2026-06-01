import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const ROWS  = 8
const SLOTS = 9
const MULTS = {
  low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13 ],
  high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29 ],
}
const BET_PRESETS = [10, 25, 50, 100]

function slotColor(m) {
  if (m >= 10)  return '#FF3B3B'
  if (m >= 3)   return '#FF9500'
  if (m >= 1.5) return '#FFD700'
  if (m >= 1)   return '#00D4FF'
  if (m >= 0.5) return '#666'
  return '#444'
}

function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r)
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r)
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r)
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r)
  ctx.closePath()
}

export default function Plinko() {
  const { conn, isAuthed, tokens, setTokens } = useHub()
  const navigate = useNavigate()

  const [bet,      setBet]      = useState(10)
  const [custBet,  setCustBet]  = useState('')
  const [risk,     setRisk]     = useState('medium')
  const [dropping, setDropping] = useState(false)
  const [result,   setResult]   = useState(null)
  const canvasRef = useRef(null)
  const riskRef   = useRef('medium')

  useEffect(() => { if (!isAuthed) navigate('/') }, [isAuthed])

  useEffect(() => { riskRef.current = risk }, [risk])

  useEffect(() => {
    if (!conn) return
    conn.on('PlinkoResult', onResult)
    return () => conn.off('PlinkoResult', onResult)
  }, [conn])

  // Draw idle board when canvas mounts or risk changes
  useEffect(() => { drawIdle() }, [risk])

  function metrics() {
    const canvas = canvasRef.current
    if (!canvas) return null
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    const padX = 14, s = (W - 2*padX) / SLOTS
    const topPad = 36, slotH = Math.min(44, H*0.12)
    const rowH = (H - topPad - slotH - 10) / (ROWS + 0.5)
    const boardTop = topPad + rowH*0.5
    const slotsY = boardTop + ROWS*rowH
    return { W, H, s, padX, topPad, rowH, boardTop, slotsY, slotH }
  }

  function initCanvas() {
    const canvas = canvasRef.current; if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = canvas.offsetWidth  * dpr
    canvas.height = canvas.offsetHeight * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function drawBoard(m, ballX, ballY, hitPeg, landedSlot, currentRisk) {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { W, H, s, padX, rowH, boardTop, slotsY, slotH } = m
    ctx.clearRect(0, 0, W, H)

    const mults = MULTS[currentRisk || riskRef.current]
    for (let k = 0; k < SLOTS; k++) {
      const x = padX + k*s, col = slotColor(mults[k])
      const isLanded = landedSlot === k
      ctx.fillStyle = isLanded ? col : col + '55'
      roundRect(ctx, x+2, slotsY+4, s-4, slotH, 6); ctx.fill()
      if (isLanded) {
        ctx.shadowColor = col; ctx.shadowBlur = 18
        roundRect(ctx, x+2, slotsY+4, s-4, slotH, 6); ctx.fill()
        ctx.shadowBlur = 0
      }
      ctx.fillStyle = isLanded ? '#fff' : 'rgba(255,255,255,0.6)'
      ctx.font = `bold ${Math.max(9, Math.floor(s*0.22))}px Space Mono, monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(mults[k]+'×', x+s/2, slotsY+4+slotH/2)
    }

    const pegR = Math.max(3, Math.floor(s*0.09))
    for (let r = 0; r < ROWS; r++) {
      const y = boardTop + r*rowH
      for (let i = 0; i <= r; i++) {
        const xPos = (SLOTS/2) - r/2 + i, x = padX + xPos*s
        const isHit = hitPeg && hitPeg.row === r && hitPeg.idx === i
        ctx.beginPath(); ctx.arc(x, y, pegR, 0, Math.PI*2)
        if (isHit) { ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 12 }
        else { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 0 }
        ctx.fill(); ctx.shadowBlur = 0
      }
    }

    if (ballX !== null && ballY !== null) {
      const ballR = Math.max(6, Math.floor(s*0.16))
      ctx.beginPath(); ctx.arc(ballX, ballY, ballR, 0, Math.PI*2)
      ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20
      ctx.fill(); ctx.shadowBlur = 0
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function drawIdle() {
    initCanvas()
    const m = metrics(); if (!m) return
    drawBoard(m, null, null, null, -1, riskRef.current)
  }

  function onResult(msg) {
    const m = metrics()
    if (!m) { setDropping(false); return }

    const { s, padX, rowH, boardTop, slotsY } = m

    const xPos = []
    let bx = padX + 4.5*s
    xPos.push(bx)
    for (let r = 0; r < ROWS; r++) {
      bx += msg.path[r] === 1 ? s/2 : -s/2
      xPos.push(bx)
    }
    const yPos = [boardTop - rowH*0.6]
    for (let r = 0; r < ROWS; r++) yPos.push(boardTop + r*rowH)
    yPos.push(slotsY + 20)

    const hitPegIdx = []; let rights = 0
    for (let r = 0; r < ROWS; r++) { hitPegIdx.push(rights); if (msg.path[r] === 1) rights++ }

    const STEP_MS = 190, TOTAL = (ROWS+1)*STEP_MS
    let startT = null

    function frame(ts) {
      if (!startT) startT = ts
      const elapsed = ts - startT
      const stepF = elapsed / STEP_MS
      const step = Math.min(Math.floor(stepF), ROWS)
      const prog = Math.min(stepF - step, 1)
      const t = easeInOut(prog)

      const fromX = step === 0 ? padX+4.5*s : xPos[step]
      const toX   = xPos[step+1] ?? xPos[step]
      const fromY = yPos[step], toY = yPos[step+1] ?? yPos[step]

      const ballX = fromX + (toX-fromX)*t
      const ballY = fromY + (toY-fromY)*t
      const hitPeg = step > 0 && prog < 0.35 ? { row: step-1, idx: hitPegIdx[step-1] } : null

      drawBoard(m, ballX, ballY, hitPeg, elapsed >= TOTAL ? msg.slot : -1, riskRef.current)

      if (elapsed < TOTAL + STEP_MS*0.5) {
        requestAnimationFrame(frame)
      } else {
        drawBoard(m, null, null, null, msg.slot, riskRef.current)
        setTokens(msg.newBalance)
        setDropping(false)
        const sign = msg.net >= 0 ? '+' : ''
        setResult({ text: `${msg.multiplier}×  ${sign}${msg.net}`, win: msg.net >= 0 })
        setTimeout(() => setResult(null), 2800)
      }
    }
    requestAnimationFrame(frame)
  }

  function drop() {
    if (dropping || tokens < bet) return
    setDropping(true)
    setResult(null)
    conn.invoke('DropPlinko', bet, risk)
  }

  return (
    <div className="game-page">
      <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,45,139,.04) 0%, transparent 55%)' }} />
      <Stars count={60} />
      <div className="app-wrapper">
        <GameHeader title="Plinko" tagline="Drop the Ball" accentColor="#FF2D8B" gradient="linear-gradient(135deg,#FF2D8B,var(--purple))" />

        <div className="plinko-canvas-wrap">
          <canvas ref={canvasRef} id="plinkoCanvas" />
          {result && <div className={`result-overlay visible ${result.win ? 'win' : 'lose'}`}>{result.text}</div>}
        </div>

        {/* Risk */}
        <div className="controls-bar">
          <span className="bet-label">Risk</span>
          <div className="risk-row">
            {['low','medium','high'].map(r => (
              <button key={r} className={`risk-btn${risk === r ? ' active' : ''}`}
                disabled={dropping}
                onClick={() => setRisk(r)}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Bet */}
        <div className="controls-bar">
          <span className="bet-label">Bet</span>
          {BET_PRESETS.map(v => (
            <button key={v} className={`bet-btn${bet === v && !custBet ? ' active' : ''}`}
              disabled={dropping}
              onClick={() => { setBet(v); setCustBet('') }}>{v}</button>
          ))}
          <input className="bet-custom" placeholder="Custom" value={custBet}
            disabled={dropping}
            onChange={e => { setCustBet(e.target.value); const v = parseInt(e.target.value); if (v >= 10) setBet(v) }} />
          <div className="cur-bet">BET <span>{bet}</span></div>
        </div>

        <div className="action-bar">
          {tokens <= 0
            ? <div className="no-tokens-msg">Out of tokens!</div>
            : <button className="btn-primary" disabled={dropping || tokens < bet} onClick={drop}>
                {dropping ? 'DROPPING...' : tokens < bet ? `Need ${bet} tokens` : `DROP · ${bet}`}
              </button>
          }
        </div>

        <div className="rules-strip">
          <div className="rule"><span style={{color:'#FF2D8B'}}>8</span>Rows</div>
          <div className="rule"><span className="c-gold">29×</span>Max multiplier</div>
          <div className="rule"><span className="c-green">3</span>Risk levels</div>
        </div>
      </div>
    </div>
  )
}
