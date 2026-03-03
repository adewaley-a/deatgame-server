const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // Wildcard ensures no more "trailing slash" CORS errors
    origin: "https://deatwin.netlify.app", 
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join_game', ({ roomId }) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = { players: {}, health: { host: 400, guest: 400 } };

    const role = Object.keys(rooms[roomId].players).length === 0 ? 'host' : 'guest';
    rooms[roomId].players[socket.id] = { role };

    socket.emit('assign_role', { role });
    io.in(roomId).emit('update_health', rooms[roomId].health);
  });

  socket.on('move', (data) => {
    // Just pass the data to the opponent
    socket.to(data.roomId).emit('opp_move', { x: data.x, y: data.y });
  });

  socket.on('fire', (data) => {
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  socket.on('take_damage', ({ roomId, victimRole }) => {
    if (rooms[roomId]) {
      rooms[roomId].health[victimRole] = Math.max(0, rooms[roomId].health[victimRole] - 10);
      io.in(roomId).emit('update_health', rooms[roomId].health);
    }
  });

  socket.on('disconnect', () => {
    // Cleanup logic
  });
});

server.listen(process.env.PORT || 3001);