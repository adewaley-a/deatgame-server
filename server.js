const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Update origin to your Netlify URL
const io = new Server(server, { 
  cors: { 
    origin: "https://deatwin.netlify.app",
    methods: ["GET", "POST"]
  } 
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_game', ({ roomId }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      // Initialize room for the Host
      rooms[roomId] = { 
        host: socket.id, 
        guest: null, 
        health: { host: 400, guest: 400 } 
      };
      socket.emit('assign_role', { role: 'host' });
    } else if (!rooms[roomId].guest) {
      // Initialize room for the Guest
      rooms[roomId].guest = socket.id;
      socket.emit('assign_role', { role: 'guest' });
    }

    // Broadcast initial health to everyone in the room
    io.in(roomId).emit('update_health', rooms[roomId].health);
  });

  // Relay movement and rotation
  socket.on('move', (data) => {
    socket.to(data.roomId).emit('opp_move', data);
  });

  // Relay bullet data (already mirrored by the sender)
  socket.on('fire', (data) => {
    socket.to(data.roomId).emit('incoming_bullet', data);
  });

  // Handle damage calculation
  socket.on('take_damage', ({ roomId, victimRole }) => {
    if (rooms[roomId]) {
      rooms[roomId].health[victimRole] = Math.max(0, rooms[roomId].health[victimRole] - 2);
      io.in(roomId).emit('update_health', rooms[roomId].health);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Logic to clean up rooms could be added here
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});