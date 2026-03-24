const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "https://deatwin.netlify.app", methods: ["GET", "POST"] }
});

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join_game', ({ roomId }) => {
    if (!roomId) return;
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id, guest: null,
        health: { host: 650, guest: 650 },
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 },
        shieldHealth: { host: 350, guest: 350 }
      };
    } else if (!rooms[roomId].guest) {
      rooms[roomId].guest = socket.id;
      io.in(roomId).emit('start_countdown');
    }
    const role = (rooms[roomId].host === socket.id) ? 'host' : 'guest';
    socket.emit('assign_role', { role });
  });

  socket.on('move_all', (d) => socket.to(d.roomId).emit('opp_move_all', d));
  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  socket.on('take_damage', ({ roomId, target, victimRole, bulletId }) => {
    const r = rooms[roomId];
    if (!r) return;

    const attacker = victimRole === 'host' ? 'guest' : 'host';
    const dmg = 8;

    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - dmg);
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - dmg);
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - dmg);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - dmg);
      // Lifesteal
      if (r.health[attacker] < 650) r.health[attacker] = Math.min(650, r.health[attacker] + 5);
      else r.overHealth[attacker] = Math.min(300, r.overHealth[attacker] + 5);
    }

    io.in(roomId).emit('update_game_state', { ...r, lastHit: { target, attacker, bulletId } });
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        delete rooms[rid];
      }
    }
  });
});

server.listen(process.env.PORT || 3001);