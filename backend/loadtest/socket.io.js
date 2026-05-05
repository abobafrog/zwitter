const { io } = require('socket.io-client');

const url = process.env.LOAD_SOCKET_URL || process.env.LOAD_BASE_URL || 'http://localhost:5000';
const token = process.env.LOAD_AUTH_TOKEN;
const chatId = process.env.LOAD_CHAT_ID;
const clients = Number(process.env.LOAD_SOCKET_CLIENTS || 100);
const durationMs = Number(process.env.LOAD_DURATION || 60) * 1000;

if (!token || !chatId) {
  console.error('LOAD_AUTH_TOKEN and LOAD_CHAT_ID are required for Socket.IO load test');
  process.exit(1);
}

let connected = 0;
let sent = 0;
let received = 0;
let errors = 0;
const sockets = [];

for (let i = 0; i < clients; i += 1) {
  const socket = io(url, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
    timeout: 10000,
  });

  socket.on('connect', () => {
    connected += 1;
    socket.emit('chat:join', chatId);
  });
  socket.on('message:new', () => { received += 1; });
  socket.on('connect_error', () => { errors += 1; });
  socket.on('error', () => { errors += 1; });
  sockets.push(socket);
}

const sendInterval = setInterval(() => {
  sockets.forEach((socket, index) => {
    if (!socket.connected) return;
    socket.emit('typing:start', { chatId });
    socket.emit('message:send', { chatId, content: `socket load ${index} ${Date.now()}` });
    sent += 1;
  });
}, Number(process.env.LOAD_SOCKET_SEND_INTERVAL_MS || 5000));

setTimeout(() => {
  clearInterval(sendInterval);
  sockets.forEach((socket) => socket.disconnect());
  console.log(JSON.stringify({ clients, connected, sent, received, errors }, null, 2));
  if (connected < clients * 0.95 || errors > sent * 0.01) process.exitCode = 1;
}, durationMs);
