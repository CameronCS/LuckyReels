import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HubProvider } from './hub'
import './index.css'
import Home      from './pages/Home'
import Slots     from './pages/Slots'
import Blackjack from './pages/Blackjack'
import Roulette  from './pages/Roulette'
import Horse     from './pages/Horse'
import Baccarat  from './pages/Baccarat'
import Mines     from './pages/Mines'
import Crash     from './pages/Crash'
import Plinko    from './pages/Plinko'

createRoot(document.getElementById('root')).render(
  <HubProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Home />} />
        <Route path="/slots"     element={<Slots />} />
        <Route path="/blackjack" element={<Blackjack />} />
        <Route path="/roulette"  element={<Roulette />} />
        <Route path="/horse"     element={<Horse />} />
        <Route path="/baccarat"  element={<Baccarat />} />
        <Route path="/mines"     element={<Mines />} />
        <Route path="/crash"     element={<Crash />} />
        <Route path="/plinko"    element={<Plinko />} />
      </Routes>
    </BrowserRouter>
  </HubProvider>
)
