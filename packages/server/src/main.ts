import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { createServerHello } from '@vtt/shared';
import { loadConfig } from './config.js';

const config = loadConfig();

const app = Fastify({ logger: true });

app.get('/health', () => ({ status: 'ok', uptime: process.uptime() }));

const io = new SocketIOServer(app.server, {
  cors: { origin: config.clientOrigin },
});

io.on('connection', (socket) => {
  app.log.info({ socketId: socket.id }, 'socket connected');
  socket.emit('server:hello', createServerHello());
  socket.on('disconnect', (reason) => {
    app.log.info({ socketId: socket.id, reason }, 'socket disconnected');
  });
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
