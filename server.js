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
      rooms[roomId] = { 
        hostId: socket.id, // Explicitly track who is host
        guestId: null,
        health: { host: 400, guest: 400 } 
      };
      socket.emit('assign_role', { role: 'host' });
    } else if (!rooms[roomId].guestId) {
      rooms[roomId].guestId = socket.id;
      socket.emit('assign_role', { role: 'guest' });
    } else {
      // Third person joins as spectator or just gets 'guest'
      socket.emit('assign_role', { role: 'guest' });
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
    if (rooms[roomId]) {
      rooms[roomId].health[victimRole] = Math.max(0, rooms[roomId].health[victimRole] - 2);
      io.in(roomId).emit('update_health', rooms[roomId].health);
    }
  });

  socket.on('disconnect', () => {
    // Basic cleanup logic could go here
  });
});

server.listen(process.env.PORT || 3001);