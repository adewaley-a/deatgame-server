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
        bonusHp: { host: 0, guest: 0 },
        grenades: { host: 2, guest: 2 },
        boxHealth: { host: 200, guest: 200 },
        shieldHealth: { host: 150, guest: 150 }
      };
      socket.emit('assign_role', { role: 'host' });
    } else {
      rooms[roomId].guest = socket.id;
      socket.emit('assign_role', { role: 'guest' });
    }
    io.in(roomId).emit('update_game_state', rooms[roomId]);
  });

  socket.on('launch_grenade', (d) => {
    const r = rooms[d.roomId];
    if (!r) return;
    const role = r.host === socket.id ? 'host' : 'guest';
    if(r.grenades[role] > 0) {
      r.grenades[role]--;
      socket.to(d.roomId).emit('incoming_grenade', d);
      io.in(d.roomId).emit('update_game_state', r);
    }
  });

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r) return;
    const attacker = victimRole === 'host' ? 'guest' : 'host';

    if (target === 'player') {
      if (r.bonusHp[victimRole] > 0) r.bonusHp[victimRole] = Math.max(0, r.bonusHp[victimRole] - 5);
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - 5);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - 5);
      if (r.health[attacker] >= 400) r.bonusHp[attacker] = Math.min(100, r.bonusHp[attacker] + 5);
      else r.health[attacker] = Math.min(400, r.health[attacker] + 5);
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - 5);
    }
    io.in(roomId).emit('update_game_state', r);
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) delete rooms[rid];
  });
});

server.listen(process.env.PORT || 3001);