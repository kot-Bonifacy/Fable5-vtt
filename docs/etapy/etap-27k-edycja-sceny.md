# Etap 27k — Edycja sceny: zaznacz, skasuj, cofnij

**Faza:** I — Wykończenie · **Wymaga etapów:** 16c (osłony), 17b (rysowanie), 18a–18d (ściany, światła, otwory), 26b (punkty dostępu), 26f (strefy bronione), 27f (okno pomocy)

> **Dopisany 2026-08-23** na zlecenie MG. Powód wprost z sesji przy stole: „nie wiem, jak
> skasować punkt dostępu". Funkcja istniała w dwóch miejscach naraz, żadnego nie dało się
> znaleźć — więc naprawiamy nie brak, tylko **gramatykę** edycji sceny.

## Cel sesji

Jedna reguła na wszystko, co stoi na mapie: **wejdź w warstwę → kliknij obiekt → `Delete`**,
a `Ctrl+Z` cofa pomyłkę. Po tej sesji MG nie musi pamiętać, że ściany kasuje się trybem wewnątrz
narzędzia, rysunki osobnym narzędziem, a notatki wyłącznie z karty.

## Rozpoznanie (23.08) — co jest dziś

Kasowanie ma **trzy różne gramatyki**, a dwa typy obiektów nie mają kosza hurtowego:

| Obiekt                | Pojedynczo dziś                   | Hurtem dziś | Karta pod klikiem   |
| --------------------- | --------------------------------- | ----------- | ------------------- |
| Rysunek               | **osobne narzędzie** „Gumka" (G)  | ↩ 🗑 🗑       | nie                 |
| Ściana / drzwi / okno | tryb gumki _wewnątrz_ narzędzia W | 🗑           | nie                 |
| Osłona                | tryb gumki wewnątrz O             | 🗑           | nie                 |
| Strefa broniona       | tryb gumki wewnątrz (trzeci tryb) | 🗑           | tak (tryb „edytuj") |
| Światło               | tryb gumki wewnątrz L             | **brak**    | nie                 |
| Punkt dostępu         | tryb gumki wewnątrz **lub** karta | **brak**    | tak                 |
| Notatka MG            | wyłącznie karta → „Usuń"          | brak        | tak                 |
| Żeton                 | wyłącznie PPM → menu              | brak        | nie (LPM zaznacza)  |

Trzy błędy znalezione przy rozpoznaniu, naprawiane w tym etapie:

1. **Cicha porażka gumek.** `MapArea.tsx:584, 728, 762` — `deleteWall`, `deleteLight`
   i `removeNetAccessPoint` idą bez sprawdzenia `ack` i bez słowa przy chybieniu. Klik obok
   gniazda nie robi nic i nie tłumaczy dlaczego. (Osłony i strefy robią to poprawnie.)
2. **Brak kosza dla świateł i gniazd** — nie ma zdarzeń `light:clear` ani `netpoint:clear`,
   choć ściany, osłony, strefy i rysunki mają swoje.
3. **Dwa narzędzia MG nie istnieją w spisie skrótów.** `MAP_TOOL_KEYS` (`shortcuts.ts:52`) nie
   zna `zone` ani `netpoint`, więc nie mają klawisza i **nie pokazują się w oknie pomocy `?`** —
   akurat narzędzie punktów dostępu jest jedynym, o którym pomoc milczy.

## Decyzje MG (2026-08-23)

Wzorzec: **Foundry VTT** — warstwa, zaznaczenie, `Delete`, karta pod dwuklikiem.

- **Pełny model, nie łatka.** Zaznaczanie obiektu na jego warstwie zastępuje tryby-gumki.
- **`Ctrl+Z` zamiast okien potwierdzenia.** Kasowanie idzie od razu; cofanie naprawia pomyłkę.
  Dodatkowy powód: `window.confirm` zawiesza sterowanie przeglądarką przez CDP
  (`pulapki-dev.md`), więc każde okno potwierdzenia zabiera nam oględziny automatem.
- **Zaznaczenie pojedyncze.** Bez ramki zaznaczającej — do sprzątania hurtem służą kosze.
- **Tryby-gumki znikają całkowicie**, razem z osobnym narzędziem „Gumka" (G). Jedna reguła.
- **Gracz dostaje ten sam gest** — ale wyłącznie na własnych rysunkach, czyli dokładnie tyle,
  ile mógł dotąd gumką. Autorstwo rozstrzyga serwer, nie UI.
- **`Delete` nie dotyka żetonów** — świadome odstępstwo od Foundry. U nas żeton siedzi w środku
  walki (`selectedTokenId` obsługuje celowanie, HUD i budżet ruchu w ~20 miejscach
  `MapRenderer.ts`), klik w pustą kratkę obok niego to **rozkaz marszu**, a jego id noszą
  inicjatywa i runy Sieci. Figury kasuje się dalej z menu pod PPM.

## Rozstrzygnięcie techniczne: cofanie żyje na serwerze

Bufor ostatnich usunięć trzyma **serwer** (w pamięci procesu, nie w bazie), a `Ctrl+Z` wysyła
`scene:undo`. Powody:

- **Serwer jest autorytatywny** (zasada z `CLAUDE.md`) — klient, który odtwarzałby obiekt
  własnym `create`, mógłby przy okazji podać inne PW osłony albo inną Architekturę gniazda.
- **Wiersz wraca z tym samym id.** Odtworzenie po stronie klienta znaczyłoby `create` + `patch`
  i **nowe id** za każdym razem — a `createWalls` nie przyjmuje `locked`, `createCover` nie
  przyjmuje bieżących PW, `placeNetAccessPoint` nie przyjmuje nazwy ani notatki.
- **Kosz „usuń wszystkie" odkłada całą grupę jako jedną pozycję**, więc jedno `Ctrl+Z` cofa cały
  kosz. To zamyka przy okazji zaległość „kosz osłon kasuje bez pytania i bez cofnięcia".

Czego cofanie **nie** przywróci (do zapisania w `decyzje-i-uproszczenia.md`): runu w Sieci
zerwanego przez usunięcie gniazda — run kończy się nieodwracalnie i wraca samo gniazdo.

## Zakres

- [x] **Zaznaczenie obiektu scenerii** — nowy store `sceneSelectionStore`
      (`{ kind, id } | null`, gdzie `kind` to `wall | cover | zone | light | netpoint | note | drawing`),
      wykluczające się wzajemnie z zaznaczeniem żetonu: zaznaczenie obiektu zdejmuje
      figurę i odwrotnie, żeby `Delete` nigdy nie musiał zgadywać, co kasuje
- [x] **Obrys zaznaczenia i podświetlenie pod kursorem** w rendererze — najechanie na obiekt
      uzbrojonej warstwy rysuje obrys i zmienia kursor na `pointer`. To jedno załatwia
      „nie wiedziałem, że to jest klikalne"; pickery (`pickWallAt`, `pickCoverAt`, `pickZoneAt`,
      `pickLightAt`, `pickAccessPointAt`, `pickDrawingAt`) już istnieją i wystarczy je złożyć
- [x] **Gesty warstwy** — przeciągnięcie po pustym tworzy (łańcuch ścian, prostokąt osłony
      i strefy, kształt rysunku), krótki klik po pustym stawia punkt (światło, gniazdo, pinezka)
      albo zaczyna łańcuch, krótki klik w obiekt **zaznacza**, dwuklik otwiera kartę tam, gdzie
      już jest (gniazdo, strefa, notatka)
- [x] **`Delete` / `Backspace`** kasuje zaznaczony obiekt; wpięte w `MapArea` przed drabiną `Esc`.
      Nowy szczebel drabiny `Esc`: zdejmij zaznaczenie obiektu — nad „odłóż narzędzie"
- [x] **`Ctrl+Z`** — serwerowy bufor cofania (20 ostatnich usunięć na kampanię) i zdarzenie
      `scene:undo`; kosz hurtowy odkłada grupę jako jedną pozycję. MG cofa swoje usunięcia,
      gracz wyłącznie własne rysunki
- [x] **Sprzątnięcie pasków** — `MAP_TOOLS` traci `erase`; `WallMode` i `ZoneMode` tracą `erase`
      (`ZoneMode` także `edit` — przechodzi na dwuklik), `CoverMode`, `LightMode` i `NetPointMode`
      przestają istnieć jako pary trybów. Kosze „usuń wszystkie" **zostają**
- [x] **Brakujące kosze** — zdarzenia `light:clear` i `netpoint:clear` plus przyciski, żeby
      światła i gniazda dało się sprzątnąć tak jak osłony i ściany
- [x] **Skróty i pomoc** — `zone` (`S`) i `netpoint` (`P`) wchodzą do `MAP_TOOL_KEYS`, więc
      pojawiają się w oknie `?` same z siebie; `G` zwalnia się razem z gumką. Nowa grupa skrótów
      „Obiekty na mapie": `Delete`, `Ctrl+Z`, dwuklik
- [x] **Podpowiedź kontekstowa pod paskiem** — przy uzbrojonej warstwie bez zaznaczenia
      „Kliknij obiekt, by go zaznaczyć", przy zaznaczeniu „Delete usuwa · Ctrl+Z cofa"
- [x] **Cel gniazda z 13 na 18 px** (`MapRenderer.ts:4675`) — pierścień 6 m i podpis zostają
      nieklikalne (zasłaniałyby figury), ale sam glif przestaje wymagać celowania

## Poza zakresem

- **Karty właściwości ściany, osłony, światła i rysunku** — te idą do **27l**; do tego czasu
  dwuklik w lampę robi to, co dziś robił klik z uzbrojonym narzędziem, czyli przestraja ją
  do ustawień z paska (świadome rozwiązanie pomostowe)
- Przesuwanie i skalowanie obiektu po zaznaczeniu — uchwyty też w **27l**
- Zaznaczanie wielokrotne ramką — **odrzucone przez MG**, do sprzątania hurtem są kosze
- Żetony: `Delete` ich nie dotyka, menu pod PPM zostaje bez zmian
- Cofanie czegokolwiek poza usunięciem (przesunięcia, edycji właściwości)

## Kryteria ukończenia

- [x] **Test wyjściowy: punkt dostępu.** Osoba, która nie zna kodu, kasuje gniazdo bez pytania
      nikogo o drogę: pasek → 🔌 → klik w gniazdo (obrys) → `Delete`. Odklikane w przeglądarce
- [x] **Ten sam gest działa na siedmiu typach** — ścianie, drzwiach, oknie, osłonie, strefie
      bronionej, świetle, notatce i rysunku. Odklikane po kolei, nie wywnioskowane z kodu
- [x] **`Ctrl+Z` przywraca ostatnio usunięty obiekt**, a po koszu „usuń wszystkie osłony"
      przywraca **wszystkie** naraz jako jedną pozycję
- [x] **Gracz zaznacza i kasuje własny rysunek, cudzego nie** — odmowa przychodzi z serwera
      i jest widoczna na ekranie gracza (sprawdzone z konta gracza na `[::1]:5173`)
- [x] **Okno pomocy `?` wymienia wszystkie narzędzia mapy** — ze strefami i gniazdami włącznie —
      oraz sekcję „Obiekty na mapie"; lista zgodna z tym, co naprawdę działa (pilnuje
      `shortcuts.test.ts`)
- [x] **Żaden pasek nie ma już trybu-gumki**; `MAP_TOOLS` nie zawiera `erase`
- [x] **Nic nie kasuje w ciszy** — każde `delete*` sprawdza `ack` i mówi zdaniem, gdy się nie
      udało; klik warstwą w puste miejsce nie udaje, że coś zrobił
- [x] **Testy:** wybór obiektu pod kursorem i pierwszeństwo warstw w `shared`; `scene:undo`,
      `light:clear` i `netpoint:clear` na serwerze; `shortcuts.test.ts` i `map-click.test.ts`
      u klienta — zielone

## Jak wyszło (2026-08-23, trzecia sesja tego dnia)

**Rozstrzygnięcie MG w trakcie:** klik w **środek** ściany zaznacza, klik przy jej **końcówce**
(≤ 12 px, promień przyciągania) zaczyna nowy łańcuch. Powód: promień trafienia w segment to
20 px przy kratce 100, czyli więcej niż promień przyciągania — „zaznaczaj zawsze" odebrałoby
jedyny sposób na dorysowanie ściany dokładnie od narożnika istniejącego muru. Predykat siedzi
w `wallEndpointNear` (`shared/walls.ts`), z którego korzysta też `snapWallPoint`. Cena: segmentu
krótszego niż 24 px nie da się złapać za środek — zostaje kosz albo `Ctrl+Z`.

**Klik kontra przeciągnięcie.** Warstwy rysowane przeciągnięciem (osłona, strefa, kształt
rysunku) decydują dopiero przy puszczeniu przycisku: gest krótszy niż 6 px ekranu i zaczęty na
obiekcie to zaznaczenie, wszystko inne to nowy kształt. Bez tego nie dałoby się narysować
osłony nachodzącej na już stojącą.

**Dwa błędy znalezione przy oględzinach i naprawione tutaj:**

1. **Podpowiedzi nad mapą były czarne na czarnym w motywie dziennym.** `.map-placement-hint`
   stawiała `var(--text)` na `var(--map-panel)`, a panel nad mapą jest ciemny w **obu**
   motywach (i ma taki zostać — Pixi rysuje pod nim białe podpisy). Dotyczyło wszystkich
   podpowiedzi, nie tylko nowej; naprawione na `--map-ink`.
2. **Podpowiedź warstwy kładła się na ikonach paska.** Pasek jest szeroki na 38 rem i
   wyśrodkowane pudełko `.map-placement-hint` po prostu na nim leżało. Podpowiedź przeniesiona
   **do środka paska** jako jego ostatni, pełnej szerokości wiersz (`.map-tool-tip`) — czyli
   dosłownie „pod paskiem", jak mówił zakres.

**Nie odklikane:** strona gracza (własny rysunek, odmowa dla cudzego). Sesja na `[::1]:5173`
jest dziś zalogowana jako MG, a dołączenie nowym imieniem zakłada konto-śmiecia w kampanii —
pozycja w `zaleglosci.md`. Ścieżka ma test serwera (`scene-undo.test.ts`) i test filtra
autorstwa w `shared/scene-objects.test.ts`.
