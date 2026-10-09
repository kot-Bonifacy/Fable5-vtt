# Etap 46 — Jedno okno wymiany, handlarze, zapas amunicji i pojemniki (wzór: Item Piles z Foundry VTT)

**Faza:** przed betą (zlecenie MG z 08.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
23b, 25c, 30d, 38a, 38b, 38c, 44c (wszystkie ukończone) · **Części:** 46a → 46c → 46b (jedna
część = jedna sesja) · **Odbiór:** E2E każdej części plus pełny domyślny przebieg po 46c, bo 46c
zmienia łańcuch „Nocnej zmiany” i punkty kontrolne `po-T3`…`po-T6`

> **Pochodzenie:** zlecenie MG z 08.10.2026: „zaprojektuj na wzór modułu z Foundry VTT »Item
> Piles« wraz z testami, w tym E2E, projekt nowego etapu; zamiast oddzielnie wymiany i handlu niech
> będzie jedno okno i, wzorując się na Foundry VTT, dodaj możliwość zakupów rzeczy ze sklepu nie
> tylko w trakcie tworzenia postaci”. Decyzje z czterech rund pytań w tej samej sesji są niżej.
>
> **Ten plik jest projektem całości** (jak `etap-44-konta-mg.md`). Sesja, która zaczyna część,
> może ją przepisać do `etap-46a-*.md` / `46c` / `46b` z decyzjami podjętymi na starcie. Pytania
> „do potwierdzenia na starcie części” mają tu domyślną odpowiedź, więc sesja nie stoi, jeśli MG
> jest nieobecny.

## Wzór: co robi Item Piles i co z tego bierzemy

| Item Piles (Foundry)                                              | u nas                                                                                   | część         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------- |
| *Trade* — prośba o handel, obie strony dokładają, dwie zgody      | jest od 38c; wchodzi do jednego okna „Wymiana”                                          | 46a           |
| *Give item* — przeciągnięcie przedmiotu na cudzy token            | jest od 38b (propozycja z „Przyjmij”), w nowym oknie jako „Wyślij bez czekania”         | 46a           |
| *Item Pile* jako łup z ciała, „Take all”, waluta w stosie         | jest od 38b (przeszukanie, „Zabierz wszystko”, gotówka), wchodzi do jednego okna        | 46a           |
| *Merchant* — aktor z towarem, cennik, mnożnik cen, odkup, kasa    | **nowe:** handlarz-figura z kartą NPC-a                                                 | 46a           |
| *Merchant* — towar ukryty, ilość nieskończona, sklep otwarty/zamknięty | **nowe:** wiersz ukryty, wiersz „bez dna”, przełącznik „Otwarte” MG                 | 46a           |
| Podwójny klik w token stosu albo handlarza otwiera jego okno      | **nowe:** u gracza podwójny klik w handlarza i pojemnik; u MG zostaje karta              | 46a, 46b      |
| *Container* — zamknięty / otwarty / na zamek                      | **nowe:** pojemnik-figura z kartą-schowkiem, zamek Testem albo kluczem                  | 46b           |
| Upuszczenie przedmiotu na płótno tworzy stos                      | **nowe:** „Stos” z przeciągnięcia wiersza ekwipunku na mapę                              | 46b           |
| Pusty stos sam znika                                              | **nowe:** stos (nie skrzynia) kasuje się po wyjęciu ostatniej rzeczy                    | 46b           |
| Waluta i amunicja jako przedmioty z ilością                       | gotówka jest od 23b; **zapas amunicji nowy** (dziś amunicja jest „bez dna”)             | 46c           |
| *Vault* (siatka), godziny otwarcia sklepu, usługi, waluty systemu | **poza etapem** (`POMYSLY.md`)                                                          | —             |

## Stan wyjściowy (08.10.2026, z kodu)

- **Trzy osobne okna i trzy wejścia.** „Wymiana” (`InventoryWindow.tsx`, 38b): przekazanie
  z propozycją, przeszukanie ciała, „Zabierz wszystko”, gotówka, u MG listy „Skąd / Dokąd”.
  „Handel” (`TradeWindow.tsx` + `TradeDock.tsx`, 38c): zaproszenie, dwa pola, dwie zgody, stan
  w pamięci serwera. Wejścia: „🤝 Handluj…”, „🤝 Handluj jako NPC…” i „🎒 Przeszukaj…” w menu
  figury (`TokenContextMenu.tsx`), „Wymiana…” i „Handel…” na zakładce Ekwipunek karty.
- **Gracz już dziś kupuje poza kreatorem**, w Kompendium: „Kup — N ed” (`economy:buy`, 23b),
  z poziomem dostępności kampanii (`shopTierVerdict`) i targiem Fixera (`haggle`, 30d). Działa też
  między sesjami (`BETWEEN_SESSIONS_EVENTS`, 44c). **Nie ma sklepu jako miejsca w świecie.**
  Katalog sprzedaje każdemu, wszędzie i bez końca, a odkupu nie ma wcale.
- **Amunicja jest „bez dna”.** `performWeaponReload` (`realtime/attacks.ts`) napełnia magazynek
  do pełna za jedną Akcję, niczego nie zużywając. Amunicję specjalną wybiera się przy
  przeładowaniu z katalogu za darmo (`requireLoadableAmmo` sprawdza tylko, czy pasuje).
  `economy:buy` odmawia amunicji (`NOT_PURCHASABLE`), kreator wypisuje ją w „zostaje poza”
  (`creationLeftOutside`). Na karcie jest pole prozą „Amunicja (zapas)” (`ammoStock: string`),
  które T5a wypełnia tekstem.
- **Pojemników nie ma** — w `POMYSLY.md` od 02.09 i 06.09 („kontener na scenie w stylu Item Piles”).
- Podwójny klik w figurę otwiera jej kartę (`onTokenActivate` → `openSheetOfToken`). Gracz nie
  ma cudzej karty, więc u niego podwójny klik w NPC-a dziś nic nie robi.

## Decyzje MG z 08.10.2026

1. **Sklep = handlarz-figura.** NPC z kartą i ustawieniami sklepu stoi na mapie i ma własny towar
   (z ilościami), mnożnik cen i kasę. Gracz podchodzi na wyciągnięcie ręki i kupuje lub sprzedaje
   w jednym oknie. **MG może też otworzyć sklep zdalny, bez figury** (sklep sieciowy, Fixer przez
   telefon).
2. **„Kup” w Kompendium zostaje za przełącznikiem MG.** Ustawienie kampanii „Zakupy z katalogu:
   wszędzie / tylko u handlarzy”, domyślnie „wszędzie”, żeby istniejące kampanie i T6a działały
   jak dziś. Przełącznik egzekwuje serwer, nie tylko guzik.
3. **Odkup za procent ceny katalogowej**, domyślnie 50% (jak w Item Piles), ustawiany per sklep
   (0% = nie skupuje). **Kasa handlarza** jest skończona (eurodolce jego karty) albo „bez dna”,
   co przełącza MG.
4. **Zakup bez zgody MG, gdy sklep jest otwarty.** MG otwiera i zamyka sklep przełącznikiem.
   W otwartym sklepie transakcja idzie od ręki, zostawiając kartę czatu i wpisy w historii
   eurodolców obu stron. Działa też w grze solo z botami.
5. **Jedno okno „Wymiana”, tryb zależy od drugiej strony.** Lewa kolumna: mój ekwipunek i portfel.
   Prawa: druga strona.
   - **Kolega albo NPC** — dwa pola i dwie zgody (handel z 38c). Prezent to handel z pustym polem
     drugiej strony, a zgoda odbiorcy zastępuje „Przyjmij”.
   - **Ciało** (a w 46b **pojemnik**) — bierzesz od ręki, „Zabierz wszystko”.
   - **Handlarz** — jego półka, mój koszyk i moje pole sprzedaży.

   Wejście zawsze jedno: „Wymiana…”.
6. **Prezent dla nieobecnego zostaje** jako „Wyślij bez czekania”. Dopóki druga strona nie
   dołączyła do okna, moje pole można wysłać jako propozycję z 38b (karta czatu z „Przyjmij”).
7. **Towar handlarza to ekwipunek jego karty.** Martwego handlarza da się przeszukać. Limit 40
   wierszy na listę obowiązuje, a wiersz „bez dna” sprzedaje kopie bez końca.
8. **Narzędzie MG zostaje** jako tryb MG w nowym oknie: dowolne „Skąd / Dokąd”, bez zgód.
   Wyjątkiem jest karta gracza — tam dalej idzie propozycja z „Przyjmij”, jak dziś.
9. **Sklepy zdalne gracz widzi w doku w rogu mapy** („Sklepy (N)”), a między sesjami jako przyciski
   na ekranie „Między sesjami”. **Między sesjami działają tylko sklepy oznaczone przez MG**
   („dostępny między sesjami”), bez mapy i bez zasięgu.
10. **Ripperdoc poza etapem.** Handlarz nie sprzedaje cyborgizacji. Montaż zostaje w Kompendium
    („Zainstaluj” z Testem), a przełącznik z decyzji 2 go nie blokuje (jak decyzja z 13.09).
11. **Pełny zapas amunicji (46c).** Każde przeładowanie zużywa naboje z ekwipunku, także zwykłe.
    Zapas liczą karty graczy i towarzysze-boty. **NPC i statyści MG są domyślnie „bez dna”**, a MG
    włącza zapas per karta (np. bossowi). Figura bez karty jest zawsze „bez dna”.
12. **Migracja amunicji: nic.** Po 46c każdy ma tylko to, co siedzi w magazynku. Pudełka MG rozdaje
    ręką albo gracze je kupują. **Kreator sprzedaje zwykłą amunicję w sklepie startowym**
    (poziom 1), broń przychodzi załadowana jak dziś, a podsumowanie ostrzega „broń bez zapasu
    amunicji”.
13. **Pojemnik (46b) = figura z kartą rodzaju „pojemnik”** (bez Cech, PW i inicjatywy). Dziedziczy
    mgłę, ukrycie przez MG, zasięg, łup i 40 wierszy na listę. Upuszczenie przedmiotu na mapę
    tworzy „Stos”.
14. **Pojemnik otwarty: bierze i wkłada każdy w zasięgu.** Zamknięty na zamek otwiera się Testem
    Otwierania zamków (`pick-lock`) albo Elektroniki i zabezpieczeń (`electronics-security`) z PT
    od MG, albo kluczem z karty. **Zawartość zamkniętego nie opuszcza serwera.**
15. **Kolejność: 46a → 46c → 46b, wszystko przed refaktoryzacją.** Pełna kolejność:
    **45 → 46a → 46c → 46b → refaktoryzacja → T10 → 28 → T11**.

## Ryzyka i błędy znalezione przy projektowaniu — przeczytaj przed kodem

1. **Granat rzucany przeładowuje się bez końca (dziś, przed 46c).** Wiersz „Granat odłamkowy” ma
   magazynek 2/2 (T4a: `customWeapon(… { magazine: 2 })`), a `performWeaponReload` napełnia go
   za Akcję do pełna. Gracz ma więc nieskończenie wiele granatów. 46c to naprawia (przeładowanie
   bierze granaty z zapasu). MG decyduje, czy wpisać to do `testy-rejestr.md` jako osobny numer.
2. **Gracz nie może poznać `characterId` karty NPC-a** (umowa `ekwipunek`, #40). Sklep zdalny nie
   ma figury, więc nie da się go wskazać tokenem. Dlatego sklep dostaje **własny publiczny
   identyfikator** (`Merchant.id`) i gracz nigdy nie widzi id karty handlarza: ani w liście
   sklepów, ani w widoku półki, ani w karcie czatu.
3. **Wiersze broni i pancerza nie mają ilości** (`qty` ma tylko wyposażenie). Pięć jednakowych
   pistoletów to pięć wierszy albo jeden wiersz „bez dna”. Przy limicie 40 wierszy na listę sklep
   z bronią szybko dobije do sufitu. Komunikat MG przy zapisie towaru musi to mówić.
4. **Wyścig o ostatnią sztukę i o kasę handlarza.** Dwóch graczy kupuje naraz. Transakcja musi
   czytać obie karty **w środku** `$transaction` i sprawdzać stan towaru i kasy na nowo. Klient
   wysyła oczekiwaną sumę, a różnica daje `QUOTE_CHANGED` (wzór: `OFFER_STALE` z 38c).
5. **Nowe zdarzenia między sesjami trzeba dopisać do `BETWEEN_SESSIONS_EVENTS`.** To biała lista:
   bez wpisu zdarzenie dostaje `SESSION_NOT_RUNNING`, zanim cokolwiek się stanie. Odwrotnie —
   zdarzenia, które **nie** powinny działać między sesjami (np. przeszukanie ciała i pojemnika),
   **nie** mogą tam trafić hurtem przy kopiowaniu listy.
6. **Rejestr zdarzeń w T2b (`fixtures/security.ts`, `EVENTS`) i macierz izolacji T9a** muszą
   dostać nowe zdarzenia. Inaczej T2b odmówi startu albo nowe zdarzenia przejdą bez testu ról
   i cudzej kampanii.
7. **Ukryty towar to dane niewidoczne dla gracza** — filtrowany na serwerze, nie w CSS. Kanarek
   w T2c: nazwa ukrytego wiersza nie może się pojawić w żadnej ramce gniazda gracza.
8. **Pojemnik-figura dotknie każdej listy figur** (46b): inicjatywa, „Postacie”, celowanie
   i obszary wybuchu, oględziny (`cpredSighting`), „oczy drużyny” (45), diagnoza ruchu (45), tura
   bota (cele), Wartość bojowa. Każde z tych miejsc musi pomijać pojemnik **jedną** funkcją
   (`isContainerCard`), a nie warunkiem przepisanym w dziesięciu miejscach.
9. **46c zmienia łańcuch „Nocnej zmiany”.** T3a musi kupić amunicję w kreatorze, T4a/T4b liczą
   granaty i przeładowania, T5a daje Kowalowi pudełko amunicji przeciwpancernej zamiast tekstu
   w „Amunicja (zapas)”, a T5b przeładowuje z zapasu. Punkty kontrolne `po-T3`…`po-T6` trzeba
   odbudować pełnym przebiegiem od zera (~45 min, we własnym oknie konsoli, gateway w terminalu MG).
10. **Tura bota-towarzysza (20b)** musi umieć „nie mam amunicji”: zmienić broń, walczyć wręcz albo
    oddać turę z wierszem na czacie, zamiast w kółko zgłaszać `NO_AMMO`. Boty-wrogowie są NPC-ami,
    więc domyślnie „bez dna” — bez zmian.
11. **Pole „Amunicja (zapas)” zostanie zdublowane** przez prawdziwy zapas. Migracja „nic” znaczy,
    że tekst zostaje jako notatka (tylko do odczytu, z podpowiedzią „przepisz na pudełka”) i znika
    z karty, gdy jest pusty. Bez tego gracz uzna tekst „×16” za zapas, którego serwer nie widzi.
12. **Zmiana zasady z 38c** („okno otwiera się obu dopiero po Przyjmij”): w jednym oknie
    zapraszający widzi okno od razu, w stanie „czeka na …”, i może już kłaść rzeczy w swoje pole
    (inaczej „Wyślij bez czekania” nie miałoby czego wysłać). Zaproszony dostaje okno po
    „Przyjmij”, jak dziś. `setTradeOffer` dopuszcza zatem stronę 0 w stanie `invited`.
13. **Podwójny klik.** U MG podwójny klik w handlarza i pojemnik dalej otwiera kartę (MG ją
    edytuje), u gracza otwiera „Wymianę”. Nie wolno zmienić tego u MG, bo T3–T6 klikają tak karty.

## Podział i kolejność

| część   | treść                                                                                   | E2E                                       |
| ------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| **46a1** | model, `shared` (`exchange.ts`, `merchant.ts`), serwer sklepu i `exchange:counterparts` z testami, przełącznik katalogu (serwer + dźwignia MG w Kompendium) — bez nowego okna | testy jednostkowe i dymne serwera |
| **46a2** | jedno okno „Wymiana” (handel, prezent, łup, sklep, tryb MG), dok „Sklepy (N)”, sekcja „Sklep” w karcie NPC-a, menu figury, „Między sesjami”, usunięcie starych okien | `specs/46-wymiana/t46a-wymiana-sklepy` + przepięte T4b, T6a, `t7a-handel-kreator`, T2b, T2c, T9a |
| **46c** | zapas amunicji: pudełka w ekwipunku, przeładowanie z zapasu, granaty, kreator, sklep    | `specs/46-wymiana/t46c-amunicja` + łańcuch |
| **46b** | pojemniki: skrzynia, bagażnik, stos z upuszczenia, zamek Testem i kluczem               | `specs/46-wymiana/t46b-pojemniki`         |

**Katalog E2E `specs/46-wymiana/`**, z tego samego powodu co `45-druzyna`: w `30-rozgrywka` plik
wpadłby w łańcuch stanów. Każdy plik startuje z `po-T6` (`startFromPoT6`, „Nocna zmiana”: Marek
gra Kowalem, Ola Iskrą, Paser przy barze „Knajpy”). MG w Chromium, Marek w Chromium, **Ola
w Firefoksie**. Wszystkie trzy pliki są w domyślnym przebiegu; testy bez LLM mają `@szybkie`.

---

## 46a — Jedno okno „Wymiana” i handlarze

### Okno

Jeden komponent `ExchangeWindow` zastępuje `InventoryWindow` i `TradeWindow`. Jeden magazyn
`exchangeStore` zastępuje `inventoryStore` i `tradeStore`, a jeden dok `ExchangeDock` zastępuje
`TradeDock`. Nagłówek ma wybór drugiej strony. Zmiana strony nie zamyka okna.

```
┌ Wymiana — Kowal ⇄ [ 🛒 Paser · „Spod lady” · 1 m ▾ ] ─────────────────────────── ✕ ┐
│ MÓJ EKWIPUNEK            │ SPRZEDAJĘ (moje pole)       │ TOWAR PASERA                  │
│ ▣ Zgrzyt 9 (12/30)   →   │ ▣ Pistolet ciężki   +45 ed  │ ✚ Stimpak         ∞   60 ed   │
│ ▣ Stimpak ×3         →   │                             │ ▣ Militech Ronin       480 ed │
│ ▣ Chip z kodem       →   │ KUPUJĘ (koszyk)             │ ▣ Kurtka kuloodporna   120 ed │
│                          │ ✚ Stimpak ×2       −120 ed  │                               │
│ Gotówka: 620 ed          │                             │ Kasa handlarza: 500 ed        │
├──────────────────────────┴─────────────────────────────┴───────────────────────────────┤
│ Płacisz 120 ed · dostajesz 45 ed · razem −75 ed · zostanie 545 ed      [ Zapłać ]     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| druga strona (`ExchangeCounterpart.kind`) | prawa kolumna                                     | pola w środku                      | zatwierdzenie                                    |
| ----------------------------------------- | ------------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `trade` — kolega, towarzysz, żywy NPC     | pole drugiej strony i jej zgoda                   | moje pole                          | dwie zgody (38c); przed dołączeniem „Wyślij bez czekania” (tylko drużyna) |
| `loot` — ciało (leży lub martwe, bez właściciela) | ekwipunek ciała z „Weź” i „Zabierz wszystko” | brak                             | od ręki (`inventory:take`)                       |
| `merchant` — otwarty sklep                | półka (ceny, „∞”, „brak”)                         | „Sprzedaję” i „Kupuję”             | jedno „Zapłać” (`merchant:deal`)                 |
| `gm` — tryb MG                            | „Dokąd” — dowolna karta                           | brak                               | od ręki; na kartę gracza propozycja (38b)        |
| `container` — pojemnik (46b)              | zawartość z „Weź” / zamek                         | brak („→” wkłada od ręki)          | od ręki                                          |

- **Lista drugich stron buduje serwer** (`exchange:counterparts`, zastępuje `inventory:sources`
  i `trade:partners`). Każda pozycja ma rodzaj, nazwę przy stole, odległość, uchwyt (`tokenId`
  albo `merchantId`) i powód, jeśli jest wyszarzona („Za daleko”, „Zamknięte”). Gracz dostaje
  tylko to, co wolno mu otworzyć. MG dostaje wszystko, a dla NPC-a z figurą — **dwie** pozycje:
  „handel jako NPC” i „tryb MG”.
- **Przeciąganie zostaje na zdarzeniach wskaźnika** (pułapka w `ui` z 38c: szybkie puszczenie),
  a strzałki „→” są wejściem z klawiatury. Pole ilości przy wyposażeniu i pole gotówki jak dziś.
- **Wejścia:** „Wymiana…” w menu figury (zastępuje trzy pozycje), „Wymiana…” na zakładce
  Ekwipunek (zastępuje dwa guziki), dok w rogu mapy (zaproszenia, otwarte handle, „Sklepy (N)”),
  podwójny klik gracza w figurę handlarza i ciała (decyzja 13 w ryzykach). Ekran „Między
  sesjami” dostaje przyciski sklepów oznaczonych `betweenSessions`.

### Handlarz

**Model** — nowa tabela, bo ustawienia sklepu nie są polem arkusza (ta sama umowa co `eddies`
i `playReady`: decyzja MG nie jedzie autozapisem karty), a publiczny uchwyt nie może być id karty
(ryzyko 2):

```prisma
/// Sklep (etap 46a): ustawienia handlarza. Towarem jest ekwipunek karty `characterId`.
model Merchant {
  id              String  @id @default(cuid())   // publiczny uchwyt sklepu
  campaignId      String
  characterId     String  @unique
  /// Szyld przy stole: „Spod lady”. Puste = alias figury.
  sign            String  @default("")
  open            Boolean @default(false)
  /// `reach` — przy figurze, na wyciągnięcie ręki; `remote` — z doku, bez figury.
  access          String  @default("reach")
  betweenSessions Boolean @default(false)
  /// Procent ceny katalogowej przy sprzedaży graczowi (100 = katalog).
  priceMul        Int     @default(100)
  /// Procent ceny katalogowej przy odkupie od gracza (0 = nie skupuje).
  buyBackPct      Int     @default(50)
  cashInfinite    Boolean @default(false)
  /// JSON `{ [rowId]: { infinite?: true, hidden?: true, price?: number } }` — nakładka na wiersze karty.
  rows            String  @default("{}")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  campaign  Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  character Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  @@index([campaignId])
}

// Campaign: catalogShopping String @default("everywhere")  // everywhere | merchants
```

**Ceny (czysta logika w `shared/src/systems/cpred/merchant.ts`, testy vitest).** Rdzeń wie tylko,
że jest półka, koszyk i suma. Skąd się bierze cena, wie system CP RED (separacja rdzeń/system).

- **Cena sprzedaży wiersza** = `price` z nakładki **albo** cena katalogowa (`compendiumId` →
  wpis, pasmo `CostCategory` jak w 23b) × `priceMul` / 100, zaokrąglona do pełnych ed. Broń
  liczy też zamontowane dodatki (wpisy katalogu dodatków). Wiersz bez `compendiumId` bez nakładki
  `price` **nie** trafia na półkę gracza (MG widzi go z chipem „⚠ bez ceny”).
- **Cena odkupu** = cena katalogowa × `buyBackPct` / 100, zaokrąglona w dół. Pancerz liczy się
  proporcjonalnie do `spCurrent / sp`. Wyposażenie kosztuje sztukę × ilość. Wiersz bez
  `compendiumId` jest nie do sprzedania (`NO_PRICE`, w oknie wyszarzony z dymkiem). Cyborgizacje
  i Programy nie jadą nigdzie.
- **Targ Fixera** (`haggle`, 30d) zdejmuje procent z **sumy zakupów jednej transakcji** i znika
  z karty w tym samym zapisie. Jedna transakcja to jeden targ — to ta sama zasada co
  w `economy:buy`. Sprzedaży nie dotyczy.
- **Poziom dostępności kampanii nie dotyczy półki handlarza** — towar wykłada MG, więc to on
  zdecydował o dostępności. Dotyczy dalej Kompendium (`shopTierVerdict`).
- `cpredMerchantQuote(shelf, basket, sell, ctx)` liczy sumę **i** listę powodów odmowy.
  Klient rysuje nią stopkę okna, a serwer porównuje ją z `expectTotal` z żądania.

**Transakcja** — `merchant:deal { merchantId, characterId, buy: [{ rowId, qty }], sell: InventoryItemRefWire[], expectTotal }`:

1. Wewnątrz jednej `$transaction` czyta sklep, kartę handlarza i kartę kupującego.
2. Sprawdza po kolei: sklep otwarty; handlarz nie leży ani nie jest martwy (inaczej
   `MERCHANT_CLOSED` — jego ekwipunek staje się łupem); zasięg ramienia `CPRED_MELEE_REACH_M`
   przy `access: reach` (bez furtki „brak wspólnej sceny” — sklep przy figurze stoi przy
   figurze); sesja trwa albo sklep ma `betweenSessions`; wiersz istnieje, nie jest ukryty przed
   graczem i ma towar (`OUT_OF_STOCK`); kasa kupującego i kasa handlarza (`MERCHANT_NO_CASH`);
   `ITEM_ROWS_MAX` na **stanie końcowym** obu kart; suma = `expectTotal` (`QUOTE_CHANGED`).
3. Przenosi rzeczy jedną czystą funkcją `cpredMerchantDeal(buyer, merchant, shelfRows, deal)`,
   która zwraca **obie** karty. Wiersz „bez dna” zostaje, a kupujący dostaje kopię z nowym id
   (`landedRow`). Wyposażenie skleja się po `compendiumId` (`stacksWith`). Pancerz przychodzi
   zdjęty. Zasada ta sama co `cpredSwapItems`: obie strony najpierw zdejmują, potem kładą.
4. Księguje przez `applyBalance({ tx, emit: false })`: `purchase` u kupującego, nowy rodzaj
   `sale` („Sprzedaż”) dla odkupu, lustrzane wpisy u handlarza (pomija je przy `cashInfinite`).
5. Emisje dopiero po transakcji: karty obu stron, odświeżona półka u wszystkich, którzy ją mają
   otwartą (`merchant:update`), karta czatu `inventory` rodzaju `shop` u kupującego i MG.

**Zdarzenia** (wszystkie `domena:czynnosc`):

| zdarzenie                    | kto        | co                                                                     | między sesjami |
| ---------------------------- | ---------- | ---------------------------------------------------------------------- | -------------- |
| `exchange:counterparts`      | wszyscy    | lista drugich stron dla mojej karty i miejsca na mapie                  | tak (tylko `trade` w drużynie i sklepy `betweenSessions`) |
| `merchant:list`              | wszyscy    | sklepy zdalne otwarte teraz (dok) i oznaczone `betweenSessions`         | tak            |
| `merchant:view`              | wszyscy    | półka przycięta per widz (ukryte wiersze i id karty tylko u MG)         | tak            |
| `merchant:deal`              | wszyscy    | transakcja jak wyżej                                                    | tak            |
| `merchant:config`            | MG         | utwórz, zmień, usuń ustawienia sklepu karty NPC-a                       | nie            |
| `merchant:row`               | MG         | nakładka na wiersz: `infinite`, `hidden`, `price`                       | nie            |
| `campaign:catalog-shopping`  | MG         | `everywhere` / `merchants`; `economy:buy` gracza → `CATALOG_CLOSED`     | nie            |
| `merchant:update` (serwer)   | —          | półka po zmianie (deal, konfiguracja, zapis karty handlarza)            | —              |

`inventory:give`, `inventory:take`, `inventory:respond` i `trade:*` zostają jako operacje
(serwer bez zmian poza ryzykiem 12). Znikają `inventory:sources` i `trade:partners`, a T2b
i `BETWEEN_SESSIONS_EVENTS` dostają nowe nazwy (ryzyka 5 i 6).

**UI MG:** w karcie NPC-a (zakładka Ekwipunek) sekcja „Sklep”. Przełącznik „Handlarz”, szyld,
„Otwarte”, „Przy figurze / Zdalny”, „Dostępny między sesjami”, „Cena %”, „Odkup %”, „Kasa bez
dna”. Przy każdym wierszu ekwipunku małe przełączniki „∞”, „ukryty” i pole ceny. Z menu figury
„🛒 Otwórz sklep / Zamknij sklep” jednym kliknięciem. Znacznik „Czeka na MG” nie dostaje nic,
bo zakup nie czeka na MG.

**Przełącznik katalogu:** w ustawieniach kampanii (sekcja Ekonomia, obok poziomu sklepu)
„Zakupy z katalogu: wszędzie / tylko u handlarzy”. Przy „tylko u handlarzy” gracz w Kompendium
nie widzi „Kup” (podpowiedź w dymku: „Kupisz u handlarza”), a serwer odmawia `economy:buy`
gracza z `CATALOG_CLOSED`. „Zainstaluj” cyborgizacji, „Dodaj za darmo” MG i `creation:buy`
działają bez zmian.

### Zakres 46a

**46a1 (08.10, zrobione):**

- [x] Migracja `20261008200000_merchants`: `Merchant`, `Campaign.catalogShopping`; `LedgerKind`
      `sale` (kolumna jest tekstem). Eksport kampanii zabiera `Merchant` i kolumnę; importu całej
      kampanii w kodzie nie ma (zaległość Z10), archiwum bez pola = „brak sklepów”
- [x] `shared`: `exchange.ts` (rodzaje drugiej strony, `exchangeOptionsFor`, kolejność listy),
      `merchants.ts` (ustawienia, nakładki, otwartość, przełącznik katalogu), `mayEditTradeOffer`
      w `trade.ts`, `systems/cpred/merchant.ts` (ceny, półka, odkup, targ, quote,
      `cpredMerchantDeal`), rodzaj `shop` karty czatu przenoszenia — z testami
- [x] Serwer: `realtime/merchant.ts` (`merchant:list`, `merchant:view`, `merchant:deal`,
      `merchant:config`, `merchant:row`, `campaign:catalog-shopping`, rozgłoszenia
      `merchant:update` / `merchant:gone` / `merchant:shops`), `realtime/exchange.ts`
      (`exchange:counterparts`), `trade:offer` w stanie `invited` dla zapraszającego,
      `CATALOG_CLOSED` w `economy:buy`, biała lista między sesjami, `state:sync`, macierz izolacji
- [x] Klient (tylko przełącznik katalogu): dźwignia „wszędzie / u handlarzy” obok progu sklepu
      w Kompendium (MG), „Kupisz u handlarza” zamiast „Kup” u gracza, karta czatu `shop` w dwie
      strony

**46a2 (następna sesja):**

- [x] Klient: `ExchangeWindow`, `exchangeStore`, `ExchangeDock` („Sklepy (N)”), sekcja „Sklep”
      w karcie NPC-a, pozycje menu figury, podwójny klik gracza, przyciski na „Między sesjami”;
      **usunięte** `InventoryWindow`, `TradeWindow`, `TradeDock` i ich magazyny. Po
      `MERCHANT_CLOSED` / `QUOTE_CHANGED` okno pobiera półkę na nowo (`merchant:view`) — stan
      figury handlarza (powalony) nie odświeża półki sam, robi to dopiero zapis jego karty
- [x] Serwer: usunąć `inventory:sources` i `trade:partners` razem ze starymi oknami (dziś obie
      listy stoją obok `exchange:counterparts`), wpisy w `BETWEEN_SESSIONS_EVENTS`, `isPassiveEvent`
      i macierzy izolacji
- [x] Przepięcie E2E na nowe okno: T4b (łup), T6a 6.1 i 6.2, `t7a-handel-kreator`, T2c (kanarek
      ukrytego towaru); T2b i T9a czytają zdarzenia z rejestru serwera same
- [x] Dokumentacja: umowy `ui` (okno), pułapki z sesji, `POSTEP.md`

**46a2 zrobiona 08.10 (trzecia sesja).** Odstępstwa od szkicu: E2E 46a.1–46a.16 idzie na
ekwipunku, który `po-T6` naprawdę ma (latarki, lina, radio, kurtki z katalogu zamiast stimpaków
i fiolek; ukryty towar to broń-kanarek), a 46a.16 (F5, restart) stoi przed 46a.15 (śmierć
Pasera). „Wyślij bez czekania” wymagało id karty kolegi w widoku handlu — strona drużyny niesie
`team` (`isTeamCard`). Koniec handlu zamyka okno, które go pokazywało (jak w 38c), a dok sklepów
odświeża też zapis karty handlarza. Kanarek ukrytego towaru siedzi w `t46a` (podsłuch Marka
i Oli), T2c dostał tylko nowe zdarzenia listy.

### Testy jednostkowe 46a

- **shared `merchant.test.ts`:** cena z mnożnikiem i zaokrągleniem; nakładka `price` wygrywa
  z katalogiem; broń z dodatkami; wiersz bez `compendiumId` poza półką gracza; odkup 50% i 0%;
  pancerz zużyty proporcjonalnie; targ raz na transakcję i tylko od zakupów; quote = suma, którą
  liczy deal; `cpredMerchantDeal`: kopia z wiersza „∞” z nowym id, zmniejszenie `qty`, zniknięcie
  wiersza przy zerze, sklejanie, pancerz zdjęty, limit wierszy na stanie końcowym, sprzedaż
  i zakup w jednej transakcji, ukryty wiersz odrzucony dla gracza.
- **shared `exchange.test.ts` / `trade.test.ts`:** rodzaj drugiej strony z karty i stanu figury
  (żywy NPC → `trade`, leżący → `loot`, handlarz otwarty → `merchant`, zamknięty → `trade` dla MG
  i wyszarzony dla gracza); strona 0 kładzie rzeczy w `invited`, strona 1 nie.
- **serwer `merchant.test.ts` (dymny na gniazdach):** zakup od ręki w otwartym sklepie; odmowy
  `MERCHANT_CLOSED` (zamknięty i martwy), `OUT_OF_REACH`, `OUT_OF_STOCK`, `NOT_ENOUGH_EDDIES`,
  `MERCHANT_NO_CASH`, `QUOTE_CHANGED`, `NO_PRICE`, `TOO_MANY_ROWS`; sklep zdalny bez figury;
  między sesjami: `betweenSessions` przechodzi, reszta `SESSION_NOT_RUNNING`;
  **wyścig: dwa `merchant:deal` na ostatnią sztukę przez `Promise.all` → dokładnie jedna
  sprzedaż**; gracz z podrobionym `rowId` ukrytego wiersza → `ROW_NOT_FOUND`; gracz nie wysyła
  `merchant:config` ani `merchant:row` (`FORBIDDEN`); `merchant:view` gracza bez ukrytych wierszy
  i bez `characterId`; wpisy historii u obu stron (i brak u handlarza z `cashInfinite`); karta
  czatu tylko u kupującego i MG; `CATALOG_CLOSED` dla gracza, MG kupuje dalej; sklep innej
  kampanii → `MERCHANT_NOT_FOUND`; eksport i import kampanii z `Merchant`.
- **klient:** `exchangeStore` (zmiana strony bez zamykania okna, powrót do handlu po
  `trade:list`), stopka okna liczona `cpredMerchantQuote`.

### E2E 46a — `specs/46-wymiana/t46a-wymiana-sklepy.spec.ts` (z `po-T6`)

| #     | krok                                                                                                  | sprawdzamy                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 46a.1 | Marek: menu figury Iskry → „Wymiana…”; okno od razu „czeka na Iskrę”, Marek kładzie stimpak            | Ola (Firefox) dostaje zaproszenie w doku; w bazie nic się nie ruszyło                               |
| 46a.2 | Ola „Przyjmij”, kładzie 100 ed; Marek „Zgadzam się”; Ola zmienia na 120 ed                             | zgoda Marka spada sama; dwie zgody → wymiana atomowa (suma ed i liczba sztuk stała), karta czatu u obu |
| 46a.3 | Ola zamyka kontekst; Marek otwiera Wymianę z Iskrą, kładzie fiolkę, „Wyślij bez czekania”              | karta czatu z „Przyjmij” jak w 38b; po powrocie Oli i „Przyjmij” fiolka na Iskrze                   |
| 46a.4 | Ciało statysty z T4 (Rzeźnik albo Zbir; gdy w `po-T6` nie ma już rzeczy, MG dopisuje mu dwie i 50 ed); Marek obok: „Wymiana…” → tryb łupu, „Zabierz wszystko” | ciało puste, gotówka przeszła; na liście Marka nie ma karty Oli jako źródła                        |
| 46a.5 | MG: tryb MG z karty Pasera, „Dokąd: Kowal” — propozycja; „Dokąd: Szrama” (NPC) — od ręki               | rozróżnienie propozycji i ruchu od ręki jak w 38b                                                  |
| 46a.6 | MG w karcie Pasera włącza „Handlarz” (szyld „Spod lady”, cena 120%, odkup 50%, kasa 500 ed), wiersz „∞” stimpaków, ukryty „Ronin”; sklep zamknięty | Marek widzi „Paser — Zamknięte”; w ramkach gniazda Marka nie ma „Ronin” (podsłuch, kanarek) |
| 46a.7 | MG „🛒 Otwórz sklep”; Marek przy barze kupuje 2× stimpak i Kurtkę                                      | ceny ×1,2 w oknie = w bazie; wiersz „∞” został; wpisy `purchase` u Kowala i lustrzane u Pasera      |
| 46a.8 | Marek sprzedaje pistolet (z katalogu) i próbuje „Chip z kodem” (bez katalogu); jedna transakcja kupno + sprzedaż | chip wyszarzony z dymkiem; pistolet za 50%; kasa Pasera maleje; `sale` w historii; stopka „razem” = baza |
| 46a.9 | Ola daleko od baru: Paser na liście wyszarzony „Za daleko”; surowe `merchant:deal`                     | `OUT_OF_REACH`, karty bez zmian                                                                     |
| 46a.10 | Ola podchodzi; MG zostawia 1 sztukę Kurtki; Marek i Ola surowym `merchant:deal` naraz                 | dokładnie jedna sprzedaż, drugi `OUT_OF_STOCK`; suma ed w kampanii się zgadza                       |
| 46a.11 | MG zmienia cenę w trakcie, gdy Ola ma pełny koszyk; Ola „Zapłać”                                      | `QUOTE_CHANGED`, okno pokazuje nową cenę, drugi „Zapłać” przechodzi                                 |
| 46a.12 | MG: drugi handlarz „Sieć Militechu”, zdalny, bez figury, „między sesjami”                              | dok Marka i Oli: „Sklepy (1)”; zakup bez zasięgu                                                   |
| 46a.13 | MG kończy sesję; Marek na „Między sesjami” kupuje w „Sieci Militechu”; surowe `merchant:deal` do Pasera | zakup przechodzi; Paser → `SESSION_NOT_RUNNING`; MG wznawia sesję                                  |
| 46a.14 | MG przełącza „Zakupy z katalogu: tylko u handlarzy”                                                    | „Kup” w Kompendium znika u Marka, surowe `economy:buy` → `CATALOG_CLOSED`, MG kupuje; „Zainstaluj” zostaje |
| 46a.15 | Paser ginie (MG 0 PW, martwy)                                                                          | sklep „Zamknięte” u graczy; Marek przeszukuje ciało i widzi cały towar, z ukrytym (domyślna odpowiedź niżej)     |
| 46a.16 | F5 u Oli w trakcie handlu i z otwartą półką; restart serwera                                           | handel wraca do doku, półka się odświeża; po restarcie sklep stoi (baza), otwarty handel znika (38c) |

**Decyzje MG na starcie 46a (08.10.2026, druga sesja):**

- **46a dzielona na 46a1 i 46a2** (tabela „Podział i kolejność”). 46a1 kończy się na serwerze
  i dźwigni katalogu, 46a2 robi całe UI wymiany i E2E. Kolejność: **46a1 → 46a2 → 46c → 46b**.
- **Odkupiona rzecz trafia od razu na półkę** (jak w Item Piles), w cenie katalog × mnożnik
  sklepu. MG może ją potem ukryć albo przecenić.
- Trzy pytania niżej — **domyślne odpowiedzi przyjęte**.
- Ryzyko 1 (granat) wpisane do `testy-rejestr.md` jako **#82**, naprawia 46c.

**Decyzje MG na starcie 46a2 (08.10.2026, trzecia sesja)** — wszystkie cztery zgodne
z rekomendacją:

- **Zaproszenie przy wyborze strony.** „Wymiana…” z menu figury kolegi albo wybór kolegi/NPC-a
  w nagłówku okna od razu wysyła zaproszenie; okno pokazuje „czeka na …”. Z karty postaci okno
  otwiera się bez wybranej strony, więc samo otwarcie nikogo nie zaprasza.
- **Handel zostaje w doku**, gdy gracz przełączy stronę albo zamknie okno ✕ (jak w 38c). Okna,
  w którym ktoś przegląda półkę, przyjęte zaproszenie nie przełącza samo — czeka „Otwórz”.
- **Podwójny klik gracza tylko u handlarza i przy ciele.** Kolega i żywy NPC — bez zmian (notka
  z podpowiedzią), żeby przypadkowy klik nie wysłał zaproszenia. U MG — karta, jak dotąd.
- **Całość 46a2 w jednej sesji**, bez dalszego dzielenia.

**Do potwierdzenia na starcie 46a** (domyślna odpowiedź w nawiasie; przyjęte 08.10):

- Czy ukryty towar martwego handlarza widać przy przeszukaniu? (**tak** — ukrycie dotyczy półki,
  nie kieszeni; ciało przeszukuje się w całości, nakładka przestaje działać, gdy handlarz nie żyje)
- Karta czatu zakupu: tylko kupujący i MG czy cały stół? (**kupujący i MG**, jak karta
  `economy`)
- Czy MG-owy „🛒 Otwórz sklep” rozgłasza na czacie „Paser otwiera sklep”? (**nie** — dok
  i wyszarzenie wystarczą)

### Kryteria ukończenia 46a

- [x] Jedno wejście „Wymiana…” prowadzi do handlu, prezentu, łupu, sklepu i trybu MG; stare okna
      i ich magazyny są usunięte
- [x] Gracz kupuje i sprzedaje u otwartego handlarza przy figurze, u zdalnego z doku i między
      sesjami u oznaczonego; ceny w oknie = ceny w bazie
- [x] Ukryty towar nie opuszcza serwera (kanarek T2c), id karty handlarza nie dociera do gracza
- [x] Wyścig o ostatnią sztukę daje jedną sprzedaż; nic nie ginie ani się nie dubluje
- [x] Przełącznik katalogu egzekwuje serwer
- [x] Testy jednostkowe, lint, `tsc` czyste; `t46a-` zielony dwa razy; `00-baseline` + `01-dym`
      + przepięte T4b, T6a, `t7a-handel-kreator`, T2b, T2c, T9a zielone
- [x] Oględziny: Ola w **Firefoksie**, MG w Chromium (okno we wszystkich trybach, dok, karta NPC-a
      z sekcją „Sklep”, ekran „Między sesjami”)

---

## 46c — Zapas amunicji

### Decyzje MG z 09.10.2026 (start 46c)

1. **Podział na dwie sesje.** **46c1:** model, `shared`, serwer, klient, testy jednostkowe,
   `t46c-` i oględziny. **46c2:** przepięcie łańcucha T3a–T5b, odbudowa punktów kontrolnych pełnym
   przebiegiem od zera, retest #82. Między nimi łańcuch T4a–T5b może być czerwony (brak zapasu),
   a `POSTEP.md` to mówi.
2. **Kaliber to rodzina z pola „Amunicja” typu broni** (`WeaponType.ammunition` →
   `ResolvedWeapon.ammoType`: „C. Pistolet”, „Karabinowa”, „Granaty”…), a nie `weaponTypeId`.
   Pudełko „C. Pistolet” pasuje do ciężkiego pistoletu i ciężkiego PM, „Granaty” — do granatu
   ręcznego i do granatnika (s. 344: „Granatami można rzucać lub wykorzystać jako amunicję
   Granatnika”). Porównanie bez wielkości liter i białych znaków.
3. **Paczka z podręcznika (s. 344):** cena wpisu jest za 10 sztuk kul, śrutu i strzał, a za
   1 sztukę granatów i rakiet. Jeden zakup = jedna paczka (z liczbą paczek w wyborze kalibru).
   Odkup i półka liczą cenę **za nabój** (cena wpisu / paczka).
4. **Zwykły granat i zwykła rakieta: 100 ed za sztukę, poziom 3** — jak amunicja przeciwpancerna,
   którą podręcznik nazywa „podstawowym standardem dla granatów i rakiet”. Mechanika zwykłego
   granatu bez zmian. W danych: nowy wpis bez efektów do granatów i rakiet (plik prywatny
   i wymyślony odpowiednik w `data/public`), poziom w `shop-tiers.json`, bez gałęzi po id w kodzie.
5. **Łuk i kusza dalej nie liczą strzał** (domyślna odpowiedź z planu) — zapis
   w `decyzje-i-uproszczenia.md`.
6. **Gracz tylko zmniejsza, MG dowolnie.** Na karcie z zapasem serwer odmawia graczowi
   podniesienia magazynka (także broni podwieszanej), ilości w pudełku i dopisania pudełka ręką.
   Amunicja przybywa z zakupu, wymiany, łupu i od MG.
7. **Granat ręczny bez magazynka bierze sztukę z zapasu przy rzucie** (bez granatów danego rodzaju
   — `NO_AMMO`), bo granatem się rzuca, a nie przeładowuje. Wpis z magazynkiem (T4a: „Granat
   odłamkowy” 2/2) przeładowuje się z zapasu jak każda broń.

### Decyzje MG z 09.10.2026 (start 46c2)

1. **T3a: Kowal kupuje w kreatorze 2 paczki zwykłej do B.C. Pistoletu** (20 szt., 20 ed →
   230 ed na karcie). Bez karabinowej „na zapas” pod Ronina.
2. **Retest #82 w T4b po walce:** przeładowanie granatu (1/2) bez zapasu → `NO_AMMO`; MG daje
   pudełko 1 granatu z Kompendium („Dodaj za darmo”), drugie przeładowanie → 2/2, pudełko znika.
3. **Gateway na wezwanie:** łańcuch najpierw kawałkami bez modelu, pełny przebieg od zera
   z gatewayem uruchomionym przez MG w jego terminalu.

Wynikowe przepięcia (bez osobnej decyzji): T5a — MG daje 2 paczki przeciwpancernej (20 szt.)
z Kompendium zamiast tekstu w „Amunicja (zapas)”; T5b 5.9 — zmiana na przeciwpancerną oddaje
7 zwykłych do zapasu i bierze 8 z pudełka; 46c.9 — towarzysz-bot „Kumpel” w `t46c-amunicja`.

### Model

**Amunicja to wiersz wyposażenia, nie nowa lista.** Dzięki temu przekazanie, łup, handel, półka
handlarza, sklejanie i limit 40 wierszy działają od razu, bez nowej gałęzi w `cpredMoveItems`,
`cpredSwapItems` i `cpredMerchantDeal`.

- `CpredGearRow.ammo?: { ammoId: string | null; weaponTypeId: string }` — `ammoId` to wpis
  amunicji z kompendium (`ammo.armour-piercing`…), `null` to amunicja zwykła; `weaponTypeId`
  to kaliber (`weapon-type.heavy-pistol`…), bo naboje kupuje się do rodzaju broni. `qty` liczy
  **naboje**, nie pudełka. Nazwa wiersza składa się sama („Przeciwpancerna · Pistolet ciężki”).
- `stacksWith` dostaje `ammo` do porównania: dwa pudełka tego samego rodzaju i kalibru sklejają
  się w jeden wiersz.
- `CpredCharacterData.ammoTracked?: boolean` — brak = zależnie od karty: `true` dla karty
  z właścicielem i towarzysza-bota, `false` dla NPC-a i statysty. MG przełącza w karcie
  („Licz amunicję”). Jedna funkcja `cpredTracksAmmo(sheet, owned, companion)`.
- `purchasedSheetRow` dostaje `case 'ammo'`. Zakup amunicji wymaga kalibru (`weaponTypeId`
  w `EconomyBuyPayload`, `creation:buy` i nakładce półki handlarza). Cena za ilość z katalogu —
  **przed kodem sprawdzić w `data/private/cpred/compendium`, jak wpis amunicji niesie cenę
  i ilość w paczce** (pasmo za 10 sztuk albo za sztukę).

### Przeładowanie

- **Karta z zapasem:** `performWeaponReload` bierze z wierszy `ammo` pasujących do kalibru broni
  i wybranego rodzaju (zwykła albo `ammoId`). Ładuje `min(ammoMax − ammoCurrent, zapas)`.
  Przy zmianie rodzaju naboje z magazynka **wracają do zapasu** swojego rodzaju (sklejają się albo
  tworzą wiersz). Bez zapasu → `NO_AMMO` („Nie masz amunicji do tej broni”), bez wydanej Akcji.
- **Bez zapasu (NPC, statysta, figura bez karty):** jak dziś, „bez dna”.
- **Granat rzucany i rakieta:** wiersz broni z magazynkiem (T4a: Granat odłamkowy 2/2)
  przeładowuje się z zapasu granatów tego wpisu. Koniec nieskończonych granatów (ryzyko 1).
  Granatnik podwieszany (31) i jego `attachmentAmmo` biorą z zapasu granatów tak samo.
- **Łuk i kusza** (`ammoMax` 0, strzał nie liczy naboju) — **do potwierdzenia na starcie 46c**
  (domyślnie: dalej nie liczymy, bo broń nie ma magazynka na karcie; zapis w
  `decyzje-i-uproszczenia.md`).
- Seria i ogień zaporowy dalej liczą się z magazynka (bez zmian).
- **Pasek broni i karta:** „12/30 · zapas 40”, menu przeładowania z liczbami („Przeciwpancerna —
  16”), rodzaje bez zapasu wyszarzone. Tura bota-towarzysza: „nie mam amunicji” jako wybór
  planera (ryzyko 10).
- **Pole „Amunicja (zapas)”:** zostaje jako notatka tylko do odczytu z podpowiedzią, dopóki nie
  jest puste (ryzyko 11). Nowe karty go nie mają.

### Kreator i sklepy

- Sklep startowy kreatora sprzedaje zwykłą amunicję na poziomie 1 (`shop-tiers.json`), z wyborem
  kalibru spośród kupionych broni. `creationLeftOutside` traci „amunicję”. Podsumowanie
  i ekran końcowy ostrzegają: „Broń bez zapasu amunicji: …”.
- Kompendium „Kup” i półka handlarza sprzedają pudełka (z wyborem kalibru) — handlarz dostaje to
  od 46a za darmo, bo amunicja jest wierszem wyposażenia.

### Zakres 46c

- [x] `shared`: `ammo` na wierszu wyposażenia z walidacją, `stacksWith`, `cpredTracksAmmo`,
      `cpredReloadFromStock` (czysta: wiersz broni + zapas → nowy wiersz broni + nowy zapas),
      `purchasedSheetRow` dla amunicji, kreator (`creationShopVerdict`, `creationOutcome`) —
      **46c1** (09.10): moduł `ammostock.ts`; pudełko z zakupu buduje `cpredPurchasedAmmoRow`
      (osobno od `purchasedSheetRow`, bo potrzebuje typu broni i liczby paczek), koszyk kreatora
      trzyma amunicję pod kluczem `wpis@typ broni`
- [x] Serwer: przeładowanie (broń, dodatek, granat), `NO_AMMO`, zakup amunicji (`economy:buy`,
      `creation:buy`, `merchant:deal`), tura bota-towarzysza, przełącznik `ammoTracked` u MG —
      **46c1**, plus bramka łaty karty `AMMO_LOCKED` (decyzja 6) i rzut granatem z zapasu
- [x] Klient: karta (pudełka w Wyposażeniu, „Licz amunicję” u MG, notatka starego pola),
      pasek broni z zapasem, menu przeładowania, kreator (kaliber przy amunicji) — **46c1**,
      plus kaliber i paczki w Kompendium („Kup” i „Dodaj za darmo”)
- [x] Łańcuch E2E (**46c2**): T3a kupuje amunicję w kreatorze; T4a/T4b — granaty z zapasu; T5a — MG daje
      pudełko przeciwpancernej zamiast tekstu; T5b — przeładowanie z zapasu; **odbudowa punktów
      kontrolnych pełnym przebiegiem od zera** — **46c2** (09.10): retest #82 w T4b po walce,
      46c.9 (`@llm`, towarzysz „Kumpel”) w `t46c-amunicja`, wspólny `fixtures/kompendium.ts`;
      przy okazji T3b i T5b przepięte na „oczy drużyny” z etapu 45
- [x] Dokumentacja: umowy `atak` (przeładowanie z zapasu) i `ekwipunek` (amunicja jako wiersz),
      `decyzje-i-uproszczenia.md` (powrót naboi do zapasu, łuki, NPC „bez dna”) — **46c1**

### Testy jednostkowe 46c

- **shared:** przeładowanie pełne, częściowe przy małym zapasie, zerowe → `NO_AMMO`; zmiana
  rodzaju zwraca naboje do zapasu i skleja je; amunicja innego kalibru nie pasuje; granat
  z zapasu granatów; karta NPC-a „bez dna”, z `ammoTracked: true` liczy; sklejanie pudełek po
  rodzaju i kalibrze, nie po nazwie; przekazanie i handel pudełek (jest to wyposażenie z `qty`);
  kreator: amunicja na poziomie 1, ostrzeżenie o broni bez zapasu.
- **serwer:** `weapon:reload` z zapasem (Akcja wydana, zapas mniejszy), bez zapasu (`NO_AMMO`,
  Akcja **nie** wydana), statysta bez karty „bez dna”, bot-towarzysz bez amunicji nie zapętla
  tury; `economy:buy` amunicji z kalibrem i bez (`AMMO_CALIBRE_REQUIRED`).

### E2E 46c — `specs/46-wymiana/t46c-amunicja.spec.ts` (z `po-T6` po odbudowie łańcucha)

| #     | krok                                                                                   | sprawdzamy                                                                           |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 46c.1 | Kowal strzela do pustego magazynka i przeładowuje ze zwykłego zapasu                   | magazynek pełny, zapas mniejszy dokładnie o tyle, ile weszło; Akcja wydana            |
| 46c.2 | Zapas mniejszy niż magazynek                                                           | ładuje się tyle, ile jest; wiersz zapasu znika przy zerze                             |
| 46c.3 | Przeładowanie bez zapasu                                                               | `NO_AMMO`, Akcja nie wydana, rodzaj wyszarzony w menu                                 |
| 46c.4 | Zmiana na przeciwpancerną przy niepełnym magazynku                                     | stare naboje wróciły do zapasu zwykłej; przeciwpancerna ubyła                          |
| 46c.5 | Granat: dwa rzuty, przeładowanie bez granatów w zapasie                                | `NO_AMMO` — koniec nieskończonych granatów                                            |
| 46c.6 | Ganger MG (NPC) przeładowuje bez pudełek; MG włącza mu „Licz amunicję”                 | najpierw „bez dna”, potem `NO_AMMO`                                                   |
| 46c.7 | Marek kupuje pudełko u Pasera (46a) i w Kompendium; Ola przekazuje Markowi pudełko     | zapas skleja się w jeden wiersz; kaliber wymagany przy zakupie                        |
| 46c.8 | Nowa postać w kreatorze kupuje amunicję; druga bez amunicji                            | pierwsza ma zapas na karcie; druga widzi ostrzeżenie w podsumowaniu                   |
| 46c.9 | `@llm` bot-towarzysz w walce bez amunicji                                              | tura się kończy wyborem (inna broń / wręcz / wiersz na czacie), nie pętlą odmów       |

### Kryteria ukończenia 46c

- [x] Przeładowanie zużywa zapas na kartach drużyny; NPC „bez dna”, dopóki MG nie włączy
- [x] Granatów nie ma nieskończenie wiele
- [x] Amunicję kupuje się w kreatorze, w Kompendium i u handlarza, przekazuje i łupi
- [x] Testy jednostkowe, lint, `tsc` czyste; `t46c-` zielony; **pełny domyślny przebieg od zera
      zielony** z odbudowanymi punktami kontrolnymi (09.10: 354/358 — 46c.9 ze starą asercją
      i znane migotanie T8c #72, oba zielone w powtórce od nowego `po-T6`)
- [x] Oględziny: Firefox (gracz: pasek broni, menu przeładowania, karta), Chromium (MG) — zrzuty
      z przebiegów 46c1 i 46c2 (`.e2e/pomiary/46c1`)

---

## 46b — Pojemniki na scenie

### Model

- **Pojemnik to karta rodzaju „pojemnik” z figurą** (decyzja 13). `CpredCharacterData.container?:
  { lock: 'open' | 'closed' | 'locked'; dv?: number; skills?: ('pick-lock' | 'electronics-security')[];
  keyId?: string; pile?: boolean }`. Karta pojemnika nie ma Cech, PW, Umiejętności ani inicjatywy.
  Karta w UI pokazuje wyłącznie zawartość i ustawienia zamka (u MG).
- **`isContainerCard(sheet)` — jedna funkcja**, którą pomijają: inicjatywa i tryb turowy,
  „Postacie”, celowanie, obszary wybuchu i serii, oględziny, „oczy drużyny”, diagnoza ruchu
  z 45, cele tury bota, Wartość bojowa, rozliczenie miesiąca (`economy:settle`), lista odbiorców
  przelewu (ryzyko 8). Figurę pojemnika gracz nie może ruszyć (`FORBIDDEN`). MG może.
- **Klucz** to wiersz wyposażenia z `key: <containerId>`, wydawany przez MG („Wydaj klucz” w karcie
  pojemnika). Klucz otwiera zamek bez Testu, jeśli jest na karcie otwierającego.
- **Stos** (`pile: true`) powstaje, gdy gracz przeciągnie wiersz ekwipunku z karty na mapę
  w zasięgu ramienia swojej figury (`inventory:drop`). Ma domyślny żeton (worek, darmowy asset
  z repo z `ATTRIBUTION.md`), jest otwarty i **znika z kartą, gdy jest pusty**. Skrzynię, bagażnik
  i schowek stawia MG z menu sceny („📦 Pojemnik”) i one nie znikają same.

### Zachowanie

- Okno „Wymiana” w trybie `container`. Otwarty pojemnik: „Weź”, „Zabierz wszystko” i „→” (wkłada
  od ręki). Bierze i wkłada każdy w zasięgu ramienia. Przeszukanie ciała ma ten sam zasięg i brak
  furtki „bez wspólnej sceny” (umowa `ekwipunek`).
- **Zamknięty (`closed`)** otwiera się jednym kliknięciem „Otwórz”. **Na zamek (`locked`)**:
  „Otwórz zamek” prowadzi przez kubek Testu wybranej Umiejętności z PT pojemnika (ta sama ścieżka
  co prośba o Test z etapu 40 — **nowe pole żądania trzeba dopisać do `requireCallableRequest`**,
  pułapka z `POSTEP.md`). Sukces ustawia `closed` → otwarte, porażka zostawia kartę rzutu. Klucz
  otwiera bez Testu.
- **Zawartość nieotwartego pojemnika nie opuszcza serwera** — gracz dostaje nazwę, stan zamku
  i nic więcej. Pojemnik pod mgłą i ukryty przez MG zachowuje się jak każda figura
  (`concealedFrom`).
- Gracz u siebie: podwójny klik w figurę pojemnika otwiera okno (decyzja 13 w ryzykach).
- **Między sesjami** pojemniki nie działają (zdarzeń `container:*` i `inventory:drop` nie ma
  na białej liście).

### Zdarzenia

| zdarzenie            | kto      | co                                                               |
| -------------------- | -------- | ---------------------------------------------------------------- |
| `container:create`   | MG       | nowa karta-pojemnik z figurą w punkcie sceny                      |
| `container:config`   | MG       | zamek, PT, Umiejętności, „Wydaj klucz”                            |
| `container:open`     | wszyscy  | otwarcie zamkniętego, klucz, start Testu zamka                    |
| `container:put`      | wszyscy  | z mojej karty do otwartego pojemnika w zasięgu                    |
| `inventory:drop`     | wszyscy  | wiersz z karty na mapę → stos (nowy albo dołożenie do stosu obok) |
| `inventory:take`     | wszyscy  | bez zmian, rozszerzone o otwarty pojemnik                         |

### Zakres 46b

- [ ] `shared`: `container` na karcie z walidacją, `isContainerCard`, reguły zamka, stos
      (tworzenie, dokładanie, znikanie)
- [ ] Serwer: zdarzenia z tabeli, Test zamka przez prośbę o Test, przycięcie zawartości per widz,
      pomijanie pojemników w miejscach z ryzyka 8
- [ ] Klient: tryb `container` okna, przeciągnięcie wiersza na płótno (zdarzenia wskaźnika,
      `fixtures/canvas.ts` w E2E), menu sceny MG „📦 Pojemnik”, karta pojemnika, żeton stosu
- [ ] Dokumentacja: umowy `ekwipunek` i `mapa`, `POMYSLY.md` (wpisy o kontenerze → „zrobione w 46b”)

### Testy jednostkowe 46b

- **shared:** stos powstaje i znika z ostatnią rzeczą; skrzynia nie znika; dokładanie do stosu
  skleja wyposażenie; zamek: klucz otwiera, `closed` otwiera klik, `locked` wymaga Testu; limit
  wierszy pojemnika; `isContainerCard` na każdej z list z ryzyka 8 (jeden test na listę).
- **serwer:** gracz nie dostaje zawartości zamkniętego pojemnika (`exchange:counterparts`,
  `inventory:take`, `state:sync`); `container:put` poza zasięgiem; gracz nie rusza figury
  pojemnika; pojemnik nie wchodzi do inicjatywy ani na listę celów; Test zamka z PT od MG,
  sukces i porażka; stos z `inventory:drop` poza zasięgiem → `OUT_OF_REACH`.

### E2E 46b — `specs/46-wymiana/t46b-pojemniki.spec.ts` (z `po-T6`)

| #     | krok                                                                                     | sprawdzamy                                                                           |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 46b.1 | MG stawia „Skrzynię” (zamknięta na zamek, PT 13, Otwieranie zamków) z dwiema rzeczami    | Marek widzi skrzynię, „Zamknięta na zamek”; w ramkach gniazda Marka nie ma nazw rzeczy |
| 46b.2 | Marek: „Otwórz zamek”, kubek, skrypt kości na porażkę, potem na sukces                    | karta rzutu; po sukcesie zawartość przychodzi                                         |
| 46b.3 | Ola wkłada do skrzyni stimpak, Marek bierze „Zabierz wszystko”                            | ruch od ręki, nic nie ginie                                                           |
| 46b.4 | Ola (Firefox) przeciąga wiersz z karty na mapę obok Iskry                                 | powstaje „Stos” z żetonem worka; Marek go widzi i opróżnia; stos znika                |
| 46b.5 | MG wydaje klucz do „Bagażnika”; Ola z kluczem otwiera bez Testu                            | klucz działa tylko na swój pojemnik                                                   |
| 46b.6 | Tryb turowy: MG włącza walkę obok skrzyni                                                 | skrzyni nie ma w inicjatywie ani w „Postaciach”; celowanie w nią odmawia              |
| 46b.7 | Skrzynia pod ręczną mgłą i ukryta przez MG                                                | gracz jej nie dostaje (`concealedFrom`)                                               |

### Kryteria ukończenia 46b

- [ ] Skrzynia, bagażnik i stos działają z jednego okna; zamek Testem i kluczem
- [ ] Zawartość nieotwartego pojemnika nie opuszcza serwera (kanarek w T2c)
- [ ] Pojemnik nie wchodzi do walki ani na listy figur
- [ ] Testy jednostkowe, lint, `tsc` czyste; `t46b-` zielony, `00-baseline` + `01-dym` zielone
- [ ] Oględziny: Firefox (gracz: przeciągnięcie na mapę, okno pojemnika), Chromium (MG)

---

## Poza etapem (do `POMYSLY.md`)

- **Handel bota LLM** — NPC sam wycenia, kładzie i się zgadza (wpis z 38c zostaje). Sklep z 46a
  nie potrzebuje bota, bo sprzedaje od ręki.
- **Ripperdoc jako handlarz z usługą montażu** (decyzja 10).
- **Godziny otwarcia sklepu z zegarem świata (37)**, ceny dynamiczne i rabat per postać
  (Item Piles: *price modifiers per actor*), usługi (naprawa, przechowanie).
- **Skarbiec z siatką (Item Piles *Vault*)**, udźwig i zajmowane miejsce (38b: podręcznik ich nie
  liczy).
- **Pojemnik w pojemniku** i pojemnik niesiony (plecak jako karta).
- **Zakup Programu i deku do pól Sieci** (wpis z 17.09 zostaje).

## Wskazówki techniczne

- **Najpierw przeczytaj sekcje `ekwipunek`, `serwer` i `ui`** w umowach i pułapkach
  (`grep -n '^## ekwipunek' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md`), a przed 46c
  także `atak`, przed 46b — `mapa` i `kosci`.
- **Nie składaj nowej transakcji z dwóch `cpredMoveItems`** — stos połyka cudze sztuki, a limit
  liczy się na stanie pośrednim (umowa 38c). `cpredMerchantDeal` robi to co `cpredSwapItems`:
  obie strony zdejmują, potem kładą.
- **Jedna funkcja na „czy to pojemnik”, „czy liczy amunicję”, „jaka cena”** — każde z tych pytań
  będzie zadawane w kilkunastu miejscach, a dwie odpowiedzi rozjadą się przy pierwszej zmianie.
- Największe pliki do czytania fragmentami: `TokenContextMenu.tsx`, `CharacterSheet.tsx`
  (172 KB), `attacks.ts`, `MapRenderer.ts` (294 KB) — `grep` + zakres.
- Etap idzie **przed refaktoryzacją**, więc nie tnij przy okazji `CharacterSheet.tsx` ani
  `socket.ts`. Nowe rzeczy wkładaj do nowych plików (`realtime/merchant.ts`,
  `components/exchange/*`), żeby refaktor miał mniej do przenoszenia.
