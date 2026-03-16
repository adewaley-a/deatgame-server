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
        gameStarted: false,
        health: { host: 650, guest: 650 }, 
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 },
        shieldHealth: { host: 350, guest: 350 },
        grenades: { host: 2, guest: 2 },
        lastHit: { host: 0, guest: 0 },
        positions: { host: {}, guest: {} }
      };
    } else {
      rooms[roomId].guest = socket.id;
      setTimeout(() => { if(rooms[roomId]) rooms[roomId].gameStarted = true; }, 3000);
      io.in(roomId).emit('start_countdown');
    }
    socket.emit('assign_role', { role: socket.id === rooms[roomId].host ? 'host' : 'guest' });
  });

  socket.on('move_all', (d) => {
    const r = rooms[d.roomId];
    if (r) r.positions[socket.id === r.host ? 'host' : 'guest'] = d;
    socket.to(d.roomId).emit('opp_move_all', d);
  });

  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId];
    if (!r || !r.gameStarted) return;
    
    const attackerRole = victimRole === 'host' ? 'guest' : 'host';
    r.lastHit[victimRole] = Date.now();

    if (target === 'player') {
        if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - 5);
        else r.health[victimRole] = Math.max(0, r.health[victimRole] - 5);
    } else if (target === 'shield') {
        r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - 5);
    } else if (target === 'box') {
        r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - 5);
        // Lifesteal logic: attacker heals
        if (r.health[attackerRole] < 650) {
            r.health[attackerRole] = Math.min(650, r.health[attackerRole] + 5);
        } else {
            r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
        }
    }

    // Pass IDs back so frontend knows exactly who won/lost
    io.in(roomId).emit('update_game_state', { 
        ...r, 
        attackerRole, 
        targetHit: target,
        hostId: r.host,
        guestId: r.guest
    });
  });
  
  // Clean up on disconnect
  socket.on('disconnect', () => {
    // Logic to clear rooms if needed
  });
});

server.listen(process.env.PORT || 3001);