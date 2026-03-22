const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: ["https://deatwin.netlify.app", "http://localhost:3000"], 
    methods: ["GET", "POST"] 
  }
});

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join_game', ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id, guest: null,
        health: { host: 650, guest: 650 }, 
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 }, 
        shieldHealth: { host: 350, guest: 350 }
      };
    } else if (!rooms[roomId].guest && rooms[roomId].host !== socket.id) {
      rooms[roomId].guest = socket.id;
      // Trigger start sequence
      setTimeout(() => io.in(roomId).emit('start_countdown'), 500);
    }

    const role = (rooms[roomId].host === socket.id) ? 'host' : 'guest';
    socket.emit('assign_role', { role });
  });

  // Mirroring Movement: Send local data to opponent only
  socket.on('move_all', (d) => socket.to(d.roomId).emit('opp_move_all', d));

  // Bullet Sync
  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  // Damage Logic: The "Single Source of Truth"
  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r) return;
    const attackerRole = victimRole === 'host' ? 'guest' : 'host';
    
    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) {
        r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - 15);
      } else {
        r.health[victimRole] = Math.max(0, r.health[victimRole] - 10);
      }
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - 20);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - 25);
      
      // Lifesteal Logic: Adds to Health first, then spills over to Overhealth
      if (r.health[attackerRole] < 650) {
        r.health[attackerRole] = Math.min(650, r.health[attackerRole] + 5);
      } else {
        r.overHealth[attackerRole] = Math.min(300, r.overHealth[attackerRole] + 5);
      }
    }

    // Broadcast updated state to BOTH players
    io.in(roomId).emit('update_game_state', {
      health: r.health, 
      overHealth: r.overHealth,
      boxHealth: r.boxHealth, 
      shieldHealth: r.shieldHealth,
      lastHit: { target, attackerRole }
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));