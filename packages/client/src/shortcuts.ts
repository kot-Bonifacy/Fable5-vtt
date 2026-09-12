import type { MapTool } from './stores/mapToolStore.js';

/**
 * Katalog skrótów klawiszowych (etap 27f).
 *
 * Do 27e skróty żyły wyłącznie w kodzie, który je obsługuje, i w ośmiu
 * atrybutach `title` na przyciskach paska narzędzi. Kto nie najechał kursorem
 * akurat na ten przycisk, nie wiedział, że `Tab` przeskakuje między figurami
 * ani że `E` kończy Turę. Wpis w `POMYSLY.md` z 01.08 prosił o jedno miejsce
 * z pełną listą — to jest to miejsce.
 *
 * **Lista narzędzi mapy nie jest przepisana, tylko wspólna.** `MAP_TOOL_KEYS`
 * czyta i `MapArea` (żeby wiedzieć, co robi klawisz), i okno pomocy (żeby
 * wiedzieć, co napisać). Kryterium etapu mówi „lista zgodna z tym, co naprawdę
 * działa" — jedyny sposób, żeby to zdanie zostało prawdziwe po następnym
 * etapie, to nie mieć dwóch list. Reszta skrótów siedzi w drabinie `Escape`
 * i w obsłudze cyfr, których w tabelę się nie zamieni bez udawania, że są
 * prostsze, niż są — te wpisano ręcznie i opisano tym, co robią.
 */

/** Jeden wiersz w oknie pomocy. */
export interface Shortcut {
  /** Zapis klawisza tak, jak się go czyta: `M`, `Shift + 1…9`, `Esc`. */
  keys: string;
  what: string;
  /** Skrót działa tylko u MG — u gracza wiersz w ogóle się nie pokazuje. */
  gmOnly?: boolean;
  /** Prośba o Test jest dostępna tylko graczowi na własnej karcie. */
  playerOnly?: boolean;
}

export interface ShortcutGroup {
  title: string;
  /** Zdanie nad tabelką: kiedy te skróty w ogóle działają. */
  note?: string;
  /**
   * Wiersze są krokami po kolei, więc dostają numery — nadaje je
   * `shortcutGroupsFor` **po** odsianiu wierszy MG. Numer wpisany w `what`
   * zostawiłby u gracza dziurę („1, 2, 3, 4, 6, 7"), bo krok 5 jest `gmOnly`.
   */
  numbered?: boolean;
  items: Shortcut[];
}

/**
 * Narzędzia mapy: klawisz przełącza narzędzie, ten sam klawisz je odkłada
 * (`toggleTool`). Kolejność jest kolejnością paska narzędzi.
 */
export const MAP_TOOL_KEYS: readonly {
  key: string;
  tool: MapTool;
  what: string;
  gmOnly: boolean;
}[] = [
  { key: 'm', tool: 'ruler', what: 'Linijka — mierzy odległość po mapie', gmOnly: false },
  { key: 'r', tool: 'draw', what: 'Rysowanie po mapie', gmOnly: false },
  { key: 'f', tool: 'fog', what: 'Mgła wojny — odsłanianie i zakrywanie', gmOnly: true },
  { key: 'n', tool: 'note', what: 'Notatka MG — pinezka na mapie', gmOnly: true },
  { key: 'w', tool: 'wall', what: 'Ściany, drzwi i okna', gmOnly: true },
  { key: 'o', tool: 'cover', what: 'Osłony — prostokąt zatrzymujący kule', gmOnly: true },
  { key: 's', tool: 'zone', what: 'Strefy bronione — pułapka na podłodze', gmOnly: true },
  { key: 'l', tool: 'light', what: 'Źródła światła', gmOnly: true },
  { key: 'p', tool: 'netpoint', what: 'Punkty dostępu do Sieci', gmOnly: true },
  {
    key: 'g',
    tool: 'spawn',
    what: 'Miejsce startu graczy — stąd patrzą, wchodząc na scenę',
    gmOnly: true,
  },
];

/** Wiersze narzędzi mapy budowane z tej samej tabeli, którą czyta `MapArea`. */
const MAP_TOOL_SHORTCUTS: Shortcut[] = MAP_TOOL_KEYS.map((entry) => ({
  keys: entry.key.toUpperCase(),
  what: entry.what,
  gmOnly: entry.gmOnly,
}));

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Walka',
    note: 'Skróty działają poza polami edycji. Wybierz figurę, aby używać jej paska akcji.',
    items: [
      {
        keys: '1…9',
        what: 'Wybierz broń lub akcję oznaczoną tą cyfrą na pasku (górny rząd klawiatury)',
      },
      { keys: 'Shift + 1…9', what: 'Przełącz tryb broni pod tą cyfrą, jeśli ma kilka trybów' },
      {
        keys: 'klik w cel',
        what: 'Przy wybranej broni przygotuj atak. Dla strzału pojedynczego wybierz korpus, głowę, przedmiot lub nogę; celowanie poza korpus: −8 i cała Akcja',
      },
      { keys: 'Tab', what: 'Następna figura, którą możesz sterować' },
      { keys: 'E', what: 'Zakończ Turę (swoją; MG — czyjąkolwiek)' },
    ],
  },
  {
    title: 'Figury i ping',
    note: 'Zaznaczyć da się wyłącznie figury, którymi możesz sterować — u gracza własne, u MG wszystkie.',
    items: [
      {
        keys: 'Alt + klik w mapę',
        what: 'Wskaż miejsce wszystkim oglądającym tę scenę',
      },
      {
        keys: 'Alt + Shift + klik',
        what: 'Wskaż miejsce i przenieś tam widok wszystkich oglądających',
        gmOnly: true,
      },
      {
        keys: 'Shift + przeciągnięcie',
        what: 'Zaznacz figury ramką na mapie',
      },
      {
        keys: 'Shift + klik w figurę',
        what: 'Dodaj figurę do zaznaczenia lub ją odznacz',
      },
      { keys: 'Ctrl + A', what: 'Zaznacza wszystkie figury, którymi możesz sterować' },
      {
        keys: 'przeciągnięcie zaznaczonej',
        what: 'Przesuń całą grupę poza walką. W trybie turowym poruszaj figury osobno',
      },
      {
        keys: 'Alt + przeciągnięcie figury',
        what: 'Utwórz kopię figury w miejscu upuszczenia',
        gmOnly: true,
      },
    ],
  },
  {
    title: 'Narzędzia mapy',
    note: 'Ten sam klawisz odkłada narzędzie z powrotem do wskaźnika.',
    items: MAP_TOOL_SHORTCUTS,
  },
  {
    title: 'Obiekty na mapie',
    note: 'Najpierw wybierz odpowiednie narzędzie mapy. Gracz może edytować tylko dostępne mu obiekty.',
    items: [
      { keys: 'klik', what: 'Zaznacz obiekt na aktywnej warstwie' },
      { keys: 'dwuklik', what: 'Otwórz kartę obiektu' },
      {
        keys: 'przeciągnięcie',
        what: 'Przesuń obiekt; przeciągnij narożnik lub koniec ściany, aby zmienić rozmiar',
      },
      {
        keys: 'Ctrl + przeciągnięcie',
        what: 'Przesuń lub zmień rozmiar bez przyciągania do kratki',
      },
      { keys: 'Delete', what: 'Usuwa zaznaczony obiekt (figur nie dotyka — te z menu pod PPM)' },
      { keys: 'Backspace', what: 'Usuń zaznaczony obiekt — tak samo jak Delete' },
      {
        keys: 'Ctrl + Z',
        what: 'Cofnij swoje ostatnie usunięcie na tej scenie, również opróżnienie kosza',
      },
    ],
  },
  {
    title: 'Rysowanie i mierzenie',
    items: [
      { keys: 'Spacja', what: 'Dokłada załamanie do mierzonej linijki' },
      { keys: 'Enter', what: 'Zamyka rysowany łańcuch ścian', gmOnly: true },
    ],
  },
  {
    title: 'Esc na mapie — kolejność anulowania',
    note: 'Na mapie Esc wykonuje pierwszy pasujący krok z listy. Otwarte okna mają także własną obsługę Esc.',
    numbered: true,
    items: [
      { keys: 'Esc', what: 'Zamyka wybór Celowania przy kursorze' },
      { keys: 'Esc', what: 'Przerywa trwający marsz figury' },
      { keys: 'Esc', what: 'Rozbraja celowanie bronią' },
      { keys: 'Esc', what: 'Zamyka otwartą kartę HUD-u walki' },
      { keys: 'Esc', what: 'Opuszcza wybraną broń' },
      { keys: 'Esc', what: 'Anuluje wpisywanie podpisu na mapie' },
      {
        keys: 'Esc',
        what: 'Porzuca rysowany łańcuch ścian albo prostokąt osłony',
        gmOnly: true,
      },
      { keys: 'Esc', what: 'Zamyka otwartą kartę obiektu sceny' },
      { keys: 'Esc', what: 'Zdejmuje zaznaczenie obiektu na mapie' },
      { keys: 'Esc', what: 'Zdejmuje zaznaczenie wielu figur' },
      { keys: 'Esc', what: 'Odkłada narzędzie mapy' },
      { keys: 'Esc', what: 'Zdejmuje zaznaczenie figury' },
    ],
  },
  {
    title: 'Pełny ekran',
    note: 'Włącza się w ⚙ Ustawienia → Widok.',
    items: [
      {
        keys: 'przytrzymanie Esc',
        what: 'Wyjdź z pełnego ekranu. Przy aktywnej blokadzie klawiatury w Chrome i Edge krótkie Esc anuluje akcję; bez blokady (np. Firefox lub zwykły HTTP poza localhost) od razu opuszcza pełny ekran',
      },
    ],
  },
  {
    title: 'Karta postaci: rzut z wiersza',
    note: 'Działa na wierszach Cech i Umiejętności na stronie pierwszej karty.',
    items: [
      { keys: 'klik', what: 'Otwiera okno rzutu — modyfikator, Szczęście, widoczność' },
      { keys: 'Shift + klik', what: 'Ładuje kubek od razu, z ostatnimi ustawieniami' },
      {
        keys: 'Alt + klik',
        what: 'Na własnej karcie poproś MG o Test Cechy lub Umiejętności. Rzut przygotujesz po jego zgodzie',
        playerOnly: true,
      },
    ],
  },
  {
    title: 'Kubek i rzuty',
    items: [
      { keys: 'Esc', what: 'Odkłada nabrany rzut z powrotem (dopóki kubek nie jest w ruchu)' },
      { keys: 'Esc', what: 'Zamyka okno rzutu przed jego potwierdzeniem' },
    ],
  },
  {
    title: 'Czat i panele',
    items: [
      {
        keys: 'Ctrl + Enter',
        what: 'Wyślij pytanie z aktywnego pola w panelu AI lub asystenta zasad',
      },
      { keys: 'Enter', what: 'Zatwierdza edytowaną inicjatywę w kolejce' },
      { keys: 'Esc', what: 'Zamyka edytor notatki MG i podpisu na mapie' },
      { keys: '?', what: 'Otwórz lub zamknij listę skrótów (poza polami edycji)' },
      { keys: 'Esc', what: 'Zamknij listę skrótów' },
    ],
  },
];

/**
 * Filtr roli: gracz nie ogląda skrótów, których u niego nie ma.
 *
 * Numerowanie idzie **po** filtrze i dlatego siedzi tutaj, a nie w oknie
 * pomocy: drabina `Esc` ma krok tylko dla MG, więc numery wpisane w treść
 * wierszy pokazywały graczowi „1, 2, 3, 4, 6, 7" (znalezione 22.08 przy
 * oględzinach z konta gracza).
 */
export function shortcutGroupsFor(isGm: boolean): ShortcutGroup[] {
  return SHORTCUT_GROUPS.map((group) => {
    const items = group.items.filter((item) => (isGm ? !item.playerOnly : !item.gmOnly));
    return {
      ...group,
      items: group.numbered
        ? items.map((item, index) => ({ ...item, what: `${index + 1}. ${item.what}` }))
        : items,
    };
  }).filter((group) => group.items.length > 0);
}
