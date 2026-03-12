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
      // Trigger simultaneous countdown
      io.in(roomId).emit('start_countdown');
    }
    socket.emit('assign_role', { role: socket.id === rooms[roomId].host ? 'host' : 'guest' });
  });

  socket.on('move', (d) => socket.to(d.roomId).emit('opp_move', d));
  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r) return;
    const attackerRole = victimRole === 'host' ? 'guest' : 'host';

    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] -= 10;
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - 10);
    } else if (target === 'box') {
      // Heal Logic
      if (r.health[attackerRole] < 400) r.health[attackerRole] += 5;
      else r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
    }
    io.in(roomId).emit('update_game_state', { ...r, attacker: socket.id, targetHit: target });
  });

  socket.on('disconnect', () => { /* Room Cleanup */ });
});

server.listen(process.env.PORT || 3001);