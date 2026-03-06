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
      // First person joins
      rooms[roomId] = { 
        host: socket.id, 
        guest: null, 
        health: { host: 400, guest: 400 } 
      };
      socket.emit('assign_role', { role: 'host' });
    } else if (!rooms[roomId].guest) {
      // Second person joins
      rooms[roomId].guest = socket.id;
      socket.emit('assign_role', { role: 'guest' });
    } else {
      // Already full
      socket.emit('assign_role', { role: 'spectator' });
    }

    io.in(roomId).emit('update_health', rooms[roomId].health);
  });

  socket.on('move', (data) => {
    socket.to(data.roomId).emit('opp_move', data);
  });

  socket.on('fire', (data) => {
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  socket.on('take_damage', ({ roomId, victimRole }) => {
    if (rooms[roomId] && rooms[roomId].health[victimRole] !== undefined) {
      rooms[roomId].health[victimRole] = Math.max(0, rooms[roomId].health[victimRole] - 2);
      io.in(roomId).emit('update_health', rooms[roomId].health);
    }
  });

  socket.on('disconnecting', () => {
    // Basic cleanup when a player leaves
    for (const roomId of socket.rooms) {
      if (rooms[roomId]) {
        if (rooms[roomId].host === socket.id) rooms[roomId].host = null;
        if (rooms[roomId].guest === socket.id) rooms[roomId].guest = null;
      }
    }
  });
});

server.listen(process.env.PORT || 3001);