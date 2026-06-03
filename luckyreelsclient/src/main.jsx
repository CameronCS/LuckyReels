import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HubProvider, useHub } from './hub'
import './index.css'
import Home from './pages/Home'
import Slots from './pages/Slots'
import Blackjack from './pages/Blackjack'
import Roulette from './pages/Roulette'
import Horse from './pages/Horse'
import Baccarat from './pages/Baccarat'
import Mines from './pages/Mines'
import Crash from './pages/Crash'
import Plinko from './pages/Plinko'
import Admin from './pages/Admin'
import Profile from './pages/Profile'

function NotificationToasts() {
    const { notifications, dismissNotification } = useHub()
    if (!notifications.length) return null
    return (
        <div className="notif-stack">
            {notifications.map(n => (
                <div key={n.id} className={`notif-toast notif-${n.type ?? 'info'}`}>
                    <span className="notif-msg">{n.message}</span>
                    <button className="notif-close" onClick={() => dismissNotification(n.id)}>×</button>
                </div>
            ))}
        </div>
    )
}

createRoot(document.getElementById('root')).render(
    <HubProvider>
        <NotificationToasts />
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/slots" element={<Slots />} />
                <Route path="/blackjack" element={<Blackjack />} />
                <Route path="/roulette" element={<Roulette />} />
                <Route path="/horse" element={<Horse />} />
                <Route path="/baccarat" element={<Baccarat />} />
                <Route path="/mines" element={<Mines />} />
                <Route path="/crash" element={<Crash />} />
                <Route path="/plinko" element={<Plinko />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/admin" element={<Admin />} />
            </Routes>
        </BrowserRouter>
    </HubProvider>
)
