import { describe, expect, it } from 'vitest';
import { UPLOAD_URL_PATTERN, campaignUploadUrl, parseCampaignUploadUrl } from './uploads.js';

describe('adresy plików kampanii (etap 44b)', () => {
  it('rozkłada adres pliku kampanii na kampanię, katalog i plik', () => {
    const url = campaignUploadUrl('cmabc123', 'maps', 'Xy_-9.png');
    expect(url).toBe('/uploads/campaigns/cmabc123/maps/Xy_-9.png');
    expect(parseCampaignUploadUrl(url)).toEqual({
      campaignId: 'cmabc123',
      dir: 'maps',
      file: 'Xy_-9.png',
    });
  });

  it('nie rozpoznaje plików wspólnych, płaskich ani prób wyjścia z katalogu', () => {
    for (const url of [
      '/uploads/art/welcome-map.webp',
      '/uploads/maps/a.png',
      '/uploads/campaigns/c1/inne/a.png',
      '/uploads/campaigns/c1/maps/../a.png',
      '/uploads/campaigns/../maps/a.png',
      '/uploads/campaigns/c1/maps/a.png?x=1',
      42,
      null,
    ]) {
      expect(parseCampaignUploadUrl(url), String(url)).toBeNull();
    }
  });

  it('wzorzec wyszukuje w tekście adresy obu kształtów', () => {
    const text = JSON.stringify({
      a: '/uploads/campaigns/c1/portraits/p.webp',
      b: 'zob. /uploads/maps/stara.png i /uploads/art/welcome-map.webp',
    });
    expect([...text.matchAll(UPLOAD_URL_PATTERN)].map((m) => m[0])).toEqual([
      '/uploads/campaigns/c1/portraits/p.webp',
      '/uploads/maps/stara.png',
      '/uploads/art/welcome-map.webp',
    ]);
  });
});
