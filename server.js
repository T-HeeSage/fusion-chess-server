const WebSocket = require('ws');
const http = require('http');

const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Fusion Chess Relay Server OK\n');
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});

const wss = new WebSocket.Server({ server: httpServer });

const rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

wss.on('connection', (socket) => {
    socket.roomCode = null;
    socket.isHost = false;

    socket.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            return;
        }

        if (msg.type === 'host') {
            const code = generateCode();
            rooms[code] = { host: socket, client: null };
            socket.roomCode = code;
            socket.isHost = true;
            socket.send(JSON.stringify({ type: 'code', code: code }));
            console.log('Room created: ' + code);
        }

        else if (msg.type === 'join') {
            const code = msg.code.toUpperCase();
            const room = rooms[code];
            if (!room) {
                socket.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
                return;
            }
            if (room.client) {
                socket.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                return;
            }
            room.client = socket;
            socket.roomCode = code;
            socket.isHost = false;
            socket.send(JSON.stringify({ type: 'joined', code: code }));
            room.host.send(JSON.stringify({ type: 'opponent_joined' }));
            console.log('Client joined room: ' + code);
        }

        else if (msg.type === 'move') {
            const room = rooms[socket.roomCode];
            if (!room) return;
            const opponent = socket.isHost ? room.client : room.host;
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify(msg));
            }
        }

        else if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
        }
    });

    socket.on('close', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            const room = rooms[socket.roomCode];
            const opponent = socket.isHost ? room.client : room.host;
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ type: 'opponent_disconnected' }));
            }
            delete rooms[socket.roomCode];
            console.log('Room closed: ' + socket.roomCode);
        }
    });
});

const SELF_URL = process.env.RENDER_EXTERNAL_URL || null;
if (SELF_URL) {
    setInterval(() => {
        http.get(SELF_URL, () => {
            console.log('Self-ping OK');
        }).on('error', () => {});
    }, 14 * 60 * 1000);
}