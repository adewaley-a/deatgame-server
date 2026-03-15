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
        shieldHealth: { host: 200, guest: 200 },
        grenades: { host: 2, guest: 2 },
        positions: { host: {}, guest: {} }
      };
    } else {
      rooms[roomId].guest = socket.id;
      io.in(roomId).emit('start_countdown');
    }
    socket.emit('assign_role', { role: socket.id === rooms[roomId].host ? 'host' : 'guest' });
  });

  socket.on('move_all', (d) => {
    if (rooms[d.roomId]) rooms[d.roomId].positions[socket.id === rooms[d.roomId].host ? 'host' : 'guest'] = d;
    socket.to(d.roomId).emit('opp_move_all', d);
  });

  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));
  
  socket.on('launch_grenade', (d) => {
    const r = rooms[d.roomId];
    if (!r) return;
    const role = socket.id === r.host ? 'host' : 'guest';
    r.grenades[role]--;
    socket.to(d.roomId).emit('incoming_grenade', d);
    io.in(d.roomId).emit('update_game_state', r);
  });

  socket.on('grenade_burst', ({ roomId, x, y }) => {
    const r = rooms[roomId];
    if (!r) return;
    const victimRole = socket.id === r.host ? 'guest' : 'host';
    const oppPos = r.positions[victimRole];
    if (!oppPos) return;

    const targets = [
        { key: 'health', pos: oppPos.shooter },
        { key: 'shieldHealth', pos: oppPos.shield },
        { key: 'boxHealth', pos: oppPos.box }
    ];

    targets.forEach(t => {
        const dist = Math.hypot(x - t.pos.x, y - t.pos.y);
        if (dist < 120) {
            const dmg = Math.floor(70 * (1 - dist/120));
            if (t.key === 'health') {
                if (r.overHealth[victimRole] > 0) {
                    const diff = r.overHealth[victimRole] - dmg;
                    if (diff < 0) { r.overHealth[victimRole] = 0; r.health[victimRole] += diff; }
                    else r.overHealth[victimRole] = diff;
                } else r.health[victimRole] -= dmg;
            } else {
                r[t.key][victimRole] = Math.max(0, r[t.key][victimRole] - dmg);
            }
        }
    });
    io.in(roomId).emit('update_game_state', r);
  });

  socket.on('take_damage', ({ roomId, target, victimRole }) => {
    const r = rooms[roomId]; if (!r) return;
    const attackerRole = victimRole === 'host' ? 'guest' : 'host';
    if (target === 'player') {
        if (r.overHealth[victimRole] > 0) r.overHealth[victimRole] = Math.max(0, r.overHealth[victimRole] - 5);
        else r.health[victimRole] = Math.max(0, r.health[victimRole] - 5);
    } else if (target === 'shield') r.shieldHealth[victimRole] = Math.max(0, r.shieldHealth[victimRole] - 5);
    else if (target === 'box') {
        r.boxHealth[victimRole] = Math.max(0, r.boxHealth[victimRole] - 5);
        if (r.health[attackerRole] < 400) r.health[attackerRole] = Math.min(400, r.health[attackerRole] + 5);
        else r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
    }
    io.in(roomId).emit('update_game_state', { ...r, attacker: socket.id, targetHit: target });
  });
});

server.listen(process.env.PORT || 3001);