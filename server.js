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
        players: {}, 
        health: { host: 400, guest: 400 } 
      };
    }

    // Assign role based on who is already there
    const existingPlayers = Object.keys(rooms[roomId].players);
    const role = existingPlayers.length === 0 ? 'host' : 'guest';
    
    rooms[roomId].players[socket.id] = role;

    // Send the role back to ONLY this specific user
    socket.emit('assign_role', { role });
    
    // Send current health state to everyone
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
    // Optional: handle player leaving logic here
  });
});

server.listen(process.env.PORT || 3001);