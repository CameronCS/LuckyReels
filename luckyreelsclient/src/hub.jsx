import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'

const HubCtx = createContext(null)

export const API = ''  // relative — proxied through Vite to the backend

export function HubProvider({ children }) {
    const [conn, setConn] = useState(null)
    const [isAuthed, setIsAuthed] = useState(false)
    const [tokens, setTokens] = useState(0)
    const [playerName, setName] = useState('')
    const [notifications, setNotifications] = useState([])
    const connecting = useRef(false)
    const notifConnRef = useRef(null)

    useEffect(() => {
        const token = localStorage.getItem('lr_token')
        const name = localStorage.getItem('lr_user')
        if (token && name) _doConnect(token, name)
    }, [])

    const dismissNotification = useCallback(id => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }, [])

    function _pushNotification(type, message) {
        const id = Date.now() + Math.random()
        setNotifications(prev => [...prev, { id, type, message }])
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000)
    }

    async function _doConnect(token, name) {
        if (connecting.current) return
        connecting.current = true

        const c = new signalR.HubConnectionBuilder()
            .withUrl(`${API}/game`, { accessTokenFactory: () => token })
            .withAutomaticReconnect()
            .build()

        c.on('TokensUpdated', t => setTokens(t))
        c.onclose(() => { setConn(null); setIsAuthed(false) })

        const n = new signalR.HubConnectionBuilder()
            .withUrl(`${API}/hub`, { accessTokenFactory: () => token })
            .withAutomaticReconnect()
            .build()

        n.on('Notification', ({ type, message }) => _pushNotification(type, message))

        try {
            await c.start()
            setConn(c)
            setName(name)
            setIsAuthed(true)
            notifConnRef.current = n
            n.start().catch(() => { })
        } catch {
            localStorage.removeItem('lr_token')
            localStorage.removeItem('lr_user')
        } finally {
            connecting.current = false
        }
    }

    async function connect(token, name) {
        localStorage.setItem('lr_token', token)
        localStorage.setItem('lr_user', name)
        await _doConnect(token, name)
    }

    async function disconnect() {
        if (conn) { await conn.stop(); setConn(null) }
        if (notifConnRef.current) { await notifConnRef.current.stop(); notifConnRef.current = null }
        localStorage.removeItem('lr_token')
        localStorage.removeItem('lr_user')
        setIsAuthed(false)
        setTokens(0)
        setName('')
    }

    return (
        <HubCtx.Provider value={{ conn, isAuthed, tokens, setTokens, playerName, connect, disconnect, notifications, dismissNotification }}>
            {children}
        </HubCtx.Provider>
    )
}

export function useHub() { return useContext(HubCtx) }
