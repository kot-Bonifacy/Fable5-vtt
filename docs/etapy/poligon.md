# Poligon bojowy — stan sceny testowej

Wyprowadzone z `POSTEP.md` 22.08.2026. Czytaj, gdy siadasz do oględzin w przeglądarce.
Stan opisany na 22.08.2026 — po każdej sesji oględzin sprawdź, czy nadal się zgadza
(trzy rozjazdy z opisem wyszły przy oględzinach 22.08).

Opis niżej uwzględnia trzy poprawki z oględzin 22.08: karta **„Test 27x" należy do avatar9**
(nigdy do MG), żeton **„Kolec" ma właściciela** (bez tego gracz nie mógł się podłączyć do Sieci
mimo posiadania karty), a **punkt dostępu jest odsłonięty** (w bazie miał `hidden = 1`).

**🎯 Poligon jest przygotowany pod stół — nic nie trzeba budować od nowa.** Na scenie
„Strzelnica" stoi odsłonięty **„Punkt dostępu"** i obok niego żeton **„Kolec"** związany z kartą
**„Test 27x"** — Netrunner z Interfejsem 7 i cyberdekiem doskonałej jakości (Gumka, Pancerz,
Miecz, Młot na wroga, Superklej, Szabloząb). Architektura **„siec klub"** ma teraz **cztery
piętra**: 1 „Poczekalnia", 2 „Strażnik piętra" z Piekielnym ogarem, 3 **„Węzeł ochrony" (PT 8)**
z dwoma urządzeniami — **„Kamera nad bramą"** (wpis „Kamera obserwacyjna") i **„Grzechot"** (wpis
„Automatyczna wieżyczka", związany z żetonem **„Automatyczna wieżyczka"** stojącym na mapie:
REF 7, Umiejętność 7, karabin szturmowy 25/25, PW 25/25) — oraz 4 **„Serce sieci"** z **Diablikiem**
(REZ 15, Interfejs 3, 2 Akcje Sieciowe, Wartość bojowa 14). Tryb turowy jest **wyłączony**;
kolejka „PRZED WALKĄ" z Tonym i avatar9 wraca jednym kliknięciem „Włącz tryb turowy".
**Od 26f na „Strzelnicy" leży też ⚠ „Podłoga elektryczna"** — prostokąt ~20 × 13 m nad żetonami,
**uzbrojona i ukryta** (gracz jej nie dostanie, dopóki nie zda Percepcji PT 17 z 4 m). Kto na nią
wejdzie, dostaje 6k6 przez pancerz i jeszcze raz na koniec każdej swojej Tury. Karta strefy
otwiera się narzędziem ⚠ w trybie 📌; „Rozbrój" ją usypia, kosz usuwa.

**„Poligon bojowy" stoi na poziomie sklepu 2 (Zawodowe)** — przestawione 22.08 decyzją MG wprost
w bazie (`Campaign.shopTier`), bo migracja dawała każdej kampanii `shopTier = 1` i gracz nie kupił
by niczego droższego niż 50 ed. Przełącznik 1–4 jest w zakładce **„Kompendium"** pod chipami
kategorii; MG kupuje przez wszystkie poziomy niezależnie od niego. **Sprawdzone 22.08:** Kompendium pokazuje „Sklep: **Zawodowe** · Do 500 ed", a wpisy wyższych
poziomów są wyszarzone z powodem — wartość z bazy dociera do UI poprawnie.

## Stan po ostatnich oględzinach (22.08, trzecia sesja tego dnia)

Przywrócone: tryb turowy wyłączony, rana zdjęta, wszystkie ściany i okna skasowane, widoczność
z powrotem „Pełna". Zostawione świadomie: punkt dostępu odsłonięty, „Kolec" u avatar9, avatar9
dwie kratki niżej z naklejką „Onieśmielony" i +50 ed z testowego przelewu.

## Stan po oględzinach 22.08 (piąta sesja tego dnia)

Bez zmian względem opisu wyżej. W trakcie sesji Poligon był używany do odklikania zaległości
i **przywrócony**: tryb turowy wyłączony (kolejka skasowana), „Kolec" wrócił pod punkt dostępu,
osłona **„Samochód 25/25"** odtworzona presetem w tym samym miejscu po sprawdzeniu kosza „usuń
wszystkie osłony", tymczasowa ściana przy Tonym skasowana, wpis testowy w kompendium i dodany
wiersz broni Tony'ego usunięte. Scena testowa **„Korytarz 16e"** (ściany, trzy żetony, w tym
figura 2×2) powstała na czas oględzin i została skasowana razem z zawartością — jeśli będzie
znów potrzebna, zbuduj ją od nowa: scena z widocznością „Dynamiczna", ściana w kształcie L,
żeton 1×1 z profilem bojowym i paskiem HP oraz żeton 2×2.

## Scena „Efekty 23x" (23.08, sesja triażu zaległości)

Osobna scena w tej samej kampanii, zbudowana **zamiast ruszania Strzelnicy** (decyzja MG).
Widoczność `open`, pusta siatka 100 px, dwie figury 1×1:

- **Strzelec 23x** — statysta (profil bojowy): Umiejętność 10, Unik 2, pancerz OB 0,
  broń **Granatnik**, magazynek wystrzelany do 0/2 (przeładowanie kosztuje Akcję).
- **Cel 23x** — statysta: pancerz **OB 6** (zaczynał od 7, ablacja zdjęła jeden), PW 33/35.

Do czego służy: efekty walki z 27i (wybuch odklikany, **zostają gaz i wyładowanie strefy**)
i wszystko, co wymaga trybu turowego bez dotykania Strzelnicy. Walka jest zakończona, scena
stoi w podglądzie — aktywna jest z powrotem „Strzelnica". Do gazu trzeba wpisu amunicji
gazowej w magazynku, do wyładowania — strefy „Podłoga elektryczna" narzędziem stref.

**Uwaga:** karta ataku statysty nie ma przycisku „Obrażenia" (błąd opisany w `zaleglosci.md`),
więc rzut obrażeń obszarowych wymaga figury z **kartą postaci** albo naprawy tego błędu.

## Stan po oględzinach 23.08 (etap 27k — edycja sceny)

**Rozjazd z opisem wyżej, zastany na starcie sesji (nie spowodowany przez 27k):**

- **⚠ „Podłogi elektrycznej" nie ma na Strzelnicy.** Licznik stref w pasku pokazywał „brak stref"
  jeszcze zanim cokolwiek w tej sesji ruszono. Opis z 26f jest w tym punkcie nieaktualny.
- **Osłony „Samochód 25/25" też nie ma.** Licznik osłon startował od zera. Poprzedni wpis
  (22.08, piąta sesja) mówi, że została odtworzona presetem — od tego czasu zniknęła.
- **Punktów dostępu jest sześć, nie jeden.** Opis z 22.08 wymienia jeden odsłonięty „Punkt
  dostępu"; pięć kolejnych doszło później.
- **Na Strzelnicy leży ściana w kształcie L** (3 segmenty). Opis z 22.08 mówi „wszystkie ściany
  skasowane" — ta jest zostawiona po testach figury 2×2 z 23.08.

**Przywrócone po oględzinach 27k:** wszystko, czego dotknęła ta sesja. Kasowanie i `Ctrl+Z`
sprawdzono na siedmiu rodzajach obiektów; każdy albo wrócił cofnięciem, albo był stworzony na
potrzeby testu i został skasowany. Stan końcowy Strzelnicy: **6 gniazd, 3 segmenty ściany,
0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków.** Zaznaczenie żetonu jest lokalne i nic nie
zapisuje. Scena **„Efekty 23x" nietknięta**.

## Scena „Karty 24x" (24.08, etap 27l — karty obiektów sceny)

Trzecia scena testowa w tej samej kampanii, znów zbudowana **zamiast ruszania Strzelnicy**.
Widoczność „Ręczna mgła", siatka 100 px, mapa pusta — na scenie stoi **po jednym obiekcie
każdego z siedmiu rodzajów**, dokładnie po to, żeby dwuklik w każdy z nich otwierał kartę:

| rodzaj  | co konkretnie                                                                       |
| ------- | ----------------------------------------------------------------------------------- |
| ściana  | pionowy odcinek (zwykła ściana)                                                     |
| drzwi   | ukośny odcinek, **otwarte, gracze mogą otwierać, bez rygla** — przestawione z karty |
| osłona  | „Samochód 25/25", przesunięta i przeskalowana uchwytami                             |
| strefa  | ⚠ „Podłoga elektryczna" 20 PW, uzbrojona                                            |
| światło | lampa różowa, **zgaszona** (przestrojona z karty)                                   |
| notatka | pinezka 📌 „Za drzwiami czeka zasadzka"                                             |
| rysunek | etykieta „Magazyn B" — literówka poprawiona z karty, warstwa **wspólna**            |

Do czego służy: wszystko, co robi karta obiektu — zmiana rodzaju przegrody, rygiel,
„gracze mogą otwierać", naprawa osłony, przestrojenie lampy, treść etykiety, przeniesienie
rysunku między warstwami — plus **uchwyty**: przeciągnięcie obrysu przesuwa, róg prostokąta
i koniec ściany skalują, `Ctrl` wyłącza przyciąganie do kratki.

Aktywna jest z powrotem **„Strzelnica"**; ta scena stoi w podglądzie. Strzelnica po tej sesji:
**6 gniazd, 3 segmenty ściany, 0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków** — czyli
dokładnie tak, jak ją zostawiło 27k. Scena **„Efekty 23x" nietknięta**.
