import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { uploadPathOfUrl } from './campaign-uploads.js';
import { loadSamplePortraits, seedPendingSamplePortraits } from './sample-portraits.js';

/**
 * Przykładowe portrety MG (21.11.2026): zestaw z `assets/sample-portraits`
 * trafia do puli nowej kampanii i raz do kampanii sprzed zestawu.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const UPLOADS = mkdtempSync(join(tmpdir(), 'vtt-sample-portraits-'));
const SAMPLES = resolve(import.meta.dirname, '../assets/sample-portraits');
const GM_PASSWORD = 'test-haslo';

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigin: 'http://localhost:5173',
  databaseUrl: `file:${TEST_DB}`,
  gmName: 'MG',
  gmPassword: GM_PASSWORD,
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: UPLOADS,
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  samplePortraitsDir: SAMPLES,
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
};

let built: BuiltApp;
let gmCookie: string;

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, sweepUploads: false });
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  const raw = res.headers['set-cookie'];
  gmCookie = (Array.isArray(raw) ? raw[0] : raw)!.split(';')[0]!;
}, 60_000);

afterAll(async () => {
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('przykładowe portrety', () => {
  it('zestaw w repo: 49 avatarów z numerami, 9 tylko dla MG', async () => {
    const samples = await loadSamplePortraits(SAMPLES);
    expect(samples).toHaveLength(49);
    expect(samples[0]).toMatchObject({ file: '01.webp', name: 'Avatar 01', gmOnly: true });
    expect(samples.filter((sample) => sample.gmOnly).map((sample) => sample.name)).toEqual([
      'Avatar 01',
      'Avatar 16',
      'Avatar 23',
      'Avatar 24',
      'Avatar 27',
      'Avatar 28',
      'Avatar 29',
      'Avatar 45',
      'Avatar 48',
    ]);
    for (const sample of samples) expect(existsSync(join(SAMPLES, sample.file))).toBe(true);
  });

  it('nowa kampania dostaje własne kopie w puli, od „Avatar 01” u góry galerii', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: gmCookie },
      payload: { name: 'Nowa' },
    });
    expect(res.statusCode).toBe(201);
    const campaignId = (res.json() as { id: string }).id;
    const pool = await built.prisma.portraitAsset.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
    expect(pool).toHaveLength(49);
    expect(pool[0]).toMatchObject({ name: 'Avatar 01', gmOnly: true });
    expect(pool[1]).toMatchObject({ name: 'Avatar 02', gmOnly: false });
    expect(pool.at(-1)!.name).toBe('Avatar 49');
    const first = pool[0]!;
    expect(first.url).toMatch(new RegExp(`^/uploads/campaigns/${campaignId}/portraits/`));
    expect(readFileSync(uploadPathOfUrl(UPLOADS, first.url)!)).toEqual(
      readFileSync(join(SAMPLES, '01.webp')),
    );
    const campaign = await built.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.samplePortraitsSeeded).toBe(true);
  });

  it('kampania sprzed zestawu dostaje go raz, pod portretami MG', async () => {
    const p = built.prisma;
    const old = await p.campaign.create({ data: { name: 'Stara' } });
    const own = await p.portraitAsset.create({
      data: {
        campaignId: old.id,
        name: 'Własny',
        url: `/uploads/campaigns/${old.id}/portraits/wlasny.webp`,
        width: 10,
        height: 10,
      },
    });
    const options = {
      uploadsDir: UPLOADS,
      samplesDir: SAMPLES,
      samples: await loadSamplePortraits(SAMPLES),
    };
    await seedPendingSamplePortraits(p, options, built.app.log);
    await seedPendingSamplePortraits(p, options, built.app.log);
    const pool = await p.portraitAsset.findMany({
      where: { campaignId: old.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(pool).toHaveLength(50);
    expect(pool[0]!.id).toBe(own.id);
    expect(pool[1]!.name).toBe('Avatar 01');
  });
});
