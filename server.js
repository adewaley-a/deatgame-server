const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://deatwin.netlify.app", // Replace with your frontend URL later (e.g., https://your-site.vercel.app)
    methods: ["GET", "POST"]
  }
});

// Store room states: { roomId: { players: { id: {x, y, role, name} }, health: {host, guest} } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join_room', ({ roomId, playerName }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        players: {}, 
        health: { host: 100, guest: 100 } 
      };
    }

    const currentPlayers = Object.values(rooms[roomId].players);
    const role = currentPlayers.length === 0 ? 'host' : 'guest';
    
    // Check if room is full
    if (currentPlayers.length >= 2 && !rooms[roomId].players[socket.id]) {
        socket.emit('error', 'Room is full');
        return;
    }

    rooms[roomId].players[socket.id] = { 
        id: socket.id, 
        role, 
        name: playerName, 
        x: 200, 
        y: role === 'host' ? 600 : 100 
    };

    socket.emit('assign_role', { role });
    io.in(roomId).emit('update_players', rooms[roomId].players);
    socket.emit('update_health', rooms[roomId].health);
  });

  socket.on('move', (data) => {
    const { roomId, x, y } = data;
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      rooms[roomId].players[socket.id].x = x;
      rooms[roomId].players[socket.id].y = y;
      
      // Send to the other player in the room
      socket.to(roomId).emit('opponent_moved', { x, y });
    }
  });

  socket.on('fire', (data) => {
    // Broadcast bullet data (x, y, vy, owner)
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  socket.on('take_damage', ({ roomId, victimRole }) => {
    if (rooms[roomId]) {
      rooms[roomId].health[victimRole] = Math.max(0, rooms[roomId].health[victimRole] - 5);
      io.in(roomId).emit('update_health', rooms[roomId].health);
    }
  });

  socket.on('disconnect', () => {
    // Clean up rooms on disconnect
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId].players[socket.id];
        if (Object.keys(rooms[roomId].players).length === 0) {
          delete rooms[roomId];
        } else {
          io.in(roomId).emit('update_players', rooms[roomId].players);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game Server Running on Port ${PORT}`));