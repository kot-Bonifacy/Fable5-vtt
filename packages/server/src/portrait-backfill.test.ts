import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PORTRAIT_CROP } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { backfillPortraitAssets } from './portrait-backfill.js';

/**
 * Uzupełnienie puli o portrety sprzed 12.09.
 *
 * Powód jest praktyczny, nie porządkowy: karty grającej drużyny noszą pliki
 * wgrane trasą, która nie zakładała wiersza w bazie, a kadr na mapie mieszka
 * **przy wierszu puli**. Bez tego przejścia nowa funkcja nie działałaby
 * dokładnie dla tych postaci, które naprawdę stoją na mapie — a zadziałałaby
 * dla portretów wgranych od jutra.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const UPLOADS = mkdtempSync(join(tmpdir(), 'vtt-portrait-backfill-'));

/** Najmniejszy prawdziwy PNG: 1 × 1, żeby `image-size` miało co odczytać. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

function putPortrait(name: string): string {
  const dir = join(UPLOADS, 'portraits');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), PNG_1X1);
  return `/uploads/portraits/${name}`;
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, sweepUploads: false });
  const campaign = await built.prisma.campaign.create({ data: { name: 'Stara kampania' } });
  campaignId = campaign.id;
}, 60_000);

afterAll(async () => {
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('backfillPortraitAssets', () => {
  it('wciąga do puli portret karty i portret bota, z wymiarami z pliku', async () => {
    const onCard = putPortrait('karta.png');
    const onBot = putPortrait('bot.png');
    await built.prisma.character.create({
      data: { campaignId, name: 'Marcin', portraitUrl: onCard },
    });
    await built.prisma.botProfile.create({
      data: { campaignId, name: 'Barman', portraitUrl: onBot, data: '{}' },
    });

    expect(await backfillPortraitAssets(built.prisma, UPLOADS, built.app.log)).toBe(2);

    const assets = await built.prisma.portraitAsset.findMany({ where: { campaignId } });
    expect(assets.map((a) => a.url).sort()).toEqual([onBot, onCard].sort());
    // Wymiary muszą pochodzić z pliku — kadr liczy granice z boków obrazu,
    // więc wiersz ze zmyślonym rozmiarem byłby gorszy od jego braku.
    expect(assets.every((a) => a.width === 1 && a.height === 1)).toBe(true);
    // Kadr domyślny: figury nie wolno przesunąć przy okazji uzupełniania puli.
    for (const asset of assets) {
      expect({ x: asset.cropX, y: asset.cropY, zoom: asset.cropZoom }).toEqual(
        DEFAULT_PORTRAIT_CROP,
      );
    }
  });

  it('drugie przejście niczego nie dokłada', async () => {
    expect(await backfillPortraitAssets(built.prisma, UPLOADS, built.app.log)).toBe(0);
  });

  it('nie dubluje wiersza, gdy karta wybrała portret z puli', async () => {
    const fromPool = putPortrait('z-puli.png');
    await built.prisma.portraitAsset.create({
      data: { campaignId, name: 'Z puli', url: fromPool, width: 1, height: 1 },
    });
    await built.prisma.character.create({
      data: { campaignId, name: 'Tony', portraitUrl: fromPool },
    });

    expect(await backfillPortraitAssets(built.prisma, UPLOADS, built.app.log)).toBe(0);
    expect(await built.prisma.portraitAsset.count({ where: { campaignId, url: fromPool } })).toBe(
      1,
    );
  });

  it('pomija adresy spoza `uploads/portraits` i pliki, których nie ma', async () => {
    await built.prisma.character.create({
      data: { campaignId, name: 'Z grafiki', portraitUrl: '/public/art/ikona.png' },
    });
    await built.prisma.character.create({
      data: { campaignId, name: 'Bez pliku', portraitUrl: '/uploads/portraits/nie-ma-mnie.png' },
    });

    expect(await backfillPortraitAssets(built.prisma, UPLOADS, built.app.log)).toBe(0);
    expect(
      await built.prisma.portraitAsset.count({
        where: { campaignId, url: '/uploads/portraits/nie-ma-mnie.png' },
      }),
    ).toBe(0);
  });
});
