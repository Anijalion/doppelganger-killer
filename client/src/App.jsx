import { Routes, Route } from 'react-router-dom'
import TitleScreen from './views/TitleScreen'
import GameScreen from './views/GameScreen'

function App() {
  return (
    <div className="fixed inset-0 w-full h-full h-[100dvh] bg-slate-900 text-white overflow-hidden relative font-sans touch-none select-none">
      <Routes>
        <Route path="/" element={<TitleScreen />} />
        <Route path="/:roomId" element={<GameScreen />} />
      </Routes>
    </div>
  )
}

export default App
