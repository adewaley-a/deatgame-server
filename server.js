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
        overHealth: { host: 0, guest: 0 },
        grenades: { host: 2, guest: 2 }
      };
    } else {
      rooms[roomId].guest = socket.id;
      io.in(roomId).emit('start_countdown');
    }
    socket.emit('assign_role', { role: socket.id === rooms[roomId].host ? 'host' : 'guest' });
  });

  socket.on('move', (d) => socket.to(d.roomId).emit('opp_move', { x: d.x, y: d.y, rot: d.rot }));
  socket.on('sync_box', (d) => socket.to(d.roomId).emit('box_move', { x: d.x, y: d.y }));
  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r) return;
    const attackerRole = victimRole === 'host' ? 'guest' : 'host';

    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] -= 10;
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - 10);
    } else if (target === 'box') {
      if (r.health[attackerRole] < 400) r.health[attackerRole] += 5;
      else r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
    }
    io.in(roomId).emit('update_game_state', r);
  });

  socket.on('toss_grenade', ({ roomId, x, y }) => {
    const r = rooms[roomId];
    if (!r) return;
    const role = socket.id === r.host ? 'host' : 'guest';
    const victimRole = role === 'host' ? 'guest' : 'host';
    if (r.grenades[role] > 0) {
      r.grenades[role] -= 1;
      r.health[victimRole] = Math.max(0, r.health[victimRole] - 50);
      io.in(roomId).emit('update_game_state', r);
    }
  });

  socket.on('disconnect', () => { /* Logic to clear rooms */ });
});

server.listen(process.env.PORT || 3001);