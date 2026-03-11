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
        boxHealth: { host: 200, guest: 200 },
        shieldHealth: { host: 150, guest: 150 },
        grenades: { host: 2, guest: 2 }
      };
      socket.emit('assign_role', { role: 'host' });
    } else {
      rooms[roomId].guest = socket.id;
      socket.emit('assign_role', { role: 'guest' });
    }
    io.in(roomId).emit('update_game_state', rooms[roomId]);
  });

  socket.on('launch_grenade', (d) => {
    rooms[d.roomId].grenades[d.role]--;
    socket.to(d.roomId).emit('incoming_grenade', d);
  });

  socket.on('grenade_explode', ({ roomId, x, y }) => {
    const r = rooms[roomId];
    if (!r) return;
    // Simple radial damage check (can be expanded with positions)
    io.in(roomId).emit('update_game_state', r);
  });

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r) return;
    const attacker = victimRole === 'host' ? 'guest' : 'host';

    if (target === 'player') {
      if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] -= 5;
      else r.health[victimRole] = Math.max(0, r.health[victimRole] - 5);
    } else if (target === 'box') {
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - 5);
      if (r.health[attacker] < 400) r.health[attacker] += 5;
      else r.overHealth[attacker] = Math.min(200, r.overHealth[attacker] + 5);
    }
    io.in(roomId).emit('update_game_state', r);
  });
});

server.listen(process.env.PORT || 3001);