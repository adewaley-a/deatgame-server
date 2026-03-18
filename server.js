const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "https://deatwin.netlify.app", methods: ["GET", "POST"] } });

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join_game', ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id, guest: null, gameStarted: false,
        health: { host: 650, guest: 650 },
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 },
        shieldHealth: { host: 350, guest: 350 }
      };
    } else if (!rooms[roomId].guest && rooms[roomId].host !== socket.id) {
      rooms[roomId].guest = socket.id;
      io.in(roomId).emit('start_countdown');
      setTimeout(() => { if (rooms[roomId]) rooms[roomId].gameStarted = true; }, 4000);
    }
    socket.emit('assign_role', { role: (rooms[roomId].host === socket.id ? 'host' : 'guest') });
  });

  socket.on('move_all', (data) => {
    socket.to(data.roomId).emit('opp_move_all', data);
  });

  socket.on('fire', (data) => {
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  socket.on('take_damage', ({ roomId, target, victimRole, damageType, x, y }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;

    const attacker = victimRole === 'host' ? 'guest' : 'host';
    const amount = damageType === 'grenade' ? 45 : 5;

    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - amount);
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - amount);
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - amount);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - amount);
      // Lifesteal
      if (r.health[attacker] < 650) r.health[attacker] = Math.min(650, r.health[attacker] + 5);
      else r.overHealth[attacker] = Math.min(200, r.overHealth[attacker] + 5);
    }

    io.in(roomId).emit('update_game_state', { 
      health: r.health, overHealth: r.overHealth, 
      boxHealth: r.boxHealth, shieldHealth: r.shieldHealth,
      attackerRole: attacker, victimRole, targetHit: target, 
      damageType, hitX: x, hitY: y
    });
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        socket.to(rid).emit('opponent_left');
        delete rooms[rid];
        break;
      }
    }
  });
});

server.listen(process.env.PORT || 3001);