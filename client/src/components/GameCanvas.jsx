import { useEffect, useRef, useState } from 'react';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { soundManager } from '../utils/audio';

function lcg(seed) {
  return function() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 2400;
const NUM_NPCS = 80;
const KILL_RADIUS = 145;

const WALLS = [
  { x: 800, y: 0, w: 24, h: 340 },
  { x: 800, y: 460, w: 24, h: 340 },
  { x: 0, y: 800, w: 340, h: 24 },
  { x: 460, y: 800, w: 340, h: 24 },

  { x: 1576, y: 0, w: 24, h: 340 },
  { x: 1576, y: 460, w: 24, h: 340 },
  { x: 1600, y: 800, w: 340, h: 24 },
  { x: 2060, y: 800, w: 340, h: 24 },

  { x: 800, y: 1600, w: 24, h: 340 },
  { x: 800, y: 2060, w: 24, h: 340 },
  { x: 0, y: 1576, w: 340, h: 24 },
  { x: 460, y: 1576, w: 340, h: 24 },

  { x: 1576, y: 1600, w: 24, h: 340 },
  { x: 1576, y: 2060, w: 24, h: 340 },
  { x: 1600, y: 1576, w: 340, h: 24 },
  { x: 2060, y: 1576, w: 340, h: 24 },

  { x: 1050, y: 1050, w: 60, h: 60 },
  { x: 1290, y: 1050, w: 60, h: 60 },
  { x: 1050, y: 1290, w: 60, h: 60 },
  { x: 1290, y: 1290, w: 60, h: 60 },
];

function isInsideWall(x, y, margin = 45) {
  for (const w of WALLS) {
    if (x > w.x - margin && x < w.x + w.w + margin && y > w.y - margin && y < w.y + w.h + margin) {
      return true;
    }
  }
  return false;
}

function getRandomWallSafePosition(randomFn = Math.random) {
  let x, y;
  let attempts = 0;
  do {
    x = randomFn() * (MAP_WIDTH - 400) + 200;
    y = randomFn() * (MAP_HEIGHT - 400) + 200;
    attempts++;
  } while (isInsideWall(x, y, 45) && attempts < 300);
  return { x, y };
}

const ROOM_LABELS = [
  { text: '🧪 バイオ実験室 [BIO-LAB]', x: 400, y: 120, color: '#4ade80' },
  { text: '⚔️ 重武器庫 [ARMORY]', x: 2000, y: 120, color: '#fb923c' },
  { text: '⚡ 中央コマンド [CAFETERIA]', x: 1200, y: 920, color: '#38bdf8' },
  { text: '🔌 高圧電気室 [ELECTRICAL]', x: 400, y: 1720, color: '#facc15' },
  { text: '🛸 主航法室 [NAVIGATION]', x: 2000, y: 1720, color: '#c084fc' },
];

export default function GameCanvas({ gameState, socket, roomId, onNearTaskStation, onNearVent, onNearCrimeScene }) {
  const canvasRef = useRef(null);
  const myId = socket.id;

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const keysRef = useRef({});
  const touchJoystickRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0,
    touchId: null
  });
  const panicExpiryRef = useRef(0);
  const killFlashRef = useRef(0);
  const lastGasDamageRef = useRef(0);
  const killCooldownUntilRef = useRef(0);
  const localStunUntilRef = useRef(0);
  
  const isTouchSprintingRef = useRef(false);
  const staminaRef = useRef(100);
  const isExhaustedRef = useRef(false);
  const dashParticlesRef = useRef([]);

  const crimeScenesRef = useRef([]);
  const footprintTrailsRef = useRef([]);
  const sonarWavesRef = useRef([]);
  const detectedTargetsRef = useRef({ targets: [], until: 0 });

  const bloodDecalsRef = useRef([]);
  const deadBodiesRef = useRef([]); 
  const floatingTextsRef = useRef([]);
  const ambientParticlesRef = useRef([]);

  const floorPatternRef = useRef(null);
  const biolabPatternRef = useRef(null);
  const armoryPatternRef = useRef(null);
  const wallPatternRef = useRef(null);
  const crateImgRef = useRef(null);

  useEffect(() => {
    const handleSprintStart = () => { isTouchSprintingRef.current = true; };
    const handleSprintEnd = () => { isTouchSprintingRef.current = false; };

    window.addEventListener('action_sprint_start', handleSprintStart);
    window.addEventListener('action_sprint_end', handleSprintEnd);
    return () => {
      window.removeEventListener('action_sprint_start', handleSprintStart);
      window.removeEventListener('action_sprint_end', handleSprintEnd);
    };
  }, []);

  useEffect(() => {
    ambientParticlesRef.current = Array.from({ length: 50 }).map(() => ({
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
      r: Math.random() * 2.5 + 1,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      alpha: Math.random() * 0.6 + 0.2
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loadPattern = (url, ref) => {
      const img = new Image();
      img.src = url;
      img.onload = () => { ref.current = ctx.createPattern(img, 'repeat'); };
    };

    loadPattern('/floor.png', floorPatternRef);
    loadPattern('/biolab.png', biolabPatternRef);
    loadPattern('/armory.png', armoryPatternRef);

    const crateImg = new Image();
    crateImg.src = '/crate.png';
    crateImg.onload = () => { crateImgRef.current = crateImg; };
  }, []);

  useSocketEvent('panic_alarm', () => {
    panicExpiryRef.current = Date.now() + 5000;
    soundManager.playPanic();
  });

  useSocketEvent('event_log', (msg) => {
    if (msg.includes('誤爆')) soundManager.playStun();
    if (msg.includes('暗殺')) {
      soundManager.playKill();
      killFlashRef.current = Date.now() + 300; // Flash red on screen!
    }
    if (msg.includes('ペンキ')) soundManager.playCrown();
  });

  useSocketEvent('game_started', () => {
    bloodDecalsRef.current = [];
    deadBodiesRef.current = [];
    floatingTextsRef.current = [];
    sonarWavesRef.current = [];
    detectedTargetsRef.current = { targets: [], until: 0 };
    localStunUntilRef.current = 0;
  });

  useSocketEvent('room_reset', () => {
    bloodDecalsRef.current = [];
    deadBodiesRef.current = [];
    floatingTextsRef.current = [];
    crimeScenesRef.current = [];
    footprintTrailsRef.current = [];
    sonarWavesRef.current = [];
    detectedTargetsRef.current = { targets: [], until: 0 };
    localStunUntilRef.current = 0;
  });

  useSocketEvent('player_vented', (data) => {
    const currentState = gameStateRef.current;
    if (currentState && currentState.players[data.playerId]) {
      currentState.players[data.playerId].x = data.x;
      currentState.players[data.playerId].y = data.y;
      if (data.playerId === myId) {
        soundManager.playVent();
      }
    }
  });

  useSocketEvent('player_killed', (data) => {
    const currentState = gameStateRef.current;
    if (currentState && currentState.players[data.victimId]) {
      const victim = currentState.players[data.victimId];
      bloodDecalsRef.current.push({ x: victim.x, y: victim.y, radius: 32 });
      deadBodiesRef.current.push({
        x: victim.x,
        y: victim.y,
        color: victim.color || '#94a3b8',
        name: victim.name,
        createdAt: Date.now()
      });

      // AUTOMATIC 10-SECOND REAL-TIME FOOTPRINT TRAIL FOR ALL KILLS!
      const killer = currentState.players[data.killerId];
      const killerX = data.killerX || (killer ? killer.x : victim.x + 90);
      const killerY = data.killerY || (killer ? killer.y : victim.y + 90);

      footprintTrailsRef.current.push({
        id: Date.now() + Math.random(),
        killerId: data.killerId,
        crimeX: victim.x,
        crimeY: victim.y,
        killerX,
        killerY,
        until: Date.now() + 10000 // 10 seconds real-time tracking!
      });

      if (data.killerId === myId) {
        floatingTextsRef.current.push({ text: '+1000 PT (PLAYER KILL!)', x: victim.x, y: victim.y - 40, color: '#4ade80', life: 60 });
      }
    }
  });

  useSocketEvent('player_stunned', (data) => {
    const currentState = gameStateRef.current;
    if (currentState && currentState.players[data.playerId]) {
      currentState.players[data.playerId].stunUntil = data.stunUntil;
    }
    if (data.playerId === myId) {
      localStunUntilRef.current = Math.max(localStunUntilRef.current, data.stunUntil);
    }
  });

  useSocketEvent('player_shielded', (data) => {
    const currentState = gameStateRef.current;
    if (currentState && currentState.players[data.playerId]) {
      currentState.players[data.playerId].shieldUntil = data.shieldUntil;
      currentState.players[data.playerId].shieldCooldownUntil = data.shieldCooldownUntil;
    }
    if (data.playerId === myId) {
      soundManager.playShield();
    }
  });

  useSocketEvent('kill_blocked', (data) => {
    soundManager.playShieldBlock();
    floatingTextsRef.current.push({
      text: '🛡️ SHIELD BLOCKED!',
      x: data.x,
      y: data.y - 45,
      color: '#38bdf8',
      life: 80
    });
  });

  useSocketEvent('sonar_item_spawned', (sonarItem) => {
    const currentState = gameStateRef.current;
    if (currentState) {
      currentState.sonarItem = sonarItem;
    }
  });

  useSocketEvent('sonar_ping', (data) => {
    soundManager.playSonarPing();

    sonarWavesRef.current.push({
      x: data.x,
      y: data.y,
      currentRadius: 10,
      maxRadius: 1400,
      alpha: 1.0,
      createdAt: Date.now()
    });

    if (data.emitterId === myId) {
      if (data.targets && data.targets.length > 0) {
        soundManager.playSonarLock();
      }
      detectedTargetsRef.current = {
        targets: data.targets || [],
        until: Date.now() + 2500
      };
      floatingTextsRef.current.push({
        text: `📡 生体スキャン完了: ${data.targets.length}名検知!`,
        x: data.x,
        y: data.y - 45,
        color: '#10b981',
        life: 70
      });
    }
  });

  useSocketEvent('npc_killed', (data) => {
    const now = Date.now();
    const currentState = gameStateRef.current;
    const crimeX = data.x || 1200;
    const crimeY = data.y || 1200;
    bloodDecalsRef.current.push({ x: crimeX, y: crimeY, radius: 28 });
    deadBodiesRef.current.push({
      x: crimeX,
      y: crimeY,
      color: data.isGolden ? '#fbbf24' : '#94a3b8',
      name: 'NPC',
      createdAt: now
    });

    if (data.killerId === myId && !data.isGolden) {
      localStunUntilRef.current = Math.max(localStunUntilRef.current, Date.now() + 3000);
      if (currentState && currentState.players[myId]) {
        currentState.players[myId].stunUntil = localStunUntilRef.current;
      }
    }

    // AUTOMATIC 10-SECOND REAL-TIME FOOTPRINT TRAIL FOR NPC MISTAKES / KILLS!
    const killer = currentState?.players[data.killerId];
    const killerX = data.killerX || (killer ? killer.x : crimeX + 90);
    const killerY = data.killerY || (killer ? killer.y : crimeY + 90);

    footprintTrailsRef.current.push({
      id: Date.now() + Math.random(),
      killerId: data.killerId,
      crimeX,
      crimeY,
      killerX,
      killerY,
      until: Date.now() + 10000 // 10 seconds real-time tracking!
    });

    if (data.killerId === myId) {
      if (data.isGolden) {
        floatingTextsRef.current.push({ text: '+1000 PT (GOLDEN NPC!)', x: crimeX, y: crimeY - 40, color: '#fbbf24', life: 60 });
      } else {
        floatingTextsRef.current.push({ text: '-500 PT (NPC MISTAKE!)', x: crimeX, y: crimeY - 40, color: '#ef4444', life: 60 });
      }
    }
  });

  useEffect(() => {
    const handleKeyDown = (e) => { keysRef.current[e.code] = true; };
    const handleKeyUp = (e) => { keysRef.current[e.code] = false; };

    const handleTouchStart = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth * 0.75 && !touchJoystickRef.current.active) {
          touchJoystickRef.current = {
            active: true,
            startX: t.clientX,
            startY: t.clientY,
            currX: t.clientX,
            currY: t.clientY,
            touchId: t.identifier
          };
        }
      }
    };

    const handleTouchMove = (e) => {
      if (!touchJoystickRef.current.active) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchJoystickRef.current.touchId) {
          touchJoystickRef.current.currX = t.clientX;
          touchJoystickRef.current.currY = t.clientY;
        }
      }
    };

    const handleTouchEnd = (e) => {
      if (!touchJoystickRef.current.active) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchJoystickRef.current.touchId) {
          touchJoystickRef.current.active = false;
          touchJoystickRef.current.touchId = null;
        }
      }
    };

    const handleMouseDown = (e) => {
      if (e.clientX < window.innerWidth * 0.75 && !touchJoystickRef.current.active && e.button === 0) {
        touchJoystickRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          currX: e.clientX,
          currY: e.clientY,
          touchId: 'mouse'
        };
      }
    };

    const handleMouseMove = (e) => {
      if (touchJoystickRef.current.active && touchJoystickRef.current.touchId === 'mouse') {
        touchJoystickRef.current.currX = e.clientX;
        touchJoystickRef.current.currY = e.clientY;
      }
    };

    const handleMouseUp = (e) => {
      if (touchJoystickRef.current.active && touchJoystickRef.current.touchId === 'mouse') {
        touchJoystickRef.current.active = false;
        touchJoystickRef.current.touchId = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);

      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);

      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!floorPatternRef.current) {
      const floorImg = new Image();
      floorImg.src = '/floor.png';
      floorImg.onload = () => {
        floorPatternRef.current = ctx.createPattern(floorImg, 'repeat');
      };
    }

    const prng = lcg((gameState.mapSeed || 0.5) * 1000000);

    const npcs = Array.from({ length: NUM_NPCS }).map((_, i) => {
      const angle = prng() * Math.PI * 2;
      const speed = 3.0;
      const safeP = getRandomWallSafePosition(prng);
      return {
        id: `npc_${i}`,
        x: safeP.x,
        y: safeP.y,
        vx: 0,
        vy: 0,
        targetVx: Math.cos(angle) * speed,
        targetVy: Math.sin(angle) * speed,
        timer: prng() * 150 + 50,
        state: 'walking', // 'walking' | 'idle' | 'task'
        animStep: prng() * 10,
        facingLeft: prng() > 0.5,
        isDead: false,
        isGolden: i === gameState.goldenNpcIndex
      };
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let animationId;
    let cameraX = 0;
    let cameraY = 0;

    const bloodParticles = [];
    const soundRipples = [];

    const createBloodEffect = (x, y) => {
      bloodDecalsRef.current.push({ x, y, radius: 30 });
      for (let i = 0; i < 30; i++) {
        bloodParticles.push({
          x, y,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          life: 50
        });
      }
    };

    const handleKillAttempt = () => {
      const state = gameStateRef.current;
      if (!state || !state.players[myId]) return;

      const me = state.players[myId];
      const isStunned = (localStunUntilRef.current > Date.now()) || ((me?.stunUntil || 0) > Date.now());
      if (me.isDead || isStunned || (killCooldownUntilRef.current || 0) > Date.now()) return;

      let closestTarget = null;
      let minDistance = KILL_RADIUS;

      Object.values(state.players).forEach(p => {
        if (p.id !== myId && !p.isDead) {
          const dist = Math.sqrt((p.x - me.x) ** 2 + (p.y - me.y) ** 2);
          if (dist < minDistance) {
            minDistance = dist;
            closestTarget = { id: p.id, isNpc: false, isGolden: false, x: p.x, y: p.y };
          }
        }
      });

      npcs.forEach(npc => {
        if (!npc.isDead) {
          const dist = Math.sqrt((npc.x - me.x) ** 2 + (npc.y - me.y) ** 2);
          if (dist < minDistance) {
            minDistance = dist;
            closestTarget = { id: npc.id, isNpc: true, isGolden: npc.isGolden, x: npc.x, y: npc.y, npcObj: npc };
          }
        }
      });

      if (closestTarget) {
        killCooldownUntilRef.current = Date.now() + 1500;
        if (closestTarget.isNpc && closestTarget.npcObj) {
          closestTarget.npcObj.isDead = true;
          if (!closestTarget.isGolden) {
            localStunUntilRef.current = Date.now() + 3000;
            me.stunUntil = Date.now() + 3000;
          }
        }

        socket.emit('action_kill', {
          roomId,
          targetId: closestTarget.id,
          isNpc: closestTarget.isNpc,
          isGolden: closestTarget.isGolden,
          x: closestTarget.x,
          y: closestTarget.y
        });
        createBloodEffect(me.x, me.y);
      }
    };

    window.addEventListener('action_kill_btn', handleKillAttempt);
    const keyActions = (e) => {
      if (e.code === 'KeyQ') handleKillAttempt();
    };
    window.addEventListener('keydown', keyActions);

    let leaderId = null;
    let isLastMinute = false;

    // FIX FOR DRIFTING LEGS: Math.sin(animStep) * 6 BOUNDS LEG STEP TO [-6, +6] PIXELS STRICTLY!
    const drawCharacter = (x, y, color, hat, facingLeft, isMoving, animStep, isStealth, crown, isMe, playerName, isTargetLocked, isGhost, isStunned, isShielded) => {
      ctx.save();

      const breathWobble = Math.sin(Date.now() * 0.005) * 1.5;
      ctx.translate(x, y + breathWobble);

      if (facingLeft) ctx.scale(-1, 1);
      if (isGhost) ctx.globalAlpha = 0.45;

      // SHIELD INVINCIBILITY BARRIER AURA & ORBITING PARTICLES
      if (isShielded) {
        ctx.save();
        const pulse = Math.sin(Date.now() * 0.015) * 4;
        const shieldRadius = 38 + pulse;

        // Rotating dashed energy barrier ring
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 16;
        ctx.setLineDash([10, 5]);
        ctx.lineDashOffset = -Date.now() * 0.02;
        ctx.beginPath();
        ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Radial gradient barrier glow
        const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, shieldRadius);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
        grad.addColorStop(0.7, 'rgba(14, 165, 233, 0.28)');
        grad.addColorStop(1, 'rgba(2, 132, 199, 0.65)');
        ctx.fillStyle = grad;
        ctx.fill();

        // 3 orbiting energy sparks
        for (let i = 0; i < 3; i++) {
          const angle = Date.now() * 0.005 + (i * Math.PI * 2 / 3);
          const px = Math.cos(angle) * (shieldRadius - 2);
          const py = Math.sin(angle) * (shieldRadius - 2);
          ctx.fillStyle = '#bae6fd';
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Floating Shield Badge above player head
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(0, -44, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡️', 0, -43);

        ctx.restore();
      }

      if (isTargetLocked) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-42, -2, 10, 4);
        ctx.fillRect(32, -2, 10, 4);
        ctx.fillRect(-2, -42, 4, 10);
        ctx.fillRect(-2, 32, 4, 10);
      }

      if (isMe) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(0, 4, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Shadow under feet
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 22, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // PERFECT LEG STEP MATH: Math.sin(animStep) * 6 ALWAYS STAYS BETWEEN -6 AND +6 PIXELS! NEVER SEPARATES!
      const currentLegStep = isMoving ? (Math.sin(animStep) * 6) : (Math.sin(Date.now() * 0.006) * 4);

      if (!isGhost) {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(-8 + currentLegStep, 16, 6, 0, Math.PI * 2);
        ctx.arc(8 - currentLegStep, 16, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // GOLDEN POWER AURA RING & SPARKLES
      if (color === '#fbbf24') {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, 32 + Math.sin(Date.now() * 0.015) * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Radiating Golden Sparkles
        for (let i = 0; i < 4; i++) {
          const sparkAngle = Date.now() * 0.003 + (i * Math.PI / 2);
          const sparkDist = 38 + Math.sin(Date.now() * 0.01 + i) * 6;
          const sx = Math.cos(sparkAngle) * sparkDist;
          const sy = Math.sin(sparkAngle) * sparkDist;
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Capsule Body
      ctx.fillStyle = isGhost ? '#a5f3fc' : color;
      ctx.beginPath();
      ctx.roundRect(-18, -26, 36, 44, [18, 18, 12, 12]);
      ctx.fill();

      ctx.strokeStyle = isGhost ? '#0284c7' : (color === '#fbbf24' ? '#d97706' : '#1e293b');
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Visor
      ctx.fillStyle = '#67e8f9';
      ctx.beginPath();
      ctx.roundRect(2, -18, 16, 14, 7);
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(6, -14, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // SPINNING STUN STARS IF PLAYER IS STUNNED
      if (isStunned) {
        const stunAge = Date.now() * 0.008;
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
          const starAngle = stunAge + (i * Math.PI * 2 / 3);
          const sx = Math.cos(starAngle) * 22;
          const sy = Math.sin(starAngle) * 8 - 32;
          ctx.fillText('💫', sx, sy);
        }
      }

      // EPIC CROWN RENDERING FOR 1ST PLACE (VISIBLE TO EVERYONE INCLUDING THE PLAYER THEMSELVES)
      if (crown) {
        // Glowing Aura Behind Crown
        ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.beginPath();
        ctx.arc(0, -42, 22 + Math.sin(Date.now() * 0.01) * 3, 0, Math.PI * 2);
        ctx.fill();

        // Crown Main Shape
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-16, -34);
        ctx.lineTo(-8, -48);
        ctx.lineTo(0, -39);
        ctx.lineTo(8, -48);
        ctx.lineTo(16, -34);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Crown Jewels
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -36, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(-8, -44, 2, 0, Math.PI * 2);
        ctx.arc(8, -44, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (isMe && playerName) {
        ctx.save();
        ctx.translate(x, y + breathWobble);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(-45, -52, 90, 20);
        ctx.strokeStyle = crown ? '#fbbf24' : '#38bdf8';
        ctx.lineWidth = crown ? 2 : 1.5;
        ctx.strokeRect(-45, -52, 90, 20);

        ctx.fillStyle = crown ? '#fbbf24' : '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(crown ? `👑 ${playerName}` : playerName, 0, -38);

        // Stamina Bar
        const stamina = staminaRef.current;
        const isExhausted = isExhaustedRef.current;
        if (stamina < 100 || isExhausted) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(-35, -30, 70, 5);
          ctx.fillStyle = isExhausted ? '#ef4444' : (stamina > 20 ? '#06b6d4' : '#f59e0b');
          ctx.fillRect(-35, -30, (stamina / 100) * 70, 5);
          ctx.strokeStyle = isExhausted ? '#ef4444' : '#38bdf8';
          ctx.lineWidth = 1;
          ctx.strokeRect(-35, -30, 70, 5);

          if (isExhausted) {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'black 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('スタミナ切れ!', 0, -20);
          }
        }

        ctx.restore();
      }
    };

    const drawDeadBody = (b) => {
      const age = Date.now() - b.createdAt;
      if (age > 15000) return;

      ctx.save();
      ctx.translate(b.x, b.y);

      if (age > 12000) {
        ctx.globalAlpha = (15000 - age) / 3000;
      }

      ctx.fillStyle = 'rgba(185, 28, 28, 0.8)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 26, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = b.color || '#94a3b8';
      ctx.beginPath();
      ctx.roundRect(-22, -12, 44, 24, 12);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(10, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-18, -4, 12, 8);

      ctx.restore();
    };

    const render = () => {
      const state = gameStateRef.current;
      if (!state) return;

      const me = state.players[myId];
      const completedTasks = me?.completedTasks || [];
      const timeElapsed = state.startTime ? (Date.now() - state.startTime) : 0;
      const timeRemaining = state.gameDuration - timeElapsed;
      const crownSec = state.crownDurationSec || 60;
      isLastMinute = crownSec === 9999 ? (timeRemaining > 0) : (timeRemaining <= (crownSec * 1000) && timeRemaining > 0);
      const isPanic = Date.now() < panicExpiryRef.current;
      const panicSpeedMultiplier = isPanic ? 2.8 : 1.0;

      // Toxic Gas Shrink Calculation
      const gasStartSec = state.poisonGasStartSec !== undefined ? state.poisonGasStartSec : 60;
      let isGasActive = false;
      let safeRadius = 1600;

      if (gasStartSec > 0 && state.state === 'playing') {
        const gasDurationMs = gasStartSec === 9999 ? state.gameDuration : (gasStartSec * 1000);
        if (gasStartSec === 9999 || timeRemaining <= gasDurationMs) {
          isGasActive = true;
          const gasTimeElapsed = gasStartSec === 9999 ? timeElapsed : (gasDurationMs - timeRemaining);
          const shrinkProgress = Math.min(1.0, Math.max(0.0, gasTimeElapsed / gasDurationMs));
          // Shrinks from 1600px radius down to 380px radius around center (1200, 1200)
          safeRadius = 1600 - shrinkProgress * (1600 - 380);
        }
      }

      if (isLastMinute && Object.keys(state.players).length > 0) {
        const sorted = Object.values(state.players).sort((a, b) => b.score - a.score);
        leaderId = sorted[0].id;
      }

      // Move Player - FASTER RESPONSIVE SPEED (3.0 BASE, 5.2 SPRINT)
      let isMeMoving = false;
      const isMeStunned = (localStunUntilRef.current > Date.now()) || ((me?.stunUntil || 0) > Date.now());
      if (me && !me.isDead && !isMeStunned) {
        if (isInsideWall(me.x, me.y, 20)) {
          const safeP = getRandomWallSafePosition();
          me.x = safeP.x;
          me.y = safeP.y;
        }

        const keys = keysRef.current;
        let dx = 0; let dy = 0;

        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        if (touchJoystickRef.current.active) {
          const joy = touchJoystickRef.current;
          const jdx = joy.currX - joy.startX;
          const jdy = joy.currY - joy.startY;
          const jdist = Math.hypot(jdx, jdy);
          if (jdist > 8) { // Deadzone threshold
            dx = jdx / jdist;
            dy = jdy / jdist;
          }
        }

        const isSprintRequested = keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyE'] || keys['Space'] || isTouchSprintingRef.current;

        if (staminaRef.current <= 0) {
          isExhaustedRef.current = true;
        } else if (isExhaustedRef.current && staminaRef.current >= 30) {
          isExhaustedRef.current = false;
        }

        const canSprint = isSprintRequested && !isExhaustedRef.current && staminaRef.current > 0;
        const isSprintingNow = canSprint && (dx !== 0 || dy !== 0);

        const baseSpeed = 3.0; // matching NPCs
        const speed = isSprintingNow ? 5.2 : baseSpeed;

        if (isSprintingNow) {
          staminaRef.current = Math.max(0, staminaRef.current - 0.7);
          if (staminaRef.current <= 0) {
            isExhaustedRef.current = true;
          }
          const len = Math.sqrt(dx * dx + dy * dy);
          if (Math.random() < 0.6) {
            dashParticlesRef.current.push({
              x: me.x - (dx / len) * 15 + (Math.random() - 0.5) * 12,
              y: me.y - (dy / len) * 15 + (Math.random() - 0.5) * 12,
              vx: -(dx / len) * 1.5,
              vy: -(dy / len) * 1.5,
              radius: Math.random() * 6 + 4,
              alpha: 0.8,
              color: me.color || '#38bdf8'
            });
          }
        } else {
          staminaRef.current = Math.min(100, staminaRef.current + 0.35);
        }

        if (dx !== 0 || dy !== 0) {
          isMeMoving = true;
          const len = Math.sqrt(dx * dx + dy * dy);
          const nextX = me.x + (dx / len) * speed;
          const nextY = me.y + (dy / len) * speed;

          let collide = false;
          WALLS.forEach(w => {
            if (nextX > w.x - 25 && nextX < w.x + w.w + 25 && nextY > w.y - 25 && nextY < w.y + w.h + 25) {
              collide = true;
            }
          });

          if (!collide) {
            me.x = Math.max(50, Math.min(MAP_WIDTH - 50, nextX));
            me.y = Math.max(50, Math.min(MAP_HEIGHT - 50, nextY));
          }

          me.facingLeft = dx < 0;
          me.animStep = (me.animStep || 0) + (isSprintingNow ? 0.45 : 0.25);

          const stepChance = isSprintingNow ? 0.25 : 0.08;
          if (Math.random() < stepChance) {
            soundRipples.push({ x: me.x, y: me.y, r: isSprintingNow ? 15 : 8, alpha: isSprintingNow ? 0.9 : 0.6 });
            soundManager.playStep();
          }

          socket.emit('sync_state', { roomId, x: me.x, y: me.y, isDead: me.isDead });
        }

        const vents = state.vents || [];
        const nearVent = vents.find(v => Math.sqrt((v.x - me.x) ** 2 + (v.y - me.y) ** 2) < 75);
        if (onNearVent) onNearVent(nearVent);

        const stations = state.taskStations || [];
        const nearStation = stations.find(s => {
          const dist = Math.sqrt((s.x - me.x) ** 2 + (s.y - me.y) ** 2);
          return dist < 85 && !completedTasks.includes(s.id);
        });
        if (onNearTaskStation) onNearTaskStation(nearStation);

        const nearCrime = crimeScenesRef.current.find(c => {
          const dist = Math.sqrt((c.x - me.x) ** 2 + (c.y - me.y) ** 2);
          return dist < 110 && (Date.now() - c.createdAt) < 30000;
        });
        if (onNearCrimeScene) onNearCrimeScene(nearCrime);

        if (state.goldenPaint && state.goldenPaint.active) {
          const distPaint = Math.sqrt((state.goldenPaint.x - me.x) ** 2 + (state.goldenPaint.y - me.y) ** 2);
          if (distPaint < 55) {
            state.goldenPaint.active = false; // Instant removal on contact!
            socket.emit('action_pickup_paint', { roomId });
          }
        }

        if (state.sonarItem && state.sonarItem.active && !me.isDead) {
          const distSonar = Math.hypot(state.sonarItem.x - me.x, state.sonarItem.y - me.y);
          if (distSonar < 55) {
            state.sonarItem.active = false; // Instant removal on contact!
            soundManager.playSonarPickup();
            socket.emit('action_pickup_sonar', { roomId });
            floatingTextsRef.current.push({
              text: '📡 生体ソナー端末獲得！ [3発装填]',
              x: me.x,
              y: me.y - 45,
              color: '#34d399',
              life: 80
            });
          }
        }

        // Toxic Gas Damage Check
        if (isGasActive && !me.isDead) {
          const distToCenter = Math.hypot(me.x - 1200, me.y - 1200);
          if (distToCenter > safeRadius) {
            if (!lastGasDamageRef.current || (Date.now() - lastGasDamageRef.current) > 1000) {
              lastGasDamageRef.current = Date.now();
              const dmg = state.scoreSettings?.gasDamage ?? 50;
              me.score = Math.max(0, me.score - dmg);
              soundManager.playStun();
              floatingTextsRef.current.push({
                text: `☣️ -${dmg} PT (TOXIC GAS!)`,
                x: me.x,
                y: me.y - 45,
                color: '#c084fc',
                life: 50
              });
            }
          }
        }
      }

      const scaleX = canvas.width / 1450;
      const scaleY = canvas.height / 750;
      const viewScale = Math.min(1.0, Math.max(0.40, Math.min(scaleX, scaleY)));

      if (me) {
        const worldViewW = canvas.width / viewScale;
        const worldViewH = canvas.height / viewScale;
        cameraX = me.x - worldViewW / 2;
        cameraY = me.y - worldViewH / 2;
      }

      ctx.fillStyle = isPanic ? '#451a1a' : '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(viewScale, viewScale);
      ctx.translate(-cameraX, -cameraY);

      // Floor Patterns
      if (floorPatternRef.current) {
        ctx.fillStyle = floorPatternRef.current;
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      }

      if (biolabPatternRef.current) {
        ctx.fillStyle = biolabPatternRef.current;
        ctx.fillRect(0, 0, 800, 800);
      }

      if (armoryPatternRef.current) {
        ctx.fillStyle = armoryPatternRef.current;
        ctx.fillRect(1600, 0, 800, 800);
      }

      // Room Labels
      ROOM_LABELS.forEach(lbl => {
        ctx.fillStyle = lbl.color || '#ffffff';
        ctx.font = 'black 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lbl.text, lbl.x, lbl.y);
      });

      // Vents
      (state.vents || []).forEach(v => {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(v.x - 25, v.y - 25, 50, 50);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.strokeRect(v.x - 25, v.y - 25, 50, 50);

        ctx.fillStyle = '#06b6d4';
        for (let i = -15; i <= 15; i += 7) {
          ctx.fillRect(v.x + i, v.y - 18, 3, 36);
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VENT', v.x, v.y + 38);
      });

      // Blood Decals
      bloodDecalsRef.current.forEach(decal => {
        ctx.fillStyle = 'rgba(153, 27, 27, 0.7)';
        ctx.beginPath();
        ctx.arc(decal.x, decal.y, decal.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Dead Bodies (15s lifetime)
      deadBodiesRef.current = deadBodiesRef.current.filter(b => (Date.now() - b.createdAt) <= 15000);
      deadBodiesRef.current.forEach(b => drawDeadBody(b));

      // Walls (Using wallPatternRef if available)
      if (wallPatternRef.current) {
        ctx.fillStyle = wallPatternRef.current;
      } else {
        ctx.fillStyle = '#1e293b';
      }
      WALLS.forEach(w => {
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 4;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      });

      // Outer Boundary
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

      // Task Stations
      (state.taskStations || []).forEach(st => {
        const isDone = completedTasks.includes(st.id);

        ctx.fillStyle = isDone ? '#065f46' : '#0284c7';
        ctx.fillRect(st.x - 32, st.y - 32, 64, 64);
        ctx.strokeStyle = isDone ? '#34d399' : '#38bdf8';
        ctx.lineWidth = 4;
        ctx.strokeRect(st.x - 32, st.y - 32, 64, 64);

        ctx.fillStyle = isDone ? '#34d399' : '#38bdf8';
        ctx.fillRect(st.x - 22, st.y - 22, 44, 26);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isDone ? '✓ 完了済み' : st.label, st.x, st.y + 48);
      });

      // Golden Paint
      if (state.goldenPaint && state.goldenPaint.active) {
        const gp = state.goldenPaint;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(gp.x, gp.y, 22 + Math.sin(Date.now() * 0.01) * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#78350f';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GOLD PAINT', gp.x, gp.y + 34);
      }

      // Biometric Sonar Item Terminal
      if (state.sonarItem && state.sonarItem.active) {
        const item = state.sonarItem;
        ctx.save();
        const pulse = Math.sin(Date.now() * 0.008) * 4;
        const beaconRadius = 22 + pulse;

        // Outer glow ripple
        const rippleR = 26 + ((Date.now() * 0.03) % 20);
        const rippleAlpha = Math.max(0, 1 - ((rippleR - 26) / 20));
        ctx.strokeStyle = `rgba(52, 211, 153, ${rippleAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(item.x, item.y, rippleR, 0, Math.PI * 2);
        ctx.stroke();

        // Terminal Base Circle
        const grad = ctx.createRadialGradient(item.x, item.y, 4, item.x, item.y, beaconRadius);
        grad.addColorStop(0, '#6ee7b7');
        grad.addColorStop(0.6, '#059669');
        grad.addColorStop(1, '#064e3b');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(item.x, item.y, beaconRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#a7f3d0';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Rotating radar scan line inside beacon
        const scanAngle = Date.now() * 0.004;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.lineTo(item.x + Math.cos(scanAngle) * beaconRadius, item.y + Math.sin(scanAngle) * beaconRadius);
        ctx.stroke();

        // Icon / Emoji inside beacon
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📡', item.x, item.y);

        // Terminal Label Badge
        ctx.fillStyle = '#064e3b';
        ctx.fillRect(item.x - 48, item.y + 26, 96, 18);
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(item.x - 48, item.y + 26, 96, 18);

        ctx.fillStyle = '#6ee7b7';
        ctx.font = 'black 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('生体ソナー端末', item.x, item.y + 35);

        ctx.restore();
      }

      // Toxic Gas Safe Zone Ring & Outer Boundary Fog Overlay (Rendered ON TOP of all room floors so it is 100% visible everywhere!)
      if (isGasActive) {
        ctx.save();
        const pulseGas = Math.sin(Date.now() * 0.008) * 6;
        const currentRadius = Math.max(100, safeRadius + pulseGas);

        // Toxic Gas Fog Overlay for areas outside safe circle
        ctx.beginPath();
        ctx.rect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        ctx.arc(1200, 1200, currentRadius, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(88, 28, 135, 0.45)';
        ctx.fill('evenodd');

        // Pulsing Safe Zone Inner Ring
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 6;
        ctx.setLineDash([12, 12]);
        ctx.beginPath();
        ctx.arc(1200, 1200, currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Glowing Outer Border Ring
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
        ctx.lineWidth = 16;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(1200, 1200, currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Label text at top of safe zone boundary
        ctx.fillStyle = '#e9d5ff';
        ctx.font = 'black 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('☣️ 毒ガス安全エリア境界 [SAFE ZONE]', 1200, 1200 - currentRadius - 14);
        ctx.restore();
      }

      // Sound Ripples
      for (let i = soundRipples.length - 1; i >= 0; i--) {
        const rip = soundRipples[i];
        rip.r += 2.0;
        rip.alpha -= 0.025;
        ctx.strokeStyle = `rgba(148, 163, 184, ${rip.alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
        ctx.stroke();
        if (rip.alpha <= 0) soundRipples.splice(i, 1);
      }

      // Dash Particles (Speed Trails)
      for (let i = dashParticlesRef.current.length - 1; i >= 0; i--) {
        const p = dashParticlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.04;
        p.radius = Math.max(0.5, p.radius - 0.2);

        if (p.alpha <= 0) {
          dashParticlesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Sonar Shockwave Radar Pulse Animation (High-Performance Zero-Blur Multi-Layer Neon)
      for (let i = sonarWavesRef.current.length - 1; i >= 0; i--) {
        const wave = sonarWavesRef.current[i];
        wave.currentRadius += 28;
        wave.alpha = Math.max(0, 1.0 - (wave.currentRadius / wave.maxRadius));

        if (wave.currentRadius >= wave.maxRadius || wave.alpha <= 0) {
          sonarWavesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = wave.alpha;

        // Pass 1: Outer soft glow halo (wide stroke, low alpha - 100% GPU accelerated, 0ms CPU blur)
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.22)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Pass 2: Sharp vibrant core ring
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Pass 3: Inner dashed auxiliary sweep ring
        if (wave.currentRadius > 70) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.arc(wave.x, wave.y, wave.currentRadius - 40, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      }

      // Footprint Investigation Trails (👣) - REAL-TIME LIVE 10-SECOND TRACKING!
      for (let i = footprintTrailsRef.current.length - 1; i >= 0; i--) {
        const trail = footprintTrailsRef.current[i];
        if (Date.now() > trail.until) {
          footprintTrailsRef.current.splice(i, 1);
          continue;
        }

        // Fetch live moving killer coordinates in real time!
        const killerPlayer = state.players[trail.killerId];
        const currentKillerX = killerPlayer ? killerPlayer.x : trail.killerX;
        const currentKillerY = killerPlayer ? killerPlayer.y : trail.killerY;

        const dx = currentKillerX - trail.crimeX;
        const dy = currentKillerY - trail.crimeY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(5, Math.min(24, Math.floor(dist / 40)));

        ctx.save();
        const pulse = Math.sin(Date.now() * 0.012) * 0.25 + 0.75;
        ctx.globalAlpha = pulse;

        // Draw connecting cyan trail line to moving player!
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(trail.crimeX, trail.crimeY);
        ctx.lineTo(currentKillerX, currentKillerY);
        ctx.stroke();

        // Draw glowing Footprints 👣 along path from crime scene to moving killer!
        for (let s = 1; s <= steps; s++) {
          const ratio = s / steps;
          const fx = trail.crimeX + dx * ratio;
          const fy = trail.crimeY + dy * ratio;

          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(fx, fy, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('👣', fx, fy + 4);
        }

        // Draw Directional Target Banner at Moving Killer Location
        const remainingSec = Math.ceil((trail.until - Date.now()) / 1000);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'black 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🔍 逃走中の犯人 (${remainingSec}s)`, currentKillerX, currentKillerY - 35);
        ctx.restore();
      }

      // Target Lock-On ID
      let lockedTargetId = null;
      if (me && !me.isDead) {
        let minDist = KILL_RADIUS;
        Object.values(state.players).forEach(p => {
          if (p.id !== myId && !p.isDead) {
            const dist = Math.sqrt((p.x - me.x) ** 2 + (p.y - me.y) ** 2);
            if (dist < minDist) {
              minDist = dist;
              lockedTargetId = p.id;
            }
          }
        });
        npcs.forEach(npc => {
          if (!npc.isDead) {
            const dist = Math.sqrt((npc.x - me.x) ** 2 + (npc.y - me.y) ** 2);
            if (dist < minDist) {
              minDist = dist;
              lockedTargetId = npc.id;
            }
          }
        });
      }

      // Update & Draw Alive NPCs
      npcs.forEach(npc => {
        if (npc.isDead) return;

        if (isInsideWall(npc.x, npc.y, 20)) {
          const safeN = getRandomWallSafePosition(prng);
          npc.x = safeN.x;
          npc.y = safeN.y;
        }

        let isNpcMoving = false;
        npc.timer -= 1;

        if (npc.timer <= 0) {
          const roll = prng();
          if (!isPanic && roll < 0.15 && state.taskStations && state.taskStations.length > 0) {
            // 15% chance: Walk toward a random Task Station and stand in front of it
            const station = state.taskStations[Math.floor(prng() * state.taskStations.length)];
            const dx = station.x - npc.x;
            const dy = station.y - npc.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = 3.0 * panicSpeedMultiplier;
            npc.targetVx = (dx / len) * speed;
            npc.targetVy = (dy / len) * speed;
            npc.state = 'task';
            npc.timer = Math.min(200, Math.max(80, Math.floor(len / speed)));
          } else if (roll < 0.40) {
            // 25% chance: Stand still (Pause & turn) for 1 to 3 seconds
            npc.targetVx = 0;
            npc.targetVy = 0;
            npc.state = 'idle';
            npc.timer = prng() * 120 + 60;
          } else {
            // 60% chance: Walk in a new random direction at 3.0 px/frame
            const angle = prng() * Math.PI * 2;
            const speed = 3.0 * panicSpeedMultiplier;
            npc.targetVx = Math.cos(angle) * speed;
            npc.targetVy = Math.sin(angle) * speed;
            npc.state = 'walking';
            npc.timer = prng() * 200 + 80;
          }
        }

        npc.vx += (npc.targetVx - npc.vx) * 0.1;
        npc.vy += (npc.targetVy - npc.vy) * 0.1;

        if (Math.abs(npc.vx) > 0.15 || Math.abs(npc.vy) > 0.15) {
          isNpcMoving = true;
        }

        const nextNpcX = npc.x + npc.vx;
        const nextNpcY = npc.y + npc.vy;

        let collide = false;
        WALLS.forEach(w => {
          if (nextNpcX > w.x - 25 && nextNpcX < w.x + w.w + 25 && nextNpcY > w.y - 25 && nextNpcY < w.y + w.h + 25) {
            collide = true;
          }
        });

        if (collide) {
          npc.targetVx *= -1;
          npc.targetVy *= -1;
        } else {
          npc.x = Math.max(50, Math.min(MAP_WIDTH - 50, nextNpcX));
          npc.y = Math.max(50, Math.min(MAP_HEIGHT - 50, nextNpcY));
        }

        if (Math.abs(npc.vx) > 0.2) {
          npc.facingLeft = npc.vx < 0;
        }

        if (isNpcMoving) {
          npc.animStep += 0.25;
        }

        const npcColor = npc.isGolden ? '#fbbf24' : '#94a3b8';
        const isLocked = lockedTargetId === npc.id;

        drawCharacter(npc.x, npc.y, npcColor, 'none', npc.facingLeft, isNpcMoving, npc.animStep, false, false, false, '', isLocked, false, false, false);
      });

      // Draw Players (Including Ghosts)
      Object.values(state.players).forEach(p => {
        if (p.isDead && !p.isGhost) return;

        const isMe = p.id === myId;
        const color = (p.isGoldenPaint) ? '#fbbf24' : (isMe ? (p.color || '#f87171') : '#94a3b8');
        // SHOW CROWN FOR EVERYONE INCLUDING THE #1 PLAYER THEMSELVES WHEN IN LAST MINUTE
        const showCrown = isLastMinute && p.id === leaderId;
        const isLocked = lockedTargetId === p.id;
        const isP = isMe ? isMeMoving : true;
        const isStunned = isMe ? ((localStunUntilRef.current > Date.now()) || ((p.stunUntil || 0) > Date.now())) : ((p.stunUntil || 0) > Date.now());
        const isShielded = (p.shieldUntil || 0) > Date.now();

        drawCharacter(
          p.x, p.y, color, p.hat,
          p.facingLeft || false,
          isP,
          p.animStep || 0,
          false,
          showCrown,
          isMe,
          p.name,
          isLocked,
          p.isGhost,
          isStunned,
          isShielded
        );
      });

      // Biometric Sonar Reticles / Target Locks (2.5s detection on living opponents)
      if (detectedTargetsRef.current && Date.now() < detectedTargetsRef.current.until) {
        const remainingMs = detectedTargetsRef.current.until - Date.now();
        const remainingSec = (remainingMs / 1000).toFixed(1);
        const pulse = Math.sin(Date.now() * 0.02) * 4;

        (detectedTargetsRef.current.targets || []).forEach(targetInfo => {
          const targetPlayer = state.players[targetInfo.id];
          if (!targetPlayer || targetPlayer.isDead) return;

          const tx = targetPlayer.x;
          const ty = targetPlayer.y;
          const isShielded = targetInfo.isShielded || ((targetPlayer.shieldUntil || 0) > Date.now());

          ctx.save();
          if (isShielded) {
            // SHIELD JAMMED COUNTERPLAY VISUAL (High performance, no shadowBlur)
            ctx.strokeStyle = 'rgba(251, 146, 60, 0.3)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(tx, ty, 34 + pulse, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = '#fdba74';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(tx, ty, 34 + pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Jammed Badge
            ctx.fillStyle = '#7c2d12';
            ctx.fillRect(tx - 46, ty - 68, 92, 20);
            ctx.strokeStyle = '#fb923c';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tx - 46, ty - 68, 92, 20);

            ctx.fillStyle = '#fdba74';
            ctx.font = 'black 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚡ JAMMED!', tx, ty - 58);
          } else {
            // BIOMETRIC LOCK RETICLE ON REAL PLAYER (High Performance Zero-Blur)
            const boxSize = 36 + pulse;
            const bLen = 10;

            // Define all 4 corner brackets in a single path
            ctx.beginPath();
            // Top-Left
            ctx.moveTo(tx - boxSize, ty - boxSize + bLen);
            ctx.lineTo(tx - boxSize, ty - boxSize);
            ctx.lineTo(tx - boxSize + bLen, ty - boxSize);
            // Top-Right
            ctx.moveTo(tx + boxSize - bLen, ty - boxSize);
            ctx.lineTo(tx + boxSize, ty - boxSize);
            ctx.lineTo(tx + boxSize, ty - boxSize + bLen);
            // Bottom-Left
            ctx.moveTo(tx - boxSize, ty + boxSize - bLen);
            ctx.lineTo(tx - boxSize, ty + boxSize);
            ctx.lineTo(tx - boxSize + bLen, ty + boxSize);
            // Bottom-Right
            ctx.moveTo(tx + boxSize - bLen, ty + boxSize);
            ctx.lineTo(tx + boxSize, ty + boxSize);
            ctx.lineTo(tx + boxSize, ty + boxSize - bLen);

            // Pass 1: Outer soft glow halo
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
            ctx.lineWidth = 7;
            ctx.stroke();

            // Pass 2: Crisp neon core
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Inner pulsing lock circle
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(tx, ty, boxSize * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Lock-on Crosshairs in a single path
            ctx.strokeStyle = 'rgba(110, 231, 183, 0.85)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(tx, ty - boxSize - 6);
            ctx.lineTo(tx, ty - boxSize + 2);
            ctx.moveTo(tx, ty + boxSize - 2);
            ctx.lineTo(tx, ty + boxSize + 6);
            ctx.moveTo(tx - boxSize - 6, ty);
            ctx.lineTo(tx - boxSize + 2, ty);
            ctx.moveTo(tx + boxSize - 2, ty);
            ctx.lineTo(tx + boxSize + 6, ty);
            ctx.stroke();

            // Prominent "生体検知 (PLAYER)" Lock-on Banner above character
            const badgeW = 124;
            const badgeH = 22;
            const badgeY = ty - 68;

            ctx.fillStyle = 'rgba(6, 78, 59, 0.92)';
            ctx.fillRect(tx - badgeW / 2, badgeY, badgeW, badgeH);
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 1.8;
            ctx.strokeRect(tx - badgeW / 2, badgeY, badgeW, badgeH);

            ctx.fillStyle = '#a7f3d0';
            ctx.font = 'black 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`📡 プレイヤー [${remainingSec}s]`, tx, badgeY + badgeH / 2);
          }
          ctx.restore();
        });
      }

      // Blood Particles
      for (let i = bloodParticles.length - 1; i >= 0; i--) {
        const bp = bloodParticles[i];
        bp.x += bp.vx; bp.y += bp.vy; bp.life--;
        ctx.fillStyle = `rgba(220,38,38,${bp.life / 50})`;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, bp.life / 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (bp.life <= 0) bloodParticles.splice(i, 1);
      }

      // Ambient Air Dust Particles
      ambientParticlesRef.current.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = MAP_WIDTH;
        if (p.x > MAP_WIDTH) p.x = 0;
        if (p.y < 0) p.y = MAP_HEIGHT;
        if (p.y > MAP_HEIGHT) p.y = 0;

        ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Floating Score Texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y -= 0.8;
        ft.life--;
        ctx.fillStyle = ft.color;
        ctx.font = 'black 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        if (ft.life <= 0) floatingTextsRef.current.splice(i, 1);
      }

      ctx.restore();

      // Red Kill Flash Screen Overlay
      if (Date.now() < killFlashRef.current) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Fog of War
      if (me) {
        const grad = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, 280 * viewScale,
          canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75
        );
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(3, 7, 18, 0.82)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // COLOPL PUNI-CON (ぷにコン) DYNAMIC TOUCH JOYSTICK GRAPHICS
      if (touchJoystickRef.current.active) {
        const joy = touchJoystickRef.current;
        const startX = joy.startX;
        const startY = joy.startY;
        const currX = joy.currX;
        const currY = joy.currY;
        const jdx = currX - startX;
        const jdy = currY - startY;
        const dist = Math.hypot(jdx, jdy);
        const maxR = 55;
        const angle = Math.atan2(jdy, jdx);
        const knobR = Math.min(dist, maxR);
        const knobX = startX + Math.cos(angle) * knobR;
        const knobY = startY + Math.sin(angle) * knobR;

        ctx.save();

        // Outer Glowing Base Ring (Puni Base)
        ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
        ctx.beginPath();
        ctx.arc(startX, startY, maxR + 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(startX, startY, maxR, 0, Math.PI * 2);
        ctx.stroke();

        // Inner Guide Ring
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(startX, startY, maxR * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Connecting Energy Beam Line
        if (dist > 5) {
          const beamGrad = ctx.createLinearGradient(startX, startY, knobX, knobY);
          beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
          beamGrad.addColorStop(1, 'rgba(251, 191, 36, 0.95)');
          ctx.strokeStyle = beamGrad;
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(knobX, knobY);
          ctx.stroke();
        }

        // Puni Puck Knob (Colopl Style Puck)
        ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
        ctx.shadowBlur = 18;

        const knobGrad = ctx.createRadialGradient(knobX - 4, knobY - 4, 2, knobX, knobY, 22);
        knobGrad.addColorStop(0, '#ffffff');
        knobGrad.addColorStop(0.5, '#38bdf8');
        knobGrad.addColorStop(1, '#0284c7');

        ctx.fillStyle = knobGrad;
        ctx.beginPath();
        ctx.arc(knobX, knobY, 22, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Center Spark / Gem Indicator
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(knobX, knobY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('action_kill_btn', handleKillAttempt);
      window.removeEventListener('keydown', keyActions);
      cancelAnimationFrame(animationId);
    };
  }, [socket, roomId, myId, onNearTaskStation, onNearVent]);

  return (
    <div className="relative w-full h-full touch-none select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
}
