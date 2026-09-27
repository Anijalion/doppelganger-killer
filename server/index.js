const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve static frontend build if available
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 2400;

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

const TASK_STATIONS = [
  { id: 't1', x: 400, y: 400, type: 'wire', label: '配線端末 [バイオラボ]' },
  { id: 't2', x: 2000, y: 400, type: 'keypad', label: '暗号端末 [武器庫]' },
  { id: 't3', x: 400, y: 2000, type: 'download', label: '通信端末 [電気室]' },
  { id: 't4', x: 2000, y: 2000, type: 'align', label: '出力調整 [航法室]' },
  { id: 't5', x: 1200, y: 350, type: 'keypad', label: 'セキュリティ [北回廊]' },
  { id: 't6', x: 350, y: 1200, type: 'download', label: 'データ同期 [西回廊]' },
  { id: 't7', x: 2050, y: 1200, type: 'wire', label: '制御配線 [東回廊]' },
  { id: 't8', x: 1200, y: 2050, type: 'align', label: 'メインサーバ [南回廊]' },
];

function generateRandomVents(randomFn = Math.random) {
  const vents = [];
  const roomLabels = ['アルファダクト', 'ベータダクト', 'ガンマダクト'];

  for (let i = 0; i < 3; i++) {
    let x, y;
    let attempts = 0;
    let valid = false;

    do {
      x = Math.floor(randomFn() * (MAP_WIDTH - 600) + 300);
      y = Math.floor(randomFn() * (MAP_HEIGHT - 600) + 300);
      attempts++;

      if (isInsideWall(x, y, 60)) continue;

      const nearTask = TASK_STATIONS.some(t => Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2) < 130);
      if (nearTask) continue;

      const nearOtherVent = vents.some(v => Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2) < 300);
      if (nearOtherVent) continue;

      valid = true;
    } while (!valid && attempts < 500);

    const id = `v${i + 1}`;
    const targetId = `v${((i + 1) % 3) + 1}`;
    vents.push({
      id,
      x,
      y,
      targetId,
      room: roomLabels[i]
    });
  }

  return vents;
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomId, name, color, hat }) => {
    if (!roomId) {
      roomId = generateRoomId();
    }
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {},
        state: 'waiting',
        startTime: null,
        gameDuration: 180 * 1000,
        crownDurationSec: 60,
        poisonGasStartSec: 60,
        shieldDurationSec: 3,
        shieldCooldownSec: 15,
        scoreSettings: {
          playerKill: 1000,
          npcMistake: 500,
          taskDone: 300,
          goldPaint: 500,
          gasDamage: 50
        },
        mapSeed: Math.random(),
        goldenNpcIndex: Math.floor(Math.random() * 80),
        goldenPaint: { x: 1200, y: 1200, active: true },
        taskStations: TASK_STATIONS,
        vents: generateRandomVents(),
        totalTasksCompleted: 0,
        logs: []
      };
    }

    const room = rooms[roomId];
    const spawnPos = getRandomWallSafePosition();

    room.players[socket.id] = {
      id: socket.id,
      name: name || `Agent #${Math.floor(Math.random() * 900 + 100)}`,
      color: color || '#f87171',
      hat: hat || 'none',
      score: 0,
      kills: 0,
      tasksDone: 0,
      mistakes: 0,
      completedTasks: [],
      hasUsedPanic: false,
      x: spawnPos.x,
      y: spawnPos.y,
      isDead: false,
      isGhost: false,
      isGoldenPaint: false,
      goldenPaintUntil: 0,
      stunUntil: 0,
      shieldUntil: 0,
      shieldCooldownUntil: 0
    };

    socket.emit('room_joined', { roomId, gameState: room });
    io.to(roomId).emit('player_updated', room.players);
  });

  socket.on('set_game_duration', ({ roomId, durationSec }) => {
    const room = rooms[roomId];
    if (room && room.state === 'waiting') {
      const validDurations = [60, 120, 180, 300];
      if (validDurations.includes(durationSec)) {
        room.gameDuration = durationSec * 1000;
        io.to(roomId).emit('room_settings_updated', {
          gameDuration: room.gameDuration,
          crownDurationSec: room.crownDurationSec,
          poisonGasStartSec: room.poisonGasStartSec,
          shieldDurationSec: room.shieldDurationSec,
          shieldCooldownSec: room.shieldCooldownSec,
          scoreSettings: room.scoreSettings
        });
      }
    }
  });

  socket.on('set_crown_duration', ({ roomId, crownSec }) => {
    const room = rooms[roomId];
    if (room && room.state === 'waiting') {
      const validCrowns = [15, 30, 45, 60, 90, 9999];
      if (validCrowns.includes(crownSec)) {
        room.crownDurationSec = crownSec;
        io.to(roomId).emit('room_settings_updated', {
          gameDuration: room.gameDuration,
          crownDurationSec: room.crownDurationSec,
          poisonGasStartSec: room.poisonGasStartSec,
          shieldDurationSec: room.shieldDurationSec,
          shieldCooldownSec: room.shieldCooldownSec,
          scoreSettings: room.scoreSettings
        });
      }
    }
  });

  socket.on('set_poison_gas_duration', ({ roomId, gasSec }) => {
    const room = rooms[roomId];
    if (room && room.state === 'waiting') {
      const validGasSecs = [0, 30, 60, 90, 120, 9999];
      if (validGasSecs.includes(gasSec)) {
        room.poisonGasStartSec = gasSec;
        io.to(roomId).emit('room_settings_updated', {
          gameDuration: room.gameDuration,
          crownDurationSec: room.crownDurationSec,
          poisonGasStartSec: room.poisonGasStartSec,
          shieldDurationSec: room.shieldDurationSec,
          shieldCooldownSec: room.shieldCooldownSec,
          scoreSettings: room.scoreSettings
        });
      }
    }
  });

  socket.on('set_shield_duration', ({ roomId, durationSec }) => {
    const room = rooms[roomId];
    if (room && room.state === 'waiting') {
      const validDurations = [0, 2, 3, 5, 8];
      if (validDurations.includes(durationSec)) {
        room.shieldDurationSec = durationSec;
        io.to(roomId).emit('room_settings_updated', {
          gameDuration: room.gameDuration,
          crownDurationSec: room.crownDurationSec,
          poisonGasStartSec: room.poisonGasStartSec,
          shieldDurationSec: room.shieldDurationSec,
          shieldCooldownSec: room.shieldCooldownSec,
          scoreSettings: room.scoreSettings
        });
      }
    }
  });

  socket.on('set_shield_cooldown', ({ roomId, cooldownSec }) => {
    const room = rooms[roomId];
    if (room && room.state === 'waiting') {
      const validCooldowns = [10, 15, 20, 30, 45];
      if (validCooldowns.includes(cooldownSec)) {
        room.shieldCooldownSec = cooldownSec;
        io.to(roomId).emit('room_settings_updated', {
          gameDuration: room.gameDuration,
          crownDurationSec: room.crownDurationSec,
          poisonGasStartSec: room.poisonGasStartSec,
          shieldDurationSec: room.shieldDurationSec,
          shieldCooldownSec: room.shieldCooldownSec,
          scoreSettings: room.scoreSettings
        });
      }
    }
  });

  socket.on('set_score_settings', ({ roomId, scoreSettings }) => {
    const room = rooms[roomId];
    if (room && room.state === 'waiting') {
      room.scoreSettings = {
        ...(room.scoreSettings || { playerKill: 1000, npcMistake: 500, taskDone: 300, goldPaint: 500, gasDamage: 50 }),
        ...scoreSettings
      };
      io.to(roomId).emit('room_settings_updated', {
        gameDuration: room.gameDuration,
        crownDurationSec: room.crownDurationSec,
        poisonGasStartSec: room.poisonGasStartSec,
        shieldDurationSec: room.shieldDurationSec,
        shieldCooldownSec: room.shieldCooldownSec,
        scoreSettings: room.scoreSettings
      });
    }
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (room && room.state === 'waiting') {
      room.state = 'playing';
      room.startTime = Date.now();
      room.totalTasksCompleted = 0;
      room.vents = generateRandomVents(); // 3 random vents per match!
      Object.values(room.players).forEach(p => {
        p.hasUsedPanic = false;
        const safeP = getRandomWallSafePosition();
        p.x = safeP.x;
        p.y = safeP.y;
      });
      io.to(roomId).emit('game_started', { startTime: room.startTime, gameState: room });

      room.paintInterval = setInterval(() => {
        if (room.state === 'playing') {
          const paintPos = getRandomWallSafePosition();
          room.goldenPaint = {
            x: paintPos.x,
            y: paintPos.y,
            active: true
          };
          io.to(roomId).emit('golden_paint_spawned', room.goldenPaint);
        }
      }, 25000);

      setTimeout(() => {
        if (room && room.state === 'playing') {
          room.state = 'finished';
          clearInterval(room.paintInterval);
          const sorted = Object.values(room.players).sort((a, b) => b.score - a.score);
          io.to(roomId).emit('game_over', { leaderboard: sorted });
        }
      }, room.gameDuration);
    }
  });

  socket.on('sync_state', ({ roomId, x, y, isDead }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      const p = room.players[socket.id];
      p.x = x;
      p.y = y;
      p.isDead = isDead;
      socket.to(roomId).emit('player_moved', { id: socket.id, x, y, isDead });
    }
  });

  socket.on('action_vent', ({ roomId, fromVentId }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      const player = room.players[socket.id];
      if ((player.ventCooldownUntil || 0) > Date.now()) return; // 15-second cooldown check!

      const vents = room.vents || [];
      const currentVent = vents.find(v => v.id === fromVentId);
      if (currentVent) {
        const targetVent = vents.find(v => v.id === currentVent.targetId);
        if (targetVent) {
          player.x = targetVent.x;
          player.y = targetVent.y;
          player.ventCooldownUntil = Date.now() + 15000; // Enforce 15s cooldown!
          io.to(roomId).emit('player_vented', { playerId: socket.id, x: targetVent.x, y: targetVent.y, ventCooldownUntil: player.ventCooldownUntil });
          io.to(roomId).emit('player_updated', room.players);
        }
      }
    }
  });

  socket.on('action_investigate', ({ roomId, crimeSceneId }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'playing') return;
    const investigator = room.players[socket.id];
    if (!investigator || investigator.isDead) return;

    const crime = (room.crimeScenes || []).find(c => c.id === crimeSceneId);
    if (crime) {
      const killer = room.players[crime.killerId];
      const killerX = killer ? killer.x : crime.x + 200;
      const killerY = killer ? killer.y : crime.y + 200;

      io.to(roomId).emit('crime_investigated', {
        investigatorId: socket.id,
        investigatorName: investigator.name,
        crimeSceneId: crime.id,
        crimeX: crime.x,
        crimeY: crime.y,
        killerId: crime.killerId,
        killerX,
        killerY,
        investigateUntil: Date.now() + 5000
      });
      io.to(roomId).emit('event_log', `🔍 ${investigator.name} が現場の指紋・足跡を特定！犯人の足跡が5秒間可視化されました！`);
    }
  });

  socket.on('action_pickup_paint', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.goldenPaint.active && room.players[socket.id]) {
      room.goldenPaint.active = false;
      const player = room.players[socket.id];
      player.isGoldenPaint = true;
      const paintPts = room.scoreSettings?.goldPaint ?? 500;
      player.score += paintPts;
      player.goldenPaintUntil = Date.now() + 15000;
      io.to(roomId).emit('golden_paint_spawned', room.goldenPaint); // Instant zone removal on all clients!
      io.to(roomId).emit('event_log', `✨ ${player.name} が黄金ペンキを獲得！15秒間ゴールド化＆+${paintPts}PT！`);
      io.to(roomId).emit('player_updated', room.players);

      setTimeout(() => {
        if (player) {
          player.isGoldenPaint = false;
          io.to(roomId).emit('player_updated', room.players);
        }
      }, 15000);
    }
  });

  socket.on('action_kill', ({ roomId, targetId, isNpc, isGolden, x, y }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'playing') return;

    const player = room.players[socket.id];
    if (!player || player.isDead || player.stunUntil > Date.now()) return;

    const killPts = room.scoreSettings?.playerKill ?? 1000;
    const mistakePenalty = room.scoreSettings?.npcMistake ?? 500;

    if (isNpc) {
      if (isGolden) {
        player.score += killPts;
        player.kills += 1;
        io.to(roomId).emit('event_log', `✨ ${player.name} が黄金NPCの暗殺に成功！ (+${killPts}pt)`);
        io.to(roomId).emit('npc_killed', { npcId: targetId, isGolden: true, killerId: socket.id, x, y, killerX: player.x, killerY: player.y });
      } else {
        player.score = Math.max(0, player.score - mistakePenalty);
        player.mistakes += 1;
        player.stunUntil = Date.now() + 3000;
        io.to(roomId).emit('event_log', `${player.name} がNPCを誤爆して3秒間スタン！ (-${mistakePenalty}pt)`);
        io.to(roomId).emit('npc_killed', { npcId: targetId, isGolden: false, killerId: socket.id, x, y, killerX: player.x, killerY: player.y });
        io.to(roomId).emit('player_stunned', { playerId: socket.id, stunUntil: player.stunUntil });
      }
    } else if (targetId && room.players[targetId] && !room.players[targetId].isDead) {
      const victim = room.players[targetId];

      // Check if victim has an active invincibility shield
      if (victim.shieldUntil && victim.shieldUntil > Date.now()) {
        io.to(roomId).emit('kill_blocked', { killerId: socket.id, victimId: targetId, x: victim.x, y: victim.y });
        io.to(roomId).emit('event_log', `🛡️ ${victim.name} はシールド無敵中！ ${player.name} の暗殺を防いだ！`);
        return;
      }
      
      if (victim.isGoldenPaint) {
        const bonusKillPts = Math.floor(killPts * 1.5);
        const bonusDeathPenalty = Math.floor(mistakePenalty * 1.6);
        player.score += bonusKillPts;
        player.kills += 1;
        victim.score = Math.max(0, victim.score - bonusDeathPenalty);
        io.to(roomId).emit('event_log', `👑✨ ${player.name} が黄金化中だった ${victim.name} を撃破！ (+${bonusKillPts}pt大横取り！)`);
      } else {
        player.score += killPts;
        player.kills += 1;
        victim.score = Math.max(0, victim.score - mistakePenalty);
        io.to(roomId).emit('event_log', `${player.name} が ${victim.name} の暗殺に成功！ (+${killPts}pt)`);
      }

      victim.isDead = true;
      victim.isGhost = true;

      io.to(roomId).emit('player_killed', { killerId: socket.id, victimId: targetId, x, y, killerX: player.x, killerY: player.y });

      setTimeout(() => {
        if (room.players[targetId] && room.state === 'playing') {
          victim.isDead = false;
          victim.isGhost = false;
          const safeR = getRandomWallSafePosition();
          victim.x = safeR.x;
          victim.y = safeR.y;
          io.to(roomId).emit('player_respawned', { playerId: targetId, x: victim.x, y: victim.y });
          io.to(roomId).emit('player_updated', room.players);
        }
      }, 4000);
    }

    io.to(roomId).emit('player_updated', room.players);
  });

  socket.on('action_shield', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'playing') return;
    if ((room.shieldDurationSec ?? 3) === 0) return; // Disabled

    const player = room.players[socket.id];
    if (!player || player.isDead || (player.stunUntil > Date.now())) return;
    if ((player.shieldCooldownUntil || 0) > Date.now()) return; // On cooldown

    const durSec = room.shieldDurationSec ?? 3;
    const cdSec = room.shieldCooldownSec ?? 15;

    player.shieldUntil = Date.now() + (durSec * 1000);
    player.shieldCooldownUntil = Date.now() + (cdSec * 1000);

    io.to(roomId).emit('player_shielded', {
      playerId: socket.id,
      shieldUntil: player.shieldUntil,
      shieldCooldownUntil: player.shieldCooldownUntil
    });
    io.to(roomId).emit('event_log', `🛡️ ${player.name} がシールドを発動！ (${durSec}秒間無敵)`);
    io.to(roomId).emit('player_updated', room.players);
  });

  socket.on('action_task_completed', ({ roomId, taskId }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id] && room.state === 'playing') {
      const player = room.players[socket.id];
      player.completedTasks = player.completedTasks || [];
      if (!player.completedTasks.includes(taskId)) {
        player.completedTasks.push(taskId);
        const taskPts = room.scoreSettings?.taskDone ?? 300;
        player.score += taskPts;
        player.tasksDone += 1;
        room.totalTasksCompleted = (room.totalTasksCompleted || 0) + 1;
        io.to(roomId).emit('event_log', `${player.name} がタスク完了！ (+${taskPts}pt)`);
        io.to(roomId).emit('total_tasks_updated', { totalTasksCompleted: room.totalTasksCompleted });
        io.to(roomId).emit('player_updated', room.players);
      }
    }
  });

  socket.on('action_panic', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.state === 'playing') {
      const player = room.players[socket.id];
      if (player && !player.hasUsedPanic) {
        player.hasUsedPanic = true;
        io.to(roomId).emit('panic_alarm');
        io.to(roomId).emit('event_log', `🚨 ${player.name} がパニックベルを発動！全NPCが5秒間暴走！(1ゲーム1回のみ)`);
        io.to(roomId).emit('player_updated', room.players);
      }
    }
  });

  socket.on('reset_room', (roomId) => {
    const room = rooms[roomId];
    if (room) {
      room.state = 'waiting';
      room.startTime = null;
      room.totalTasksCompleted = 0;
      room.vents = generateRandomVents();
      Object.values(room.players).forEach(p => {
        p.score = 0;
        p.kills = 0;
        p.tasksDone = 0;
        p.mistakes = 0;
        p.completedTasks = [];
        p.hasUsedPanic = false;
        p.isDead = false;
        p.isGhost = false;
        p.stunUntil = 0;
        p.shieldUntil = 0;
        p.shieldCooldownUntil = 0;
      });
      io.to(roomId).emit('room_reset', { gameState: room });
    }
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomId).emit('player_updated', room.players);
        if (Object.keys(room.players).length === 0) {
          if (room.paintInterval) clearInterval(room.paintInterval);
          delete rooms[roomId];
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

app.get('{*path}', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
