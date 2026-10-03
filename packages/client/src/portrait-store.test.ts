import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortraitAssetView } from '@vtt/shared';

const apiGet = vi.fn<(url: string) => Promise<PortraitAssetView[]>>();
vi.mock('./api.js', () => ({ apiGet: (url: string) => apiGet(url) }));

const { usePortraitStore } = await import('./stores/portraitStore.js');

function asset(id: string, url: string, extra: Partial<PortraitAssetView> = {}): PortraitAssetView {
  return {
    id,
    name: id,
    url,
    width: 512,
    height: 512,
    crop: { x: 0.2, y: 0.3, zoom: 2 },
    bannerCrop: null,
    ...extra,
  };
}

/**
 * Portrety NPC (23.09) dochodzą do gracza, dopiero gdy coś je nosi. Figura NPC-a
 * z portretem, którego pula gracza jeszcze nie zna, ma dociągnąć pulę — inaczej
 * stanęłaby u gracza w kadrze domyślnym, a u MG w ustawionym.
 */
describe('portrait pool for a player', () => {
  beforeEach(() => {
    apiGet.mockReset();
    usePortraitStore.getState().reset();
  });

  it('refetches once for a portrait a figure wears but the pool does not know', async () => {
    apiGet.mockResolvedValueOnce([asset('a', '/uploads/campaigns/k1/portraits/a.webp')]);
    await usePortraitStore.getState().load();
    apiGet.mockResolvedValue([
      asset('a', '/uploads/campaigns/k1/portraits/a.webp'),
      asset('npc', '/uploads/campaigns/k1/portraits/npc.webp', { name: '', gmOnly: true }),
    ]);

    usePortraitStore
      .getState()
      .notice([
        '/uploads/campaigns/k1/portraits/npc.webp',
        null,
        '/uploads/campaigns/k1/tokens/x.png',
      ]);
    await vi.waitFor(() =>
      expect(
        usePortraitStore.getState().crops.has('/uploads/campaigns/k1/portraits/npc.webp'),
      ).toBe(true),
    );
    expect(apiGet).toHaveBeenCalledTimes(2);

    // Plik, którego serwer nie odda (stary upload bez wiersza), pyta tylko raz.
    usePortraitStore.getState().notice(['/uploads/campaigns/k1/portraits/stary.webp']);
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(3));
    usePortraitStore.getState().notice(['/uploads/campaigns/k1/portraits/stary.webp']);
    await Promise.resolve();
    expect(apiGet).toHaveBeenCalledTimes(3);
  });

  it('forgets a portrait the GM moved to the NPC portraits', async () => {
    apiGet.mockResolvedValueOnce([asset('a', '/uploads/campaigns/k1/portraits/a.webp')]);
    await usePortraitStore.getState().load();
    usePortraitStore.getState().applyRemove('a');
    expect(usePortraitStore.getState().assets).toEqual([]);
    expect(usePortraitStore.getState().crops.size).toBe(0);
  });
});
