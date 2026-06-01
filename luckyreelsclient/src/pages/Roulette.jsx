import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import GameHeader from '../components/GameHeader'
import Stars from '../components/Stars'

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
const WHEEL    = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2]
const CHIP_OPTS = [1, 5, 10, 25, 50, 100]

function pocketColor(n) {
  if (n === 0 || n === 37) return '#1a5c1a'
  return RED_NUMS.has(n) ? '#8b1515' : '#0e0e1c'
}

function easeOut(t) { return 1 - Math.pow(1-t, 3) }

export default function Roulette() {
  const { conn, isAuthed, tokens, setTokens } = useHub()
  const navigate = useNavigate()

  const [bets,       setBets]      = useState({})   // key → amount
  const [chip,       setChip]      = useState(5)
  const [custChip,   setCustChip]  = useState('')
  const [spinning,   setSpinning]  = useState(false)
  const [winNum,     setWinNum]    = useState(null)
  const [winCls,     setWinCls]    = useState('')
  const [resultBar,  setResultBar] = useState({ text: '', cls: '' })
  const [winKeys,    setWinKeys]   = useState([])
  const canvasRef = useRef(null)
  const wheelRot  = useRef(0)
  const rafRef    = useRef(null)

  useEffect(() => { if (!isAuthed) navigate('/') }, [isAuthed])

  useEffect(() => {
    drawWheel()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  useEffect(() => {
    if (!conn) return
    conn.on('RouletteResult', onResult)
    return () => conn.off('RouletteResult', onResult)
  }, [conn])

  function drawWheel() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const size = Math.min(canvas.offsetWidth, 200)
    canvas.width = size; canvas.height = size
    const cx = size/2, cy = size/2, r = cx - 10, n = WHEEL.length, arc = (2*Math.PI)/n

    ctx.clearRect(0, 0, size, size)
    ctx.beginPath(); ctx.arc(cx,cy,r+8,0,2*Math.PI)
    ctx.fillStyle = '#1a0a00'; ctx.fill()
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.stroke()

    ctx.save(); ctx.translate(cx,cy); ctx.rotate(wheelRot.current*Math.PI/180)

    for (let i = 0; i < n; i++) {
      const num = WHEEL[i], s = -Math.PI/2+i*arc, e = s+arc, mid = s+arc/2
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,s,e); ctx.closePath()
      ctx.fillStyle = pocketColor(num); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.7; ctx.stroke()
      const tr = r*0.77
      ctx.save(); ctx.translate(tr*Math.cos(mid),tr*Math.sin(mid)); ctx.rotate(mid+Math.PI/2)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(num===37?'00':String(num),0,0)
      ctx.restore()
    }

    ctx.beginPath(); ctx.arc(0,0,r*0.2,0,2*Math.PI)
    ctx.fillStyle = '#0a0a0f'; ctx.fill(); ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.restore()

    ctx.save(); ctx.translate(cx,cy-r-2)
    ctx.beginPath(); ctx.moveTo(-7,-6); ctx.lineTo(7,-6); ctx.lineTo(0,10)
    ctx.closePath(); ctx.fillStyle = '#FFD700'; ctx.fill()
    ctx.restore()
  }

  function onResult(msg) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const numStr = msg.winNumber
    const numInt = numStr === '00' ? 37 : parseInt(numStr)
    const winIdx = WHEEL.indexOf(numInt)
    const sectorDeg = 360/38
    let targetRot = -(winIdx+0.5)*sectorDeg
    while (targetRot < wheelRot.current+900) targetRot += 360

    const startRot = wheelRot.current, dur = 2200, startTime = performance.now()

    function frame(now) {
      const t = Math.min((now-startTime)/dur, 1)
      wheelRot.current = startRot + (targetRot-startRot)*easeOut(t)
      drawWheel()
      if (t < 1) { rafRef.current = requestAnimationFrame(frame) }
      else {
        wheelRot.current = targetRot
        drawWheel()
        finishSpin(numInt, numStr, msg)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  function finishSpin(numInt, numStr, msg) {
    setTokens(msg.newBalance)
    const isGreen = numInt === 0 || numInt === 37
    const numCls = isGreen ? 'green-num' : RED_NUMS.has(numInt) ? 'red-num' : 'black-num'
    const colorLabel = isGreen ? 'GREEN' : RED_NUMS.has(numInt) ? 'RED' : 'BLACK'
    setWinNum(numStr); setWinCls(numCls)
    const barCls = msg.net > 0 ? 'win' : msg.net < 0 ? 'loss' : 'push'
    const barText = msg.net > 0 ? `${colorLabel} · +${msg.net}` : msg.net < 0 ? `${colorLabel} · −${Math.abs(msg.net)}` : `${colorLabel} · PUSH`
    setResultBar({ text: barText, cls: barCls })
    setWinKeys(msg.winningBets || [])
    setSpinning(false)
  }

  function spin() {
    if (spinning) return
    const total = Object.values(bets).reduce((s,v) => s+v, 0)
    if (total === 0 || tokens < total) return
    setSpinning(true); setWinNum(null); setWinCls(''); setResultBar({ text:'', cls:'' }); setWinKeys([])

    // Start fake wheel spin
    const randomIdx = Math.floor(Math.random()*38), sectorDeg = 360/38
    let fakeTarget = -(randomIdx+0.5)*sectorDeg
    while (fakeTarget < wheelRot.current+1800) fakeTarget += 360
    const startRot = wheelRot.current, startTime = performance.now()

    function fakeFrame(now) {
      const t = Math.min((now-startTime)/4500, 1)
      wheelRot.current = startRot + (fakeTarget-startRot)*easeOut(t)
      drawWheel()
      if (t < 1) rafRef.current = requestAnimationFrame(fakeFrame)
    }
    rafRef.current = requestAnimationFrame(fakeFrame)

    const betData = Object.fromEntries(Object.entries(bets).filter(([,v]) => v > 0).map(([k,v]) => [k,v]))
    conn.invoke('SpinRoulette', Object.entries(betData).map(([k,v]) => ({ key:k, amount:v })))
  }

  function placeBet(key) {
    if (spinning) return
    setBets(b => ({ ...b, [key]: (b[key] || 0) + chip }))
  }

  function clearBets() {
    if (spinning) return
    setBets({}); setWinNum(null); setWinCls(''); setResultBar({ text:'', cls:'' }); setWinKeys([])
    drawWheel()
  }

  const totalBet = Object.values(bets).reduce((s,v) => s+v, 0)

  // Table rows
  const ROW_NUMS = [
    [3,6,9,12,15,18,21,24,27,30,33,36],
    [2,5,8,11,14,17,20,23,26,29,32,35],
    [1,4,7,10,13,16,19,22,25,28,31,34],
  ]

  function BetCell({ cls, text, bkey, style }) {
    const amt = bets[bkey] || 0
    const isWin = winKeys.includes(bkey)
    return (
      <div className={`bet-cell ${cls}${isWin ? ' winner' : ''}`} style={style} onClick={() => placeBet(bkey)}>
        {text}
        {amt > 0 && <div className="chip-stack">{amt >= 1000 ? Math.round(amt/1000)+'k' : amt}</div>}
      </div>
    )
  }

  return (
    <div className="game-page">
      <div className="game-bg" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,45,85,.04) 0%, transparent 55%)' }} />
      <Stars count={60} />
      <div className="app-wrapper wide">
        <GameHeader title="Roulette" tagline="American Style" accentColor="var(--red)" gradient="linear-gradient(135deg,#8b0000,var(--red))" />

        <div className="roulette-layout">
          <div className="wheel-area">
            <div className="wheel-wrap">
              <canvas ref={canvasRef} id="wheelCanvas" style={{ width:200, height:200 }} />
              <div className="win-num-area">
                {winNum != null
                  ? <><span style={{fontSize:12,color:'#555',letterSpacing:3}}>NUMBER</span><br /><span className={`win-num-display ${winCls}`}>{winNum}</span></>
                  : <span style={{color:'#333'}}>—</span>
                }
              </div>
            </div>

            {/* Chip selector */}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div className="chip-controls">
                {CHIP_OPTS.map(v => (
                  <button key={v} className={`chip-btn${chip===v&&!custChip?' active':''}`}
                    onClick={() => { setChip(v); setCustChip('') }}>{v}</button>
                ))}
                <input className="bet-custom" placeholder="Custom" value={custChip} style={{ width:64 }}
                  onChange={e => { setCustChip(e.target.value); const v = parseInt(e.target.value); if (v>0) setChip(v) }} />
              </div>
              <div className="total-bet-display">Total bet: <span>{totalBet}</span></div>
              {resultBar.text && <div className={`result-bar ${resultBar.cls}`} style={{ fontSize:20 }}>{resultBar.text}</div>}
            </div>
          </div>

          {/* Betting table */}
          <div className="bet-table-wrap">
            <div className="bet-table">
              <BetCell cls="num-cell green-num" text="0"  bkey="straight-0"  style={{ gridRow:1, gridColumn:'1 / 7' }} />
              <BetCell cls="num-cell green-num" text="00" bkey="straight-37" style={{ gridRow:1, gridColumn:'7 / 13' }} />

              {ROW_NUMS.map((row, ri) => (
                <>
                  {row.map((n, ci) => (
                    <BetCell key={n}
                      cls={`num-cell ${RED_NUMS.has(n)?'red-num':'black-num'}`}
                      text={String(n)} bkey={`straight-${n}`}
                      style={{ gridRow: ri+2, gridColumn: ci+1 }} />
                  ))}
                  <BetCell cls="col-bet" text="2:1" bkey={`col-${3-ri}`} style={{ gridRow: ri+2, gridColumn: 13 }} />
                </>
              ))}

              {[['1st 12','dozen-1','1 / 5'],['2nd 12','dozen-2','5 / 9'],['3rd 12','dozen-3','9 / 13']].map(([t,k,col]) => (
                <BetCell key={k} cls="dozen-cell" text={t} bkey={k} style={{ gridRow:5, gridColumn:col }} />
              ))}

              {[
                ['1–18','low','even-cell','1 / 3'],['Even','even','even-cell','3 / 5'],
                ['●','red','even-cell red-cell','5 / 7'],['●','black','even-cell black-cell','7 / 9'],
                ['Odd','odd','even-cell','9 / 11'],['19–36','high','even-cell','11 / 13'],
              ].map(([t,k,cls,col]) => (
                <BetCell key={k} cls={cls} text={t} bkey={k} style={{ gridRow:6, gridColumn:col }} />
              ))}
            </div>
          </div>
        </div>

        <div className="action-bar">
          <button className="roulette-clear-btn" disabled={spinning || totalBet===0} onClick={clearBets}>CLEAR</button>
          {tokens <= 0
            ? <div className="no-tokens-msg" style={{ flex:1 }}>Out of tokens!</div>
            : <button className="roulette-spin-btn" disabled={spinning||totalBet===0||tokens<totalBet} onClick={spin}>SPIN</button>
          }
        </div>

        <div className="rules-strip">
          <div className="rule"><span className="c-gold">35:1</span>Straight up</div>
          <div className="rule"><span className="c-blue">2:1</span>Column / Dozen</div>
          <div className="rule"><span className="c-green">1:1</span>Even money</div>
        </div>
      </div>
    </div>
  )
}
