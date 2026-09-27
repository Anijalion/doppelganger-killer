import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Smartphone, 
  Maximize, 
  Copy, 
  Check, 
  Users, 
  Clock, 
  Crown, 
  Biohazard, 
  Trophy, 
  Play, 
  Settings, 
  ChevronDown, 
  ChevronUp,
  Shield,
  Timer
} from 'lucide-react';
import { motion } from 'framer-motion';
import { socket } from '../socket';
import { useSocketEvent } from '../hooks/useSocketEvent';
import GameCanvas from '../components/GameCanvas';
import HUD from '../components/HUD';
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

export default function GameScreen() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [nearTaskStation, setNearTaskStation] = useState(null);
  const [nearVent, setNearVent] = useState(null);
  const [nearCrimeScene, setNearCrimeScene] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [showScoreCustomizer, setShowScoreCustomizer] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  const handleForceLandscape = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {
      console.log('Orientation lock error:', e);
    }
  };

  const [playerName, setPlayerName] = useState(() => {
    const saved = localStorage.getItem('dg_player_name');
    if (saved) return `${saved} #${Math.floor(Math.random() * 89 + 10)}`;
    return `Agent #${Math.floor(Math.random() * 900 + 100)}`;
  });
  const [playerColor, setPlayerColor] = useState(() => {
    return localStorage.getItem('dg_player_color') || COLORS[Math.floor(Math.random() * COLORS.length)].hex;
  });
  const [isJoined, setIsJoined] = useState(false);

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const finalName = playerName.trim() || `Agent #${Math.floor(Math.random() * 900 + 100)}`;
    localStorage.setItem('dg_player_name', finalName.split(' #')[0]);
    localStorage.setItem('dg_player_color', playerColor);

    soundManager.init();
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join_room', { roomId, name: finalName, color: playerColor });
    setIsJoined(true);
  };

  useSocketEvent('room_joined', (data) => {
    setGameState(data.gameState);
  });

  useSocketEvent('player_updated', (players) => {
    setGameState(prev => {
      if (!prev) return prev;
      const updatedPlayers = { ...players };
      if (socket.id && prev.players && prev.players[socket.id] && updatedPlayers[socket.id]) {
        const prevStun = prev.players[socket.id].stunUntil || 0;
        const newStun = updatedPlayers[socket.id].stunUntil || 0;
        if (prevStun > Date.now() && prevStun > newStun) {
          updatedPlayers[socket.id].stunUntil = prevStun;
        }
      }
      return { ...prev, players: updatedPlayers };
    });
  });

  useSocketEvent('player_moved', (data) => {
    setGameState(prev => {
      if (!prev) return prev;
      const { id, x, y, isDead, isStealth } = data;
      if (prev.players[id]) {
        return {
          ...prev,
          players: {
            ...prev.players,
            [id]: { ...prev.players[id], x, y, isDead, isStealth }
          }
        };
      }
      return prev;
    });
  });

  useSocketEvent('golden_paint_spawned', (goldenPaint) => {
    setGameState(prev => prev ? { ...prev, goldenPaint } : prev);
  });

  useSocketEvent('room_settings_updated', (data) => {
    setGameState(prev => prev ? { 
      ...prev, 
      gameDuration: data.gameDuration, 
      crownDurationSec: data.crownDurationSec,
      poisonGasStartSec: data.poisonGasStartSec,
      shieldDurationSec: data.shieldDurationSec,
      shieldCooldownSec: data.shieldCooldownSec,
      scoreSettings: data.scoreSettings
    } : prev);
  });

  useSocketEvent('game_started', (data) => {
    setGameOverData(null);
    setGameState(data.gameState);
    soundManager.startBgm();
  });

  useSocketEvent('game_over', (data) => {
    soundManager.playCrown();
    setGameOverData(data.leaderboard);
  });

  useSocketEvent('room_reset', (data) => {
    soundManager.stopBgm();
    setGameOverData(null);
    setGameState(data.gameState);
  });

  const handleStartGame = () => {
    soundManager.init();
    soundManager.startBgm();
    socket.emit('start_game', roomId);
  };

  const handleResetRoom = () => {
    soundManager.stopBgm();
    socket.emit('reset_room', roomId);
  };

  const handleUseVent = () => {
    if (!nearVent || !gameState.vents) return;
    const myPlayer = gameState.players[socket.id];
    if (myPlayer && (myPlayer.ventCooldownUntil || 0) > Date.now()) return;

    const targetVent = gameState.vents.find(v => v.id === nearVent.targetId);
    if (targetVent) {
      socket.emit('action_vent', {
        roomId,
        fromVentId: nearVent.id,
        toX: targetVent.x,
        toY: targetVent.y
      });
      soundManager.playVent();
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full bg-slate-950 text-white p-3 overflow-y-auto">
        <div className="bg-slate-900 border-4 border-slate-700 p-5 sm:p-8 rounded-3xl max-w-md w-full flex flex-col items-center shadow-2xl my-auto">
          <h2 className="text-2xl sm:text-3xl font-black mb-1 text-white text-center">ROOM: {roomId}</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 text-center">参加者の名前とカラーを設定してください</p>

          <form onSubmit={handleJoinSubmit} className="w-full flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">表示名</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={14}
                required
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-2.5 text-white font-bold focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">My Color (自分だけに識別用)</label>
              <div className="flex justify-between gap-1.5">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.hex}
                    onClick={() => setPlayerColor(c.hex)}
                    className={`w-8 h-8 rounded-full border-4 ${playerColor === c.hex ? 'border-white scale-110 shadow-lg' : 'border-slate-800'} transition-all`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black py-3.5 px-6 rounded-2xl shadow-[0_5px_0_0_#991b1b] active:translate-y-1 transition-all text-lg mt-1"
            >
              ルームに参加する！
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-950 text-white">
        <p className="text-2xl font-bold animate-pulse text-red-500">Connecting to Room Server...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
      {gameState.state === 'waiting' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-3 sm:p-6 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="bg-slate-900/90 border border-slate-700/80 p-5 sm:p-7 rounded-3xl shadow-[0_0_80px_rgba(239,68,68,0.2)] max-w-2xl w-full max-h-[95vh] my-auto overflow-y-auto flex flex-col items-center backdrop-blur-2xl relative"
          >
            {/* Decorative top ambient glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-r from-red-600/20 via-orange-500/20 to-amber-500/20 blur-2xl pointer-events-none rounded-full" />

            {/* Header section */}
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 mb-5 border-b border-slate-800 pb-4 relative z-10">
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    WAITING LOBBY
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 mt-0.5">
                  作戦準備ロビー
                </h2>
              </div>

              {/* Room Code Badge & Copy */}
              <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-700/80 p-1.5 px-3 rounded-2xl shadow-inner">
                <div className="flex flex-col">
                  <span className="text-[9px] font-extrabold text-slate-500 tracking-widest uppercase">ROOM ID</span>
                  <span className="font-mono text-base font-black text-cyan-400 tracking-widest">{roomId}</span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={copyUrl}
                  className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    copied
                      ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-white" />
                      <span>コピー完了</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>URL共有</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Main Grid: Player Roster & Game Settings */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5 relative z-10">
              
              {/* Player Roster Section (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Users size={15} className="text-cyan-400" />
                    参加プレイヤー
                  </label>
                  <span className="text-xs font-bold bg-slate-800 text-cyan-300 px-2.5 py-0.5 rounded-full border border-slate-700">
                    {Object.keys(gameState.players).length} 名
                  </span>
                </div>

                <div className="w-full bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80 flex flex-col gap-2 max-h-56 lg:max-h-72 overflow-y-auto shadow-inner">
                  {Object.values(gameState.players).map((p, idx) => {
                    const isLocal = p.id === socket.id;
                    const isHost = idx === 0;
                    return (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={p.id} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          isLocal 
                            ? 'bg-gradient-to-r from-slate-900 to-slate-800 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]' 
                            : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div 
                              className="w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center font-black text-[10px] text-slate-950" 
                              style={{ backgroundColor: p.color }}
                            >
                              {idx + 1}
                            </div>
                            <div 
                              className="absolute inset-0 rounded-full blur-sm opacity-50 pointer-events-none" 
                              style={{ backgroundColor: p.color }} 
                            />
                          </div>
                          <span className={`font-bold text-xs truncate max-w-[130px] ${isLocal ? 'text-white font-extrabold' : 'text-slate-300'}`}>
                            {p.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isHost && (
                            <span className="text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Crown size={10} className="text-amber-400" />
                              HOST
                            </span>
                          )}
                          {isLocal && (
                            <span className="text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded-md shadow-sm">
                              YOU
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Game Settings Panel (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-3.5 bg-slate-950/50 p-3.5 sm:p-4 rounded-2xl border border-slate-800/80">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Settings size={15} className="text-amber-400" />
                    ゲームルール設定
                  </label>
                  <span className="text-[10px] text-slate-500 font-bold">リアルタイム変更</span>
                </div>

                {/* 1. Match Duration */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1.5 flex items-center gap-1.5">
                    <Clock size={13} className="text-cyan-400" />
                    試合時間
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { sec: 60, label: '1分' },
                      { sec: 120, label: '2分' },
                      { sec: 180, label: '3分 ★' },
                      { sec: 300, label: '5分' },
                    ].map(item => {
                      const currentSec = Math.floor((gameState.gameDuration || 180000) / 1000);
                      const isSelected = currentSec === item.sec;
                      return (
                        <button
                          key={item.sec}
                          type="button"
                          onClick={() => socket.emit('set_game_duration', { roomId, durationSec: item.sec })}
                          className={`py-1.5 rounded-xl text-center font-bold text-xs transition-all border ${
                            isSelected
                              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)] font-black scale-105'
                              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Crown Reveal Time */}
                <div>
                  <label className="text-[11px] font-bold text-amber-300 block mb-1.5 flex items-center gap-1.5">
                    <Crown size={13} className="text-amber-400" />
                    王冠の出現タイミング
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { sec: 15, label: 'ラスト15秒' },
                      { sec: 30, label: 'ラスト30秒' },
                      { sec: 45, label: 'ラスト45秒' },
                      { sec: 60, label: 'ラスト1分 ★' },
                      { sec: 90, label: 'ラスト1分半' },
                      { sec: 9999, label: '常時表示 👑' },
                    ].map(item => {
                      const currentCrownSec = gameState.crownDurationSec || 60;
                      const isSelected = currentCrownSec === item.sec;
                      return (
                        <button
                          key={item.sec}
                          type="button"
                          onClick={() => socket.emit('set_crown_duration', { roomId, crownSec: item.sec })}
                          className={`py-1.5 rounded-xl text-center font-bold text-[11px] transition-all border ${
                            isSelected
                              ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 border-yellow-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] font-black scale-105'
                              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Poison Gas Shrink Time */}
                <div>
                  <label className="text-[11px] font-bold text-purple-300 block mb-1.5 flex items-center gap-1.5">
                    <Biohazard size={13} className="text-purple-400" />
                    毒ガス縮小開始
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { sec: 0, label: 'オフ (なし)' },
                      { sec: 30, label: 'ラスト30秒' },
                      { sec: 60, label: 'ラスト1分 ★' },
                      { sec: 90, label: 'ラスト1分半' },
                      { sec: 120, label: 'ラスト2分' },
                      { sec: 9999, label: '常時発生 ☣️' },
                    ].map(item => {
                      const currentGasSec = gameState.poisonGasStartSec !== undefined ? gameState.poisonGasStartSec : 60;
                      const isSelected = currentGasSec === item.sec;
                      return (
                        <button
                          key={item.sec}
                          type="button"
                          onClick={() => socket.emit('set_poison_gas_duration', { roomId, gasSec: item.sec })}
                          className={`py-1.5 rounded-xl text-center font-bold text-[11px] transition-all border ${
                            isSelected
                              ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.4)] font-black scale-105'
                              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Shield Duration */}
                <div>
                  <label className="text-[11px] font-bold text-sky-300 block mb-1.5 flex items-center gap-1.5">
                    <Shield size={13} className="text-sky-400" />
                    シールド無敵時間 (効果秒数)
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { sec: 0, label: 'オフ' },
                      { sec: 2, label: '2秒' },
                      { sec: 3, label: '3秒 ★' },
                      { sec: 5, label: '5秒' },
                      { sec: 8, label: '8秒' },
                    ].map(item => {
                      const currentShieldSec = gameState.shieldDurationSec !== undefined ? gameState.shieldDurationSec : 3;
                      const isSelected = currentShieldSec === item.sec;
                      return (
                        <button
                          key={item.sec}
                          type="button"
                          onClick={() => socket.emit('set_shield_duration', { roomId, durationSec: item.sec })}
                          className={`py-1.5 rounded-xl text-center font-bold text-[11px] transition-all border ${
                            isSelected
                              ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-600 text-white border-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.5)] font-black scale-105'
                              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Shield Cooldown */}
                <div>
                  <label className="text-[11px] font-bold text-teal-300 block mb-1.5 flex items-center gap-1.5">
                    <Timer size={13} className="text-teal-400" />
                    シールドのクールタイム
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { sec: 10, label: '10秒' },
                      { sec: 15, label: '15秒 ★' },
                      { sec: 20, label: '20秒' },
                      { sec: 30, label: '30秒' },
                      { sec: 45, label: '45秒' },
                    ].map(item => {
                      const currentCdSec = gameState.shieldCooldownSec || 15;
                      const isSelected = currentCdSec === item.sec;
                      return (
                        <button
                          key={item.sec}
                          type="button"
                          onClick={() => socket.emit('set_shield_cooldown', { roomId, cooldownSec: item.sec })}
                          className={`py-1.5 rounded-xl text-center font-bold text-[11px] transition-all border ${
                            isSelected
                              ? 'bg-gradient-to-r from-teal-500 via-emerald-600 to-teal-600 text-white border-teal-300 shadow-[0_0_12px_rgba(20,184,166,0.5)] font-black scale-105'
                              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Score Settings Expandable */}
                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowScoreCustomizer(!showScoreCustomizer)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-all text-left"
                  >
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                      <Trophy size={14} className="text-cyan-400" />
                      スコア・配点設定 (カスタム)
                    </span>
                    <span className="text-[11px] font-extrabold text-cyan-400 flex items-center gap-1">
                      {showScoreCustomizer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {showScoreCustomizer ? '閉じる' : '開く'}
                    </span>
                  </button>

                  {showScoreCustomizer && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-950 p-3 rounded-xl border border-cyan-500/30 mt-2 shadow-inner"
                    >
                      {/* 1. Player Kill Score */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">⚔️ 撃破スコア (キル成功)</span>
                        <div className="grid grid-cols-2 gap-1">
                          {[500, 1000, 1500, 2000].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => socket.emit('set_score_settings', { roomId, scoreSettings: { playerKill: val } })}
                              className={`py-1 text-[10px] font-bold rounded-lg border text-center transition-all ${
                                (gameState.scoreSettings?.playerKill ?? 1000) === val
                                  ? 'bg-cyan-600 text-white border-cyan-300 font-black shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              +{val}pt {val === 1000 ? '★' : ''}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 2. NPC Mistake Penalty */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">😵 NPC誤爆ペナルティ</span>
                        <div className="grid grid-cols-2 gap-1">
                          {[200, 500, 800, 1000].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => socket.emit('set_score_settings', { roomId, scoreSettings: { npcMistake: val } })}
                              className={`py-1 text-[10px] font-bold rounded-lg border text-center transition-all ${
                                (gameState.scoreSettings?.npcMistake ?? 500) === val
                                  ? 'bg-red-600 text-white border-red-300 font-black shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              -{val}pt {val === 500 ? '★' : ''}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 3. Task Done Score */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">🛠️ タスク完了スコア</span>
                        <div className="grid grid-cols-2 gap-1">
                          {[100, 300, 500, 1000].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => socket.emit('set_score_settings', { roomId, scoreSettings: { taskDone: val } })}
                              className={`py-1 text-[10px] font-bold rounded-lg border text-center transition-all ${
                                (gameState.scoreSettings?.taskDone ?? 300) === val
                                  ? 'bg-emerald-600 text-white border-emerald-300 font-black shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              +{val}pt {val === 300 ? '★' : ''}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 4. Gold Paint Score */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">✨ 黄金ペンキ獲得</span>
                        <div className="grid grid-cols-2 gap-1">
                          {[300, 500, 800, 1000].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => socket.emit('set_score_settings', { roomId, scoreSettings: { goldPaint: val } })}
                              className={`py-1 text-[10px] font-bold rounded-lg border text-center transition-all ${
                                (gameState.scoreSettings?.goldPaint ?? 500) === val
                                  ? 'bg-amber-500 text-slate-950 border-yellow-200 font-black shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              +{val}pt {val === 500 ? '★' : ''}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 5. Toxic Gas Damage */}
                      <div className="sm:col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">☣️ 毒ガス毎秒ダメージ</span>
                        <div className="grid grid-cols-4 gap-1">
                          {[20, 50, 100, 200].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => socket.emit('set_score_settings', { roomId, scoreSettings: { gasDamage: val } })}
                              className={`py-1 text-[10px] font-bold rounded-lg border text-center transition-all ${
                                (gameState.scoreSettings?.gasDamage ?? 50) === val
                                  ? 'bg-purple-600 text-white border-purple-300 font-black shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              -{val}pt/秒 {val === 50 ? '★' : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

            </div>

            {/* Start Game Hero Action Button */}
            <div className="w-full flex flex-col gap-2.5 relative z-10 pt-2 border-t border-slate-800/80">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartGame}
                className="w-full bg-gradient-to-r from-red-600 via-orange-500 to-red-600 hover:from-red-500 hover:via-orange-400 hover:to-red-500 text-white font-black py-4 px-6 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.4)] active:translate-y-0.5 transition-all text-xl tracking-wider flex items-center justify-center gap-3 border border-red-400/40"
              >
                <Play size={24} className="fill-white text-white" />
                <span>ゲームを開始する！</span>
                <span className="text-xs bg-black/30 font-bold px-2.5 py-1 rounded-full border border-white/20">
                  {Math.floor((gameState.gameDuration || 180000) / 60000)}分戦
                  {gameState.shieldDurationSec !== 0 ? ` | 🛡️無敵${gameState.shieldDurationSec ?? 3}秒` : ' | 🛡️無効'}
                </span>
              </motion.button>

              <div className="flex items-center justify-between px-2">
                <button 
                  onClick={() => navigate('/')}
                  className="text-slate-400 hover:text-white underline text-xs font-semibold transition-colors flex items-center gap-1"
                >
                  ← タイトルへ戻る
                </button>
                
                <span className="text-[11px] text-slate-500 font-bold">
                  準備ができたら「ゲームを開始する」を押してください
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <GameCanvas 
        gameState={gameState} 
        socket={socket} 
        roomId={roomId} 
        onNearTaskStation={setNearTaskStation} 
        onNearVent={setNearVent}
        onNearCrimeScene={setNearCrimeScene}
      />

      <HUD 
        gameState={gameState} 
        socket={socket} 
        roomId={roomId} 
        nearTaskStation={nearTaskStation}
        nearVent={nearVent}
        nearCrimeScene={nearCrimeScene}
        onUseVent={handleUseVent}
        gameOverData={gameOverData}
        onResetRoom={handleResetRoom}
      />

      {/* NON-BLOCKING LANDSCAPE RECOMMENDATION TOAST */}
      {isPortrait && (
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md border border-cyan-500/50 text-cyan-200 px-3.5 py-1.5 rounded-full shadow-lg text-[11px] font-bold flex items-center gap-2 pointer-events-auto max-w-[92vw]"
        >
          <Smartphone size={16} className="animate-spin-slow text-cyan-400 flex-shrink-0" />
          <span className="truncate">📱 スマホを横向きに倒すと画面が広くなり操作しやすくなります</span>
          <button 
            onClick={() => setIsPortrait(false)}
            className="text-slate-400 hover:text-white font-black text-xs px-1"
          >
            ✕
          </button>
        </motion.div>
      )}
    </div>
  );
}
