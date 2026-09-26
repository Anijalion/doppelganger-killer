import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, VolumeX, Swords, Sparkles, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';
import { soundManager } from '../utils/audio';

const COLORS = [
  { label: 'Red', hex: '#f87171' },
  { label: 'Blue', hex: '#60a5fa' },
  { label: 'Green', hex: '#4ade80' },
  { label: 'Yellow', hex: '#facc15' },
  { label: 'Purple', hex: '#c084fc' },
  { label: 'Cyan', hex: '#22d3ee' },
  { label: 'Pink', hex: '#f472b6' },
  { label: 'Orange', hex: '#fb923c' },
];

export default function TitleScreen() {
  const [name, setName] = useState(localStorage.getItem('dg_player_name') || '');
  const [color, setColor] = useState(COLORS[0].hex);
  const [roomId, setRoomId] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    soundManager.init();
    soundManager.playStep();
    const finalName = name.trim() || `Agent #${Math.floor(Math.random() * 900 + 100)}`;
    localStorage.setItem('dg_player_name', finalName);
    localStorage.setItem('dg_player_color', color);
    
    const newRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/${newRoom}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      soundManager.init();
      soundManager.playStep();
      const finalName = name.trim() || `Agent #${Math.floor(Math.random() * 900 + 100)}`;
      localStorage.setItem('dg_player_name', finalName);
      localStorage.setItem('dg_player_color', color);
      navigate(`/${roomId.trim().toUpperCase()}`);
    }
  };

  const toggleSound = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-slate-950 text-white p-4 relative overflow-y-auto">
      {/* Sound Toggle Top Right */}
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={toggleSound}
        className="absolute top-6 right-6 bg-slate-800/80 hover:bg-slate-700 text-slate-300 p-3 rounded-2xl border border-slate-700 backdrop-blur shadow-lg transition-all z-20"
      >
        {isMuted ? <VolumeX size={24} className="text-red-400" /> : <Volume2 size={24} className="text-emerald-400" />}
      </motion.button>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        className="bg-slate-900/90 border-4 border-slate-700/80 p-8 rounded-3xl shadow-[0_0_60px_rgba(2,132,199,0.35)] w-full max-w-lg flex flex-col items-center backdrop-blur-xl z-10 my-8"
      >
        {/* Title Logo Banner Image */}
        <motion.div 
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          className="w-full mb-3 flex flex-col items-center"
        >
          <img 
            src="/logo.png" 
            alt="Doppelganger Killer Logo" 
            className="w-full max-h-48 object-contain rounded-2xl shadow-2xl border border-cyan-500/40"
          />
        </motion.div>
        <p className="text-cyan-400 text-sm font-bold tracking-widest uppercase mb-6 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">
          超・疑心暗鬼 2Dマルチプレイ暗殺アクション
        </p>

        {/* Customization Section */}
        <div className="w-full bg-slate-950/60 p-4 rounded-2xl border border-slate-800 mb-6 flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">プレイヤー名</label>
            <input 
              type="text" 
              placeholder="あなたの名前を入力..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={12}
              className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-white font-bold focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">My Color (自分だけに表示)</label>
            <div className="flex justify-between gap-2">
              {COLORS.map((c) => (
                <motion.button
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  className={`w-8 h-8 rounded-full border-4 ${color === c.hex ? 'border-white scale-110 shadow-lg' : 'border-slate-800'} transition-all`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleCreateRoom}
          className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black py-4 px-6 rounded-2xl shadow-[0_6px_0_0_#991b1b] active:shadow-none active:translate-y-1 transition-all mb-6 text-xl tracking-wider flex items-center justify-center gap-3"
        >
          <Swords size={28} />
          ルームを作成する
        </motion.button>

        <div className="w-full flex items-center justify-between mb-6">
          <div className="h-px bg-slate-700 flex-1"></div>
          <span className="px-4 text-slate-500 text-xs font-bold tracking-widest">またはルームIDを入力</span>
          <div className="h-px bg-slate-700 flex-1"></div>
        </div>

        <form onSubmit={handleJoinRoom} className="w-full flex gap-2 mb-6">
          <input 
            type="text" 
            placeholder="ROOM ID" 
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            className="flex-1 bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-3 text-white font-mono font-bold focus:outline-none focus:border-blue-500 transition-colors uppercase tracking-widest text-center"
            maxLength={6}
          />
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-2xl shadow-[0_4px_0_0_#1e40af] active:translate-y-1 transition-all"
          >
            参加
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
