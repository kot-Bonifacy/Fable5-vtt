import { create } from 'zustand';
import type { PortraitAssetView, PortraitCrop } from '@vtt/shared';
import { DEFAULT_PORTRAIT_CROP } from '@vtt/shared';
import { apiGet } from '../api.js';

/**
 * Pula portretów kampanii u klienta (12.09).
 *
 * Do tej pory listę trzymał sam `PortraitPicker` w swoim stanie — i to
 * wystarczało, bo nikt poza nim jej nie potrzebował. Od 12.09 potrzebuje jej
 * **mapa**: kadr portretu jest cechą obrazka, więc figura pyta o niego po
 * adresie pliku, a nie po swoim właścicielu.
 *
 * Stąd `crops` — odwzorowanie adres → kadr, gotowe do podania rendererowi bez
 * przeszukiwania listy przy każdej klatce. Trzyma **wyłącznie** kadry inne niż
 * domyślny: figura, której nikt nie kadrował, ma zachowywać się dokładnie tak,
 * jak przed tą zmianą, a mapa rozpoznaje to po braku wpisu.
 *
 * Listę widzi każdy zalogowany (trasa jest wspólna dla stołu), więc ten sklep
 * ładuje się u gracza tak samo jak u MG.
 */
interface PortraitStoreState {
  assets: PortraitAssetView[];
  /** Adres pliku → kadr na mapie; bez wpisu = kadr domyślny. */
  crops: ReadonlyMap<string, PortraitCrop>;
  /** Czy lista była już raz pobrana — żeby nie odpytywać z każdego miejsca. */
  loaded: boolean;
  /** Który portret MG właśnie kadruje; `null` = okno zamknięte. */
  cropping: string | null;

  load: (force?: boolean) => Promise<void>;
  applyUpsert: (asset: PortraitAssetView) => void;
  applyDelete: (assetId: string) => void;
  openCrop: (assetId: string) => void;
  closeCrop: () => void;
}

function indexCrops(assets: PortraitAssetView[]): ReadonlyMap<string, PortraitCrop> {
  const map = new Map<string, PortraitCrop>();
  for (const asset of assets) {
    if (
      asset.crop.x === DEFAULT_PORTRAIT_CROP.x &&
      asset.crop.y === DEFAULT_PORTRAIT_CROP.y &&
      asset.crop.zoom === DEFAULT_PORTRAIT_CROP.zoom
    ) {
      continue;
    }
    map.set(asset.url, asset.crop);
  }
  return map;
}

/** Żeby dwa miejsca, które zamontowały się w tej samej klatce, nie pytały dwa razy. */
let inFlight: Promise<void> | null = null;

export const usePortraitStore = create<PortraitStoreState>((set, get) => ({
  assets: [],
  crops: new Map(),
  loaded: false,
  cropping: null,

  load: (force = false) => {
    if (!force && (get().loaded || inFlight)) return inFlight ?? Promise.resolve();
    const request = apiGet<PortraitAssetView[]>('/api/portrait-assets')
      .then((assets) => {
        set({ assets, crops: indexCrops(assets), loaded: true });
      })
      .catch(() => {
        // Pula bywa niedostępna (brak kampanii, chwilowy błąd) — mapa rysuje
        // wtedy kadr domyślny, czyli to, co rysowała zawsze.
        set({ loaded: true });
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = request;
    return request;
  },

  applyUpsert: (asset) =>
    set((state) => {
      const assets = state.assets.some((a) => a.id === asset.id)
        ? state.assets.map((a) => (a.id === asset.id ? asset : a))
        : [asset, ...state.assets];
      return { assets, crops: indexCrops(assets) };
    }),

  applyDelete: (assetId) =>
    set((state) => {
      const assets = state.assets.filter((a) => a.id !== assetId);
      // Kadr zostaje w indeksie umyślnie: zdjęcie portretu z puli znaczy „nie
      // proponuj tego dalej", a nie „odbierz komuś obrazek" — figura, która ten
      // plik nosi, ma dalej być ujęta tak, jak ją MG ustawił.
      return { assets, cropping: state.cropping === assetId ? null : state.cropping };
    }),

  openCrop: (assetId) => set({ cropping: assetId }),
  closeCrop: () => set({ cropping: null }),
}));
