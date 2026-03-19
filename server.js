const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://deatwin.netlify.app", // Change this to your Netlify URL in production
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on('join_game', ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);

    // Initialize room state if it's the first player
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id,
        guest: null,
        gameStarted: false,
        health: { host: 650, guest: 650 },
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 },
        shieldHealth: { host: 350, guest: 350 }
      };
    } else if (!rooms[roomId].guest && rooms[roomId].host !== socket.id) {
      // Second player joins
      rooms[roomId].guest = socket.id;
      
      // Trigger the 3-second countdown on both clients
      io.in(roomId).emit('start_countdown');
      
      // Enable damage and shooting after countdown ends (approx 4s total)
      setTimeout(() => {
        if (rooms[roomId]) rooms[roomId].gameStarted = true;
      }, 4000);
    }

    const role = rooms[roomId].host === socket.id ? 'host' : 'guest';
    socket.emit('assign_role', { role });
  });

  // Syncs Shooter, Shield, and Box positions
  socket.on('move_all', (data) => {
    socket.to(data.roomId).emit('opp_move_all', data);
  });

  // Broadcasts bullet creation to the opponent
  socket.on('fire', (data) => {
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  // Centralized Damage Engine
  socket.on('take_damage', ({ roomId, target, victimRole, damageType, x, y }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;

    const attacker = victimRole === 'host' ? 'guest' : 'host';
    const amount = damageType === 'grenade' ? 45 : 5; // Grenades do massive AOE damage

    // 1. Logic for Player/Grenade Damage
    if (target === 'player' || damageType === 'grenade') {
      if (r.overHealth[victimRole] > 0) {
        r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - amount);
      } else {
        r.health[victimRole] = Math.max(0, r.health[victimRole] - amount);
      }
    } 
    // 2. Logic for Shield Damage
    else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - amount);
    } 
    // 3. Logic for Box Damage (Lifesteal Trigger)
    else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - amount);
      
      // Lifesteal: Attacker gains 5HP. If main health is full, it becomes Overhealth.
      if (r.health[attacker] < 650) {
        r.health[attacker] = Math.min(650, r.health[attacker] + 5);
      } else {
        r.overHealth[attacker] = Math.min(200, r.overHealth[attacker] + 5);
      }
    }

    // Broadcast updated stats and hit markers to all players in the room
    io.in(roomId).emit('update_game_state', { 
      health: r.health, 
      overHealth: r.overHealth, 
      boxHealth: r.boxHealth, 
      shieldHealth: r.shieldHealth,
      attackerRole: attacker,
      victimRole: victimRole,
      targetHit: target,
      damageType: damageType, // 'bullet' or 'grenade'
      hitX: x, 
      hitY: y
    });
  });

  socket.on('disconnect', () => {
    // Cleanup room if a player leaves
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        socket.to(rid).emit('opponent_left');
        delete rooms[rid];
        console.log(`Room ${rid} closed due to disconnect.`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`DEATWIN Server running on port ${PORT}`);
});