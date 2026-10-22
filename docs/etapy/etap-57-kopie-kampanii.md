# Etap 57 — Kopie kampanii: paczki z grafikami, cofnięcie kampanii, kopia postaci gracza

**Faza:** przed betą (zlecenie MG z 22.10 spoza planu) · **Wymaga etapów:** 33 (pliki wymiany,
snapshoty), 44b (izolacja kampanii, `localizeArchiveUploads`), 44c (sesje i sloty), 53 (kopie
całej bazy u administratora) · **Podział:** 57a → 57b → 57c, każdy na jedną sesję

## Skąd ten etap

MG (22.10): „w zakładce Kopie MG ma możliwość wykonania kopii różnego rodzaju, ale nie wiem, jak
może te kopie później (w nowej scenie albo nowy MG) wczytać. Sprawdź, czy to nie błąd" — „oraz
kopia postaci graczy".

Diagnoza z 22.10 (stan po etapie 56):

1. **Wczytanie karty i sceny istnieje, ale go nie widać.** To gołe `<input type="file">`
   (`.archive-file`, 0.75rem, `--text-dim`) bez przycisku „Wczytaj”. Podpowiedź nie mówi, że
   wybranie pliku od razu go wczytuje (`ArchivePanel.tsx`).
2. **Zrzutu kampanii nie da się wczytać wcale.** To decyzja etapu 33 („kampania z pliku byłaby
   drugą kampanią”, `realtime/archive.ts`), zdezaktualizowana przez etap 44: wiele kampanii
   jednego MG to dziś norma. Zrzut nie niesie też tabel losowych.
3. **Grafiki nie jadą w pliku.** Plik wymiany niesie adresy, a `localizeArchiveUploads` kopiuje
   obrazek tylko z kampanii, którą importujący MG posiada. Każdy inny adres czyści. Plik nie jest
   samowystarczalny: kampania usunięta albo plik przeniesiony ⇒ scena bez mapy, karta bez portretu.
4. **Gracz nie ma kopii swojej postaci.** Pobranie karty jest `gmOnly`. Gracz nie może jej ani
   pobrać, ani przynieść z innej kampanii.
5. **MG nie cofnie własnej kampanii.** Kopie całej bazy (etap 33/53) są u administratora,
   przywraca je skrypt przy zatrzymanym serwerze, a przywrócenie cofa **wszystkie** kampanie
   wszystkich MG.

## Decyzje MG z 22.10 (pytania na starcie)

1. **Format: paczka ZIP.** W środku `manifest` + JSON z danymi (jak dziś, wcięcie dwóch spacji)
   i katalog grafik. Import idzie trasą REST (multipart), nie gniazdem: kampania z grafikami
   waży lokalnie 4–28 MB, a Socket.IO ma limit 1 MB. Stare pliki JSON z etapu 33 dalej się
   wczytują (bez grafik, jak dziś).
2. **Wczytanie zrzutu kampanii = zawsze nowa kampania.** Nic nie nadpisuje i nic nie scala.
3. **Karty graczy pamiętają gracza.** Karta z właścicielem w pliku wchodzi jako „czeka na
   gracza: <imię z pliku>”. Ten sam gracz w tej samej instalacji (to samo konto, będące członkiem
   kampanii) dostaje kartę od razu. W pozostałych przypadkach MG przypisuje jednym klikiem, także
   przy zapraszaniu („ta karta jest twoja”).
4. **Scenariusze w zakresie: ten sam MG, inna kampania; cofnięcie własnej kampanii.** Inny MG
   i inny serwer są **poza zakresem**: nic pod nie nie projektujemy i nie testujemy (paczka
   i tak będzie samowystarczalna, ale to skutek uboczny, nie obietnica).
5. **Cofnięcie z automatycznych kopii kampanii.** Serwer sam robi kopię kampanii przy
   **rozpoczęciu i zakończeniu sesji** oraz **co godzinę w jej trakcie**. Zostają kopie
   z **10 ostatnich sesji**. Grafiki trzymane twardymi dowiązaniami, jak w etapie 33.
6. **Cofnięcie = zamiana miejscami.** Odtworzona kampania zajmuje miejsce bieżącej: ci sami
   gracze, przypisane karty, zostaje otwarta. Dotychczasowa zawartość wyjeżdża do osobnej kampanii
   „<nazwa> (przed cofnięciem 22.10)” bez graczy, do ręcznego usunięcia.
7. **Czat przy cofnięciu zostaje bieżący.** Cofnięcie dotyczy stanu gry, log rozmów się nie
   cofa. Automatyczne kopie mogą więc być bez czatu. Ręczne pobranie zostaje z przełącznikiem
   „Z logiem czatu”.
8. **Cofnąć można tylko bez trwającej sesji**, z potwierdzeniem przez wpisanie nazwy kampanii.
9. **Gracz pobiera kopię swojej karty i zgłasza kartę do wczytania.** Zgłoszenie trafia do MG,
   który je przyjmuje albo odrzuca (wzór: prośba o wszczep, `cyberware:request`). Gracz nie
   wprowadza karty do kampanii sam.
10. **Pojedyncze rzeczy do przenoszenia między kampaniami MG:** karta i scena (są), dochodzą
    **sklepy** (handlarz z asortymentem) i **profile botów** (z relacjami). Scena z NPC-ami,
    tabele losowe jako osobne pliki, notatki i handouty — **nie** (wjeżdżają tylko w całej
    kampanii).

## 57a — Paczka ZIP i wczytanie kampanii jako nowej

### Zakres

- [x] Format paczki w `shared/archive.ts`: wersja schematu paczki, układ katalogów
      (`manifest.json`, `data.json`, `files/<katalog>/<nazwa>`), lista plików w manifeście
      z rozmiarem i skrótem SHA-256. Kody odmowy dla paczki: uszkodzona, za duża, plik spoza
      listy, ścieżka wychodząca poza katalog (zip slip). Testy vitest
- [x] Eksport karty, sceny i kampanii jako ZIP (strumieniowo, bez składania całości w pamięci).
      Do paczki trafiają wyłącznie grafiki, do których prowadzą adresy z danych: własne pliki
      kampanii i stare płaskie. Wspólnych `SHARED_UPLOADS_PREFIX` nie kopiujemy, bo są
      na każdym serwerze
- [x] **Zrzut kampanii kompletny:** dochodzą tabele losowe (`RandomTable` + wiersze), czas
      kalendarza i ustawienia kampanii oraz wszystko, co ma `campaignId`, a dziś nie jedzie.
      Na start etapu przejrzeć `schema.prisma` model po modelu i spisać tabelę „jedzie / nie
      jedzie i dlaczego” do manifestu (`omitted`)
- [x] Import przez `POST /api/archive/import` (multipart, `gmOnly`, limit rozmiaru w configu).
      Rozpoznaje rodzaj z manifestu, rozpakowuje grafiki do katalogu kampanii docelowej
      (`campaignUploadTarget`) i przepisuje adresy. Plik JSON z etapu 33 przyjmuje dalej starą
      drogą (`localizeArchiveUploads`)
- [x] **Wczytanie kampanii = nowa kampania** u wczytującego MG: nowe id wszędzie, spójne
      przemapowanie powiązań (figura → karta, scena → architektura Sieci, relacje botów,
      sklep → karta handlarza itd.) w jednej transakcji. Nowa kampania **nie** zostaje otwarta
      sama; pojawia się na liście kampanii
- [x] Karty graczy wg decyzji 3: pole „czeka na gracza” (imię z pliku + id konta źródłowego).
      Przypisanie: w nagłówku karty i przy zaproszeniu gracza do kampanii
- [x] **Zakładka „Kopie” po nowemu:** przyciski „Pobierz …” i jedno „Wczytaj z pliku…” (ukryty
      input pod przyciskiem) z podpowiedzią, co się stanie. Wynik importu jako komunikat
      (etap 55) z linkiem „Otwórz kampanię” przy kampanii
- [x] Testy: `shared` (manifest, odmowy, zip slip), dymne serwera (karta i scena z grafiką
      w obie strony, kampania → nowa kampania z kompletem tabel i działającymi powiązaniami),
      E2E `@szybkie`: pobranie i wczytanie sceny z mapą do drugiej kampanii MG

### Kryteria ukończenia

- [x] Scena z mapą i figurami pobrana z kampanii A i wczytana w kampanii B tego MG pokazuje mapę
      także po **usunięciu** pliku mapy z katalogu A (paczka jest samowystarczalna)
- [x] Zrzut kampanii wczytany jako nowa kampania odtwarza karty, sceny, tabele losowe, sklepy,
      boty, dziennik i handouty, a figury na scenach są powiązane z kartami
- [x] Karta gracza z paczki wchodzi jako „czeka na gracza” i daje się przypisać jednym klikiem
- [x] Stary plik JSON z etapu 33 dalej się wczytuje
- [x] Oględziny zakładki „Kopie” w Firefoksie (Playwright)

### Rozstrzygnięcia 57a (22.10, bez pytań — do słowa MG)

- **Biblioteka ZIP: `yazl` + `yauzl`** (czysty JS, strumieniowo). Grafiki w paczce bez
  kompresji (WebP/JPG/MP3 już są skompresowane); manifest i dane — z kompresją.
- **Walka przy wczytaniu jako nowa kampania nie jedzie** (wskazówka techniczna „domyślnie nie”).
  Czat też nie: jedzie w pliku do przeczytania (przełącznik „Z logiem czatu”), ale nowa
  kampania zaczyna z pustym — autorzy to konta innej kampanii, a karty czatu wskazują figury
  sprzed wczytania. Manifest mówi to zdaniem.
- **Jedno „Wczytaj z pliku…” zamiast wyboru właściciela i nazwy.** Właściciela rozstrzyga
  decyzja 3 (to samo konto w kampanii — od razu, inaczej „czeka na gracza”), nazwę zmienia się
  potem na karcie. Kampania o nazwie, którą MG już ma, dostaje dopisek „(z pliku DD.MM)”.
- **Id konta przy czekającej karcie zostaje tylko dla gracza kampanii tego samego MG**
  (`knownPlayers`) — inaczej samo imię. Wymusił to test izolacji kampanii (44b).
- **Zdarzenia `archive:character` i `archive:scene` usunięte** — wczytanie to wyłącznie trasa
  `POST /api/archive/import`, także dla starych plików JSON.
- **Limity:** plik do 512 MB (`VTT_ARCHIVE_IMPORT_MAX_MB`), po rozpakowaniu do 2 GB i 20 000
  plików. **Na VPS sufitem jest `client_max_body_size 64m` w `deploy/nginx.conf`** (i ewentualny
  limit Nginx Proxy Managera) — dziś kampanie mają 4–28 MB; większą paczkę trzeba będzie
  wpuścić tam (do sprawdzenia w 57b, przy pomiarze miejsca na VPS). Wiedza i dziennik wczytanej kampanii tracą ślad indeksu RAG (indeksują się od nowa).
- **Udostępnienia handoutów** jadą w zrzucie, ale wczytują się tylko graczom, którzy są
  w kampanii docelowej — w nowej kampanii nie ma nikogo (przyda się przy cofnięciu, 57b).

## 57b — Automatyczne kopie kampanii i cofnięcie

### Zakres

- [x] Kopia kampanii po stronie serwera: katalog `<BACKUP_DIR>/campaigns/<campaignId>/<chwila>/`
      z `manifest.json` + `data.json` (bez czatu) + grafikami jako **twardymi dowiązaniami**
      do `uploads/`. ZIP składany dopiero przy pobraniu. Ten sam kod danych co w 57a
- [x] Wyzwalacze: `session:start`, `session:end`, każda inna droga końca sesji (administrator
      `POST /api/admin/sessions/:campaignId/end`, wygaśnięcie slotu) oraz co godzinę, póki sesja
      trwa. Kopia nie blokuje stołu: robi ją praca w tle, a błąd kopii idzie do dziennika serwera
      i komunikatu MG, nie do graczy
- [x] Rotacja: kopie z 10 ostatnich sesji (wszystkie kopie jednej sesji liczą się jako jedna
      pozycja), ustawiana w configu. Czysta funkcja planu rotacji w `shared` z testami, wzorem
      `rotateSnapshots`
- [x] Panel „Kopie”: lista kopii tej kampanii (sesja, chwila, rodzaj: start / co godzinę /
      koniec, rozmiar), „Pobierz” (ZIP) i „Cofnij do tej kopii”
- [x] **Cofnięcie (decyzje 6–8):** odmowa przy trwającej sesji (`SESSION_ACTIVE`), potwierdzenie
      nazwą kampanii, kopia bezpieczeństwa stanu sprzed cofnięcia. Kampania zachowuje
      **tożsamość**: id, graczy, zaproszenia, czat, historię sesji i swoją listę kopii.
      Zawartość gry (karty, sceny, tabele, sklepy, boty, dziennik…) wymienia się na tę z kopii,
      a dotychczasowa wyjeżdża do nowej kampanii „<nazwa> (przed cofnięciem DD.MM)” bez graczy
- [x] Karty graczy po cofnięciu wracają do tych samych graczy. Karta gracza, którego już nie ma
      w kampanii, wchodzi jako „czeka na gracza” (57a)
- [x] **„Usuń kampanię” dla MG** (dziś usuwa tylko administrator razem z kontem MG): z
      potwierdzeniem nazwą i odmową przy trwającej sesji albo otwartej kampanii. Bez tego
      kampanie „przed cofnięciem” zostają na zawsze. Usunięcie zabiera katalog uploadów
      kampanii; dowiązania w kopiach trzymają pliki przy życiu
- [x] `deploy/pull-backup.ps1` i `docs/DEPLOY.md`: sprawdzić, czy kopie kampanii jadą off-site
      razem z kopiami bazy, i zmierzyć miejsce na dysku VPS po 10 sesjach
- [x] Testy: rotacja w `shared`, dymne serwera (kopia na start/koniec sesji, odmowa przy
      sesji, cofnięcie zachowuje graczy i czat, stara zawartość w kampanii „przed cofnięciem”),
      E2E: sesja → zmiana karty → koniec sesji → cofnięcie → karta sprzed zmiany u gracza

### Kryteria ukończenia

- [x] Rozpoczęcie i zakończenie sesji zostawia dwie kopie kampanii; po 11 sesjach zostają kopie
      z 10 ostatnich
- [x] Cofnięcie do kopii ze startu sesji przywraca stan gry sprzed sesji: gracze wchodzą do
      tej samej kampanii i widzą swoje karty, a czat jest kompletny
- [x] Stan sprzed cofnięcia da się obejrzeć w kampanii „(przed cofnięciem …)” i usunąć
- [x] Kopie bazy z etapu 33/53 i skrypt `restore.ts` działają bez zmian
- [x] Oględziny listy kopii i cofnięcia w Firefoksie (Playwright)

### Rozstrzygnięcia 57b (22.10, bez pytań — do słowa MG)

- **Nazwa kopii `copy-RRRRMMDD-GGMMSS-mmm-<powód>`** (UTC, z milisekundami): start i koniec
  krótkiej sesji mieszczą się w jednej sekundzie, a porządek nazw ma być porządkiem czasu.
  Sesję w kopii znaczy chwila jej startu; kopia „przed cofnięciem” jest poza sesją i liczy się
  w rotacji jako osobna pozycja.
- **Cofnięcie zostawia te same id** kart, scen, figur, botów i walk (tryb `replace`), a nie nowe:
  czat, zaproszenia „ta karta jest twoja” i otwarte okna wskazują dalej to, co trzeba. Kampania
  „przed cofnięciem” dostaje nowe id (droga 57a), jej karty graczy czekają na gracza.
- **Zostaje bieżące:** nazwa kampanii, flaga poligonu, członkowie, zaproszenia, czat, dziennik
  sesji i szkice kreatora. **Wraca z kopii:** zegar świata, sklepy i dostępność, muzyka, walki;
  przebiegi Sieci nie (stan chwili — czarny LOD z przebiegu wypada z kolejki).
- **Kopie usuniętej kampanii zostają w `BACKUP_DIR`** (furtka na pomyłkę); sprząta je
  administrator na dysku. „Usuń kampanię” zabiera też konta graczy tylko tej kampanii — jak
  usunięcie konta MG przez administratora (od 44b gracz ma jedną kampanię).
- **Kopie kampanii nie jadą off-site** — pełna kopia bazy pokrywa każdą kampanię
  (`docs/DEPLOY.md`). **Na VPS kopie bazy były pełnymi kopiami plików** (cztery bind mounty,
  EXDEV): `docker-compose.yml` montuje teraz cały `vtt-data` raz — do sprawdzenia po wdrożeniu.

## 57c — Pojedyncze rzeczy: sklepy i boty, karta gracza

### Zakres

- [ ] Paczka sklepu (handlarz z asortymentem i kartą handlarza, jeśli ma) i paczka profilu bota
      (z relacjami; relacja do bota, którego w kampanii docelowej nie ma, przepada i trafia
      do zdania „czego tu nie ma”). Pobieranie i wczytywanie w zakładce „Kopie”
- [ ] **Gracz: „Pobierz kopię” na własnej karcie** (paczka z portretem). Trasa sprawdza
      właściciela, a cudza karta wygląda jak nieistniejąca
- [ ] **Gracz: „Zgłoś kartę do wczytania”.** Upload paczki karty trafia do poczekalni kampanii
      (plik tymczasowy z terminem ważności), a MG dostaje prośbę w czacie / komunikacie
      z podglądem (imię, Rola, Poziom, portret) i przyciskami „Przyjmij” / „Odrzuć”. Po
      przyjęciu karta wchodzi jako karta tego gracza. Odmowa przy trwającym starciu
      (`COMBAT_LOCKED` — gracz nie zakłada nowej postaci w walce, umowa z 21.10)
- [ ] MG: „Pobierz karty graczy”, jedna paczka ze wszystkimi kartami graczy kampanii
- [ ] Testy: dymne (gracz pobiera swoją, nie cudzą; zgłoszenie → przyjęcie → karta u gracza;
      odrzucenie sprząta plik; odmowa w walce), E2E gracz + MG w osobnych kontekstach

### Kryteria ukończenia

- [ ] Gracz pobiera kopię swojej postaci, zgłasza ją w drugiej kampanii tego samego MG, a MG
      przyjmuje: karta z portretem jest u gracza
- [ ] Sklep i bot przeniesione do drugiej kampanii działają (asortyment, osobowość, relacje)
- [ ] Oględziny w Firefoksie (gracz) obok Chromium (MG)

## Poza zakresem

- **Inny MG i inny serwer** (decyzja 4): dopasowywanie kont, obce instalacje, testy pod obce konto
- **Scalanie kampanii** i nadpisywanie bieżącej zawartością pliku (decyzja 2)
- **Scena razem z NPC-ami**, tabele losowe, notatki i handouty jako osobne pliki (decyzja 10)
- **Cofanie czatu** (decyzja 7)
- **Zmiany w kopiach całej bazy** (etap 33/53) i w `restore.ts`: zostają narzędziem
  administratora na awarię serwera
- **Trwające przebiegi w Sieci** w kopii: stan chwili, jak w etapie 33

## Wskazówki techniczne

- **Jeden kod danych dla pliku i kopii automatycznej.** Funkcja „kampania → (data, lista
  grafik)” i „(data, grafiki) → nowe wiersze z mapą id” są wspólne dla 57a i 57b. Kopia
  automatyczna różni się tylko miejscem zapisu i dowiązaniami zamiast kopiowania.
- **Przemapowanie id w jednym miejscu.** Wczytanie kampanii i cofnięcie budują mapę
  `stare id → nowe id` dla każdego modelu, zanim cokolwiek zapiszą, a potem przepisują klucze
  obce. Kolumny JSON z id w środku (np. `data` karty, stan sceny) potrzebują tej samej mapy,
  więc spis takich miejsc to część przeglądu modeli z 57a.
- **Walka w kopii kampanii.** Tracker walki może trwać między sesjami (blokada rozwoju z 21.10
  zależy od niego), więc `Combat` / `Combatant` jadą w kopii automatycznej. Przy wczytaniu jako
  nowa kampania — do rozstrzygnięcia na starcie 57a, domyślnie nie jadą (jak w etapie 33).
- **Cofnięcie zachowuje id kampanii,** bo od niego zależą członkostwa, zaproszenia, czat,
  `openCampaignId` MG, sloty sesji i katalog `uploads/campaigns/<id>`. Kolejność: przenieś
  bieżącą zawartość gry do nowej kampanii „przed cofnięciem” (zmiana `campaignId` + przeniesienie
  grafik), potem wczytaj kopię do zwolnionej kampanii.
- **ZIP:** biblioteka strumieniowa na serwerze (np. `yazl` / `yauzl` albo `archiver` / `unzipper`;
  wybór na starcie 57a, bez natywnych zależności). Przy rozpakowaniu sprawdzaj każdą ścieżkę
  (zip slip), sumaryczny rozmiar po rozpakowaniu (zip bomb) i skrót z manifestu.
- **Nazewnictwo:** `archive:*` / `routes/archive.ts` jak w etapie 33. `backup` to w kodzie
  Zdolność Roli **Wsparcie** (30c).
- Umowy i pułapki obszaru: sekcja `kopie` w `umowy-kodu.md` i `pulapki-dev.md`, a przy uploadach
  i trasach także `serwer` (przeczytać przed startem).
