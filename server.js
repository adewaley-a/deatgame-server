const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ["https://deatwin.netlify.app", "http://localhost:3000"], methods: ["GET", "POST"] }
});

const rooms = {};
const damageCooldowns = new Set();

io.on('connection', (socket) => {
  socket.on('join_game', ({ roomId }) => {
    if (!roomId) return;
    if (rooms[roomId] && rooms[roomId].isClosed) {
      socket.emit('error', 'Game Over: Room Closed');
      return;
    }
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id, guest: null, gameStarted: false, isClosed: false,
        health: { host: 650, guest: 650 }, overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 }, shieldHealth: { host: 350, guest: 350 }
      };
    } else if (!rooms[roomId].guest && rooms[roomId].host !== socket.id) {
      rooms[roomId].guest = socket.id;
      io.in(roomId).emit('start_countdown');
      setTimeout(() => { if (rooms[roomId]) rooms[roomId].gameStarted = true; }, 3500);
    }
    const role = (rooms[roomId] && rooms[roomId].host === socket.id) ? 'host' : 'guest';
    socket.emit('assign_role', { role });
  });

  socket.on('move_all', (d) => socket.to(d.roomId).emit('opp_move_all', d));
  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  socket.on('take_damage', ({ roomId, target, victimRole, bulletId }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted || r.isClosed) return;
    const hitKey = `${roomId}-${bulletId}`;
    if (damageCooldowns.has(hitKey)) return;
    damageCooldowns.add(hitKey);
    setTimeout(() => damageCooldowns.delete(hitKey), 100);

    const attackerRole = victimRole === 'host' ? 'guest' : 'host';
    const amount = 5;
    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - amount);
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - amount);
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - amount);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - amount);
      if (r.health[attackerRole] < 650) r.health[attackerRole] = Math.min(650, r.health[attackerRole] + amount);
      else r.overHealth[attackerRole] = Math.min(300, r.overHealth[attackerRole] + amount);
    }

    if (r.health.host <= 0 || r.health.guest <= 0) r.isClosed = true;
    io.in(roomId).emit('update_game_state', { ...r, lastHit: { target, attackerRole } });
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