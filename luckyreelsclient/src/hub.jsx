import { createContext, useContext, useState, useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'

const HubCtx = createContext(null)

export const API = 'https://localhost:7211'

export function HubProvider({ children }) {
  const [conn, setConn]           = useState(null)
  const [isAuthed, setIsAuthed]   = useState(false)
  const [tokens, setTokens]       = useState(0)
  const [playerName, setName]     = useState('')
  const connecting = useRef(false)

  useEffect(() => {
    const token = localStorage.getItem('lr_token')
    const name  = localStorage.getItem('lr_user')
    if (token && name) _doConnect(token, name)
  }, [])

  async function _doConnect(token, name) {
    if (connecting.current) return
    connecting.current = true

    const c = new signalR.HubConnectionBuilder()
      .withUrl(`${API}/game`, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .build()

    c.on('TokensUpdated', t => setTokens(t))
    c.onclose(() => { setConn(null); setIsAuthed(false) })

    try {
      await c.start()
      setConn(c)
      setName(name)
      setIsAuthed(true)
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
    localStorage.removeItem('lr_token')
    localStorage.removeItem('lr_user')
    setIsAuthed(false)
    setTokens(0)
    setName('')
  }

  return (
    <HubCtx.Provider value={{ conn, isAuthed, tokens, setTokens, playerName, connect, disconnect }}>
      {children}
    </HubCtx.Provider>
  )
}

export function useHub() { return useContext(HubCtx) }
