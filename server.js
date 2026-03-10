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
        host: socket.id, guest: null, 
        health: { host: 400, guest: 400 }, 
        boxHealth: { host: 200, guest: 200 },
        shieldHealth: { host: 150, guest: 150 }
      };
      socket.emit('assign_role', { role: 'host' });
    } else if (!rooms[roomId].guest && socket.id !== rooms[roomId].host) {
      rooms[roomId].guest = socket.id;
      socket.emit('assign_role', { role: 'guest' });
    }
    io.in(roomId).emit('update_game_state', rooms[roomId]);
  });

  socket.on('move', (data) => socket.to(data.roomId).emit('opp_move', data));
  socket.on('fire', (data) => socket.to(data.roomId).emit('incoming_bullet', data));
  
  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r) return;
    const attacker = victimRole === 'host' ? 'guest' : 'host';

    if (target === 'player') r.health[victimRole] = Math.max(0, r.health[victimRole] - 10);
    else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - 5);
      r.health[attacker] = Math.min(400, r.health[attacker] + 5);
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - 8);
    }
    io.in(roomId).emit('update_game_state', r);
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) delete rooms[rid];
  });
});

server.listen(process.env.PORT || 3001);