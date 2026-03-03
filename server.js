const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "https://deatwin.netlify.app/" } });

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) rooms[roomId] = [];
        const role = rooms[roomId].length === 0 ? 'host' : 'guest';
        rooms[roomId].push(socket.id);
        socket.emit('role', role);
    });

    socket.on('move', (data) => {
        // Broadcast the raw X/Y to the opponent
        socket.to(data.roomId).emit('opp_move', { x: data.x, y: data.y });
    });

    socket.on('shoot', (data) => {
        // Broadcast bullet data to the opponent
        socket.to(data.roomId).emit('opp_shoot', data);
    });
});

server.listen(process.env.PORT || 3001);