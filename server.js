const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "https://deatwin.netlify.app" } });

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join_game', ({ roomId }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        host: socket.id, guest: null, 
        health: { [socket.id]: 400 },
        entities: { [socket.id]: { boxHp: 200, shieldHp: 200 } }
      };
    } else {
      rooms[roomId].guest = socket.id;
      rooms[roomId].health[socket.id] = 400;
      rooms[roomId].entities[socket.id] = { boxHp: 200, shieldHp: 200 };
      io.in(roomId).emit('start_countdown');
    }
    socket.emit('assign_role', { role: socket.id === rooms[roomId].host ? 'host' : 'guest' });
  });

  socket.on('client_movement', (data) => {
    socket.to(data.roomId).emit('sync_all', data);
  });

  socket.on('damage_entity', ({ roomId, type, targetId }) => {
    const r = rooms[roomId];
    if (!r) return;
    const victimId = targetId === 'opponent' ? (socket.id === r.host ? r.guest : r.host) : socket.id;
    
    if (type === 'player') r.health[victimId] -= 5;
    else if (type === 'box') r.entities[victimId].boxHp -= 5;
    else if (type === 'shield') r.entities[victimId].shieldHp -= 5;

    io.in(roomId).emit('update_game_state', r);
  });

  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));
});

server.listen(3001);