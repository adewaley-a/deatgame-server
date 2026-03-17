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
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id, guest: null, gameStarted: false,
        health: { host: 650, guest: 650 }, 
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 }, 
        shieldHealth: { host: 350, guest: 350 },
        grenades: { host: 2, guest: 2 },
        positions: { host: { x: 0, y: 0 }, guest: { x: 0, y: 0 } }
      };
    } else if (!rooms[roomId].guest) {
      rooms[roomId].guest = socket.id;
      io.in(roomId).emit('start_countdown');
      setTimeout(() => { if (rooms[roomId]) rooms[roomId].gameStarted = true; }, 3500);
    }
    socket.emit('assign_role', { role: (rooms[roomId] && rooms[roomId].host === socket.id) ? 'host' : 'guest' });
  });

  socket.on('move_all', (d) => {
    if (rooms[d.roomId]) {
      const role = rooms[d.roomId].host === socket.id ? 'host' : 'guest';
      rooms[d.roomId].positions[role] = d.shooter;
    }
    socket.to(d.roomId).emit('opp_move_all', d);
  });

  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));
  socket.on('throw_grenade', (d) => socket.to(d.roomId).emit('incoming_grenade', d));
  socket.on('request_sparks', (d) => io.in(d.roomId).emit('spawn_sparks', d));

  socket.on('grenade_explosion', ({ roomId, x, y }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;
    const attacker = r.host === socket.id ? 'host' : 'guest';
    const victim = attacker === 'host' ? 'guest' : 'host';
    if (r.grenades[attacker] <= 0) return;
    r.grenades[attacker]--;

    const vicPos = r.positions[victim];
    const dist = Math.hypot(x - vicPos.x, y - vicPos.y);
    if (dist < 100) {
      const damage = Math.floor(70 * (1 - dist / 100));
      if (r.overHealth[victim] > 0) r.overHealth[victim] = Math.max(0, r.overHealth[victim] - damage);
      else r.health[victim] = Math.max(0, r.health[victim] - damage);
    }
    io.in(roomId).emit('update_game_state', { ...r, attackerRole: attacker, targetHit: 'explosion' });
  });

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;
    const attacker = victimRole === 'host' ? 'guest' : 'host';
    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] -= 5;
      else r.health[victimRole] -= 5;
    } else if (target === 'shield') r.shieldHealth[victimRole] -= 5;
    else if (target === 'box') {
      r.boxHealth[victimRole] -= 5;
      if (r.health[attacker] < 650) r.health[attacker] += 5;
      else r.overHealth[attacker] = Math.min(200, r.overHealth[attacker] + 5);
    }
    io.in(roomId).emit('update_game_state', { ...r, attackerRole: attacker, targetHit: target });
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) { delete rooms[rid]; break; }
    }
  });
});

server.listen(process.env.PORT || 3001);