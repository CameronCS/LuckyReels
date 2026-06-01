import { useState, useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'

const PAGE_SIZE = 50

function formatEvent(ev) {
    const d = ev.data ?? {}
    const net = d.net !== undefined ? (d.net >= 0 ? `+${d.net}` : `${d.net}`) : null
    const time = new Date(ev.time).toLocaleTimeString()
    switch (ev.game) {
        case 'slots':
            return { icon: d.net > 0 ? '🎰' : '·', label: `M${d.machineNum} · ${(d.symbols || []).join('')}`, detail: d.resultType, net, time }
        case 'blackjack':
            if (d.phase === 'deal') {
                return { icon: '🃏', label: 'DEAL', detail: `bet ${d.bet}`, net: `-${d.bet}`, time }
            }
            return { icon: d.result === 'blackjack' ? '🃏' : d.net > 0 ? '✅' : d.net === 0 ? '🔵' : '❌', label: (d.result || '').toUpperCase(), detail: `bet ${d.bet}`, net, time }
        case 'baccarat':
            return { icon: d.net > 0 ? '🎴' : d.net === 0 ? '🔵' : '❌', label: `${(d.betType || '').toUpperCase()} · ${d.outcome}`, detail: `bet ${d.bet}`, net, time }
        case 'roulette':
            return { icon: '🎡', label: `#${d.winNumber}`, detail: `bet ${d.totalBet}`, net, time }
        case 'horse':
            return { icon: d.net > 0 ? '🏆' : '🏇', label: d.winnerName, detail: `picked ${d.pickedHorse} · bet ${d.bet}`, net, time }
        case 'mines':
            if (d.phase === 'start') {
                return { icon: '💣', label: 'START', detail: `${d.mineCount} mines · bet ${d.bet}`, net: `-${d.bet}`, time }
            }
            if (d.phase === 'explode') {
                return { icon: '💥', label: 'BOOM', detail: `${d.revealed} safe`, net, time }
            }
            return { icon: '💎', label: 'CASHOUT', detail: `${d.revealed} safe · ${d.multiplier?.toFixed(2)}×`, net, time }
        case 'crash':
            if (d.phase === 'bet') {
                return { icon: '🚀', label: 'BET', detail: `bet ${d.bet}`, net: `-${d.bet}`, time }
            }
            return { icon: d.net > 0 ? '🚀' : '💥', label: 'CASHOUT', detail: `${d.cashedOutAt?.toFixed(2)}× · crash @ ${d.crashPoint?.toFixed(2)}×`, net, time }
        case 'plinko':
            return { icon: d.net > 0 ? '🎯' : '·', label: `${(d.riskLevel || '').toUpperCase()} · slot ${d.slot}`, detail: `${d.mult}× · bet ${d.bet}`, net, time }
        default:
            return { icon: '·', label: ev.game, detail: '', net, time }
    }
}

function useDebounce(value, delay) {
    const [d, setD] = useState(value)
    useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t) }, [value, delay])
    return d
}

export default function Admin() {
    // ── Auth state ────────────────────────────────────────────────────
    const [authed, setAuthed] = useState(false)
    const [token, setToken] = useState(null)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loginErr, setLoginErr] = useState('')
    const [loginLoading, setLoginLoading] = useState(false)
    const [broadcastMsg, setBroadcastMsg] = useState('')
    const [broadcastType, setBroadcastType] = useState('info')
    const [broadcasting, setBroadcasting] = useState(false)

    // Keep a ref so SignalR callbacks always see the latest token
    // without stale closure issues
    const tokenRef = useRef(null)

    // ── Player list state ─────────────────────────────────────────────
    const [players, setPlayers] = useState([])
    const [onlineIds, setOnlineIds] = useState(new Set())
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState('')
    const [editVals, setEditVals] = useState({})
    const [expanded, setExpanded] = useState(null)
    const [events, setEvents] = useState({})
    const [hubState, setHubState] = useState('disconnected') // disconnected | connecting | connected | error

    const connRef = useRef(null)
    const expandedRef = useRef(null)
    const toastTimer = useRef(null)
    const debouncedSearch = useDebounce(search, 350)
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    // ── Login ─────────────────────────────────────────────────────────
    async function login() {
        setLoginErr('')
        if (!username.trim() || !password) {
            setLoginErr('Enter username and password.');
            return
        }
        setLoginLoading(true)
        try {
            const res = await fetch('/api/v1/Auth/LoginAdmin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Username: username.trim(), Password: password }),
            })
            if (!res.ok) {
                setLoginErr('Invalid credentials.');
                return
            }
            const data = await res.json()
            // Set ref immediately — before state commit — so effects have token instantly
            tokenRef.current = data.token
            setToken(data.token)
            setAuthed(true)
            // Hub connection happens in useEffect once authed+token are committed
        } catch {
            setLoginErr('Cannot reach server.')
        } finally {
            setLoginLoading(false)
        }
    }

    function logout() {
        connRef.current?.stop()
        connRef.current = null
        tokenRef.current = null
        setAuthed(false); setToken(null); setHubState('disconnected')
        setPlayers([]); setExpanded(null); setEvents({})
    }

    // ── Hub connection — fires AFTER auth state is committed ──────────
    useEffect(() => {
        if (!authed || !token) {
            return
        }

        setHubState('connecting')
        const tok = token   // capture for this effect's lifetime

        const conn = new signalR.HubConnectionBuilder().withUrl('/adminhub', { accessTokenFactory: () => tok }).withAutomaticReconnect().build()

        conn.on('PlayerTokenUpdate', ({ playerId, tokens }) => {
            setPlayers(ps => ps.map(p => p.id === playerId ? { ...p, tokens } : p))
        })

        conn.on('PlayerOnlineStatus', ({ playerId, isOnline }) => {
            setOnlineIds(prev => {
                const next = new Set(prev)
                if (isOnline) {
                    next.add(playerId)
                } else {
                    next.delete(playerId)
                }
                return next
            })
        })

        conn.on('PlayerGameEvent', ev => {
            setEvents(prev => ({
                ...prev,
                [ev.playerId]: [ev, ...(prev[ev.playerId] || [])].slice(0, 150),
            }))
        })

        conn.onreconnecting(() => setHubState('connecting'))
        conn.onreconnected(() => {
            setHubState('connected')
            // Group memberships are lost on reconnect — re-subscribe to the watched player
            const watching = expandedRef.current
            if (watching) {
                conn.invoke('WatchPlayer', watching).catch(() => { })
            }
        })
        conn.onclose(() => {
            setHubState('disconnected')
            if (connRef.current === conn) {
                connRef.current = null
            }
        })

        conn.start()
            .then(() => { connRef.current = conn; setHubState('connected') })
            .catch(err => {
                console.warn('Admin hub failed to connect:', err?.message ?? err)
                setHubState('error')
            })

        return () => {
            conn.stop()
            if (connRef.current === conn) {
                connRef.current = null
            }
        }
    }, [authed, token])

    // ── Player fetch ──────────────────────────────────────────────────
    const fetchPlayers = useCallback(async (pg, srch) => {
        const tok = tokenRef.current
        if (!tok) return
        setLoading(true)
        try {
            const params = new URLSearchParams({ page: pg, pageSize: PAGE_SIZE })
            if (srch) {
                params.set('search', srch)
            }
            const res = await fetch(`/api/v1/Admin/Players?${params}`, {
                headers: { Authorization: `Bearer ${tok}` },
            })
            if (res.status === 401) {
                logout();
                return
            }
            if (!res.ok) {
                return
            }
            const data = await res.json()
            setPlayers(data.players)
            setOnlineIds(new Set(data.players.filter(p => p.isOnline).map(p => p.id)))
            setTotal(data.total)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (authed) {
            fetchPlayers(page, debouncedSearch)
        }
    }, [authed, page, debouncedSearch, fetchPlayers])

    useEffect(() => { setPage(1) }, [debouncedSearch])
    useEffect(() => { expandedRef.current = expanded }, [expanded])

    // ── Watch / unwatch player ────────────────────────────────────────
    async function toggleExpand(playerId) {
        const conn = connRef.current
        if (expanded === playerId) {
            conn?.invoke('UnwatchPlayer', playerId).catch(() => { })
            setExpanded(null)
        } else {
            if (expanded) {
                conn?.invoke('UnwatchPlayer', expanded).catch(() => { })
            }
            conn?.invoke('WatchPlayer', playerId).catch(() => { })
            setExpanded(playerId)
        }
    }

    // ── Token actions ─────────────────────────────────────────────────
    async function applyTokens(player, newTokens, label) {
        if (newTokens < 0) {
            return
        }
        const tok = tokenRef.current
        try {
            const res = await fetch('/api/v1/Admin/SetTokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                body: JSON.stringify({ PlayerId: player.id, Tokens: newTokens }),
            })
            if (!res.ok) {
                return
            }
            setPlayers(ps => ps.map(p => p.id === player.id ? { ...p, tokens: newTokens } : p))
            showToast(label)
        } catch {
            showToast('Failed.')
        }
    }

    function adjust(player, delta) {
        applyTokens(player, Math.max(0, player.tokens + delta),
            `${delta > 0 ? '+' : ''}${delta} → ${player.name}`)
    }

    function applyCustom(player, mode) {
        const raw = parseInt(editVals[player.id] || '')
        if (isNaN(raw) || raw < 0) {
            return
        }
        const next = mode === 'set' ? raw : mode === 'add' ? player.tokens + raw : Math.max(0, player.tokens - raw)
        setEditVals(v => ({ ...v, [player.id]: '' }))
        applyTokens(player, next,
            mode === 'set' ? `Set ${player.name} → ${next}` : mode === 'add' ? `+${raw} → ${player.name}` : `-${raw} → ${player.name}`)
    }

    async function broadcast() {
        if (!broadcastMsg.trim()) {
            return
        }
        const tok = tokenRef.current
        setBroadcasting(true)
        try {
            await fetch('/api/v1/Admin/Broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                body: JSON.stringify({ Type: broadcastType, Message: broadcastMsg.trim() }),
            })
            setBroadcastMsg('')
            showToast('Broadcast sent.')
        } catch {
            showToast('Broadcast failed.')
        }
        finally {
            setBroadcasting(false)
        }
    }

    function showToast(msg) {
        setToast(msg)
        if (toastTimer.current) {
            clearTimeout(toastTimer.current)
        }
        toastTimer.current = setTimeout(() => setToast(''), 2200)
    }

    // ── Hub status pill ───────────────────────────────────────────────
    const hubPill = {
        connected: { text: '🟢 Live', style: { color: 'var(--green)' } },
        connecting: { text: '🟡 Connecting…', style: { color: 'var(--gold)' } },
        disconnected: { text: '⚫ Offline', style: { color: '#555' } },
        error: { text: '🔴 Hub error', style: { color: 'var(--red)' } },
    }[hubState]

    // ── Login screen ──────────────────────────────────────────────────
    if (!authed) {
        return (
            <div className="admin-login-wrap">
                <div className="admin-login-card">
                    <div className="admin-login-badge">⚡ Admin</div>
                    <div className="admin-login-title">Lucky Reels</div>
                    <div className="admin-login-sub">Control Panel</div>
                    <input className="lobby-input" placeholder="Username" value={username}
                        onChange={e => setUsername(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && login()} autoComplete="off" />
                    <input className="lobby-input" placeholder="Password" type="password" value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && login()} />
                    {loginErr && <div className="lobby-error">{loginErr}</div>}
                    <button className="lobby-btn" onClick={login} disabled={loginLoading}>
                        {loginLoading ? '…' : 'LOGIN'}
                    </button>
                </div>
            </div>
        )
    }

    // ── Sorted player list (online first, then alphabetical) ─────────
    const sortedPlayers = [...players].sort((a, b) => {
        const aOnline = onlineIds.has(a.id)
        const bOnline = onlineIds.has(b.id)
        if (aOnline !== bOnline) {
            return aOnline ? -1 : 1
        }
        return a.name.localeCompare(b.name)
    })

    // ── Main panel ────────────────────────────────────────────────────
    return (
        <div className="admin-wrap">

            <div className="admin-header">
                <div className="admin-header-left">
                    <div className="admin-badge-pill">⚡ Admin Panel</div>
                    <div className="admin-title">Lucky Reels</div>
                </div>
                <div className="admin-header-stats">
                    <div className="admin-stat">
                        <div className="admin-stat-value">{total.toLocaleString()}</div>
                        <div className="admin-stat-label">Players</div>
                    </div>
                    <div className="admin-stat-divider" />
                    <div className="admin-stat" style={hubPill.style}>
                        <div className="admin-stat-value" style={{ fontSize: 14 }}>{hubPill.text}</div>
                        <div className="admin-stat-label">Real-time</div>
                    </div>
                </div>
                <button className="hub-logout-btn" onClick={logout}>Logout</button>
            </div>

            <div className="admin-broadcast-bar">
                <select className="broadcast-type-select" value={broadcastType} onChange={e => setBroadcastType(e.target.value)}>
                    <option value="info">ℹ Info</option>
                    <option value="success">✅ Success</option>
                    <option value="warning">⚠ Warning</option>
                    <option value="error">🔴 Alert</option>
                </select>
                <input
                    className="broadcast-input"
                    placeholder="Broadcast message to all players…"
                    value={broadcastMsg}
                    onChange={e => setBroadcastMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && broadcast()}
                />
                <button className="broadcast-btn" onClick={broadcast} disabled={broadcasting || !broadcastMsg.trim()}>
                    {broadcasting ? '…' : 'Send'}
                </button>
            </div>

            <div className="admin-toolbar">
                <div className="admin-search-wrap">
                    <span className="admin-search-icon">🔍</span>
                    <input className="admin-search" placeholder="Search players..." value={search}
                        onChange={e => setSearch(e.target.value)} />
                    {search && <button className="admin-search-clear" onClick={() => setSearch('')}>×</button>}
                </div>
                <div className="admin-pagination">
                    <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <span className="admin-page-info">Page {page} / {totalPages}</span>
                    <button className="admin-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            </div>

            <div className="admin-table-wrap">
                {loading && <div className="admin-loading">Loading...</div>}
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }} />
                            <th>Player</th>
                            <th className="th-tokens">Tokens</th>
                            <th className="th-quick">Quick</th>
                            <th className="th-custom">Custom</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedPlayers.map(p => {
                            const isExpanded = expanded === p.id
                            const isOnline = onlineIds.has(p.id)
                            const playerEvents = events[p.id] || []
                            return [
                                <tr key={p.id} className={`admin-row${isExpanded ? ' admin-row-expanded' : ''}`}>
                                    <td className="td-expand" onClick={() => toggleExpand(p.id)}>
                                        <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
                                    </td>
                                    <td className="td-name" onClick={() => toggleExpand(p.id)} style={{ cursor: 'pointer' }}>
                                        <span className="player-name-text">
                                            {isOnline && <span className="online-dot" title="Online" />}
                                            {p.name}
                                        </span>
                                        <span className="player-joined">joined {new Date(p.createdAt).toLocaleDateString()}</span>
                                    </td>
                                    <td className="td-tokens">
                                        <span className="token-badge">{p.tokens.toLocaleString()}</span>
                                    </td>
                                    <td className="td-quick">
                                        <div className="quick-row">
                                            <button className="q-btn q-add" onClick={() => adjust(p, 10)}>+10</button>
                                            <button className="q-btn q-add" onClick={() => adjust(p, 25)}>+25</button>
                                            <button className="q-btn q-add" onClick={() => adjust(p, 100)}>+100</button>
                                            <button className="q-btn q-add" onClick={() => adjust(p, 500)}>+500</button>
                                            <button className="q-btn q-sub" onClick={() => adjust(p, -100)}>-100</button>
                                            <button className="q-btn q-sub" onClick={() => adjust(p, -500)}>-500</button>
                                        </div>
                                    </td>
                                    <td className="td-custom">
                                        <div className="custom-row">
                                            <input className="custom-input" type="number" min="0" placeholder="amount"
                                                value={editVals[p.id] || ''}
                                                onChange={e => setEditVals(v => ({ ...v, [p.id]: e.target.value }))}
                                                onKeyDown={e => e.key === 'Enter' && applyCustom(p, 'set')} />
                                            <button className="q-btn q-add" onClick={() => applyCustom(p, 'add')}>+</button>
                                            <button className="q-btn q-sub" onClick={() => applyCustom(p, 'sub')}>−</button>
                                            <button className="q-btn q-set" onClick={() => applyCustom(p, 'set')}>SET</button>
                                        </div>
                                    </td>
                                </tr>,
                                isExpanded && (
                                    <tr key={`${p.id}-detail`} className="admin-detail-row">
                                        <td colSpan={5} className="admin-detail-cell">
                                            <div className="admin-detail">
                                                <div className="admin-detail-header">
                                                    <span className="admin-detail-title">🔴 LIVE · {p.name}</span>
                                                    <span className="admin-detail-count">{playerEvents.length} events</span>
                                                </div>
                                                {playerEvents.length === 0 ? (
                                                    <div className="admin-detail-empty">Waiting for activity…</div>
                                                ) : (
                                                    <div className="admin-event-list">
                                                        {playerEvents.map((ev, i) => {
                                                            const f = formatEvent(ev)
                                                            const isPos = f.net && !f.net.startsWith('-')
                                                            return (
                                                                <div key={i} className="admin-event-row">
                                                                    <span className="ev-icon">{f.icon}</span>
                                                                    <span className="ev-game">{(ev.game || '').toUpperCase()}</span>
                                                                    <span className="ev-label">{f.label}</span>
                                                                    <span className="ev-detail">{f.detail}</span>
                                                                    {f.net && <span className={`ev-net ${isPos ? 'pos' : 'neg'}`}>{f.net}</span>}
                                                                    <span className="ev-time">{f.time}</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            ]
                        })}
                        {!loading && players.length === 0 && (
                            <tr><td colSpan={5} className="admin-empty">No players found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="admin-toolbar admin-toolbar-bottom">
                <span className="admin-result-count">{total.toLocaleString()} players total</span>
                <div className="admin-pagination">
                    <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                        .reduce((acc, n, i, arr) => { if (i > 0 && n - arr[i - 1] > 1) acc.push('…'); acc.push(n); return acc }, [])
                        .map((n, i) => n === '…'
                            ? <span key={`e${i}`} className="admin-ellipsis">…</span>
                            : <button key={n} className={`admin-page-num${n === page ? ' active' : ''}`} onClick={() => setPage(n)}>{n}</button>
                        )}
                    <button className="admin-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            </div>

            {toast && <div className="admin-toast">✓ {toast}</div>}
        </div>
    )
}
