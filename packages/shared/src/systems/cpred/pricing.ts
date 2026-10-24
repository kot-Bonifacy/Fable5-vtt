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
 *  - drobny sprzęt ogólny (pasma Tanie, Codzienne, Drogie — 10–50 ed) ×3,
 *  - amunicja ×1 (decyzja MG z 20.10.2026 — dziesięć zwykłych naboi za 10 ed
 *    to już cena z dzisiejszego sklepu, ×3 robiło z nich towar luksusowy),
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
/** Drobiazgi, które się zużywa albo kupuje garściami. */
export const CPRED_PRICE_SCALE_CONSUMABLE = 3;
/** Amunicja — ceny podręcznika już wyglądają jak dzisiejsze euro. */
export const CPRED_PRICE_SCALE_AMMO = 1;

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
 *  - Decyzja MG z 20.10.2026 — broń, którą dziś kupi się w markecie albo
 *    sklepie myśliwskim bez pozwolenia, nie kosztuje jak pistolet: nóż, kij,
 *    maczeta, piła łańcuchowa, łuk, kusza, pałka ogłuszająca. Markowe łuki
 *    i kusze z DLC zostają przy ×10 — płaci się za markę i jakość.
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
  ['weapon.light-melee', 1], // 50 ed
  ['weapon.medium-melee', 1], // 50 ed
  ['weapon.heavy-melee', 2], // 200 ed
  ['weapon.very-heavy-melee', 1], // 500 ed
  ['weapon.bow', 3], // 300 ed
  ['weapon.crossbow', 4], // 400 ed
  ['weapon.palka-ogluszajaca', 2], // 200 ed
  // Etap 59b: fiolki trucizny to nabój do ostrza — cena jak amunicja zatruta
  // i biotoksyczna (×1), a nie jak sprzęt trwały; dobry alkohol to drobiazg (×3).
  ['gear.fiolka-trucizny', CPRED_PRICE_SCALE_AMMO], // 100 ed
  ['gear.fiolka-biotoksyny', CPRED_PRICE_SCALE_AMMO], // 500 ed
  ['gear.alkohol-doskonalej-jakosci', CPRED_PRICE_SCALE_CONSUMABLE], // 300 ed
  // 24.10: farmaceutyki z pasma Premium to dawka, nie sprzęt trwały (×10 dawało
  // 1000 ed za strzał Stymu); id z `CPRED_PHARMACEUTICALS` (`pharma.ts`).
  ['gear.turbo-uzdrawiacz', CPRED_PRICE_SCALE_CONSUMABLE], // 300 ed
  ['gear.stym', CPRED_PRICE_SCALE_CONSUMABLE], // 300 ed
  ['gear.zryw', CPRED_PRICE_SCALE_CONSUMABLE], // 300 ed
]);

/**
 * Groups thousands: „15 000" reads, „15000" does not. The separator is a
 * no-break space, written as an escape so it is visible in the source — a plain
 * space would let a rent wrap in the middle of its own number. Zwykła twarda
 * spacja (U+00A0), nie wąska (U+202F): Firefox rysował wąską w Jost przy małym
 * kroju prawie bez szerokości i „1 180 ed” czytało się jak „1180” (10.10).
 */
export function formatEddies(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/** Ile razy cennik domowy mnoży cenę z podręcznika dla tego wpisu. */
export function cpredCatalogPriceScale(
  entry: Partial<Pick<CompendiumEntry, 'id' | 'category' | 'costCategory'>>,
): number {
  const exception = entry.id === undefined ? undefined : PRICE_SCALE_BY_ID.get(entry.id);
  if (exception !== undefined) return exception;
  if (entry.category === 'ammo') return CPRED_PRICE_SCALE_AMMO;
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
  ' cyborgizacje, sprzęt Netrunnera i droższy sprzęt kosztują 10 razy tyle, drobny sprzęt 3 razy' +
  ' tyle, amunicja i zwykła broń biała (nóż, kij, piła łańcuchowa) tyle co w podręczniku, łuk 3 razy,' +
  ' kusza 4 razy, a maczeta i pałka ogłuszająca 2 razy tyle, montaż znalezionej cyborgizacji 10 razy tyle, a terapia 2 razy tyle; czynsz, Poziom' +
  ' życia i wypłaty są jak w podręczniku. Gdy pytanie dotyczy ceny, podajesz cenę z fragmentu i' +
  ' dopisujesz, ile wynosi po przeliczniku.';
