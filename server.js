const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const io = new Server(http.createServer(express()).listen(3001), { cors: { origin: "https://deatwin.netlify.app" } });

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join_game', ({ roomId }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { host: socket.id, guest: null, health: {[socket.id]: 400}, overHealth: {[socket.id]: 0}, entities: {[socket.id]: {boxHp: 200, shieldHp: 200}} };
    } else {
      rooms[roomId].guest = socket.id;
      rooms[roomId].health[socket.id] = 400;
      rooms[roomId].overHealth[socket.id] = 0;
      rooms[roomId].entities[socket.id] = {boxHp: 200, shieldHp: 200};
      io.in(roomId).emit('start_countdown');
    }
  });

  socket.on('damage_entity', ({ roomId, type, targetId }) => {
    const r = rooms[roomId]; if (!r) return;
    const victim = targetId === 'opponent' ? (socket.id === r.host ? r.guest : r.host) : socket.id;
    const attacker = socket.id;

    if (type === 'player') r.health[victim] -= 5;
    if (type === 'shield') r.entities[victim].shieldHp -= 5;
    if (type === 'box') {
      r.entities[victim].boxHp -= 5;
      if (r.health[attacker] < 400) r.health[attacker] += 5;
      else r.overHealth[attacker] = Math.min(200, r.overHealth[attacker] + 5);
    }
    io.in(roomId).emit('update_game_state', r);
  });

  socket.on('grenade_explosion', ({ roomId, x, y }) => {
    // Damage logic proportional to distance from x,y
    io.in(roomId).emit('update_game_state', rooms[roomId]);
  });

  socket.on('client_movement', (d) => socket.to(d.roomId).emit('sync_all', d));
  socket.on('fire', (d) => socket.to(d.roomId).emit('incoming_bullet', d));
  socket.on('launch_grenade', (d) => socket.to(d.roomId).emit('incoming_grenade', d));
});