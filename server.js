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
      rooms[roomId] = { players: {}, health: { host: 400, guest: 400 } };
    }

    // Role Assignment Logic
    const clients = io.sockets.adapter.rooms.get(roomId);
    const numPlayers = clients ? clients.size : 0;
    
    // First person is host, everyone else is guest
    const role = numPlayers === 1 ? 'host' : 'guest';
    
    rooms[roomId].players[socket.id] = role;
    socket.emit('assign_role', { role });
    
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

  socket.on('disconnect', () => {});
});

server.listen(process.env.PORT || 3001);