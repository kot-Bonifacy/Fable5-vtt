import { mkdir } from 'node:fs/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Server as SocketIOServer } from 'socket.io';
import { SHARED_UPLOADS_PREFIX, parseCampaignUploadUrl, withShopTiers } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import type { AppContext } from './context.js';
import { createPrisma, type PrismaClient } from './db.js';
import { AiGateway } from './ai/gateway.js';
import { AiAccess } from './ai/access.js';
import { SESSION_COOKIE, resolveSessionUser } from './auth/sessions.js';
import { TEMPORARY_PASSWORD_ROUTES } from './auth/guards.js';
import { ensureAdminUser, ensureGmUser } from './auth/seed.js';
import { backfillPortraitAssetsInBackground } from './portrait-backfill.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerJoinRoutes } from './routes/join.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAiAccessRoutes } from './routes/ai-access.js';
import { registerCampaignDeleteRoute, registerCampaignRoutes } from './routes/campaigns.js';
import { MAX_MAP_UPLOAD_BYTES, registerUploadRoutes } from './routes/uploads.js';
import { registerArchiveRoutes } from './routes/archive.js';
import { registerMusicRoutes } from './routes/music.js';
import { setupRealtime, type RealtimeHandle } from './realtime/index.js';
import { diceScriptPath } from './realtime/dice-script.js';
import { sweepUploadsInBackground } from './uploads-gc.js';
import { campaignUploadReadable, migrateFlatUploads } from './campaign-uploads.js';
import { MapPreviews } from './map-preview.js';
import { snapshotPathsFor, startSnapshotSchedule } from './snapshots.js';
import { CampaignCopies, campaignCopySettings } from './campaign-copies.js';
import { loadStatusRegistry } from './statuses.js';
import { loadCompendium } from './compendium.js';
import { loadShopRules } from './shop-rules.js';
import { loadCpredRegistry } from './cpred.js';
import { loadCoverCatalogue } from './covers.js';
import { LoginAttemptLimiter, REGISTRATION_WINDOW_MS, REGISTRATIONS_MAX } from './rate-limit.js';

export interface BuiltApp {
  app: FastifyInstance;
  io: SocketIOServer;
  prisma: PrismaClient;
  /** Gniazda i zegar sesji (44c) — testy obracają zegar sami (`sweepSessions`). */
  realtime: RealtimeHandle;
}

export interface BuildAppOptions {
  logger?: boolean;
  /** Lets smoke tests stand in for the AI gateway without a running Python service. */
  aiFetch?: typeof fetch;
  /**
   * Przebieg zbieracza osieroconych plików przy starcie (domyślnie tak).
   * Wyłączany w teście samego zbieracza — inaczej ten w tle sprząta pliki,
   * które test dopiero kładzie.
   */
  sweepUploads?: boolean;
  /** Zegar sesji (etap 44c) — test progów bezczynności podaje sztuczny. */
  clock?: () => number;
}

export async function buildApp(
  config: ServerConfig,
  options: BuildAppOptions = {},
): Promise<BuiltApp> {
  const prisma = createPrisma(config.databaseUrl);
  // `trustProxy` tylko za zaufanym pośrednikiem (Caddy, etap 28): bez niego
  // `request.ip` to adres Caddy'ego i limit logowania liczyłby wszystkich razem.
  const app = Fastify({ logger: options.logger ?? true, trustProxy: config.trustProxy ?? false });
  // Skrypt kości E2E (`dice-script.ts`) ma być widoczny w logu — a w produkcji martwy.
  if (process.env.VTT_DICE_SCRIPT) {
    const script = diceScriptPath();
    app.log.warn(
      script
        ? `VTT_DICE_SCRIPT: dice are forced from ${script} (E2E only)`
        : 'VTT_DICE_SCRIPT is ignored in production',
    );
  }

  await app.register(fastifyCookie, { secret: config.cookieSecret });
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // Sesja rozpoznawana już w `onRequest`, a nie w `preHandler`: od 01.10 (#10, Z7)
  // pliki `/uploads/` wymagają zalogowania, a trasę statyczną obsługuje wtyczka
  // zarejestrowana niżej — zaczep musi stać przed nią, żeby ją objąć.
  app.addHook('onRequest', async (request) => {
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

  /**
   * Hasło tymczasowe (etap 53): dopóki konto go nie zmieni, dostaje tylko
   * `TEMPORARY_PASSWORD_ROUTES`. Trasa, a nie surowy adres — jak strażnik plików.
   */
  app.addHook('onRequest', async (request, reply) => {
    if (!request.user?.mustChangePassword) return;
    const route = request.routeOptions.url ?? '';
    if (TEMPORARY_PASSWORD_ROUTES.has(route)) return;
    if (!route.startsWith('/api/') && !route.startsWith('/uploads/')) return;
    return reply.code(403).send({ error: 'PASSWORD_CHANGE_REQUIRED' });
  });

  /**
   * Mapy, portrety, żetony i handouty tylko dla zalogowanych (#10 / Z7, decyzja
   * MG z 01.10), a od etapu 44b — tylko dla MG tej kampanii i jej graczy, przy
   * handoucie: tylko dla tych, którym go udostępniono. Kampania stoi w ścieżce
   * (`/uploads/campaigns/<id>/…`), więc decyzja nie szuka adresu w bazie.
   * Przeglądarka wysyła ciasteczko sesji do obrazków i `fetch` Pixi z tego
   * samego pochodzenia, więc stół niczego nie zauważa. Obcy plik daje 404 jak
   * nieistniejący — odmowa nie zdradza, że coś pod adresem leży.
   */
  app.addHook('onRequest', async (request, reply) => {
    // Trasa, a nie surowy adres: `/%75ploads/…` trafia w tę samą trasę statyczną.
    const route = request.routeOptions.url ?? '';
    if (!route.startsWith('/uploads/') && !request.url.startsWith('/uploads/')) return;
    if (!request.user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://vtt').pathname);
    } catch {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    if (path.startsWith(SHARED_UPLOADS_PREFIX) && !path.includes('..')) return;
    const ref = parseCampaignUploadUrl(path);
    if (!ref || !(await campaignUploadReadable(prisma, request.user, ref, path))) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  });

  /**
   * Podgląd mapy (`mapPreviewUrl`, 20.10) — po strażniku wyżej, więc dostaje go
   * tylko ten, kto może czytać sam plik. Gracz na słabym łączu widzi od razu
   * mapę sceny w małej rozdzielczości, a pełny plik dochodzi pod nią.
   */
  const previews = new MapPreviews(config.uploadsDir);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/uploads/') || !request.url.includes('?')) return;
    const url = new URL(request.url, 'http://vtt');
    if (!url.searchParams.has('preview')) return;
    const preview = await previews.get(decodeURIComponent(url.pathname));
    if (!preview) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'private, max-age=86400')
      .send(preview);
  });

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

  app.get('/health', () => ({ status: 'ok', uptime: process.uptime() }));

  const gateway = new AiGateway({
    url: config.aiGatewayUrl,
    apiKey: config.aiGatewayApiKey,
    healthIntervalMs: config.aiHealthIntervalMs,
    requestTimeoutMs: config.aiRequestTimeoutMs,
    fetchImpl: options.aiFetch,
  });
  const ai = new AiAccess(prisma, gateway, {
    ownerGraceMs: config.aiOwnerGraceMs ?? 120_000,
    requestTimeoutMs: config.aiRequestTimeoutMs,
  });

  const shopRules = await loadShopRules(config.dataPublicDir, config.dataPrivateDir, app.log);
  const copySettings = campaignCopySettings(config);
  const ctx: AppContext = {
    config,
    prisma,
    statuses: await loadStatusRegistry(config.dataPublicDir, app.log),
    cpred: await loadCpredRegistry(config.dataPublicDir, config.dataPrivateDir, app.log),
    compendium: withShopTiers(
      await loadCompendium(config.dataPublicDir, config.dataPrivateDir, app.log),
      shopRules.tiers,
    ),
    shopRules,
    covers: await loadCoverCatalogue(config.dataPublicDir, config.dataPrivateDir, app.log),
    ai,
    // Kopie kampanii (57b) — przy starcie i końcu sesji oraz co godzinę.
    ...(copySettings ? { copies: new CampaignCopies(prisma, copySettings, app.log) } : {}),
    ...(config.rateLimits
      ? {
          loginLimiter: new LoginAttemptLimiter(),
          registrationLimiter: new LoginAttemptLimiter(REGISTRATIONS_MAX, REGISTRATION_WINDOW_MS),
        }
      : {}),
  };
  // Gniazda przed trasami: wylogowanie rozłącza gniazda swojej sesji (#11).
  const io = new SocketIOServer(app.server, {
    cors: { origin: config.clientOrigin, credentials: true },
  });
  registerAuthRoutes(app, ctx, io);
  registerAiAccessRoutes(app, ctx, io);
  const late: { deps?: RealtimeHandle['deps'] } = {};
  registerJoinRoutes(app, ctx, () => late.deps);
  registerCampaignRoutes(app, ctx);
  registerUploadRoutes(app, ctx);

  const realtime = setupRealtime(io, app, ctx, options.clock);
  late.deps = realtime.deps;
  // Panel administratora (etap 53) kończy sesje tą samą drogą co MG — potrzebuje gniazd.
  registerAdminRoutes(app, ctx, realtime.deps);
  // Wczytanie pliku wymiany (57a) rozgłasza nową kartę i listę scen.
  registerArchiveRoutes(app, ctx, realtime.deps);
  // „Usuń kampanię” (57b) wylogowuje gniazda jej graczy.
  registerCampaignDeleteRoute(app, ctx, realtime.deps);
  registerMusicRoutes(app, ctx, io);
  gateway.start();

  // Kopie zapasowe (etap 33): jedna przy starcie, potem co godzinę. Brak
  // sekcji `backups` w konfiguracji znaczy „ten proces kopii nie robi" — tak
  // stoją testy dymne.
  const backupPaths = snapshotPathsFor(config);
  const stopSnapshots =
    backupPaths && config.backups
      ? startSnapshotSchedule(
          backupPaths,
          { keepHourly: config.backups.keepHourly, keepDaily: config.backups.keepDaily },
          config.backups.intervalMinutes * 60_000,
          app.log,
        )
      : () => undefined;

  app.addHook('onClose', async () => {
    stopSnapshots();
    ai.stop();
    gateway.stop();
    io.close();
    await prisma.$disconnect();
  });

  await ensureGmUser(prisma, config, app.log);
  await ensureAdminUser(prisma, config, app.log);
  // Kampanie, sesje i zgody do bramy AI (44d) — po fladze właściciela, przed
  // pierwszym żądaniem.
  await ai.refresh();
  // Płaskie `uploads/<katalog>/` sprzed 44b do katalogów kampanii — przed
  // pierwszym żądaniem, bo strażnik płaskich adresów już nie wydaje.
  await migrateFlatUploads(prisma, config.uploadsDir, app.log);
  // Pliki, których nikt już nie wymienia (sesja naprawcza 22.08). W tle i po
  // cichu: nic tu nie jest pilne, a start stołu nie ma na co czekać.
  if (options.sweepUploads !== false) {
    sweepUploadsInBackground(prisma, config.uploadsDir, app.log);
    // Tym samym wejściem i z tego samego powodu: portrety wgrane przed 12.09
    // trasą bez wiersza w bazie trafiają do puli, żeby dało się je kadrować.
    backfillPortraitAssetsInBackground(prisma, config.uploadsDir, app.log);
  }

  return { app, io, prisma, realtime };
}
