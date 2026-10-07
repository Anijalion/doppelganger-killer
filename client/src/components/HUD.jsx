import { useEffect, useState, useRef } from 'react';
import { Target, AlertTriangle, Zap, Volume2, VolumeX, Trophy, Skull, RefreshCw, Footprints, Wind, Sparkles, Maximize, Minimize, Shield, Radar, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { soundManager } from '../utils/audio';
import TaskMinigame from './TaskMinigame';

export default function HUD({ gameState, socket, roomId, nearTaskStation, nearVent, nearCrimeScene, onUseVent, gameOverData, onResetRoom }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [logs, setLogs] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
  const [showPwaHint, setShowPwaHint] = useState(false);
  const [, setTick] = useState(0);
  const lastSonarAtRef = useRef(0);

  // Force tick for smooth cooldown updates
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const docEl = document.documentElement;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIos) {
      window.scrollTo(0, 1);
      setShowPwaHint(true);
      setTimeout(() => setShowPwaHint(false), 5000);
    }

    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape').catch(() => {});
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (e) {
      console.log('Fullscreen toggle error:', e);
      setShowPwaHint(true);
      setTimeout(() => setShowPwaHint(false), 5000);
    }
  };

  const myPlayer = gameState.players[socket.id];
  const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.score - a.score);
  const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;

  const [localStunUntil, setLocalStunUntil] = useState(0);

  useSocketEvent('player_stunned', (data) => {
    if (data.playerId === socket.id) {
      setLocalStunUntil(data.stunUntil);
    }
  });

  useSocketEvent('npc_killed', (data) => {
    if (data.killerId === socket.id && !data.isGolden) {
      setLocalStunUntil(Date.now() + 3000);
    }
  });

  useSocketEvent('event_log', (msg) => {
    const logId = Date.now() + Math.random();
    setLogs(prev => [...prev.slice(-3), { id: logId, text: msg }]);
    setTimeout(() => {
      setLogs(prev => prev.filter(l => l.id !== logId));
    }, 4000);
  });

  useSocketEvent('game_started', () => {
    setLogs([]);
    setLocalStunUntil(0);
  });

  useSocketEvent('room_reset', () => {
    setLogs([]);
    setLocalStunUntil(0);
  });

  useEffect(() => {
    if (gameState.state !== 'playing' || !gameState.startTime) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - gameState.startTime;
      const remaining = Math.max(0, gameState.gameDuration - elapsed);
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.state, gameState.startTime, gameState.gameDuration]);

  const formatTime = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleKill = () => {
    window.dispatchEvent(new Event('action_kill_btn'));
  };

  const handlePanic = () => {
    if (myPlayer && !myPlayer.hasUsedPanic) {
      socket.emit('action_panic', { roomId });
    }
  };

  const isStunned = (localStunUntil > Date.now()) || ((myPlayer?.stunUntil || 0) > Date.now());
  const shieldDuration = gameState.shieldDurationSec !== undefined ? gameState.shieldDurationSec : 3;
  const isShieldActive = (myPlayer?.shieldUntil || 0) > Date.now();
  const shieldActiveSec = Math.ceil(((myPlayer?.shieldUntil || 0) - Date.now()) / 1000);
  const isShieldOnCooldown = (myPlayer?.shieldCooldownUntil || 0) > Date.now();
  const shieldCooldownSec = Math.ceil(((myPlayer?.shieldCooldownUntil || 0) - Date.now()) / 1000);

  const handleShield = () => {
    if (!myPlayer || myPlayer.isDead || isStunned) return;
    if (isShieldActive || isShieldOnCooldown) return;
    if (shieldDuration === 0) return;
    socket.emit('action_shield', { roomId });
  };

  const sonarCharges = myPlayer?.sonarCharges || 0;
  const handleSonar = () => {
    if (!myPlayer || myPlayer.isDead || isStunned) return;
    if (sonarCharges <= 0) return;
    if (Date.now() - lastSonarAtRef.current < 700) return; // Prevent spamming / double-triggers
    lastSonarAtRef.current = Date.now();
    socket.emit('action_sonar', { roomId });
  };

  const invisibilityCharges = myPlayer?.invisibilityCharges || 0;
  const invisibleUntil = myPlayer?.invisibleUntil || 0;
  const isInvisible = invisibleUntil > Date.now();
  const invisRemainingSec = Math.max(0, Math.ceil((invisibleUntil - Date.now()) / 1000));

  const handleInvisibility = () => {
    if (!myPlayer || myPlayer.isDead || isStunned) return;
    if (invisibilityCharges <= 0) return;
    socket.emit('action_invisibility', { roomId });
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.repeat) return; // Prevent auto-repeat when holding down keys
      if (e.code === 'KeyE') {
        handleShield();
      }
      if (e.code === 'KeyF') {
        if (sonarCharges > 0) handleSonar();
        else if (invisibilityCharges > 0) handleInvisibility();
      }
      if (e.code === 'KeyC') {
        handleInvisibility();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [myPlayer, isStunned, isShieldActive, isShieldOnCooldown, shieldDuration, sonarCharges, invisibilityCharges, roomId]);

  const handleTaskComplete = () => {
    if (activeTask) {
      socket.emit('action_task_completed', { roomId, taskId: activeTask.id });
      setActiveTask(null);
    }
  };

  const toggleSound = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  const crownSec = gameState.crownDurationSec || 60;
  const isCrownPeriod = crownSec === 9999 ? (timeLeft > 0) : (timeLeft <= (crownSec * 1000) && timeLeft > 0);

  const gasStartSec = gameState.poisonGasStartSec !== undefined ? gameState.poisonGasStartSec : 60;
  const gasDurationMs = gasStartSec === 9999 ? gameState.gameDuration : (gasStartSec * 1000);
  const isGasActive = gasStartSec > 0 && gameState.state === 'playing' && (gasStartSec === 9999 || timeLeft <= gasDurationMs);

  if (!myPlayer) return null;

  const isVentOnCooldown = (myPlayer.ventCooldownUntil || 0) > Date.now();
  const ventCooldownSec = Math.ceil(((myPlayer.ventCooldownUntil || 0) - Date.now()) / 1000);

  return (
    <div className="absolute inset-0 pointer-events-none z-40 flex flex-col justify-between p-1.5 sm:p-3 font-sans select-none overflow-hidden">
      {/* Top Bar HUD */}
      <div className="flex justify-between items-center w-full gap-1.5">
        <motion.div 
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="bg-slate-900/85 backdrop-blur-md border border-slate-700/80 rounded-full px-3 py-1 shadow-lg pointer-events-auto flex items-center gap-2 text-xs font-black"
        >
          <span className="text-slate-400 text-[10px] uppercase">RANK</span>
          <span className="text-white text-sm font-black">#{myRank}</span>
          <div className="w-px h-3.5 bg-slate-700"></div>
          <span className="text-amber-400 text-sm font-black">{myPlayer.score}<span className="text-[10px] text-amber-500 ml-0.5">pt</span></span>
        </motion.div>

        {/* Compact Countdown Timer Pill */}
        <motion.div 
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.05 }}
          className={`bg-slate-900/85 backdrop-blur-md border ${timeLeft <= 60000 ? 'border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.6)]' : 'border-slate-700/80 text-white'} rounded-full px-3 py-1 shadow-lg flex items-center gap-1.5 pointer-events-auto transition-colors`}
        >
          <span className="text-[10px] font-extrabold opacity-80">{timeLeft <= 60000 ? '👑 LAST' : '⏱️'}</span>
          <span className="text-sm font-black font-mono tracking-wider">{formatTime(timeLeft)}</span>
        </motion.div>

        {/* Right Section */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full bg-slate-900/85 hover:bg-slate-800 text-slate-300 border border-slate-700 shadow-md pointer-events-auto flex items-center justify-center transition-all"
            title="全画面表示 (ブラウザバー非表示)"
          >
            {isFullscreen ? <Minimize size={15} className="text-amber-400" /> : <Maximize size={15} className="text-cyan-400" />}
          </button>

          <button
            onClick={toggleSound}
            className="w-8 h-8 rounded-full bg-slate-900/85 hover:bg-slate-800 text-slate-300 border border-slate-700 shadow-md pointer-events-auto flex items-center justify-center transition-all"
          >
            {isMuted ? <VolumeX size={15} className="text-red-400" /> : <Volume2 size={15} className="text-emerald-400" />}
          </button>

          <div className="absolute top-10 right-2 w-40 sm:w-60 flex flex-col gap-1 pointer-events-none z-30">
            <AnimatePresence>
              {logs.map((log) => (
                <motion.div 
                  key={log.id} 
                  initial={{ x: 50, opacity: 0, scale: 0.9 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 text-slate-200 px-2 py-1 rounded-lg text-[10px] font-bold shadow-lg border-l-4 border-l-cyan-400"
                >
                  {log.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* CROWN BANNER NOTIFICATION */}
      <AnimatePresence>
        {isCrownPeriod && gameState.state === 'playing' && (
          <motion.div 
            key="crown-banner"
            initial={{ scale: 0.5, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="absolute top-10 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 text-slate-950 font-black px-3 py-1 rounded-full shadow-[0_0_25px_rgba(251,191,36,0.9)] border border-white pointer-events-auto text-[10px] sm:text-xs flex items-center gap-1 z-30 max-w-[85vw] text-center"
          >
            <Trophy size={14} className="text-slate-950 animate-bounce flex-shrink-0" />
            <span className="truncate">
              {myRank === 1 
                ? '👑 ラストスパート！あなたが現在1位！黄金の王冠が輝いています！' 
                : `👑 ラストスパート！現在1位 (${sortedPlayers[0]?.name || 'プレイヤー'}) に王冠が出現中！`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* POISON GAS WARNING BANNER */}
      <AnimatePresence>
        {isGasActive && (
          <motion.div 
            key="gas-banner"
            initial={{ scale: 0.7, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-900 via-purple-700 to-indigo-900 text-purple-200 border-2 border-purple-400 font-black px-3.5 py-1 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.9)] text-[10px] sm:text-xs z-30 pointer-events-auto flex items-center gap-1.5 max-w-[90vw] text-center backdrop-blur"
          >
            <span className="animate-pulse">☣️ 警告！毒ガスサークルが縮小中！中央安全ゾーンへ避難せよ！</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Near Task Prompt */}
      {nearTaskStation && !activeTask && gameState.state === 'playing' && (
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.8 }}
          className="absolute top-1/4 left-1/2 -translate-x-1/2 pointer-events-auto z-30"
        >
          <button
            onClick={() => setActiveTask(nearTaskStation)}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-4 py-2 rounded-full shadow-lg active:translate-y-0.5 font-black text-xs border border-white flex items-center gap-1.5 transition-transform"
          >
            <Zap className="text-yellow-300" size={16} />
            {nearTaskStation.label} を実行
          </button>
        </motion.div>
      )}

      {/* Near Vent Prompt Button with 15s Cooldown Indicator */}
      {!activeTask && nearVent && gameState.state === 'playing' && (
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-30"
        >
          {isVentOnCooldown ? (
            <div className="bg-slate-900/90 text-slate-400 px-4 py-2 rounded-full shadow-lg font-black text-xs border border-slate-700 flex items-center gap-1.5 opacity-80 cursor-not-allowed backdrop-blur">
              <Wind className="text-slate-500" size={16} />
              🕳️ ダクト冷却中 ({ventCooldownSec}秒)
            </div>
          ) : (
            <button
              onClick={onUseVent}
              className="bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white px-4 py-2 rounded-full shadow-lg active:translate-y-0.5 font-black text-xs border border-white flex items-center gap-1.5 transition-transform animate-pulse"
            >
              <Wind className="text-cyan-200" size={16} />
              ダクト(Vent)に入る
            </button>
          )}
        </motion.div>
      )}

      {/* Near Crime Scene Investigation Button */}
      {!activeTask && nearCrimeScene && gameState.state === 'playing' && (
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.8 }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-auto z-30"
        >
          <button
            onClick={() => socket.emit('action_investigate', { roomId, crimeSceneId: nearCrimeScene.id })}
            className="bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white px-4 py-2 rounded-full shadow-[0_0_22px_rgba(168,85,247,0.9)] active:translate-y-0.5 font-black text-xs border-2 border-purple-300 flex items-center gap-1.5 transition-transform"
          >
            <Sparkles className="text-yellow-300 animate-spin" size={16} />
            🔍 現場の指紋・足跡を捜査する
          </button>
        </motion.div>
      )}

      {/* Interactive Task Overlay */}
      <AnimatePresence>
        {activeTask && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="pointer-events-auto"
          >
            <TaskMinigame
              taskType={activeTask.type}
              onComplete={handleTaskComplete}
              onCancel={() => setActiveTask(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS / Fullscreen PWA HINT TOAST */}
      <AnimatePresence>
        {showPwaHint && (
          <motion.div 
            key="pwa-hint-toast"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md border-2 border-amber-400 text-amber-200 px-4 py-2 rounded-2xl shadow-2xl text-xs font-bold text-center max-w-[90vw] pointer-events-auto flex flex-col items-center gap-1"
          >
            <span>💡 iOS (iPhone) Safariでは 『共有アイコン ➔ ホーム画面に追加』 をするとブラウザバーが完全に消失して全画面プレイ可能です！</span>
            <button onClick={() => setShowPwaHint(false)} className="text-amber-400 underline text-[10px] font-black">理解しました [✕]</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ACTIVE INVISIBILITY HUD INDICATOR */}
      <AnimatePresence>
        {isInvisible && !myPlayer.isDead && (
          <motion.div 
            key="active-invis-indicator"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-40 bg-purple-950/90 backdrop-blur-md border-2 border-purple-400 text-purple-200 px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.7)] text-xs font-black flex items-center gap-2 pointer-events-none"
          >
            <EyeOff size={16} className="text-purple-300 animate-pulse" />
            <span>🕶️ 光学迷彩・透明中 ({invisRemainingSec}秒)</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2×2 GAMEPAD ACTION CLUSTER (OPTIMIZED FOR LANDSCAPE SMARTPHONES & KEYBOARD) */}
      {!activeTask && (
        <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-50 pointer-events-auto select-none touch-none flex flex-col items-end gap-1.5 sm:gap-2">
          
          {/* Top Pill Bar: Panic Bell Button (Safely placed above twitch zone) */}
          <motion.button
            whileHover={!myPlayer.hasUsedPanic ? { scale: 1.06 } : {}}
            whileTap={!myPlayer.hasUsedPanic ? { scale: 0.94 } : {}}
            onClick={handlePanic}
            onTouchStart={(e) => {
              if (!myPlayer.hasUsedPanic) {
                e.preventDefault();
                handlePanic();
              }
            }}
            disabled={myPlayer.hasUsedPanic}
            className={`h-7 px-2.5 rounded-xl border flex items-center gap-1.5 transition-all text-[10px] font-black shadow-md ${
              myPlayer.hasUsedPanic 
                ? 'bg-slate-800/80 text-slate-500 border-slate-700 cursor-not-allowed opacity-40' 
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white border-amber-300 shadow-[0_2px_10px_rgba(245,158,11,0.5)] active:scale-95'
            }`}
            title={myPlayer.hasUsedPanic ? 'パニックベル使用済み (1ゲーム1回のみ)' : 'パニックベル発動！'}
          >
            <AlertTriangle size={13} className={!myPlayer.hasUsedPanic ? 'animate-bounce' : ''} />
            <span>パニック</span>
            <span className="text-[9px] opacity-75">{myPlayer.hasUsedPanic ? '済' : '1回'}</span>
          </motion.button>

          {/* 2×2 Grid Action Layout */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">

            {/* TOP-LEFT SLOT: ACTIVE ITEM (SONAR / INVISIBILITY) - DEDICATED FIXED SLOT SO OTHER BUTTONS NEVER SHIFT */}
            <div className="w-[84px] h-[48px] sm:w-[96px] sm:h-[52px] flex items-center justify-center">
              <AnimatePresence mode="wait">
                {/* Dual items: if holding BOTH Sonar and Invisibility */}
                {sonarCharges > 0 && invisibilityCharges > 0 && !myPlayer.isDead && (
                  <motion.div 
                    key="dual-item-container" 
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    className="grid grid-cols-2 gap-1 w-full h-full"
                  >
                    <motion.button
                      key="sonar-mini-btn"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      onClick={handleSonar}
                      onTouchStart={(e) => {
                        if (!myPlayer.isDead && !isStunned) {
                          e.preventDefault();
                          handleSonar();
                        }
                      }}
                      disabled={myPlayer.isDead || isStunned}
                      className="w-full h-full rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex flex-col items-center justify-center select-none touch-none shadow-md active:scale-95"
                      title={`ソナー (${sonarCharges}発) [F]`}
                    >
                      <Radar size={13} className="text-emerald-200 animate-spin-slow" />
                      <span className="text-[9px] font-black leading-none mt-0.5">ソナー</span>
                      <span className="text-[7px] text-emerald-200/80">[F]</span>
                    </motion.button>

                    <motion.button
                      key="invis-mini-btn"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      onClick={handleInvisibility}
                      onTouchStart={(e) => {
                        if (!myPlayer.isDead && !isStunned) {
                          e.preventDefault();
                          handleInvisibility();
                        }
                      }}
                      disabled={myPlayer.isDead || isStunned}
                      className="w-full h-full rounded-xl border border-purple-300 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex flex-col items-center justify-center select-none touch-none shadow-md shadow-purple-900/50 active:scale-95"
                      title="光学迷彩・透明化発動！ [C]"
                    >
                      <EyeOff size={13} className="text-purple-200 animate-pulse" />
                      <span className="text-[9px] font-black leading-none mt-0.5">透明化</span>
                      <span className="text-[7px] text-purple-200/80">[C]</span>
                    </motion.button>
                  </motion.div>
                )}

                {/* Only Invisibility */}
                {invisibilityCharges > 0 && sonarCharges <= 0 && !myPlayer.isDead && (
                  <motion.button
                    key="invis-pulse-btn"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                    whileHover={!isStunned ? { scale: 1.06 } : {}}
                    whileTap={!isStunned ? { scale: 0.94 } : {}}
                    onClick={handleInvisibility}
                    onTouchStart={(e) => {
                      if (!myPlayer.isDead && !isStunned) {
                        e.preventDefault();
                        handleInvisibility();
                      }
                    }}
                    disabled={myPlayer.isDead || isStunned}
                    className={`w-full h-full rounded-2xl border-2 flex items-center justify-center gap-1.5 transition-all font-black select-none touch-none ${
                      isStunned 
                        ? 'opacity-40 cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500' 
                        : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-700 hover:from-purple-500 hover:to-indigo-500 text-white border-purple-300 shadow-[0_0_18px_rgba(168,85,247,0.75)] active:scale-95'
                    }`}
                    title="光学迷彩発動！ 透明人間化 (ショートカットキー: C)"
                  >
                    <div className="relative flex items-center justify-center flex-shrink-0">
                      <EyeOff size={17} className="text-purple-200 animate-pulse" />
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-300 rounded-full animate-ping"></span>
                    </div>
                    <div className="flex flex-col items-start leading-none">
                      <span className="text-[11px] font-black">透明化</span>
                      <span className="text-[9px] text-purple-200/80 mt-0.5">[C]</span>
                    </div>
                  </motion.button>
                )}

                {/* Only Sonar */}
                {sonarCharges > 0 && invisibilityCharges <= 0 && !myPlayer.isDead && (
                  <motion.button
                    key="sonar-pulse-btn"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                    whileHover={!isStunned ? { scale: 1.06 } : {}}
                    whileTap={!isStunned ? { scale: 0.94 } : {}}
                    onClick={handleSonar}
                    onTouchStart={(e) => {
                      if (!myPlayer.isDead && !isStunned) {
                        e.preventDefault();
                        handleSonar();
                      }
                    }}
                    disabled={myPlayer.isDead || isStunned}
                    className={`w-full h-full rounded-2xl border-2 flex items-center justify-center gap-1.5 transition-all font-black select-none touch-none ${
                      isStunned 
                        ? 'opacity-40 cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500' 
                        : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white border-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.7)] active:scale-95'
                    }`}
                    title={`生体ソナー発射！ 残り${sonarCharges}発 (ショートカットキー: F)`}
                  >
                    <div className="relative flex items-center justify-center flex-shrink-0">
                      <Radar size={17} className="text-emerald-200 animate-spin-slow" />
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-300 rounded-full animate-ping"></span>
                    </div>
                    <div className="flex flex-col items-start leading-none">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-black">ソナー</span>
                        <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-400/60 px-1 py-0.2 rounded text-[9px] font-black">
                          {sonarCharges}
                        </span>
                      </div>
                      <span className="text-[9px] text-emerald-200/75 mt-0.5">[F]</span>
                    </div>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* TOP-RIGHT SLOT: SHIELD */}
            <div className="w-[84px] h-[48px] sm:w-[96px] sm:h-[52px] flex items-center justify-center">
              {shieldDuration > 0 && (
                <motion.button
                  whileHover={(!isShieldOnCooldown && !isShieldActive && !isStunned && !myPlayer.isDead) ? { scale: 1.06 } : {}}
                  whileTap={(!isShieldOnCooldown && !isShieldActive && !isStunned && !myPlayer.isDead) ? { scale: 0.94 } : {}}
                  onClick={handleShield}
                  onTouchStart={(e) => {
                    if (!isShieldOnCooldown && !isShieldActive && !isStunned && !myPlayer.isDead) {
                      e.preventDefault();
                      handleShield();
                    }
                  }}
                  disabled={isShieldOnCooldown || isShieldActive || isStunned || myPlayer.isDead}
                  className={`w-full h-full rounded-2xl border-2 flex items-center justify-center gap-1.5 transition-all font-black select-none touch-none ${
                    isShieldActive
                      ? 'bg-gradient-to-r from-cyan-500 via-sky-400 to-cyan-500 text-slate-950 border-white shadow-[0_0_22px_rgba(56,189,248,1)] animate-pulse'
                      : isShieldOnCooldown
                        ? 'bg-slate-900/90 text-slate-500 border-slate-700 cursor-not-allowed opacity-60'
                        : isStunned || myPlayer.isDead
                          ? 'opacity-40 cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500'
                          : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white border-cyan-300 shadow-[0_0_16px_rgba(14,165,233,0.7)] active:scale-95'
                  }`}
                  title={isShieldActive ? `無敵中 (${shieldActiveSec}秒)` : isShieldOnCooldown ? `クールタイム中 (${shieldCooldownSec}秒)` : 'シールド展開！ (ショートカットキー: E)'}
                >
                  <Shield size={17} className={isShieldActive ? 'text-slate-950 animate-bounce' : 'text-cyan-200 flex-shrink-0'} />
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-[11px] font-black">
                      {isShieldActive ? `${shieldActiveSec}s` : isShieldOnCooldown ? `${shieldCooldownSec}s` : 'シールド'}
                    </span>
                    <span className="text-[9px] text-cyan-200/75 mt-0.5">[E]</span>
                  </div>
                </motion.button>
              )}
            </div>

            {/* BOTTOM-LEFT SLOT: DASH (Sprint - Tap/Hold) */}
            <div className="w-[84px] h-[58px] sm:w-[96px] sm:h-[62px] flex items-center justify-center">
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onMouseDown={() => window.dispatchEvent(new Event('action_sprint_start'))}
                onMouseUp={() => window.dispatchEvent(new Event('action_sprint_end'))}
                onMouseLeave={() => window.dispatchEvent(new Event('action_sprint_end'))}
                onTouchStart={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(new Event('action_sprint_start'));
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(new Event('action_sprint_end'));
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(new Event('action_sprint_end'));
                }}
                className="w-full h-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl transition-all border-2 border-cyan-300 shadow-[0_0_18px_rgba(6,182,212,0.7)] active:scale-95 flex items-center justify-center gap-1.5 font-black select-none touch-none"
                title="高速移動スプリント (長押し / Shiftキー)"
              >
                <Zap size={20} className="text-yellow-300 animate-pulse flex-shrink-0" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[12px] font-black tracking-wide">ダッシュ</span>
                  <span className="text-[9px] text-cyan-200/80 mt-1">[SHIFT]</span>
                </div>
              </motion.button>
            </div>

            {/* BOTTOM-RIGHT SLOT: KILL (Primary Action, Largest, Right Thumb Anchor) */}
            <div className="w-[84px] h-[58px] sm:w-[96px] sm:h-[62px] flex items-center justify-center">
              {(() => {
                const isStunned = (localStunUntil > Date.now()) || ((myPlayer.stunUntil || 0) > Date.now());
                return (
                  <motion.button
                    whileHover={!isStunned ? { scale: 1.06 } : {}}
                    whileTap={!isStunned ? { scale: 0.94 } : {}}
                    onClick={handleKill}
                    onTouchStart={(e) => {
                      if (!myPlayer.isDead && !isStunned) {
                        e.preventDefault();
                        handleKill();
                      }
                    }}
                    disabled={myPlayer.isDead || isStunned}
                    className={`w-full h-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 ${
                      isStunned 
                        ? 'opacity-40 cursor-not-allowed border-slate-700' 
                        : 'hover:from-red-500 hover:to-rose-500 border-red-300 shadow-[0_0_24px_rgba(225,29,72,0.95)] active:scale-95'
                    } text-white rounded-2xl transition-all border-2 flex items-center justify-center gap-1.5 select-none touch-none`}
                    title="ターゲットを暗殺する (ショートカットキー: Q)"
                  >
                    <div className="relative flex items-center justify-center flex-shrink-0">
                      <Target size={22} className="text-white animate-spin-slow" />
                      <Skull size={13} className="absolute text-yellow-300 animate-pulse" />
                    </div>
                    <div className="flex flex-col items-start leading-none">
                      <span className="text-[14px] font-black tracking-widest drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">KILL</span>
                      <span className="text-[9px] text-red-200/80 mt-1 font-bold">[Q]</span>
                    </div>
                  </motion.button>
                );
              })()}
            </div>

          </div>
        </div>
      )}

      {((localStunUntil > Date.now()) || ((myPlayer.stunUntil || 0) > Date.now())) && (
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600 text-white px-8 py-4 rounded-3xl font-black text-2xl shadow-2xl border-4 border-white pointer-events-auto text-center z-50"
        >
          誤爆ペナルティ！ 3秒間スタン状態
        </motion.div>
      )}

      {myPlayer.isDead && (
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/95 text-red-500 px-8 py-6 rounded-3xl font-black text-3xl shadow-2xl border-4 border-red-600 pointer-events-auto text-center backdrop-blur-md flex flex-col items-center gap-2 z-50"
        >
          <Skull size={48} className="animate-pulse" />
          暗殺されました！4秒後にリスポーンします...
        </motion.div>
      )}

      {/* MATCH RESULT PODIUM OVERLAY WITH FRAMER MOTION */}
      <AnimatePresence>
        {gameOverData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 pointer-events-auto"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="bg-slate-900 border-4 border-slate-700 p-8 rounded-3xl max-w-lg w-full flex flex-col items-center shadow-2xl"
            >
              <Trophy size={64} className="text-yellow-400 mb-2 animate-bounce" />
              <h2 className="text-4xl font-black text-white mb-1 tracking-wider">MATCH RESULT</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">試合終了！栄光の勝者は...</p>

              <div className="w-full flex flex-col gap-3 mb-8 max-h-60 overflow-y-auto pr-1">
                {gameOverData.map((p, idx) => (
                  <motion.div 
                    key={p.id} 
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border-2 ${idx === 0 ? 'bg-gradient-to-r from-yellow-950 via-amber-900 to-yellow-950 border-yellow-500 text-yellow-200 shadow-[0_0_20px_rgba(251,191,36,0.4)]' : 'bg-slate-950 border-slate-800 text-slate-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-black text-lg ${idx === 0 ? 'text-yellow-400' : 'text-slate-500'}`}>#{idx + 1}</span>
                      <div className="w-4 h-4 rounded-full border-2 border-white" style={{ backgroundColor: p.color }} />
                      <span className="font-bold text-sm text-white">{p.name}</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <span>キル: {p.kills}</span>
                      <span>タスク: {p.tasksDone}</span>
                      <span className="font-black text-base text-amber-400">{p.score} pt</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onResetRoom}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-4 px-6 rounded-2xl shadow-[0_6px_0_0_#065f46] active:translate-y-1 transition-all text-xl flex items-center justify-center gap-2"
              >
                <RefreshCw size={24} />
                もう一度遊ぶ
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
