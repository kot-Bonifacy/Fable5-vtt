import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Server as SocketIOServer } from 'socket.io';
import type { ServerConfig } from './config.js';
import type { AppContext } from './context.js';
import { createPrisma, type PrismaClient } from './db.js';
import { AiGateway } from './ai/gateway.js';
import { TtsClient } from './ai/tts.js';
import { SESSION_COOKIE, resolveSessionUser } from './auth/sessions.js';
import { ensureGmUser } from './auth/seed.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerJoinRoutes } from './routes/join.js';
import { registerCampaignRoutes } from './routes/campaigns.js';
import { MAX_MAP_UPLOAD_BYTES, registerUploadRoutes } from './routes/uploads.js';
import { registerTtsRoutes } from './routes/tts.js';
import { setupRealtime } from './realtime/index.js';
import { loadStatusRegistry } from './statuses.js';
import { loadCompendium } from './compendium.js';
import { loadCpredRegistry } from './cpred.js';
import { loadCoverCatalogue } from './covers.js';
import { loadVoiceRegistry } from './voices.js';

export interface BuiltApp {
  app: FastifyInstance;
  io: SocketIOServer;
  prisma: PrismaClient;
}

export interface BuildAppOptions {
  logger?: boolean;
  /** Lets smoke tests stand in for the AI gateway without a running Python service. */
  aiFetch?: typeof fetch;
}

export async function buildApp(
  config: ServerConfig,
  options: BuildAppOptions = {},
): Promise<BuiltApp> {
  const prisma = createPrisma(config.databaseUrl);
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(fastifyCookie, { secret: config.cookieSecret });
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_MAP_UPLOAD_BYTES, files: 1 },
  });

  await mkdir(config.uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/uploads/',
  });
  // Committed public data: status icon SVGs, sample assets. Read-only.
  await app.register(fastifyStatic, {
    root: config.dataPublicDir,
    prefix: '/public/',
    decorateReply: false,
  });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('preHandler', async (request) => {
    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) return;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    const user = await resolveSessionUser(prisma, unsigned.value);
    if (user) {
      request.user = user;
      request.sessionId = unsigned.value;
    }
  });

  app.get('/health', () => ({ status: 'ok', uptime: process.uptime() }));

  const ai = new AiGateway({
    url: config.aiGatewayUrl,
    apiKey: config.aiGatewayApiKey,
    healthIntervalMs: config.aiHealthIntervalMs,
    requestTimeoutMs: config.aiRequestTimeoutMs,
    fetchImpl: options.aiFetch,
  });

  const tts = new TtsClient({
    url: config.aiGatewayUrl,
    apiKey: config.aiGatewayApiKey,
    cacheDir: join(config.uploadsDir, 'tts-cache'),
    timeoutMs: config.ttsTimeoutMs,
    maxCacheBytes: config.ttsCacheMaxBytes,
    ...(options.aiFetch ? { fetchImpl: options.aiFetch } : {}),
    log: app.log,
  });

  const ctx: AppContext = {
    config,
    prisma,
    statuses: await loadStatusRegistry(config.dataPublicDir, app.log),
    cpred: await loadCpredRegistry(config.dataPublicDir, config.dataPrivateDir, app.log),
    compendium: await loadCompendium(config.dataPublicDir, config.dataPrivateDir, app.log),
    covers: await loadCoverCatalogue(config.dataPublicDir, config.dataPrivateDir, app.log),
    ai,
    tts,
    voices: await loadVoiceRegistry(config.dataPublicDir, app.log),
  };
  registerAuthRoutes(app, ctx);
  registerJoinRoutes(app, ctx);
  registerCampaignRoutes(app, ctx);
  registerUploadRoutes(app, ctx);
  registerTtsRoutes(app, ctx);

  const io = new SocketIOServer(app.server, {
    cors: { origin: config.clientOrigin, credentials: true },
  });
  setupRealtime(io, app, ctx);
  ai.start();

  app.addHook('onClose', async () => {
    ai.stop();
    io.close();
    await prisma.$disconnect();
  });

  await ensureGmUser(prisma, config, app.log);

  return { app, io, prisma };
}
