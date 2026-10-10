import type { CompendiumEntry, CompendiumRegistry, CostCategory } from './compendium.js';

/**
 * Cennik domowy (etap 47a, decyzja MG z 09.10.2026): eurodolar to mniej więcej
 * euro z lekką inflacją, więc pistolet nie kosztuje 50 ed, tylko 500.
 *
 * Podręcznik ma tani **sprzęt** i realne **życie** — kawalerka za 1500 ed
 * miesięcznie i 10 ed za dziesięć naboi już dziś wyglądają jak euro, a broń,
 * pancerz, elektronika i chrom są od nich dziesięć razy tańsze. Dlatego cennik
 * nie mnoży wszystkiego tak samo:
 *
 *  - sprzęt trwały (broń, dodatki, pancerze, cyborgizacja, sprzęt i programy
 *    Netrunnera, obrona Sieci, droższy sprzęt ogólny) ×10,
 *  - amunicja i drobny sprzęt ogólny (pasma Tanie, Codzienne, Drogie — 10–50 ed) ×3,
 *  - czynsz, Poziom życia, zakup mieszkania, wypłaty i gotówka startowa ×1.
 *
 * **Pasmo zostaje przy przedmiocie.** Od pasma zależą PT i czas Wytwarzania
 * (`CPRED_FABRICATION_TASK`), zasięg Fixera i poziom sklepu; ciężki pistolet za
 * 1000 ed dalej jest „Premium". Zmienia się wyłącznie kwota w ed.
 *
 * Mnoży się katalog z plików (`cpredScaleCatalogPrices` przy wczytaniu), a nie
 * dane: JSON-y pisze importer podręcznika i nadpisałby każdą ręczną zmianę.
 * Wpisy MG z Kompendium i kwoty wpisane ręcznie (handlarz, saldo) są już
 * w nowej walucie i nikt ich nie przelicza.
 */

/** Sprzęt trwały — broń, pancerz, chrom, elektronika. */
export const CPRED_PRICE_SCALE_DURABLE = 10;
/** Amunicja i drobiazgi, które się zużywa albo kupuje garściami. */
export const CPRED_PRICE_SCALE_CONSUMABLE = 3;

/** Pasma sprzętu ogólnego, które liczą się jak drobiazg. */
const CONSUMABLE_GEAR_BANDS: ReadonlySet<CostCategory> = new Set(['cheap', 'everyday', 'costly']);

/**
 * Wpisy, którym mnożnik ich rodzaju daje cenę z innego świata — id z importera
 * (stabilne, jak id umiejętności w `roleability.ts`). Wyjątek jest mnożnikiem,
 * a nie kwotą, bo poziom sklepu czyta cenę podzieloną przez mnożnik.
 *
 *  - Komputer z tanich pasm: 150 ed byłoby dziesięć razy taniej od agenta.
 *  - Decyzje MG z 10.10.2026 — ×10 dawało ceny bez związku z tym, co rzecz
 *    robi: ochronniki słuchu za 10 000 ed (drożej od smartkularów), wykrywacze
 *    i lokalizator po 5000 ed, dyktafon w cenie agenta, torba z narzędziami za
 *    pięć technarzędzi, magazynek bębnowy droższy od pistoletu. Wersje
 *    wszczepiane zostają przy ×10 — ich cena zawiera montaż.
 */
const PRICE_SCALE_BY_ID: ReadonlyMap<string, number> = new Map([
  ['gear.komputer', CPRED_PRICE_SCALE_DURABLE],
  ['gear.automatyczne-sluchawki-wygluszajace', 2], // 2000 ed
  ['gear.wykrywacz-podsluchu', 2], // 1000 ed
  ['gear.wykrywacz-radaru', 2], // 1000 ed
  ['gear.odbiornik-lokalizatora', 2], // 1000 ed
  ['gear.rejestrator-dzwieku', 3], // 300 ed
  ['gear.przegladarka-braindance-u', 3], // 3000 ed
  ['gear.przybornik-technika', 4], // 2000 ed
  ['attachment.drum-magazine', 4], // 2000 ed
]);

/**
 * Groups thousands: „15 000" reads, „15000" does not. The separator is a narrow
 * no-break space, written as an escape so it is visible in the source — a plain
 * space would let a rent wrap in the middle of its own number.
 */
export function formatEddies(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Ile razy cennik domowy mnoży cenę z podręcznika dla tego wpisu. */
export function cpredCatalogPriceScale(
  entry: Partial<Pick<CompendiumEntry, 'id' | 'category' | 'costCategory'>>,
): number {
  const exception = entry.id === undefined ? undefined : PRICE_SCALE_BY_ID.get(entry.id);
  if (exception !== undefined) return exception;
  if (entry.category === 'ammo') return CPRED_PRICE_SCALE_CONSUMABLE;
  if (
    entry.category === 'gear' &&
    entry.costCategory !== undefined &&
    CONSUMABLE_GEAR_BANDS.has(entry.costCategory)
  ) {
    return CPRED_PRICE_SCALE_CONSUMABLE;
  }
  return CPRED_PRICE_SCALE_DURABLE;
}

/**
 * Wpis katalogu z podręcznika w cenach domowych. Wpis bez ceny liczbowej
 * zostaje bez niej — jego cenę daje pasmo, które `entryPrice` mnoży tym samym
 * mnożnikiem, a pasmo się nie zmienia.
 */
export function cpredScaledEntry<T extends CompendiumEntry>(entry: T): T {
  if (entry.cost === null || entry.cost === undefined || entry.cost === 0) return entry;
  return { ...entry, cost: entry.cost * cpredCatalogPriceScale(entry) };
}

/** Cały katalog z plików w cenach domowych — woła go wyłącznie wczytanie kompendium. */
export function cpredScaleCatalogPrices(registry: CompendiumRegistry): CompendiumRegistry {
  const entries = registry.entries.map((entry) => cpredScaledEntry(entry));
  return { ...registry, entries, entryById: new Map(entries.map((entry) => [entry.id, entry])) };
}

/**
 * Notka dla asystenta zasad: fragmenty podręcznika podają ceny sprzed
 * przelicznika, a przy stole obowiązuje cennik z Kompendium.
 */
export const CPRED_PRICE_HOUSE_RULE_NOTE =
  'Ceny w eurodolcach przy tym stole różnią się od podręcznika (cennik domowy MG): broń, pancerze,' +
  ' cyborgizacje, sprzęt Netrunnera i droższy sprzęt kosztują 10 razy tyle, amunicja i drobny sprzęt' +
  ' 3 razy tyle, montaż znalezionej cyborgizacji 10 razy tyle, a terapia 2 razy tyle; czynsz, Poziom' +
  ' życia i wypłaty są jak w podręczniku. Gdy pytanie dotyczy ceny, podajesz cenę z fragmentu i' +
  ' dopisujesz, ile wynosi po przeliczniku.';
