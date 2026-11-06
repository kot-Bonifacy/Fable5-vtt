/**
 * Pojazd jako bryła (etap 65a) — to, co wie o nim rdzeń VTT.
 *
 * Rdzeń zna wyłącznie kształt: nazwę, grafikę, rozmiar w kratkach i układ
 * foteli. Liczby systemu (CP RED: PUK, Ruch, ulepszenia) jadą w `system` jako
 * JSON, tak jak `Character.data` — czyta je `shared/systems/cpred/vehicles.ts`.
 * Pojazd jest osobnym wierszem bazy, nie polem karty: dzielą go pasażerowie,
 * niszczy go scena i może należeć do NPC-a (`ownerCharacterId: null`).
 */

/** Bryła rysowana „pod stołem” — przodem do góry, figury normalnej wielkości na fotelach. */
export const VEHICLE_BODIES = ['bike', 'car', 'van'] as const;
export type VehicleBody = (typeof VEHICLE_BODIES)[number];

/** Domyślne rozmiary brył w kratkach (szerokość × długość) — decyzja MG 5 z 30.10. */
export const VEHICLE_BODY_SIZES: Record<VehicleBody, { widthSq: number; lengthSq: number }> = {
  bike: { widthSq: 2, lengthSq: 3 },
  car: { widthSq: 3, lengthSq: 5 },
  van: { widthSq: 3, lengthSq: 7 },
};

export const VEHICLE_SIZE_MIN = 1;
export const VEHICLE_SIZE_MAX = 12;
export const VEHICLE_NAME_MAX = 80;

/**
 * Fotel jako punkt w ułamkach bryły: `x` w poprzek (0 lewa burta, 1 prawa),
 * `y` wzdłuż (0 przód, 1 tył). Ułamki, nie kratki — ten sam układ pasuje
 * do kompaktu 3×5 i do bryły powiększonej przez MG.
 */
export interface VehicleSeatPoint {
  x: number;
  y: number;
  driver?: true;
}

export const VEHICLE_LAYOUT_IDS = ['bike-2', 'car-2', 'car-4', 'car-6', 'van-8'] as const;
export type VehicleLayoutId = (typeof VEHICLE_LAYOUT_IDS)[number];

/** Kierowca zawsze na pierwszym miejscu listy — numer fotela 0. */
export const VEHICLE_LAYOUTS: Record<VehicleLayoutId, readonly VehicleSeatPoint[]> = {
  'bike-2': [
    { x: 0.5, y: 0.35, driver: true },
    { x: 0.5, y: 0.68 },
  ],
  'car-2': [
    { x: 0.3, y: 0.42, driver: true },
    { x: 0.7, y: 0.42 },
  ],
  'car-4': [
    { x: 0.3, y: 0.38, driver: true },
    { x: 0.7, y: 0.38 },
    { x: 0.3, y: 0.66 },
    { x: 0.7, y: 0.66 },
  ],
  'car-6': [
    { x: 0.3, y: 0.3, driver: true },
    { x: 0.7, y: 0.3 },
    { x: 0.3, y: 0.52 },
    { x: 0.7, y: 0.52 },
    { x: 0.3, y: 0.74 },
    { x: 0.7, y: 0.74 },
  ],
  'van-8': [
    { x: 0.3, y: 0.18, driver: true },
    { x: 0.7, y: 0.18 },
    { x: 0.3, y: 0.4 },
    { x: 0.7, y: 0.4 },
    { x: 0.3, y: 0.62 },
    { x: 0.7, y: 0.62 },
    { x: 0.3, y: 0.84 },
    { x: 0.7, y: 0.84 },
  ],
};

export const VEHICLE_LAYOUT_LABELS: Record<VehicleLayoutId, string> = {
  'bike-2': 'Motocykl — tandem (2)',
  'car-2': 'Auto — dwa fotele',
  'car-4': 'Auto — 2 + 2',
  'car-6': 'Auto — trzy rzędy (6)',
  'van-8': 'Furgon — cztery rzędy (8)',
};

export function isVehicleLayoutId(value: unknown): value is VehicleLayoutId {
  return (VEHICLE_LAYOUT_IDS as readonly unknown[]).includes(value);
}

export function vehicleSeatCount(layout: VehicleLayoutId): number {
  return VEHICLE_LAYOUTS[layout].length;
}

/**
 * Najmniejszy układ, który mieści tyle foteli. Motocykl ma własny tandem, póki
 * wystarcza; z koszem (Ulepszenie foteli) siada jak auto 2 + 2. Pojazd większy
 * od furgonu (jacht, aerozep) dostaje furgon — reszta miejsc jest pod pokładem,
 * nie na mapie.
 */
export function vehicleLayoutFor(body: VehicleBody, seats: number): VehicleLayoutId {
  if (body === 'bike' && seats <= 2) return 'bike-2';
  const fits = (['car-2', 'car-4', 'car-6', 'van-8'] as const).find(
    (id) => vehicleSeatCount(id) >= seats,
  );
  return fits ?? 'van-8';
}

/** Bryła z liczby foteli: furgon od siedmiu, motocykl tylko z nazwy rodzaju. */
export function vehicleBodyFor(bike: boolean, seats: number): VehicleBody {
  if (bike) return 'bike';
  return seats > 6 ? 'van' : 'car';
}

/** Pojazd tak, jak widzi go klient. `system` czyta moduł systemu (CP RED: `readCpredVehicle`). */
export interface VehicleView {
  id: string;
  /** Karta właściciela; `null` = pojazd MG albo NPC-a bez karty. */
  ownerCharacterId: string | null;
  name: string;
  imageUrl: string | null;
  widthSq: number;
  lengthSq: number;
  layout: VehicleLayoutId;
  system: unknown;
  updatedAt: string;
}

/** MG: `vehicle:create` — pojazd z katalogu, dla karty albo bez właściciela. */
export interface VehicleCreatePayload {
  catalogId: string;
  ownerCharacterId: string | null;
  name?: string;
}

/** MG: `vehicle:update` — dowolne pola; `system` to łata liczb systemu. */
export interface VehicleUpdatePayload {
  vehicleId: string;
  patch: {
    name?: string;
    imageUrl?: string | null;
    widthSq?: number;
    lengthSq?: number;
    layout?: VehicleLayoutId;
    ownerCharacterId?: string | null;
    system?: unknown;
  };
}

/** MG: `vehicle:delete`. */
export interface VehicleIdPayload {
  vehicleId: string;
}

/** Właściciel karty: `vehicle:rename` — nazwa i grafika, nic więcej. */
export interface VehicleRenamePayload {
  vehicleId: string;
  name?: string;
  imageUrl?: string | null;
}

/**
 * Gracz (albo MG za kartę) kupuje auto z modelu: `vehicle:buy` (etap 67).
 * Bez `merchantId` — z Kompendium (poziom sklepu kampanii, „Kup: wszędzie”),
 * z nim — u lady handlarza z kategorią „Pojazdy”. `expectPrice` to cena, którą
 * pokazał przycisk; inna po stronie serwera daje `QUOTE_CHANGED`.
 */
export interface VehicleBuyPayload {
  characterId: string;
  entryId: string;
  merchantId?: string;
  expectPrice: number;
}

export interface VehicleBuyResult {
  vehicle: VehicleView;
  balance: number;
  price: number;
}

/** Auto w salonie handlarza (`MerchantView.vehicles`) — cena już z mnożnikiem sklepu. */
export interface MerchantVehicleOfferView {
  entryId: string;
  name: string;
  art: string;
  /** „Supersamochód · 2 fotele · PUK 50 · Ruch 60”. */
  detail: string;
  price: number;
}

/** Server → client `vehicle:upsert`. */
export interface VehicleUpsertBroadcast {
  vehicle: VehicleView;
}

/** Server → client `vehicle:delete`. */
export interface VehicleDeleteBroadcast {
  vehicleId: string;
}

/**
 * Grafika, którą gracz może dać swojemu pojazdowi bez MG: wyłącznie wbudowana
 * z `/art/vehicles/` (etap 65b dokłada pliki). Wgrywa tylko MG — biblioteka
 * „Grafik” jest jego i może zdradzać, kto pojawi się na stole.
 */
export const VEHICLE_ART_PREFIX = '/art/vehicles/';

/**
 * Wbudowane grafiki aut, rysowane przodem do góry. Od etapu 67 (MG 06.11.2026)
 * to grafiki MG (`tools/art/vehicle-models.py`) — po jednej na model auta
 * z `vehicle-models.json`; `gmOnly` — służby, których gracz nie dostaje
 * w galerii. Grafiki z paczki CC0 (65b, `VEHICLE_ART_LEGACY`) leżą dalej
 * w `/art/vehicles/` dla przeszkód pościgu i scen zapisanych przed 67.
 * Furgony i motocykle — druga dostawa MG z 06.11.
 */
export const VEHICLE_ART: readonly { url: string; label: string; gmOnly?: true }[] = [
  { url: '/art/vehicles/kagero.webp', label: 'Arasaka „Kagerō”' },
  { url: '/art/vehicles/widmo.webp', label: '„Widmo”' },
  { url: '/art/vehicles/rajdowka-77.webp', label: '„Rajdówka 77”' },
  { url: '/art/vehicles/nocny-neon.webp', label: '„Nocny Neon”' },
  { url: '/art/vehicles/bastion.webp', label: '„Bastion” (SUV)' },
  { url: '/art/vehicles/ranczer.webp', label: '„Ranczer” (pickup)' },
  { url: '/art/vehicles/rdzawiec.webp', label: '„Rdzawiec” (stary pickup)' },
  { url: '/art/vehicles/wloczega.webp', label: '„Włóczęga” (stare kombi)' },
  { url: '/art/vehicles/graty.webp', label: '„Graty” (furgon)' },
  { url: '/art/vehicles/nomada.webp', label: '„Nomada” (kamper)' },
  { url: '/art/vehicles/zadlo.webp', label: '„Żądło” (motocykl)' },
  { url: '/art/vehicles/osa.webp', label: '„Osa” (motocykl)' },
  { url: '/art/vehicles/taksowka.webp', label: 'Taksówka', gmOnly: true },
  { url: '/art/vehicles/radiowoz.webp', label: 'Radiowóz', gmOnly: true },
  { url: '/art/vehicles/karetka.webp', label: 'Karetka', gmOnly: true },
  { url: '/art/vehicles/militech-furgon.webp', label: 'Militech — furgon', gmOnly: true },
];

/** Grafiki z paczki CC0 sprzed etapu 67 — przeszkody pościgu i stare sceny. */
export const VEHICLE_ART_LEGACY: readonly { url: string; label: string }[] = [
  { url: '/art/vehicles/car-red.webp', label: 'Czerwone sportowe' },
  { url: '/art/vehicles/car-black-viper.webp', label: 'Czarne w pasy' },
  { url: '/art/vehicles/car-orange.webp', label: 'Pomarańczowy muscle car' },
  { url: '/art/vehicles/car-taxi.webp', label: 'Taksówka (stara)' },
  { url: '/art/vehicles/car-police.webp', label: 'Radiowóz (stary)' },
  { url: '/art/vehicles/pickup-blue.webp', label: 'Pickup' },
  { url: '/art/vehicles/van-ambulance.webp', label: 'Karetka (stara)' },
  { url: '/art/vehicles/van-white.webp', label: 'Furgon' },
];

/**
 * Grafika pojazdu bez własnej (od 06.11 grafiki MG): „Żądło” dla motocykla,
 * „Graty” dla furgonu `van-8`, „Włóczęga” dla auta. `null` zostaje w typie
 * na wypadek układu, któremu grafiki zabraknie — wtedy rysuje się bryła.
 */
export function defaultVehicleArt(layout: VehicleLayoutId): string | null {
  if (layout === 'bike-2') return '/art/vehicles/zadlo.webp';
  return layout === 'van-8' ? '/art/vehicles/graty.webp' : '/art/vehicles/wloczega.webp';
}

export function isVehicleArtUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(VEHICLE_ART_PREFIX) &&
    /^\/art\/vehicles\/[a-z0-9-]+\.(webp|png|jpg)$/.test(value)
  );
}

/** Nazwa pojazdu po przycięciu; pusta albo nie-tekst — `null`. */
export function readVehicleName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().slice(0, VEHICLE_NAME_MAX);
  return name.length > 0 ? name : null;
}

/** Rozmiar bryły w kratkach; poza zakresem — `null`. */
export function readVehicleSize(raw: unknown): number | null {
  return typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= VEHICLE_SIZE_MIN &&
    raw <= VEHICLE_SIZE_MAX
    ? raw
    : null;
}
