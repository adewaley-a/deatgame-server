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
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      // Initialize room with the first player as host
      rooms[roomId] = { 
        host: socket.id, 
        guest: null, 
        health: { host: 400, guest: 400 } 
      };
      socket.emit('assign_role', { role: 'host' });
    } else if (!rooms[roomId].guest && rooms[roomId].host !== socket.id) {
      // Second player is guest (and ensure it's not the same socket)
      rooms[roomId].guest = socket.id;
      socket.emit('assign_role', { role: 'guest' });
    }

    // Always sync health state immediately upon joining
    io.in(roomId).emit('update_health', rooms[roomId].health);
  });

  socket.on('move', (data) => {
    // Mirror movement to the other player
    socket.to(data.roomId).emit('opp_move', data);
  });

  socket.on('fire', (data) => {
    // Mirror bullet to the other player
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  socket.on('take_damage', ({ roomId, victimRole }) => {
    if (rooms[roomId]) {
      // Apply damage to the correct role (host or guest)
      rooms[roomId].health[victimRole] = Math.max(0, rooms[roomId].health[victimRole] - 2);
      io.in(roomId).emit('update_health', rooms[roomId].health);
    }
  });

  socket.on('disconnecting', () => {
    // Optional: Cleanup rooms[roomId] when a player leaves
  });
});

server.listen(process.env.PORT || 3001);