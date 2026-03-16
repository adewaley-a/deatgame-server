const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "https://deatwin.netlify.app" } });

const rooms = {};

// Shield Replenishment Logic
setInterval(() => {
  for (const rid in rooms) {
    const r = rooms[rid];
    if (!r.gameStarted) continue;
    const now = Date.now();
    ['host', 'guest'].forEach(role => {
      if (now - r.lastHit[role] > 5000 && r.shieldHealth[role] < 350 && r.shieldHealth[role] > 0) {
        r.shieldHealth[role] = Math.min(350, r.shieldHealth[role] + 5);
      }
    });
    // Optional: Broadcast replenishment every second
    io.in(rid).emit('update_game_state', { ...r, hostId: r.host, guestId: r.guest });
  }
}, 1000);

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
        lastHit: { host: 0, guest: 0 },
        positions: { host: {}, guest: {} }
      };
    } else if (!rooms[roomId].guest) {
      rooms[roomId].guest = socket.id;
      setTimeout(() => { if(rooms[roomId]) rooms[roomId].gameStarted = true; }, 3000);
      io.in(roomId).emit('start_countdown');
    }
    socket.emit('assign_role', { role: socket.id === rooms[roomId].host ? 'host' : 'guest' });
  });

  socket.on('move_all', (d) => {
    const r = rooms[d.roomId];
    if (r) {
      r.positions[socket.id === r.host ? 'host' : 'guest'] = d;
      socket.to(d.roomId).emit('opp_move_all', d);
    }
  });

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;
    
    r.lastHit[victimRole] = Date.now(); // Reset shield regen timer
    const attackerRole = victimRole === 'host' ? 'guest' : 'host';

    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - 5);
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - 5);
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - 5);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - 5);
      if (r.health[attackerRole] < 650) r.health[attackerRole] = Math.min(650, r.health[attackerRole] + 5);
      else r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
    }

    io.in(roomId).emit('update_game_state', { 
      ...r, attackerRole, targetHit: target, hostId: r.host, guestId: r.guest 
    });
  });

  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        delete rooms[rid];
        break;
      }
    }
  });
});

server.listen(process.env.PORT || 3001);