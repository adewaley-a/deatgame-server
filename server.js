const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "https://deatwin.netlify.app" } });

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
        shieldHealth: { host: 350, guest: 350 },
        grenades: { host: 2, guest: 2 }
      };
    } else if (!rooms[roomId].guest && rooms[roomId].host !== socket.id) {
      rooms[roomId].guest = socket.id;
      setTimeout(() => io.in(roomId).emit('start_countdown'), 500);
      setTimeout(() => { if (rooms[roomId]) rooms[roomId].gameStarted = true; }, 4000);
    }
    socket.emit('assign_role', { role: rooms[roomId].host === socket.id ? 'host' : 'guest' });
  });

  socket.on('take_damage', ({ roomId, target, victimRole, damageType, dist }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;
    const attacker = victimRole === 'host' ? 'guest' : 'host';
    
    let amount = 5;
    if (damageType === 'grenade') {
      // RADIAL DAMAGE: Max damage is 75 at center, drops to 0 at 150px distance
      amount = Math.max(0, Math.floor(75 * (1 - (dist / 150)))); 
    }

    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) {
        r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - amount);
      } else {
        r.health[victimRole] = Math.max(0, r.health[victimRole] - amount);
      }
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - amount);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - amount);
      // Lifesteal Logic
      if (r.health[attacker] < 650) {
        r.health[attacker] = Math.min(650, r.health[attacker] + 5);
      } else {
        r.overHealth[attacker] = Math.min(300, r.overHealth[attacker] + 5);
      }
    }

    io.in(roomId).emit('update_game_state', {
      health: r.health, 
      overHealth: r.overHealth, 
      boxHealth: r.boxHealth, 
      shieldHealth: r.shieldHealth, 
      grenades: r.grenades, 
      lastHit: { target, attackerRole: attacker }
    });
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        socket.to(rid).emit('opponent_left');
        delete rooms[rid];
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));