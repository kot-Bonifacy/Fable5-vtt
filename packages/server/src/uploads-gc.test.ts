import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { UPLOAD_GRACE_MS, referencedUploadUrls, sweepOrphanUploads } from './uploads-gc.js';

/**
 * Zbieracz osieroconych plików z `uploads/` (sesja naprawcza 22.08).
 *
 * Zaległość z etapu 24a, szersza niż jej opis: nikt nie sprzątał **żadnego**
 * z czterech katalogów — usunięcie handoutu, sceny, postaci czy tokenu kasowało
 * wiersz, a plik zostawał. Sprawdzane jest jedno zdanie i jego dwie granice:
 * plik ginie tylko wtedy, gdy nikt go nie wymienia, i tylko wtedy, gdy jest
 * starszy niż okno łaski — bo portret w kreatorze powstaje **przed** postacią.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const UPLOADS = mkdtempSync(join(tmpdir(), 'vtt-uploads-gc-'));

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigin: 'http://localhost:5173',
  databaseUrl: `file:${TEST_DB}`,
  gmName: 'MG',
  gmPassword: 'test-haslo',
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: UPLOADS,
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
};

let built: BuiltApp;
let campaignId: string;
let sceneId: string;

/** Kładzie plik i cofa mu datę modyfikacji, żeby wypadł z okna łaski. */
function putFile(directory: string, name: string, ageMs = UPLOAD_GRACE_MS * 2): string {
  const dir = join(UPLOADS, directory);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, 'x');
  const when = new Date(Date.now() - ageMs);
  utimesSync(path, when, when);
  return `/uploads/${directory}/${name}`;
}

function present(directory: string): string[] {
  try {
    return readdirSync(join(UPLOADS, directory)).sort();
  } catch {
    return [];
  }
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, sweepUploads: false });
  const campaign = await built.prisma.campaign.create({ data: { name: 'Sprzątanie' } });
  campaignId = campaign.id;
  const scene = await built.prisma.scene.create({
    data: { campaignId, name: 'Zaułek', backgroundUrl: putFile('maps', 'w-uzyciu.png') },
  });
  sceneId = scene.id;
}, 60_000);

afterAll(async () => {
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('referencedUploadUrls', () => {
  it('finds an address in a plain column and one buried in JSON', async () => {
    const portrait = putFile('portraits', 'szkic.png');
    const user = await built.prisma.user.findFirstOrThrow();
    await built.prisma.characterDraft.create({
      data: {
        campaign: { connect: { id: campaignId } },
        user: { connect: { id: user.id } },
        data: JSON.stringify({ name: 'Nowa', portraitUrl: portrait }),
      },
    });

    const urls = await referencedUploadUrls(built.prisma);
    expect(urls.has('/uploads/maps/w-uzyciu.png')).toBe(true);
    // Portret kreatora nie ma jeszcze postaci — żyje wyłącznie w JSON-ie szkicu.
    expect(urls.has(portrait)).toBe(true);
  });
});

describe('sweepOrphanUploads', () => {
  it('removes what nothing mentions and keeps what something does', async () => {
    putFile('handouts', 'sierota.png');
    putFile('tokens', 'sierota.png');
    const kept = putFile('tokens', 'zeton.png');
    await built.prisma.token.create({
      data: { sceneId, name: 'Zbir', x: 0, y: 0, imageUrl: kept },
    });

    const result = await sweepOrphanUploads(built.prisma, UPLOADS);
    expect(result.removed).toContain('/uploads/handouts/sierota.png');
    expect(result.removed).toContain('/uploads/tokens/sierota.png');
    expect(result.removed).not.toContain(kept);
    expect(present('tokens')).toEqual(['zeton.png']);
    expect(present('maps')).toEqual(['w-uzyciu.png']);
    expect(present('handouts')).toEqual([]);
  });

  it('spares a file too young to be an orphan — the upload may still be in flight', async () => {
    putFile('portraits', 'swiezy.png', 0);
    const result = await sweepOrphanUploads(built.prisma, UPLOADS);
    expect(result.removed).not.toContain('/uploads/portraits/swiezy.png');
    expect(result.spared).toBeGreaterThan(0);
    expect(present('portraits')).toContain('swiezy.png');
  });

  it('dry run counts the same files without touching the disk', async () => {
    putFile('maps', 'do-skasowania.png');
    const dry = await sweepOrphanUploads(built.prisma, UPLOADS, { dryRun: true });
    expect(dry.removed).toContain('/uploads/maps/do-skasowania.png');
    expect(present('maps')).toContain('do-skasowania.png');

    const wet = await sweepOrphanUploads(built.prisma, UPLOADS);
    expect(wet.removed).toEqual(dry.removed);
    expect(present('maps')).toEqual(['w-uzyciu.png']);
  });

  it('never looks outside the four directories it sweeps', async () => {
    mkdirSync(join(UPLOADS, 'prywatne'), { recursive: true });
    writeFileSync(join(UPLOADS, 'prywatne', 'nie-ruszaj.txt'), 'x');
    await sweepOrphanUploads(built.prisma, UPLOADS);
    expect(present('prywatne')).toEqual(['nie-ruszaj.txt']);
  });
});
