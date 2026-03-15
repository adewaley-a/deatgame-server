const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "https://deatwin.netlify.app" } // Ensure this matches your Netlify URL in production
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  socket.on('join_game', ({ roomId }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id,
        guest: null,
        health: { [socket.id]: 400 },
        overHealth: { [socket.id]: 0 },
        grenades: { [socket.id]: 2 },
        entities: {
          [socket.id]: { boxHp: 200, shieldHp: 200 }
        }
      };
    } else if (!rooms[roomId].guest) {
      rooms[roomId].guest = socket.id;
      rooms[roomId].health[socket.id] = 400;
      rooms[roomId].overHealth[socket.id] = 0;
      rooms[roomId].grenades[socket.id] = 2;
      rooms[roomId].entities[socket.id] = { boxHp: 200, shieldHp: 200 };
      
      io.in(roomId).emit('start_countdown');
    }
    
    // Send initial state to let frontend know roles
    io.in(roomId).emit('update_game_state', rooms[roomId]);
  });

  // Authoritative Movement Sync
  socket.on('client_movement', (data) => {
    socket.to(data.roomId).emit('sync_all', data);
  });

  // Authoritative Damage & Lifesteal Logic
  socket.on('damage_entity', ({ roomId, type, targetId }) => {
    const r = rooms[roomId];
    if (!r) return;

    const attackerId = socket.id;
    const victimId = targetId === 'opponent' ? (attackerId === r.host ? r.guest : r.host) : attackerId;

    if (!victimId) return;

    if (type === 'player') {
      // Damage overHealth first, then regular health
      if (r.overHealth[victimId] > 0) {
        r.overHealth[victimId] -= 5;
      } else {
        r.health[victimId] -= 5;
      }
    } 
    else if (type === 'shield') {
      r.entities[victimId].shieldHp -= 5;
    } 
    else if (type === 'box') {
      r.entities[victimId].boxHp -= 5;
      // LIFESTEAL LOGIC
      if (r.health[attackerId] < 400) {
        r.health[attackerId] = Math.min(400, r.health[attackerId] + 5);
      } else {
        r.overHealth[attackerId] = Math.min(200, r.overHealth[attackerId] + 5);
      }
    }

    io.in(roomId).emit('update_game_state', r);
  });

  // Grenade Inventory Logic
  socket.on('launch_grenade', (data) => {
    const r = rooms[data.roomId];
    if (r && r.grenades[socket.id] > 0) {
      r.grenades[socket.id] -= 1;
      socket.to(data.roomId).emit('incoming_grenade', data);
      io.in(data.roomId).emit('update_game_state', r);
    }
  });

  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  socket.on('disconnect', () => {
    // Cleanup empty rooms
    for (const roomId in rooms) {
      if (rooms[roomId].host === socket.id || rooms[roomId].guest === socket.id) {
        delete rooms[roomId];
        console.log(`Room ${roomId} closed due to disconnect`);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Deatwin Server running on port ${PORT}`));