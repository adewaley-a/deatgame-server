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
  },
  transports: ["websocket"] // High-speed transport
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  socket.on('join_game', ({ roomId }) => {
    if (!roomId) return;

    // CRITICAL: Actually join the socket.io room
    socket.join(roomId);

    if (!rooms[roomId]) {
      // Create room if it doesn't exist
      rooms[roomId] = {
        host: socket.id, 
        guest: null,
        health: { host: 650, guest: 650 },
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 },
        shieldHealth: { host: 350, guest: 350 }
      };
      socket.emit('assign_role', { role: 'host' });
    } else if (!rooms[roomId].guest) {
      // Second player joins
      rooms[roomId].guest = socket.id;
      socket.emit('assign_role', { role: 'guest' });
      
      // Start the game for EVERYONE in the room
      io.in(roomId).emit('start_countdown');
    } else {
      // Handle reconnection: Check if this socket should be host or guest
      // (Simplified: if room is full, just assign based on arrival)
      socket.emit('assign_role', { role: 'guest' });
    }
  });

  socket.on('move_all', (d) => {
    // Use socket.to(roomId) so sender doesn't get their own move back
    socket.to(d.roomId).emit('opp_move_all', {
        shooter: d.shooter,
        shield: d.shield,
        box: d.box
    });
  });

  socket.on('fire', (d) => {
    socket.to(d.roomId).emit('incoming_bullet', d);
  });

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
      // Lifesteal logic
      if (r.health[attacker] < 650) {
        r.health[attacker] = Math.min(650, r.health[attacker] + 5);
      } else {
        r.overHealth[attacker] = Math.min(300, r.overHealth[attacker] + 5);
      }
    }

    io.in(roomId).emit('update_game_state', { 
      ...r, 
      lastHit: { target, attacker, bulletId } 
    });
  });

  socket.on('disconnecting', () => {
    // Clean up rooms when someone leaves
    socket.rooms.forEach(rid => {
      if (rooms[rid]) {
        console.log(`Room ${rid} closed due to disconnect`);
        delete rooms[rid];
        io.in(rid).emit('opponent_left');
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game Server running on port ${PORT}`));