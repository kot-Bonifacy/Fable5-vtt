# Testy walki przez przeglądarkę — sesja 2026-08-08

Dokument przekazania. Opisuje **poligon testowy** (gotowy do ponownego użycia — nie buduj go
od nowa), **co już zostało sprawdzone** (nie powtarzaj), **co znaleziono** i **co zostało do
zrobienia**, w kolejności, z konkretnymi krokami.

Testy prowadzone przez `claude-in-chrome` na koncie MG, na świeżej kampanii, bez dotykania
danych „Ulice Night City".

---

## 1. Poligon — stan gotowy do użycia

Kampania **„Poligon bojowy"** (`cmsjj1hgp0001xouefth4kyez`), scena **„Strzelnica"**
(`cmsjj322b0003xoue58mov3ty`): 4000×3000 px, kratka 100 px = **2 m**, widoczność **„Pełna"**,
bez tła (czysta siatka — odległości widać na oko).

Link zaproszenia gracza (ważny do 15.08.2026):
`http://localhost:5173/join/KmYpFpEPWOCIXbKvredxl7zFu00Xfg5x`

| Figura      | Karta                   | PW  | Pancerz                     | Broń                                                                                                    | Kluczowe umiejętności                                                  |
| ----------- | ----------------------- | --- | --------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Rico**    | tak                     | 45  | Lekka kurtka OB 11 (korpus) | C. pistolet 8, HPM 40 (seria + zapora), Militech Bulldog 4, **Puszka hukowa** (granat), Duża broń biała | REF 8, Broń krótka 6, Broń długa 6, Ogień ciągły 4, Unik 6, Atletyka 5 |
| **Kaya**    | tak                     | 40  | Kevlar OB 7                 | C. pistolet, Duża broń biała                                                                            | ZW 8, Unik 7, Bijatyka 6, Pierwsza pomoc 6                             |
| **Manekin** | tak                     | 50  | Średnia kurtka OB 12        | C. pistolet                                                                                             | BC 8, SW 8 — worek treningowy                                          |
| **Brutus**  | tak                     | 55  | Skóry OB 4                  | Duża broń biała                                                                                         | BC 10, Bijatyka 8 — do zwarcia                                         |
| **Zbir**    | **nie** (profil bojowy) | 30  | OB 7                        | C. pistolet 8/8                                                                                         | statysta; **ukryty przed graczami**                                    |

Pozycje wyjściowe (świat px): Rico 800,1300 · Kaya 900,1300 · Manekin 2400,1300 ·
Brutus 2500,1300 · Zbir 2400,1500. W trakcie sesji Rico podszedł do ~2200,1300.
Odległości startowe: Rico→Manekin **32 m**, Rico→Kaya **2 m**, Manekin→Brutus **2 m**.

Skrypt wypełniający karty (gdyby trzeba było odtworzyć):
`scratchpad/seed-poligon.mjs` (kształt karty w §7).

**Stan walki na koniec sesji:** RUNDA 1, tura Rica, kolejka: Kaya 16 · Rico 9 · Brutus 8 ·
Manekin 8 · Zbir 7. Rico ma mocno przekroczony budżet tury (MG może).

> **Sprzątanie na koniec testów:** utworzenie „Poligonu bojowego" **zdezaktywowało kampanię
> „Ulice Night City"**. Trzeba ją przywrócić: Panel MG → „Ulice Night City" → _Aktywuj_.
> Od 22.08 przycisk istnieje i przenosi ekrany same — przeładowanie karty nie jest potrzebne.

---

## 2. Znalezione błędy

### #1 — zmiana aktywnej kampanii nie odświeża klienta ✅ POPRAWIONE (22.08)

Po utworzeniu albo aktywowaniu kampanii w Panelu MG zmienia się **tylko nazwa w nagłówku**.
Mapa, czat (nagłówek „ONLINE — <stara kampania>"), tracker inicjatywy i lewy pasek nadal
należą do poprzedniej kampanii, aż do ręcznego przeładowania karty. MG może działać na
scenie kampanii, której nazwy nagłówek już nie pokazuje.
**Repro:** Panel MG → „Utwórz" nową kampanię (albo „Aktywuj" inną) → „← Wróć do gry".
**Waga:** niska (rzadka ścieżka), ale mylące.
**Poprawka (22.08):** przycisku „Aktywuj" w ogóle nie było — kampanię dało się przełączyć
wyłącznie tworząc nową (ten dokument opisywał ścieżkę, która nie istniała). Doszło zdarzenie
`campaign:activate` (MG), które przenosi **każde** podpięte gniazdo: stare pokoje → nowe,
scena aktywna nowej kampanii, pełny `state:sync`, a na końcu `campaign:switch` odświeżające
nazwę w pasku i wskaźniki klienta. Przycisk stoi przy każdej nieaktywnej kampanii w Panelu MG.
Test: `packages/server/src/campaign-switch.test.ts`.

### #2 — statysta dostawał pięści zamiast wybranej broni ✅ POPRAWIONE

`pickWeapon` w `packages/client/src/components/TokenContextMenu.tsx` czytał `entry.magazine`
i `entry.damage` z **surowego wpisu kompendium**. Żaden ze 100 wpisów broni (30 bazowych +
70 markowych) tych pól nie ma — obrażenia i magazynek mieszkają na **typie** broni i wyciąga
je `resolveWeapon`. Każdy statysta utworzony przez UI zapisywał się więc z
`weaponDamage: "1k6"` (wartość poprzednia, czyli pięści) i `ammoMax: 0` — bez magazynka, bez
Przeładowania i bez profilu naboju z 16g.
**Poprawka:** `pickWeapon` idzie przez `resolveWeapon`, jak każde inne miejsce w kliencie.
**Zweryfikowane:** Bulldog → „z 4"; C. pistolet → zapisane `3k6`, `8/8`.

### #3 — karta ataku podawała zły rozmiar magazynka ✅ POPRAWIONE

`packages/server/src/realtime/attacks.ts` liczyło mianownik jako `ammoCost + ammoAfter`,
czyli „ile było w broni **przed strzałem**", a nie pojemność magazynka. Zgadzało się to
wyłącznie wtedy, gdy broń zaczynała strzał pełna — dlatego strzał pojedynczy wyglądał
poprawnie („39/40"), a seria z 39 naboi wypisała „**29/39**" przy magazynku na 40.
**Poprawka:** `CpredAttackMeta` niesie nowe, opcjonalne pole `ammoMax` (opcjonalne, żeby
karty zapisane wcześniej dalej się renderowały); karta czyta pojemność stamtąd.
**Zweryfikowane na żywo:** ogień zaporowy wypisał „magazynek **19/40**".
**Test:** `packages/shared/src/systems/cpred/attacks.test.ts` — „carries the magazine size,
which a burst cannot be back-computed from".

### #6 — wymuszony test wypisuje statyście surowe id rany ✅ POPRAWIONE (22.08)

Granat z gazem łzawiącym, karta wymuszonego testu. Figura **z kartą postaci** dostaje czytelne
„Uraz oka · na minutę"; **statysta** dostaje „**injury.head-uraz-oka** · na minutę".

**Przyczyna (ustalona):** `packages/shared/src/systems/cpred/ammo.ts:364`

```js
const injuries = labels.injuries ?? failure.injuries ?? [];
```

`labels.injuries` powstaje w `packages/server/src/realtime/ammo-effects.ts:299` z
`log.injury?.name` / `log.injuryExtra?.name`. Dla statysty rana **nie jest nigdzie zapisywana**
(nie ma karty — kod ustawia tylko `injuryNote: 'Statysta nie ma karty…'`), więc `log.injury`
jest puste, `labels.injuries` to `undefined`, i odzywa się fallback `failure.injuries` —
czyli tablica **surowych id** z pliku amunicji.
Statusy tej wady nie mają, bo `statusLabels` liczy się zawsze przez `statusName(...)`.

**Proponowana poprawka:** w `ammo-effects.ts` dla gałęzi statysty rozwiń
`check.failure.injuries` na nazwy z kompendium (`deps.ctx.compendium`) i podaj je jako
`labels.injuries`, zamiast zostawiać `undefined`. Albo usuń fallback w `describeAmmoFailure`
i wymuś podawanie etykiet przez wołającego. Wymaga testu w `ammo-effects.test.ts`
(statysta w obszarze gazu).

### #5 — chip naboju nie odświeża się przy broni bez magazynka ✅ POPRAWIONE (22.08)

Po wybraniu amunicji dla **granatu** (`ammoMax = 0`) chip na pasku akcji **nie pojawia się
do przeładowania strony**. Przy strzelbie chip pojawia się natychmiast, bo zmiana naboju
odpala `weapon:reload`, który rozsyła `character:upsert`; granat magazynka nie ma, więc
zdarzenie nie leci i pasek nie jest przerysowywany. Nabój **jest** zapisany poprawnie
(`ammoId: ammo.tear-gas` w bazie) i atak działa — mylący jest tylko brak potwierdzenia
na ekranie.

### #8 — klik narzędziem osłon przecieka do warstwy gry ✅ POPRAWIONE (22.08)

Z gumką osłon w ręku kliknięcie **kasuje osłonę i jednocześnie wykonuje ruch albo ładuje
atak**. Zobaczone dwa razy z rzędu: skasowanie wraku wysłało Rica w marsz („Akcja Ruchu —
8,2 m ścieżki POZA BUDŻETEM TURY"), a skasowanie świeżo postawionego samochodu naładowało
kubek atakiem „Ciężki pistolet → Samochód · 14 m · PT 20". MG kasujący scenografię
przypadkiem przestawia figurę i pali jej turę.
**Przyczyna (ustalona):** `packages/client/src/map/MapRenderer.ts:1041` — handler `clicked`
wypisuje kolejność znaczeń kliknięcia i pomija narzędzie osłon. Linia 1044 wyklucza
`this.wall.armed || this.light.armed` (te obsłużone już na `pointerdown`), linia 1053
`rulerMode || fogBrush.armed || draw.armed || erasing` — ale `this.cover.armed`
**nie występuje nigdzie**, choć gałąź osłon w `pointerdown` (linia 1445) kończy się
`return`, dokładnie jak ściany i lampy.
**Poprawka (22.08):** dwa gettery zamiast czterech list pisanych z ręki —
`toolSpentThisClick` (narzędzia rozliczone na `pointerdown`: ściany, lampy, gniazda, osłony,
strefy) i `mapToolArmed` (wszystkie, pędzle włącznie). Przy okazji wyszło, że błąd był
**szerszy**: te same gałęzie mają strefy z 26f i gniazda sieciowe z 26b, a celownik, podgląd
trasy i kursor mapy nie znały części narzędzi. Pilnuje `packages/client/src/map-click.test.ts`.

### #7 — etykieta odchylenia granatu kłamie, gdy zadziała dolny limit ✅ POPRAWIONE (22.08)

Pudło Puszką hukową wypisało „odległość 1k10 = 5 − ZW 7 = **2 m**". 5 − 7 = −2; te 2 m to
dolny limit z `rollBlastScatter` (`packages/shared/src/systems/cpred/areas.ts:223`:
`clamp(distanceDie − stat, min, max)`, gdzie `min` = jedno pole = 2 m). Zachowanie jest
zamierzone (ładunek zawsze schodzi choć o pole), ale karta pokazuje działanie, które się
nie zgadza — MG przy stole policzy to na palcach i uzna za błąd.
Tekst skleja `packages/server/src/realtime/areas.ts:331`
(`${describeScatter(scatter)} = ${formatMetres(...)}`).
**Propozycja:** gdy limit zadziałał, pisać np. „5 − ZW 7 → najmniej 2 m (jedno pole)".

### #4 — dymek celowania ignoruje załadowany śrut ✅ POPRAWIONE (22.08)

Z załadowaną **Amunicją śrutową** dymek nad celem pokazuje przedział i PT z **tabeli kul**
(np. na 10 m: „Przedział 7–12 m · PT 15"), a nie stały PT śrutu i limit stożka 6 m. Klik
ładuje kubek, a dopiero rzut wraca odmową „Cel jest poza zasięgiem tej broni".
Karta po strzale jest już poprawna („PT 13 (śrut — stały) · stożek 6 m").
**Repro:** Rico, slot Bulldog z Amunicją śrutową, cel dalej niż 6 m.
**Poprawka (22.08):** `planAttackPreview` czyta nabój z komory tą samą drogą, którą czyta go
serwer (`loadedAmmoFor` + katalog ze sklepu kompendium) i podaje go planerowi. Za stożkiem
podgląd odmawia od razu, w stożku pokazuje stałe PT. Test:
`packages/client/src/aim-preview.test.ts`.

---

## 3. Ograniczenia narzędzia i obejścia (oszczędza dużo czasu)

- **CDP `right_click` NIE otwiera menu kontekstowego tokenu.** Wysyła sam trusted
  `pointerdown` z `button: 2`, bez `pointerup`/`contextmenu`, i Pixi tego nie obsługuje.
  Pełne zdarzenie wskaźnika (`pointermove` + `pointerdown`) menu **otwiera** — sprawdzone.
  **To koryguje starą „pułapkę dev" z POSTEP.md:** problemem jest wyłącznie PPM; lewy
  przycisk, przeciąganie i podwójny klik działają normalnie.
  Obejście (wklej po każdym przeładowaniu strony przez `javascript_tool`):

  ```js
  window.__shotW = 1496; // szerokość zrzutu ekranu z narzędzia
  window.__ppm = (sx, sy) => {
    const c = document.querySelector('canvas');
    const s = window.innerWidth / window.__shotW;
    const x = Math.round(sx * s),
      y = Math.round(sy * s);
    const mk = (t, b, bs) =>
      new PointerEvent(t, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        button: b,
        buttons: bs,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        view: window,
      });
    c.dispatchEvent(mk('pointermove', -1, 0));
    c.dispatchEvent(mk('pointerdown', 2, 2));
  };
  ```

- **`window.confirm` nie zawiesza sesji, jeśli się go przechwyci** — druga korekta pułapki
  z POSTEP. Wystarczy:

  ```js
  window.__confirms = [];
  window.__confirmAnswer = false;
  window.confirm = (m) => {
    window.__confirms.push(String(m));
    return window.__confirmAnswer;
  };
  ```

  Sprawdzone na ✕ w górnej belce: pytanie brzmi „Wyłączyć tryb turowy? Kolejka inicjatywy
  zostanie skasowana.", odpowiedź `false` zostawia kolejkę nietkniętą.

- **Współrzędne ze zrzutu ekranu ≠ współrzędne strony.** Mnożnik to
  `window.innerWidth / szerokość_zrzutu` (w tej sesji ~1,126). Narzędzie `computer` skaluje
  je samo; ręcznie wysyłane zdarzenia trzeba przeliczyć.

- **HMR psuje Pixi** (znane) — po każdej edycji kodu klienta **przeładuj kartę**, a potem
  wklej `__ppm` na nowo.

- Po przeładowaniu strony **numeracja slotów w lewym pasku się przesuwa** (znika linia
  podpowiedzi „Podgląd — kliknij tę figurę…"). Zawsze zrób zrzut przed klikaniem slotu.

---

## 4. Co JUŻ sprawdzone — nie powtarzaj

### Etap 13 — kompendium (było „odklikane tylko powierzchownie")

- ✅ Karta przedmiotu z **tabelą PT wg zasięgu** (Ciężki pistolet: 13/15/20/25/30/30).
- ✅ **Dodanie przedmiotu na kartę postaci** — select postaci + „Dodaj postaci", dla broni
  i pancerza; wiersz wchodzi z `compendiumId`, obrażeniami i magazynkiem.
- ✅ Chipy kategorii z licznikami, wyszukiwarka, „← Lista".
- ✅ Potwierdzona znana zaległość: **opisy broni markowych po angielsku** (Militech Bulldog).

### Górny pasek tury / tryb turowy u MG

- ✅ Przycisk wyszarzony z powodem „Na scenie nie ma tokenów, które mogłyby wejść do kolejki";
  po postawieniu tokenów: „Zakłada kolejkę inicjatywy (N)".
- ✅ Jeden klik zakłada kolejkę ze wszystkich tokenów sceny (nie było postaci graczy).
- ✅ **◀ ▶ przesuwają turę bez zaznaczonego tokenu.**
- ✅ **✕ pyta** „Wyłączyć tryb turowy? Kolejka inicjatywy zostanie skasowana." i odmowa
  zostawia kolejkę. (Ścieżka „tak" **niesprawdzona** — patrz §5.)
- ✅ **Remis rozstrzyga REF:** Brutus 8 (REF 6) przed Manekinem 8 (REF 5).
- ✅ „Rzuć wszystkim" **celowo** nie zostawia kart na czacie (kartę daje kostka przy wierszu
  — komentarz w `realtime/combat.ts:814`). To nie jest błąd.
- ✅ Żeton **ukryty** u MG: przygaszony, przerywana ramka, bez paska PW; w trackerze chip
  „UKRYTY".

### Menu kontekstowe tokenu (uznane wcześniej za nieosiągalne automatem)

- ✅ Otwiera się i zawiera: 🎯 Atak…, 🚫 Ukryj przed graczami, ✏️ Edytuj…, 🗑 Usuń,
  **listę statusów z checkboxami**, oraz skróty PW **−5 / −1 / +1 / +5**.
- ✅ Edytor tokenu: rozmiar, zasięg widzenia, światło, właściciel, **karta postaci**,
  „Pasek HP", **„Profil bojowy (statysta bez karty postaci)"** z kompletem pól.
  Wybór karty postaci chowa pola PW i tłumaczy, że PW pochodzi z karty.

### Ruch i budżet tury (etapy 14b/14c/16e, strona MG)

- ✅ Zaznaczenie klikiem, biały przerywany pierścień, podgląd trasy z licznikiem
  („10 m / 12 m") i znacznikiem ✖, pierścień zasięgu na mapie.
- ✅ Marsz po kliknięciu w podłoże, budżet schodzi poprawnie (Ruch 1/1, dystans 10/12 m).
- ✅ Przekroczenie budżetu przez MG: czerwony licznik „22 m / 12 m", chip „+N",
  wiersz na czacie „Akcja Ruchu — 22 m ścieżki **POZA BUDŻETEM TURY**".
- ✅ Lewy pasek **pamięta figurę** po przeładowaniu strony.
- ⚠️ **„✖ na granicy budżetu i wygaszony ogon" NIE dotyczy MG** — `MapRenderer.ts:546`
  mówi wprost, że budżet MG jest nieegzekwowany (`enforced === false`), więc trasa nie jest
  przycinana. Ten punkt zaległości 16e trzeba sprawdzić **na koncie gracza**.

### Atak z mapy, PT z odległości, obrażenia (etapy 15, 16, 16b, 16f)

- ✅ **MG celuje z `Alt`** (dla MG każdy token jest „własny"); czerwone narożniki celownika
  i dymek: nazwa, broń, dystans, przedział, PT, „Naboje 8 → 7".
- ✅ **PT z tabeli zasięgów** zweryfikowane trzykrotnie: C. pistolet 32 m → PT 25 (przedział
  26–50); HPM 32 m → PT 20; HPM ogień ciągły 10 m → PT 17; Bulldog 10 m → PT 15.
- ✅ Kubek, rzut 3D, karta z rozbiciem („Refleks (REF) +8", „Broń krótka +6").
- ✅ **Krytyk z dorzutem** („10 + 14 + 6 · Krytyk! dorzut +6").
- ✅ Karta obrażeń z wyborem celu i lokacji, „Zastosuj" **tylko u MG**.
- ✅ **Pancerz zatrzymał cios** (11 obr. vs OB 12): PW 50 → 50, **bez ablacji**.
- ✅ **Przebicie**: 16 obr. − OB 12 = 4; PW 50 → 46; **ablacja OB 12 → 11**; chip progu rany
  „Bez ran → Lekko ranny".
- ✅ **„Cofnij"** przywraca PW **i** pancerz (zweryfikowane w bazie: 50 PW, OB 12/12),
  wpis zostaje przekreślony z chipem „Cofnięte — MG".
- ✅ Podwójny klik w token otwiera kartę postaci.
- ✅ Klik w slot lewego paska przejmuje sterowanie i uzbraja broń.

**Zweryfikowane wobec podręcznika (nie są to błędy, choć wyglądały podejrzanie):**

- „**brakło 5**" przy 21 vs PT 25 jest poprawne: podręcznik mówi „twój rzut … musi być
  **wyższy** od PT" (rozdz. 9), więc trafienie wymaga 26 (`attacks.ts:742: hit = margin > 0`).
- **Brak ablacji pancerza przy zatrzymanym ciosie** jest poprawny: „**Jeśli tracisz Punkty
  Wytrzymałości**, pancerz … OB spada o 1" (rozdz. 10).
- **Przycisk „Unik" pojawia się celowo także przy REF < 8** — komentarz w
  `realtime/attacks.ts:1125` zostawia próg REF 8+ decyzji MG. Warto o tym pamiętać przy stole.

### Ogień ciągły i zaporowy (etap 16)

- ✅ Chipy „seria"/„zapora" na osobnych slotach; podpowiedzi „10 naboi, obrażenia 2k6 ×
  przerzut (do ×3)" i „10 naboi, testy SW u wszystkich w 25 m".
- ✅ Ogień ciągły: własna tabela PT (10 m → 17), umiejętność **Ogień ciągły**, zużycie
  **10 naboi**.
- ✅ **Ogień zaporowy**: karta z „PT dla celów 15 · zasięg 25 m" i **wymuszonym testem dla
  każdej figury w promieniu**, z rozbiciem „SW+Koncentracja rzut+mod = wynik vs PT" i
  wynikiem „— do osłony". Nie ma linii „w zasięgu 25 m: N" (zgodnie z poprawką z 16h).

### Amunicja specjalna (etap 16g — wcześniej **zero** oględzin)

- ✅ (1) **Select naboju filtruje po kształcie**: pistolet/HPM tylko kule; Bulldog dodatkowo
  śrut, brenekę i naboje zapalarki; **granat wyłącznie naboje granatowe** (gaz łzawiący,
  dym, EMP, usypiająca, biotoksyna, zatruta, hukbłyskowa, przeciwpancerna, zapalająca).
- ✅ (2) **Zmiana naboju w walce kosztuje Akcję**: na czacie „Rico — **Przeładowanie**",
  magazynek napełniony do pełna (3/4 → 4/4).
- ✅ (3) **Chip naboju na slocie** paska akcji — „Militech B… [Amunicja śrutowa] 4/4"
  w fioletowej ramce.
- ✅ (4) **Pomarańczowy stożek 6 m** chodzi za kursorem; **klik celuje w figurę**, nie w pole.
- ✅ (5) **Karta ataku śrutem**: „PT 13 (śrut — stały) · nabój: Amunicja śrutowa ·
  magazynek 3/4 · stożek 6 m" + lista trafionych („Manekin — 5 m od środka").
- ✅ Odmowa poza stożkiem: „Cel jest poza zasięgiem tej broni" (ale dymek nie ostrzega —
  błąd #4).

### Granat i obszary (etap 16d — wcześniej **zero** oględzin)

- ✅ **Pomarańczowy kwadrat 5×5** chodzi za kursorem i obejmuje figury.
- ✅ **Regresja 16e**: z granatem w ręku **podgląd trasy znika**.
- ✅ Klik w podłoże ładuje kubek; karta: „Puszka hukowa → **wybrane pole** · 1d10+12",
  rozbicie „Zwinność (ZW) +7 · Atletyka +5", „Trafienie · 6 m (0–6 m) · PT 14 ·
  **obszar 10×10 m**" i lista trafionych z odległością od środka (Brutus 0 m, Manekin 2 m,
  Zbir 5 m).
- ✅ **„Zastosuj wszystkim (3)"** rozlicza każdą figurę osobnym wpisem z **własnym „Cofnij"**
  i własnym pancerzem: Zbir 18 − OB 7 → PW 30→19, OB 7→6; Brutus 18 − OB 4 → PW 55→41,
  OB 4→3; Manekin 18 − OB 12 → PW 50→44, OB 12→11.
- ✅ **Przycisk „Odskocz"** pojawia się przy figurze z REF 8+ (Rico) na liście obszaru,
  i tylko przy niej.

### Amunicja bez obrażeń — gaz (etap 16h — wcześniej **zero** oględzin)

Sprawdzone granatem („Puszka hukowa" + `ammo.tear-gas`) rzuconym tak, by objąć cztery figury.

- ✅ **Karta ataku gazem bez przycisku „Obrażenia"** dającego zwykłe obrażenia — zamiast
  tego linia „nabój: Amunicja z gazem łzawiącym · obszar 10×10 m · **test Odporność na
  tortury/narkotyki PT 13**".
- ✅ **Serwer rzuca test za każdą figurę**, z pełnym rozbiciem i obiema ścieżkami wyniku:
  „Rico — 2 m · Odporność na tortury/narkotyki 6+5 = 11 vs PT 13 · **Uraz oka · na minutę**",
  „Manekin — 3 m · 2+12 = 14 vs PT 13 — **oparł się**".
- ✅ **Rana krytyczna „na minutę"** z chipem **„na minutę — do rundy 7"** i opisem efektu
  („−2 do ataków dystansowych i Testów Percepcji opartych na wzroku").
- ✅ **Przycisk „Minęła minuta"** u MG na karcie.
- ✅ Statysta dostaje sensowną notkę „Statysta nie ma karty — ranę krytyczną rozstrzyga MG."
- ⚠️ …ale wypisuje przy tym **surowe id rany** — błąd #6.
- ⚠️ Linia „Pancerz zatrzymał cios (0 obr., OB 0) · rzut 0 · bez pancerza" przy naboju,
  który **z definicji nie zadaje obrażeń**, jest myląca (Zbir ma OB 7 w profilu). Do
  rozważenia osobne brzmienie dla `noDamage`.

### Druga sesja (2026-08-08, ciąg dalszy) — granat, amunicja bez obrażeń, osłony

Granat i obszary (16d):

- ✅ **„Odskocz"** klikalny: dopisuje do karty „Odskok Rico: 5 vs 15 — nie zdążył" i **zdejmuje
  przycisk** z wiersza figury. Test sporny z wynikiem rzutu ataku. (Udany odskok — niesprawdzony.)
- ✅ **`Esc` chowa szablon** granatu i czyści kubek. Drabina Esc działa zgodnie z komentarzem
  w `MapArea.tsx:1378`: szablon → broń w ręku → narzędzie mapy. **Menu kontekstowe tokenu
  Esc nie zamyka** (zamyka je klik poza menu) — drobiazg, nie wpisany jako błąd.
- ✅ **Pudło z odchyleniem**: „Fumble! dorzut −3 · Pudło · brakło 5 · odchylenie — kierunek
  1k10 = 5 (144°) · odległość 1k10 = 5 − ZW 7 = 2 m". Krater **widocznie przesunięty**
  względem punktu celowania. Etykieta myli przy dolnym limicie — błąd #7.

Amunicja bez obrażeń (16h):

- ✅ **„Minęła minuta"**: przycisk znika, chip zmienia się na **„Efekt minął"**, PW bez zmian
  (45/45), a rana **schodzi z karty postaci** („Brak ran krytycznych").
- ✅ **Amunicja usypiająca**: „Manekin — 3 m · Odporność na tortury/narkotyki 1+12 = 13 vs
  PT 13 · **Powalony, Nieprzytomny** · na minutę". Oba statusy zaznaczone w menu kontekstowym
  tokenu, ikony widoczne nad żetonem. (13 vs PT 13 to porażka — zgodnie z zasadą „wyżej niż PT".)
- ✅ **Amunicja EMP**: test **Cyberinżynieria PT 15**, ikona **(⚡)** na tokenach wszystkich
  trzech figur, chip „na minutę — do rundy 7".
- ✅ **Amunicja dymna**: szary kwadrat „Dym −4" na mapie; strzał z jego wnętrza ma **nazwany
  wiersz „Dym −4"** w rozbiciu („Refleks (REF) +8 · Broń krótka +6 · Dym −4"). Dymek
  celowania o dymie **nie wspomina** — to samo co błąd #4.
- ✅ **Gumka dymu**: licznik „dymu: 1" → kosz → „brak dymu", chmura znika.
- ⚠️ Chip naboju na slocie po zmianie amunicji dalej wymaga przeładowania strony (błąd #5) —
  potwierdzone przy każdej z czterech zmian.

Osłony (16c, strona MG) — **wcześniej zero oględzin**:

- ✅ Skrót **`O`** otwiera pasek osłon; **przeciągnięcie stawia osłonę** („Samochód 25/25"
  z paskiem PW).
- ✅ **10 presetów** z materiałem i PW: Samochód 25, Opancerzony wóz 50, Kontener 25, Słupek
  betonowy 25, Barierka 10, Murek 20, Skrzynia 20, Barykada 5, Kuloodporna witryna 15,
  Automat 15.
- ✅ **`Esc` dwustopniowy**: pierwszy porzuca prostokąt w trakcie przeciągania, kolejne idą
  drabiną (broń → narzędzie).
- ✅ **Cel za osłoną**: dymek „Cel jest za osłoną — ostrzelaj osłonę albo strzelaj mimo niej.
  Samochód: 25/25 PW", a pod kartą ataku wybór **[Ostrzelaj osłonę] [Strzelaj mimo osłony]**.
- ✅ **Osłona jako cel**: karta „Ciężki pistolet → Samochód", obrażenia bez pola lokacji
  i bez OB, wpis „Samochód OSŁONA · Przebicie: 9 obr. · rzut 9 · bez pancerza · PW 25 → 16"
  z „Cofnij". Etykieta na mapie i pasek PW idą za wynikiem.
- ✅ **Wrak**: po zejściu do 0 PW obrys przygaszony, podpis „Samochód (wrak)", na czacie
  **„Osłona zniszczona — nadwyżka 7 obrażeń przepada"**. Wrak **przestaje zasłaniać** —
  następny strzał w Kaię jest już zwykłym strzałem (PT 20 z przedziału 13–25 m).
- ✅ **Gumka** kasuje osłonę i wrak (licznik „osłon: N" schodzi) — ale patrz błąd #8.
- ✅ Osłona **blokuje ruch**: podgląd trasy obchodzi ją łamaną.
- ⚠️ Tytuł karty obrażeń dla osłony brzmi „Ciężki pistolet — obrażenia **(Korpus)**", choć
  osłona lokacji nie ma. Pole wyboru lokacji faktycznie znika; zostaje sam nagłówek.

Amunicja inteligentna i edytor kompendium (16g/13):

- ✅ **„Popraw strzał 1k10+10"** po pudle o ≤ 4: karta pudła („brakło 3") niesie przycisk,
  a pod nim kursywą **„Ten nabój wymaga cyborgizacji »Celownik optyczny« — VTT tego nie
  sprawdza."** Klik przepisuje kartę: „poprawka naboju: 1k10+10 = 12 — znowu pudło",
  przycisk znika. (Nagłówek zostaje przy pierwotnym „1d10+14", choć rozbicie pokazuje już
  „2 + 10" — czytelne dzięki linii opisowej, ale niespójne.)
- ✅ **Formularz wpisu amunicji** („+ Własny wpis" → kategoria _Amunicja_) ma komplet pól
  z 16g: rodzaje naboju, pancerz −, podpalenie, „nie uszkadza pancerza", „bez ran
  krytycznych", „zostawia 1 PW", „bez celowania", stożek, zasięg, „nie zadaje obrażeń",
  **test** (umiejętność / nazwa / cecha / PT), **porażka** (obrażenia / statusy / rany /
  czas), „działa tylko na cele biologiczne", **dym** (bok / kara), **poprawka** (premia /
  max chybienie) i „wymaga".
- ⚠️ **Etykiety formularza bez polskich znaków**: „Stozek: PT", „Nie zadaje obrazen",
  „Test: umiejętnosc", „Porazka: obrażenia", „Dziala tylko na cele biologiczne". Projekt
  wymaga poprawnej polszczyzny w UI.
- ⚠️ Pola oczekują **surowych id** (`resist-torture-drugs`, `injury.head-uraz-oka`) — MG
  musi je znać z pliku, nie ma podpowiedzi ani selecta.
- ⚠️ **„Usuń" własnego wpisu nie pyta o potwierdzenie** (przechwycony `window.confirm` nie
  dostał ani jednego pytania). Wpisy z podręcznika nie mają „Edytuj/Usuń" — i słusznie.

Śmiertelne rany (etap 15) — **wcześniej zero oględzin**:

- ✅ Progi z menu tokenu: PW 4/50 zapala **„Poważnie ranny"**, PW 0 przełącza na
  **„Śmiertelnie ranny"** (i gasi poprzedni). PW nie schodzi poniżej 0.
- ✅ Na turze śmiertelnie rannego górny pasek dostaje czerwony przycisk
  **„Test Przeżywalności"**, a po pierwszym rzucie **„Test Przeżywalności +1"** (kara rośnie).
- ✅ Rzut: „Test Przeżywalności · 1d10 · 10 · **Śmierć · Naturalna 10 — automatyczna
  porażka**"; token dostaje status **„Martwy"** i czaszkę.
- ✅ **Ustabilizowanie od zera** (cel, który nigdy nie rzucał Testu): Kaya → Brutus,
  „1d10+12 · 27 · Technika (TECH) +6 · Pierwsza pomoc +6 · Krytyk! dorzut +5 ·
  **Ustabilizowany · Pierwsza pomoc 27 vs PT 15 · cel wraca do 1 PW**". Brutus: 1/55 PW,
  „Śmiertelnie ranny" zgaszony, „Poważnie ranny" zapalony.
- ✅ Lista celów Ustabilizowania oznacza zdrowych chipem **„BEZ RAN"**.
- ⚠️ Przycisk „Test Przeżywalności +1" **zostaje na pasku martwej figury**.
- ⚠️ Ustabilizować można też **martwego** (Manekin był na liście bez ostrzeżenia).

Zwarcie (etap 14d) — **wcześniej zero oględzin**:

- ✅ **Pochwycenie**: panel „ZWARCIE" z listą figur i parą przycisków **[Pochwyć]
  [Przedmiot]**. Karta: „Pochwycenie → Brutus · 1d10+14 · 29 · Zwinność (ZW) +8 ·
  Bijatyka +6 · Krytyk! dorzut +5 · **Udane** · zwarcie · 0 m · **PT 19 (ZW + Bijatyka
  celu)**" — test sporny przeciw statycznej wartości celu.
- ✅ **„Broń się"** przepisuje tę samą kartę: chip „Udane" → **„Nieudane"**, dopisek
  „**Obrona Brutus: 29 → wywinął się**". Slot trzymającego wraca z „Zwarcie" na
  „Pochwycenie", ikona zwarcia znika z trackera.
- ✅ Trzymany dostaje slot **„Wyrwij się"**, a jego pasek pokazuje **„0 m / 12 m"**.
- ✅ Konsekwentnie z zasadą „wyżej niż PT": rzut **19 vs PT 19 to porażka**.
- ⚠️ Przycisk „Broń się" pojawia się także pod **nieudanym** pochwyceniem — nie ma się
  przed czym bronić.
- ℹ️ **Blokady statusowe są u MG niesprawdzalne**: `packages/server/src/realtime/movement.ts:216`
  (`refuseBlockedByStatus`) zaczyna od `if (user.role === ROLE_GM …) return false`, więc
  MG przesuwa Pochwyconego i Powalonego bez odmowy (Brutus przeszedł 23,3 m mimo „0 m").
  To zamierzone — punkty 14d/14e o odmowach ruchu trzeba sprawdzić **na koncie gracza**.

Inne:

- ✅ **Zakładka „AI" u MG otwiera się** (martwa zaległość z etapu 09) i degraduje się
  łagodnie: chip „boty offline · brak połączenia z gatewayem", „fetch failed", pola „Rola
  modelu" i „Pytanie" z podpowiedzią „Boty offline — uruchom AI Gateway", checkbox „Pokaż
  rozumowanie (tryb asystenta MG)".
- ✅ **Monity początku tury (14e/16h)** działają na żywo: „Brutus — Początek tury — Impuls
  EMP wyłączył ci dwie cyborgizacje — MG mówi które." oraz „Manekin — … Ostrzał przygwoździł
  cię do ziemi — rusz się do osłony." Ten sam tekst wchodzi w żółty pasek nad mapą.

---

## 5. Co ZOSTAŁO do zrobienia — plan dokończenia

Kolejność jest celowa: najpierw to, czego nikt nigdy nie widział.

### A. Reszta granatu i obszarów (16d) — zostały dwa punkty

1. ~~Pudło z odchyleniem~~ — **zrobione** (patrz §4, druga sesja).
2. ~~`Esc` chowający szablon~~ — **zrobione**.
3. ~~Kliknięcie „Odskocz"~~ — **zrobione** (nieudany odskok; udany wciąż niewidziany).
4. „Zasłonięty ścianą" / „zasłonięty: Samochód" **na liście trafionych obszarem** — osłony
   są już przetestowane (§4), zostaje rzucić granat zza samochodu.
5. **„Rzuć"** w `AttackLauncher` na zwykłej broni (rzut przedmiotem).

### B. Amunicja bez obrażeń (16h) — **zamknięte poza jednym punktem**

Punkty 1–4 i 6–9 zrobione (§4, druga sesja). Zostaje: 5. **Chip „na minutę — do rundy N" na karcie postaci**, w sekcji „RANY KRYTYCZNE". Na karcie
obrażeń chip jest; kartę postaci widziano tylko **po** „Minęła minuta", czyli już pustą
(„Brak ran krytycznych"). Trzeba trafić gazem figurę z kartą i zajrzeć na kartę **przed**
zdjęciem efektu.

### C. Ściany i linia strzału (16b) — **osłony zamknięte, zostały mury**

Punkty 1–7 (osłony) zrobione — patrz §4, druga sesja; z gumki wyszedł błąd #8. Nie
sprawdzono jeszcze kosza **„usuń wszystkie osłony"** (kasowano pojedynczo). 8. **Ściany**: narzędzie `W` działa dopiero przy widoczności „Dynamiczna" — trzeba przełączyć
scenę w zakładce „Sceny" (albo założyć drugą scenę „Poligon — mury"), postawić ścianę
i sprawdzić strzał przez nią, przez szybę i przez zamknięte drzwi.

### D. Zwarcie i statusy (14d, 14e) — częściowo zrobione

Kaya i Brutus stoją obok siebie na wschodzie mapy; Kaya ma slot „Pochwycenie".

1. ~~Pochwycenie + „Broń się"~~ — **zrobione** (§4, druga sesja).
2. **Duszenie** (seria), **Rzut**, **Ludzka tarcza**; odmowa Uniku Ludzkiej tarczy.
   Wchodzi się w nie slotem **„Zwarcie"**, który pojawia się u trzymającego po udanym
   pochwyceniu — trzeba więc najpierw pochwycić i **nie** klikać „Broń się".
3. ~~Blokada ruchu Trzymanego~~ — **niesprawdzalna u MG** (`movement.ts:216`), do sekcji F.
4. **Statusy z menu kontekstowego** — j.w., odmowy nie dotyczą MG. Zostaje sprawdzić
   **„Wstanie" zdejmujące Powalonego** (to nie odmowa, więc u MG zadziała).
5. **Rany krytyczne blokujące** Akcję/ruch (Uraz kręgosłupa, Uraz ucha) — wpisuje się je
   na karcie postaci w sekcji „RANY KRYTYCZNE"; odmowy znów tylko u gracza, ale **dług
   następnej tury** („owes" w trackerze) widać u MG.
6. **DoT (Podpalony)** na granicy tury. Monity z 14e — **zrobione** (§4).

### E. Śmiertelne rany i Test Przeżywalności (etap 15) — **zrobione**

Wszystkie cztery punkty zamknięte (§4, druga sesja). Niesprawdzone zostało tylko
**narastanie kary w praktyce** (seria testów tej samej figury — pierwszy rzut od razu
zabił Manekina) oraz **modyfikatory z ran krytycznych** do Testu.

### F. Strona gracza w oknie prywatnym (największa zaległość przekrojowa)

Użytkownik **włączył rozszerzeniu dostęp do trybu prywatnego** — poproś go o otwarcie okna
incognito z linkiem zaproszenia (§1) i utworzenie gracza; potem przypisz mu **Kaię**
(Postacie → select właściciela) i **token Kai** (menu tokenu → Edytuj… → Właściciel).
Do sprawdzenia:

1. **Celownik bez `Alt`** (u gracza nie trzeba modyfikatora).
2. **Pasek wyszarzony z powodem** „To nie jest tura tej postaci" poza turą.
3. **`Tab`** pokazujący wyłącznie własne tokeny.
4. **Brak PW cudzego tokenu** w panelu.
5. **Trasa przycięta budżetem**: ✖ na granicy i wygaszony ogon (u MG niedostępne — §4).
6. **Karta odmowy** z przyciskiem „Przepuść" u MG i powtórzenie akcji przez gracza (14b).
7. **Snap-back** odrzuconego przeciągnięcia i „Za daleko o X m" (14c).
8. **„Broń się"** u broniącego się gracza (14d).
9. **Redakcja**: ogień zaporowy Rica wymienia z nazwiska **ukrytego Zbira** — u gracza
   ten wiersz **nie może się pojawić** (poprawka z 16h). To najważniejszy test bezpieczeństwa
   danych w tym zestawie.
10. Ikona 🪟 i komunikaty okien/drzwi u gracza (18d/18e).

### G. Drobiazgi do sprawdzenia przy okazji

- Ślad ścieżki przy **przeciąganiu** tokenu (łamana z licznikiem metrów). **Korekta z tej
  sesji:** `left_click_drag` z CDP **działa** — postawił nim osłony — więc warto spróbować
  także na tokenie.
- **Token 2×2** przy metrowych drzwiach.
- ~~Zakładka „AI" u MG~~ — **zrobione** (§4, druga sesja).
- Ścieżka **„tak"** na ✕ trybu turowego (kasowanie kolejki) — na sam koniec.

---

## 6. Obserwacje bez rangi błędu (do decyzji MG)

- **Wiersz broni bez `compendiumId` jest martwy mechanicznie.** „Dodaj broń" na karcie
  tworzy pusty wiersz ręczny; kolumna AMUNICJA pokazuje „—", bo bez wpisu kompendium nie ma
  z czego wywnioskować typu, zasięgów ani trybów ognia (`hotbar.ts:72`). W żywej kampanii
  tak wygląda „Bardzo ciężki pistolet" Johnny'ego — **jego broń nie ma tabeli PT**.
- **Próbki publiczne dokładają się do katalogu**, nie tylko zastępują braki: 26 wpisów
  z `data/public/cpred/compendium/sample.json` (w tym **10 naboi „przykładowych"**) stoi
  w kompendium obok 147 prawdziwych, bo ich id nie kolidują. Dla testów to zaleta — jest
  gotowy **granat rzucany** (`weapon.puszka-hukowa`), którego prawdziwy katalog nie ma —
  ale przy stole MG widzi „Nabój przykładowy" obok drukowanych.
- **Notacja kości jest niespójna:** karta postaci i kompendium piszą „3k6", karty na czacie
  „3d6" i „1d10+14". Projekt deklaruje polskie „k".
- **Dymek celowania pokazuje stan sprzed marszu**, jeśli załadować kubek w trakcie animacji
  ruchu — serwer i tak przelicza dystans w chwili rzutu (i to jest właściwe zachowanie),
  ale etykieta potrafi się rozminąć z kartą.

---

## 7. Kształt karty postaci (do skryptów)

```json
{
  "schemaVersion": 2,
  "stats": {
    "int": 5,
    "ref": 8,
    "dex": 7,
    "tech": 5,
    "cool": 5,
    "will": 5,
    "luck": 5,
    "move": 6,
    "body": 8,
    "emp": 5
  },
  "hpCurrent": 45,
  "luckCurrent": 5,
  "humanityCurrent": 50,
  "roleId": null,
  "roleAbilityRank": 1,
  "skills": { "handgun": 6, "shoulder-arms": 6, "autofire": 4, "evasion": 6, "athletics": 5 },
  "weapons": [
    {
      "id": "zwyqs8zz",
      "name": "Ciężki pistolet",
      "notes": "",
      "compendiumId": "weapon.heavy-pistol",
      "damage": "3k6",
      "ammoCurrent": 8,
      "ammoMax": 8,
      "ammoType": "C. Pistolet",
      "rof": "2"
    }
  ],
  "armor": [
    {
      "id": "45u804e6",
      "name": "Lekka kurtka kuloodporna",
      "notes": "",
      "compendiumId": "armor.light-armorjack",
      "sp": 11,
      "spCurrent": 11,
      "location": "body"
    }
  ],
  "gear": [],
  "cyberware": [],
  "criticalInjuries": [],
  "deathSaves": 0,
  "eddies": 0,
  "notes": ""
}
```

PW max = `10 + 5 × ceil((BC + SW) / 2)`. Baza a umiejętność: karta pokazuje sumę cechy
i poziomu. Wiersz broni **musi** mieć `compendiumId`, inaczej nie ma statystyk.

Baza dev: `packages/server/dev.db` (nie `prisma/dev.db` — ten jest pusty).
`better-sqlite3` leży w `node_modules/.pnpm/better-sqlite3@12.11.1/node_modules/better-sqlite3`.

---

## 8. Stan testów automatycznych po poprawkach

- `pnpm --filter @vtt/shared test` — **727 testów, wszystkie przechodzą** (1 nowy).
- `pnpm --filter @vtt/server test` — **424 testy, wszystkie przechodzą**.
- `npx tsc --noEmit -p packages/client/tsconfig.json` — czysto.
- **Nie uruchomiono jeszcze:** `pnpm lint`, `pnpm format`, `pnpm build`. Do zrobienia przed
  commitem poprawek #2 i #3.

---

## 9. Stan na koniec sesji — od czego zacząć następną

Serwer dev podnosi się jednym poleceniem:

```
pnpm dev                      # :3001 + Vite :5173
```

Potem w przeglądarce: zaloguj MG (**hasła nie wpisuję sam — poproś właściciela**),
wejdź na `http://localhost:5173` i wklej helper `__ppm` z §3 (`__shotW` ustaw na szerokość
zrzutu, jaką zwraca narzędzie — w drugiej sesji było to 1496).

**Kod jest zacommitowany** (stan po drugiej sesji, gałąź `main`):

- `aa9854d` — poprawka #2 (statysta dostaje wybraną broń)
- `f750688` — poprawka #3 (rozmiar magazynka na karcie, nowe pole `ammoMax`)
- `9a1c39c` — ten plik i `POSTEP.md`

`pnpm lint` czysty, `pnpm build` przechodzi, testy: **726 w `shared`, 424 w `server`**.
Uwaga: `pnpm format` przeformatował przy okazji dziesięć plików `docs/etapy/*` (tabele
markdown) — te zmiany zostały **cofnięte**, żeby nie zaszumiać commitu. Jeśli ktoś chce je
wprowadzić, warto zrobić to osobnym commitem „format only".

**Wszystkie osiem błędów jest już poprawionych** (#2 i #3 tego samego dnia, reszta w sesjach
naprawczych 21.08 i 22.08). Rozdział §2 zostaje jako historia — opisy przyczyn są nadal
najlepszym opisem tych miejsc w kodzie — ale nie ma w nim nic do zrobienia.

**Kampania „Ulice Night City" jest nadal zdezaktywowana.** Nie przywracaj jej, dopóki
testy trwają — poligon musi być kampanią aktywną. Przywróć dopiero po zamknięciu listy z §5
(Panel MG → „Ulice Night City" → _Aktywuj_; od 22.08 bez przeładowania karty).

**Stan poligonu w bazie po drugiej sesji** (do odtworzenia sytuacji albo do wyzerowania):

- **Rico** 45/45, stoi samotnie na zachodzie, ~28 m od reszty. Pistolet 3/8, HPM 39/40
  z **amunicją inteligentną**, Bulldog 3/4 na śrucie, Puszka hukowa z **amunicją dymną**.
- **Manekin** 0/50 — **MARTWY** (Test Przeżywalności: naturalna 10). Statusy: Śmiertelnie
  ranny, Nieprzytomny, Powalony, Martwy, EMP.
- **Brutus** 1/55, poważnie ranny, ustabilizowany przez Kaię, **pochwycony** (Kaya trzyma).
  Status EMP.
- **Kaya** 40/40, stoi przy Brutusie, trzyma go w zwarciu.
- **Zbir** 19/30 (OB 6/7), Uraz oka „na minutę", EMP.
- Na mapie **jedna osłona** „Samochód 25/25" na wschodzie; dym skasowany, wrak skasowany.
- RUNDA 1, **tura Manekina**, budżety mocno przekroczone (MG może).

Najprościej wyzerować: PW skrótami „+5" w menu tokenu, statusy odklikać w tym samym menu,
rany krytyczne na kartach postaci, osłonę koszem w narzędziu `O`, a walkę przez ✕ w górnej
belce i „Włącz tryb turowy" od nowa. Uwaga: **Manekin jest martwy** — żeby dalej służył za
worek treningowy, trzeba mu zdjąć „Martwy" i „Śmiertelnie ranny" ręcznie.
