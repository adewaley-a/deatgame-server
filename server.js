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
        host: socket.id, guest: null, gameStarted: false,
        health: { host: 650, guest: 650 }, 
        overHealth: { host: 0, guest: 0 },
        boxHealth: { host: 300, guest: 300 },
        shieldHealth: { host: 350, guest: 350 },
        grenades: { host: 2, guest: 2 },
        lastHit: { host: 0, guest: 0 },
        positions: { host: {shooter:{x:0,y:0},shield:{x:0,y:0},box:{x:0,y:0}}, guest: {shooter:{x:0,y:0},shield:{x:0,y:0},box:{x:0,y:0}} }
      };
    } else {
      rooms[roomId].guest = socket.id;
      setTimeout(() => { 
        if(rooms[roomId]) rooms[roomId].gameStarted = true;
      }, 3000); // 3s delay before damage starts
      io.in(roomId).emit('start_countdown');
    }
    socket.emit('assign_role', { role: socket.id === rooms[roomId].host ? 'host' : 'guest' });
  });

  // Shield Regen Logic (Every second)
  setInterval(() => {
    Object.keys(rooms).forEach(id => {
        const r = rooms[id];
        const now = Date.now();
        ['host', 'guest'].forEach(role => {
            if (now - r.lastHit[role] > 5000 && r.shieldHealth[role] < 350 && r.shieldHealth[role] > 0) {
                r.shieldHealth[role] = Math.min(350, r.shieldHealth[role] + 5);
                io.in(id).emit('update_game_state', r);
            }
        });
    });
  }, 1000);

  socket.on('move_all', (d) => {
    const r = rooms[d.roomId];
    if (r) r.positions[socket.id === r.host ? 'host' : 'guest'] = d;
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
    if (!r || !r.gameStarted) return;
    
    ['host', 'guest'].forEach(targetRole => {
        const p = r.positions[targetRole];
        const units = [
            { key: 'health', pos: p.shooter, max: 650 },
            { key: 'shieldHealth', pos: p.shield, max: 350 },
            { key: 'boxHealth', pos: p.box, max: 300 }
        ];

        units.forEach(u => {
            const dist = Math.hypot(x - u.pos.x, y - u.pos.y);
            if (dist < 130) {
                const dmg = Math.floor(100 * (1 - dist/130));
                r.lastHit[targetRole] = Date.now();
                if (u.key === 'health') {
                    if (r.overHealth[targetRole] > 0) {
                        r.overHealth[targetRole] -= dmg;
                        if (r.overHealth[targetRole] < 0) { 
                            r.health[targetRole] += r.overHealth[targetRole]; 
                            r.overHealth[targetRole] = 0; 
                        }
                    } else r.health[targetRole] = Math.max(0, r.health[targetRole] - dmg);
                } else r[u.key][targetRole] = Math.max(0, r[u.key][targetRole] - dmg);
            }
        });
    });
    io.in(roomId).emit('update_game_state', r);
  });

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
        if (r.health[attackerRole] < 650) r.health[attackerRole] = Math.min(650, r.health[attackerRole] + 5);
        else r.overHealth[attackerRole] = Math.min(200, r.overHealth[attackerRole] + 5);
    }
    io.in(roomId).emit('update_game_state', { ...r, attackerRole, targetHit: target });
  });
});

server.listen(process.env.PORT || 3001);