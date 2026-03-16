const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "https://deatwin.netlify.app" } });

// Storage for active game rooms
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_game', ({ roomId }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      // Initialize room for the Host
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
      console.log(`Room ${roomId} created by host`);
    } else if (!rooms[roomId].guest) {
      // Join the Guest and trigger countdown
      rooms[roomId].guest = socket.id;
      console.log(`Guest joined room ${roomId}`);
      
      // Delay game start for the 3-second countdown
      setTimeout(() => { 
        if(rooms[roomId]) rooms[roomId].gameStarted = true; 
      }, 3000);
      
      io.in(roomId).emit('start_countdown');
    }
    
    // Assign roles immediately upon joining
    const role = socket.id === rooms[roomId].host ? 'host' : 'guest';
    socket.emit('assign_role', { role });
  });

  // Sync movements across clients
  socket.on('move_all', (data) => {
    socket.to(data.roomId).emit('opp_move_all', data);
  });

  // Sync bullet firing
  socket.on('fire', (data) => {
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  // Precise Damage and Lifesteal Logic
  socket.on('take_damage', ({ roomId, target, victimRole, amount = 5 }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;

    const attackerRole = victimRole === 'host' ? 'guest' : 'host';
    
    if (target === 'player') {
      // Damage priority: Overhealth first, then Main Health
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
      // Box takes damage
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - amount);
      
      // Lifesteal Logic: Attacker heals for 5 per hit
      if (r.health[attackerRole] < 650) {
        r.health[attackerRole] = Math.min(650, r.health[attackerRole] + 5);
      } else {
        // If Health is full, add to Gold Overhealth (Cap: 200)
        r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
      }
    }

    // Broadcast updated state to all players in the room
    io.in(roomId).emit('update_game_state', { 
      health: r.health,
      overHealth: r.overHealth,
      boxHealth: r.boxHealth,
      shieldHealth: r.shieldHealth,
      grenades: r.grenades,
      attackerRole,
      targetHit: target
    });
  });

  // Clean up room on disconnect
  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        console.log(`Closing room ${rid} due to disconnect`);
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