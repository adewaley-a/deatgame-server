const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// W and H are the logical game space dimensions
const W = 400;
const H = 700;

const io = new Server(server, {
  cors: {
    origin: "https://deatwin.netlify.app", // Use "*" for testing; update to your frontend URL later
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  socket.on('join_game', ({ roomId, playerName }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      // Create room with default health from your sketch
      rooms[roomId] = { players: {}, health: { host: 400, guest: 400 } };
    }

    const currentPlayers = Object.keys(rooms[roomId].players);
    if (currentPlayers.length >= 2) {
      socket.emit('error_message', 'Room is full');
      return;
    }

    const role = currentPlayers.length === 0 ? 'host' : 'guest';
    
    // Default starting positions based on the sketch
    const startingY = role === 'host' ? H - 100 : 100;

    rooms[roomId].players[socket.id] = { id: socket.id, role, name: playerName, x: 200, y: startingY };

    socket.emit('assign_role', { role });
    io.in(roomId).emit('update_players', rooms[roomId].players);
    io.in(roomId).emit('update_health', rooms[roomId].health);
  });

  socket.on('move', (data) => {
    const { roomId, x, y, role } = data;
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      rooms[roomId].players[socket.id].x = x;
      rooms[roomId].players[socket.id].y = y;
      
      // CRUCIAL MIRRORING: If Player A moves to X=100, Y=600,
      // the server sends Player B (at X=300, Y=100)
      // to the same position, which looks correct as the "Enemy".
      socket.to(roomId).emit('opp_move', { 
        x: W - x, 
        y: H - y, 
        role: role 
      });
    }
  });

  socket.on('fire', (bullet) => {
    // Broadcast bullet directly (mirrored) to opponent half
    socket.to(bullet.roomId).emit('incoming_bullet', {
      x: W - bullet.x,
      y: H - bullet.y,
      vy: bullet.vy, // Server will already have flipped the bullet's direction
      owner: bullet.owner
    });
  });

  socket.on('take_damage', ({ roomId, victimRole }) => {
    if (rooms[roomId]) {
      rooms[roomId].health[victimRole] = Math.max(0, rooms[roomId].health[victimRole] - 10);
      io.in(roomId).emit('update_health', rooms[roomId].health);
    }
  });

  socket.on('disconnect', () => {
    console.log('User Disconnected');
    // Simple cleanup
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
server.listen(PORT, () => console.log(`Real-Time Game Server on Port ${PORT}`));