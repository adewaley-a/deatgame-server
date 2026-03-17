const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://deatwin.netlify.app",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_game', ({ roomId }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      // Initialize room as Host
      rooms[roomId] = {
        host: socket.id,
        guest: null,
        gameStarted: false,
        health: { host: 650, guest: 650 },
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 },
        shieldHealth: { host: 350, guest: 350 },
        grenades: { host: 2, guest: 2 }
      };
      console.log(`Room ${roomId} created by host: ${socket.id}`);
    } else if (!rooms[roomId].guest) {
      // Join room as Guest
      rooms[roomId].guest = socket.id;
      console.log(`Guest ${socket.id} joined room ${roomId}`);
      
      // Start the 3-second countdown for both players
      io.in(roomId).emit('start_countdown');
      
      // Allow gameplay interaction after countdown finishes
      setTimeout(() => {
        if (rooms[roomId]) rooms[roomId].gameStarted = true;
      }, 3500);
    }

    const role = (rooms[roomId].host === socket.id) ? 'host' : 'guest';
    socket.emit('assign_role', { role });
  });

  // Relay positional movement to the opponent
  socket.on('move_all', (data) => {
    socket.to(data.roomId).emit('opp_move_all', data);
  });

  // Relay bullet data to the opponent
  socket.on('fire', (data) => {
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  // Relay grenade data to the opponent
  socket.on('throw_grenade', (data) => {
    socket.to(data.roomId).emit('incoming_grenade', data);
  });

  // Handle all collision and health logic
  socket.on('take_damage', ({ roomId, target, victimRole, amount = 5 }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;

    const attackerRole = victimRole === 'host' ? 'guest' : 'host';

    if (target === 'player') {
      // Damage priority: Overhealth (Gold) -> Main Health (Blue/Red)
      if (r.overHealth[victimRole] > 0) {
        r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - amount);
      } else {
        r.health[victimRole] = Math.max(0, r.health[victimRole] - amount);
      }
    } 
    else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - amount);
    } 
    else if (target === 'box') {
      // 1. Reduce Treasure Box health
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - amount);
      
      // 2. Lifesteal Logic: Heal the attacker
      if (r.health[attackerRole] < 650) {
        r.health[attackerRole] = Math.min(650, r.health[attackerRole] + 5);
      } else {
        // Convert excess lifesteal to Overhealth
        r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
      }
    }

    // Broadcast updated state to both players
    io.in(roomId).emit('update_game_state', {
      health: r.health,
      overHealth: r.overHealth,
      boxHealth: r.boxHealth,
      shieldHealth: r.shieldHealth,
      grenades: r.grenades,
      attackerRole: attackerRole,
      targetHit: target
    });
  });

  socket.on('disconnect', () => {
    // Clean up room if a player leaves
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        console.log(`Room ${rid} closed due to disconnect.`);
        delete rooms[rid];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Deatwin Server running on port ${PORT}`);
});