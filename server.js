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
        host: socket.id, 
        guest: null, 
        health: { host: 400, guest: 400 }, 
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

  socket.on('move', (d) => socket.to(d.roomId).emit('opp_move', d));
  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));
  socket.on('throw_grenade', (d) => socket.to(d.roomId).emit('incoming_grenade', d));
  
  socket.on('take_damage', ({ roomId, target, victimRole, amount = 5 }) => {
    const r = rooms[roomId];
    if (!r) return;
    
    const attacker = victimRole === 'host' ? 'guest' : 'host';
    let targetHit = null;

    // Use the dynamic 'amount' (default 5 for bullets, up to 70 for grenades)
    if (target === 'player') {
      r.health[victimRole] = Math.max(0, r.health[victimRole] - amount);
    } else if (target === 'box') {
      targetHit = 'box';
      r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - amount);
      // Lifesteal: Attacker heals half the damage dealt to a box, capped at 400 total HP
      const healAmount = Math.floor(amount / 2);
      r.health[attacker] = Math.min(400, r.health[attacker] + healAmount);
    } else if (target === 'shield') {
      r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - amount);
    }
    
    io.in(roomId).emit('update_game_state', { ...r, targetHit, attacker });
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].host === socket.id || rooms[rid].guest === socket.id) {
        delete rooms[rid];
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));