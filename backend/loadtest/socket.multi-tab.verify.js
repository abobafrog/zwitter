const { io } = require('socket.io-client');

const urls = (process.env.LOAD_SOCKET_URLS || process.env.LOAD_SOCKET_URL || process.env.LOAD_BASE_URL || 'http://localhost:5000')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const token = process.env.LOAD_AUTH_TOKEN;
const chatId = process.env.LOAD_CHAT_ID;
const tabs = Number(process.env.LOAD_SOCKET_TABS || 3);

if (!token || !chatId) {
  console.error('LOAD_AUTH_TOKEN and LOAD_CHAT_ID are required');
  process.exit(1);
}

const sockets = [];
let connected = 0;
let messages = 0;
let typingEvents = 0;
let readEvents = 0;
let errors = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectTab = (index) => new Promise((resolve) => {
  const url = urls[index % urls.length];
  const socket = io(url, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
    timeout: 10000,
  });

  socket.on('connect', () => {
    connected += 1;
    socket.emit('chat:join', chatId);
    resolve(socket);
  });
  socket.on('message:new', () => { messages += 1; });
  socket.on('typing:start', () => { typingEvents += 1; });
  socket.on('messages:read', () => { readEvents += 1; });
  socket.on('connect_error', (error) => {
    errors += 1;
    console.error(`tab ${index} connect_error: ${error.message}`);
    resolve(socket);
  });
  socket.on('error', () => { errors += 1; });
  sockets.push(socket);
});

(async () => {
  await Promise.all(Array.from({ length: tabs }, (_, index) => connectTab(index)));
  await wait(1000);

  const sender = sockets.find((socket) => socket.connected);
  if (!sender) throw new Error('No connected sockets');

  sender.emit('typing:start', { chatId });
  sender.emit('messages:read', { chatId });
  sender.emit('message:send', { chatId, content: `multi-tab verify ${Date.now()}` });
  await wait(Number(process.env.LOAD_SOCKET_VERIFY_WAIT_MS || 5000));

  sockets.forEach((socket) => socket.disconnect());

  const result = { urls, tabs, connected, messages, typingEvents, readEvents, errors };
  console.log(JSON.stringify(result, null, 2));

  if (connected !== tabs || messages < 1 || errors > 0) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  sockets.forEach((socket) => socket.disconnect());
  process.exit(1);
});
