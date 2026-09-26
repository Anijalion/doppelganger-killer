import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Zap, Download, Sliders, Cpu, Radio, ShieldCheck, Sparkles, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { soundManager } from '../utils/audio';

export default function TaskMinigame({ taskType, onComplete, onCancel }) {
  // 1. Cyber Laser Grid State
  const [nodes, setNodes] = useState([
    { id: 0, color: 'from-red-500 to-rose-600', shadow: 'shadow-red-500/50', border: 'border-red-400', label: 'ALPHA', connected: false },
    { id: 1, color: 'from-cyan-500 to-blue-600', shadow: 'shadow-cyan-500/50', border: 'border-cyan-400', label: 'BETA', connected: false },
    { id: 2, color: 'from-amber-400 to-yellow-600', shadow: 'shadow-amber-500/50', border: 'border-amber-400', label: 'GAMMA', connected: false },
    { id: 3, color: 'from-emerald-400 to-teal-600', shadow: 'shadow-emerald-500/50', border: 'border-emerald-400', label: 'DELTA', connected: false },
  ]);
  const [selectedNode, setSelectedNode] = useState(null);

  // 2. Keypad State
  const [targetCode, setTargetCode] = useState('8429');
  const [inputCode, setInputCode] = useState('');

  // 3. Quantum Uplink State
  const [downloadProgress, setDownloadProgress] = useState(0);
  const isDownloadingRef = useRef(false);

  // 4. Plasma Tuner State
  const [sliderVal, setSliderVal] = useState(15);
  const [targetVal, setTargetVal] = useState(78);

  useEffect(() => {
    if (taskType === 'keypad') {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      setTargetCode(code);
    } else if (taskType === 'align') {
      const tgt = Math.floor(40 + Math.random() * 45);
      setTargetVal(tgt);
    }
  }, [taskType]);

  // Quantum Uplink Charge Loop
  useEffect(() => {
    if (taskType !== 'download') return;

    const timer = setInterval(() => {
      if (isDownloadingRef.current) {
        setDownloadProgress(prev => {
          if (prev >= 100) {
            isDownloadingRef.current = false;
            clearInterval(timer);
            soundManager.playTaskComplete();
            setTimeout(() => onComplete(), 180);
            return 100;
          }
          soundManager.playStep();
          return prev + 5;
        });
      }
    }, 50);

    return () => clearInterval(timer);
  }, [taskType, onComplete]);

  // Laser node click
  const handleLeftNodeClick = (index) => {
    if (nodes[index].connected) return;
    soundManager.playStep();
    setSelectedNode(index);
  };

  const handleRightNodeClick = (index) => {
    if (selectedNode !== null && selectedNode === index) {
      const nextNodes = [...nodes];
      nextNodes[index].connected = true;
      setNodes(nextNodes);
      setSelectedNode(null);
      soundManager.playStep();

      if (nextNodes.every(n => n.connected)) {
        setTimeout(() => {
          soundManager.playTaskComplete();
          onComplete();
        }, 220);
      }
    } else {
      setSelectedNode(null);
      soundManager.playStun();
    }
  };

  // Keypad press
  const handleKeypadPress = (num) => {
    if (inputCode.length < 4) {
      soundManager.playStep();
      const next = inputCode + num;
      setInputCode(next);

      if (next.length === 4) {
        if (next === targetCode) {
          setTimeout(() => {
            soundManager.playTaskComplete();
            onComplete();
          }, 200);
        } else {
          soundManager.playStun();
          setTimeout(() => setInputCode(''), 400);
        }
      }
    }
  };

  // Plasma Slider Tune
  const handleSliderChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setSliderVal(val);
    if (Math.abs(val - targetVal) <= 3) {
      soundManager.playTaskComplete();
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none">
      <motion.div 
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="relative w-full max-w-lg bg-slate-900/95 border-4 border-cyan-500/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col items-center backdrop-blur-xl"
      >
        {/* Header Bar */}
        <div className="w-full flex justify-between items-center mb-6 pb-4 border-b-2 border-slate-800">
          <div className="flex items-center gap-2.5">
            <Cpu className="text-cyan-400 animate-pulse" size={26} />
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-wider">
                {taskType === 'wire' && 'レーザー回路マトリクス同期'}
                {taskType === 'keypad' && '暗号セキュリティコード入力'}
                {taskType === 'download' && '量子データバースト転送'}
                {taskType === 'align' && 'プラズマコア周波数同調'}
              </h3>
              <p className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-widest">SYSTEM SYSTEM TASK STATION</p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="text-slate-400 hover:text-white font-bold text-xs bg-slate-800/80 hover:bg-slate-700 px-3.5 py-2 rounded-xl border border-slate-700 transition-all"
          >
            中断 (視界を戻す)
          </button>
        </div>

        {/* Task 1: Laser Node Grid Alignment */}
        {taskType === 'wire' && (
          <div className="w-full bg-slate-950 p-6 rounded-2xl border border-slate-800/80 flex flex-col items-center">
            <div className="w-full flex justify-between items-center gap-12">
              <div className="flex flex-col gap-4">
                {nodes.map((node, idx) => (
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    key={`left-${idx}`}
                    onClick={() => handleLeftNodeClick(idx)}
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${node.color} flex flex-col items-center justify-center border-4 ${selectedNode === idx ? 'border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.8)]' : node.border} ${node.connected ? 'opacity-40 cursor-not-allowed' : ''} shadow-lg transition-all`}
                  >
                    <span className="text-[9px] font-black text-white">{node.label}</span>
                    {node.connected ? <CheckCircle2 className="text-white mt-0.5" size={18} /> : <Zap className="text-white mt-0.5" size={16} />}
                  </motion.button>
                ))}
              </div>

              <div className="flex flex-col items-center justify-center text-center">
                <Activity size={32} className="text-cyan-400 mb-2 animate-pulse" />
                <p className="text-slate-300 font-bold text-xs">同色ノード端子を<br/>直感的に接続！</p>
              </div>

              <div className="flex flex-col gap-4">
                {nodes.map((node, idx) => (
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    key={`right-${idx}`}
                    onClick={() => handleRightNodeClick(idx)}
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${node.color} flex flex-col items-center justify-center border-4 border-slate-800 ${node.connected ? 'opacity-40 cursor-not-allowed' : ''} shadow-lg transition-all`}
                  >
                    <span className="text-[9px] font-black text-white">{node.label}</span>
                    {node.connected ? <CheckCircle2 className="text-white mt-0.5" size={18} /> : <Zap className="text-white mt-0.5" size={16} />}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Task 2: Cyber Keypad Hack */}
        {taskType === 'keypad' && (
          <div className="w-full flex flex-col items-center bg-slate-950 p-6 rounded-2xl border border-slate-800/80">
            <div className="w-full bg-slate-900/90 border-2 border-emerald-500/50 rounded-2xl p-4 mb-6 text-center shadow-inner">
              <p className="text-xs text-emerald-400 font-mono mb-1 flex items-center justify-center gap-1">
                <ShieldCheck size={14} /> CIPHER CODE: <span className="font-black text-white tracking-widest text-base">{targetCode}</span>
              </p>
              <p className="text-4xl font-mono font-black text-emerald-300 tracking-[0.4em] h-12 flex items-center justify-center drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]">
                {inputCode.padEnd(4, '_')}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  key={num}
                  onClick={() => handleKeypadPress(num.toString())}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-black text-2xl py-3.5 rounded-2xl border-b-4 border-slate-950 active:translate-y-1 active:border-b-0 shadow-md transition-all"
                >
                  {num}
                </motion.button>
              ))}
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={() => setInputCode('')} 
                className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold py-3.5 rounded-2xl border-b-4 border-rose-950 text-xs flex items-center justify-center"
              >
                CLEAR
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleKeypadPress('0')} 
                className="bg-slate-800 hover:bg-slate-700 text-white font-black text-2xl py-3.5 rounded-2xl border-b-4 border-slate-950 active:translate-y-1 transition-all"
              >
                0
              </motion.button>
            </div>
          </div>
        )}

        {/* Task 3: Quantum Overload Charge */}
        {taskType === 'download' && (
          <div className="w-full flex flex-col items-center bg-slate-950 p-6 rounded-2xl border border-slate-800/80">
            <Radio size={48} className="text-cyan-400 mb-2 animate-bounce" />
            <p className="text-cyan-300 text-xs font-mono font-bold mb-4 uppercase tracking-widest">QUANTUM DATA TRANSMISSION UPLINK</p>

            <div className="w-full bg-slate-900 h-10 rounded-2xl overflow-hidden mb-6 border-2 border-cyan-500/40 relative flex items-center justify-center p-1 shadow-inner">
              <motion.div 
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400 rounded-xl"
                style={{ width: `${downloadProgress}%` }}
              />
              <span className="relative z-10 font-mono font-black text-white text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {downloadProgress}% CHARGED
              </span>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onMouseDown={() => { isDownloadingRef.current = true; }}
              onMouseUp={() => { isDownloadingRef.current = false; }}
              onMouseLeave={() => { isDownloadingRef.current = false; }}
              onTouchStart={() => { isDownloadingRef.current = true; }}
              onTouchEnd={() => { isDownloadingRef.current = false; }}
              className="w-full bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-black py-4.5 px-6 rounded-2xl shadow-[0_6px_0_0_#1e3a8a,0_0_30px_rgba(6,182,212,0.5)] active:translate-y-1 active:shadow-none transition-all text-xl uppercase tracking-wider select-none cursor-pointer flex items-center justify-center gap-2"
            >
              <Download size={24} />
              長押しで量子データチャージ！
            </motion.button>
          </div>
        )}

        {/* Task 4: Plasma Core Frequency Tuner */}
        {taskType === 'align' && (
          <div className="w-full flex flex-col items-center bg-slate-950 p-6 rounded-2xl border border-slate-800/80">
            <Sliders size={48} className="text-amber-400 mb-2 animate-pulse" />
            <p className="text-slate-200 text-sm font-bold mb-2">周波数スライダーをターゲット帯域に同期してください</p>
            
            <div className="w-full bg-slate-900/90 border border-slate-800 p-3 rounded-xl mb-4 text-center font-mono font-bold text-xs flex justify-around">
              <span className="text-amber-400">TARGET: {targetVal} MHz</span>
              <span className="text-cyan-400">CURRENT: {sliderVal} MHz</span>
            </div>

            <div className="w-full relative py-6 px-2">
              <input
                type="range"
                min="0"
                max="100"
                value={sliderVal}
                onChange={handleSliderChange}
                className="w-full h-5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 shadow-inner"
              />
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-rose-400 font-bold text-center animate-pulse flex items-center justify-center gap-1">
          <Sparkles size={14} /> ⚠️ 注意: タスク実行中は無防備になります！周囲を警戒してください！
        </p>
      </motion.div>
    </div>
  );
}
