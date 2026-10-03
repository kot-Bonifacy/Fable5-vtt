import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { localizeArchiveUploads, migrateFlatUploads } from './campaign-uploads.js';
import { sweepOrphanUploads } from './uploads-gc.js';

/**
 * Pliki kampanii (etap 44b): migracja płaskich katalogów sprzed 44b, import
 * pliku wymiany z innej kampanii i zbieracz sierot w katalogach kampanii.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const UPLOADS = mkdtempSync(join(tmpdir(), 'vtt-campaign-uploads-'));
const PNG = Buffer.from('obrazek');

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

function put(relative: string): void {
  const path = join(UPLOADS, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, PNG);
}
const onDisk = (relative: string) => existsSync(join(UPLOADS, relative));

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, sweepUploads: false });
}, 60_000);

afterAll(async () => {
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('migracja płaskich uploadów do katalogów kampanii', () => {
  it('przenosi pliki, przepisuje adresy w kolumnach i w JSON-ie, a wspólny plik kopiuje obu', async () => {
    const p = built.prisma;
    const a = await p.campaign.create({
      data: {
        name: 'A',
        music: JSON.stringify({ tracks: [{ id: 't', name: 'x', url: '/uploads/music/m.mp3' }] }),
      },
    });
    const b = await p.campaign.create({ data: { name: 'B' } });
    for (const file of [
      'maps/wspolna.png',
      'tokens/t.png',
      'portraits/p.webp',
      'handouts/h.png',
      'music/m.mp3',
      'art/welcome-map.webp',
    ]) {
      put(file);
    }

    const sceneA = await p.scene.create({
      data: { name: 'S', campaignId: a.id, backgroundUrl: '/uploads/maps/wspolna.png' },
    });
    const sceneB = await p.scene.create({
      data: { name: 'S', campaignId: b.id, backgroundUrl: '/uploads/maps/wspolna.png' },
    });
    const token = await p.token.create({
      data: { sceneId: sceneA.id, name: 'T', x: 0, y: 0, imageUrl: '/uploads/tokens/t.png' },
    });
    const character = await p.character.create({
      data: {
        name: 'C',
        campaignId: b.id,
        portraitUrl: '/uploads/portraits/p.webp',
        data: JSON.stringify({ note: 'portret: /uploads/portraits/p.webp' }),
      },
    });
    const handout = await p.handout.create({
      data: {
        campaignId: a.id,
        title: 'H',
        imageUrl: '/uploads/handouts/h.png',
        body: '[mapa](/uploads/maps/wspolna.png) i [powitanie](/uploads/art/welcome-map.webp)',
      },
    });

    const result = await migrateFlatUploads(p, UPLOADS, built.app.log);
    expect(result.rows).toBe(6);
    expect(result.files).toBe(5);

    const at = (campaign: string, rest: string) => `/uploads/campaigns/${campaign}/${rest}`;
    expect((await p.scene.findUniqueOrThrow({ where: { id: sceneA.id } })).backgroundUrl).toBe(
      at(a.id, 'maps/wspolna.png'),
    );
    expect((await p.scene.findUniqueOrThrow({ where: { id: sceneB.id } })).backgroundUrl).toBe(
      at(b.id, 'maps/wspolna.png'),
    );
    expect((await p.token.findUniqueOrThrow({ where: { id: token.id } })).imageUrl).toBe(
      at(a.id, 'tokens/t.png'),
    );
    const card = await p.character.findUniqueOrThrow({ where: { id: character.id } });
    expect(card.portraitUrl).toBe(at(b.id, 'portraits/p.webp'));
    expect(card.data).toContain(at(b.id, 'portraits/p.webp'));
    const sheet = await p.handout.findUniqueOrThrow({ where: { id: handout.id } });
    expect(sheet.imageUrl).toBe(at(a.id, 'handouts/h.png'));
    // Odnośnik do pliku wspólnego zostaje, jak był.
    expect(sheet.body).toBe(
      `[mapa](${at(a.id, 'maps/wspolna.png')}) i [powitanie](/uploads/art/welcome-map.webp)`,
    );
    expect((await p.campaign.findUniqueOrThrow({ where: { id: a.id } })).music).toContain(
      at(a.id, 'music/m.mp3'),
    );

    for (const file of [
      `campaigns/${a.id}/maps/wspolna.png`,
      `campaigns/${b.id}/maps/wspolna.png`,
      `campaigns/${a.id}/tokens/t.png`,
      `campaigns/${b.id}/portraits/p.webp`,
      `campaigns/${a.id}/handouts/h.png`,
      `campaigns/${a.id}/music/m.mp3`,
      'art/welcome-map.webp',
    ]) {
      expect(onDisk(file), file).toBe(true);
    }
    for (const file of ['maps/wspolna.png', 'tokens/t.png', 'portraits/p.webp']) {
      expect(onDisk(file), file).toBe(false);
    }
  });

  it('drugi przebieg niczego nie rusza', async () => {
    expect(await migrateFlatUploads(built.prisma, UPLOADS, built.app.log)).toEqual({
      rows: 0,
      files: 0,
    });
  });
});

describe('import pliku wymiany do innej kampanii', () => {
  it('kopiuje pliki kampanii, którą MG może czytać, a resztę zdejmuje', async () => {
    put('campaigns/moja/maps/m.png');
    put('campaigns/cudza/maps/c.png');
    put('maps/stara.png');
    const file = {
      payload: {
        scene: { backgroundUrl: '/uploads/campaigns/moja/maps/m.png' },
        tokens: [
          { imageUrl: '/uploads/campaigns/cudza/maps/c.png' },
          { imageUrl: '/uploads/campaigns/moja/maps/brak.png' },
          { imageUrl: '/uploads/maps/stara.png' },
          { imageUrl: '/uploads/art/welcome-map.webp' },
          { imageUrl: '/uploads/campaigns/cel/maps/juz-tu.png' },
        ],
        notes: 'zob. /uploads/campaigns/cudza/maps/c.png',
      },
    };
    const localized = (await localizeArchiveUploads(file, {
      uploadsDir: UPLOADS,
      campaignId: 'cel',
      canRead: async (id) => id === 'moja',
    })) as typeof file;

    expect(localized.payload.scene.backgroundUrl).toBe('/uploads/campaigns/cel/maps/m.png');
    expect(localized.payload.tokens.map((t) => t.imageUrl)).toEqual([
      null,
      null,
      '/uploads/campaigns/cel/maps/stara.png',
      '/uploads/art/welcome-map.webp',
      '/uploads/campaigns/cel/maps/juz-tu.png',
    ]);
    expect(localized.payload.notes).toBe('zob. ');
    expect(onDisk('campaigns/cel/maps/m.png')).toBe(true);
    expect(onDisk('campaigns/cel/maps/stara.png')).toBe(true);
    expect(onDisk('campaigns/cel/maps/c.png')).toBe(false);
  });
});

describe('zbieracz sierot w katalogach kampanii', () => {
  it('kasuje stary plik kampanii, którego nikt nie wymienia, a wymieniany zostawia', async () => {
    const campaign = await built.prisma.campaign.create({ data: { name: 'Sprzątana' } });
    const used = `campaigns/${campaign.id}/tokens/uzywany.png`;
    const orphan = `campaigns/${campaign.id}/tokens/sierota.png`;
    put(used);
    put(orphan);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const file of [used, orphan]) utimesSync(join(UPLOADS, file), old, old);
    await built.prisma.tokenAsset.create({
      data: {
        campaignId: campaign.id,
        name: 'U',
        url: `/uploads/${used}`,
        width: 1,
        height: 1,
      },
    });

    const result = await sweepOrphanUploads(built.prisma, UPLOADS, { dryRun: true });
    expect(result.removed).toContain(`/uploads/${orphan}`);
    expect(result.removed).not.toContain(`/uploads/${used}`);
    // Pliki wspólne leżą poza zasięgiem zbieracza.
    expect(result.removed.some((url) => url.startsWith('/uploads/art/'))).toBe(false);
  });
});
