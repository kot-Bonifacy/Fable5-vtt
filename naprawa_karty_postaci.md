# Naprawa kreatora postaci — audyt i projekt

Data: 15.09.2026. Stan na 17.09: **etap 1 ukończony; etap 2 ukończony (2a ✅, 2b ✅, 2c ✅);
etap 3 w toku (3a ✅, 3b ✅, 3c ✅, 3d do realizacji)**.
Audyt poniżej opisuje stan sprzed naprawy.

**Priorytet MG: Kompletny Pakiet** (określony w rozmowie jako „Pełny Pakiet”).
To główna ścieżka projektowania i odbioru. Krawędziarz pozostaje zakresem
uzupełniającym oraz sprawdzeniem regresji wspólnego kodu; Ulicznik jest poza zakresem.

## Wniosek

Kreator ma działający fundament: zapis szkicu, serwerowe losowania, kontrolę
przekroczenia pul oraz przenoszenie danych i zakupów na kartę. **Nie można jednak
uznać go za w pełni zgodny z podręcznikiem ani za wystarczająco pomocny przy
samodzielnym tworzeniu postaci.** Walidacja za późno wyjaśnia braki, część zasad
jest egzekwowana nieprawidłowo, a drobna typografia utrudnia podejmowanie decyzji.

Proponowane są **trzy kolejne etapy, po jednej sesji każdy**: zasady i zapis,
prowadzenie użytkownika i czytelność, następnie wyposażenie oraz odbiór całego procesu.
Uproszczenia wyposażenia pozostają zgodnie z potwierdzoną decyzją MG.
Pełna obsługa wielu specjalizacji wymaga osobnego oszacowania przed implementacją.

## Zakres i źródła weryfikacji

- Przejrzano kroki kreatora, stan klienta, walidację i przekształcanie szkicu
  w `shared`, zdarzenia serwera, CSS oraz testy tworzenia i Ścieżki Życia.
- Podstawą porównania było **polskie wydanie podręcznika**, dostępne lokalnie
  w prywatnych rozdziałach Markdown: „Dusza i nowa maszyna”, „Uliczne opowieści”,
  „Wyposażony na Przyszłość”. Odsyłacze poniżej oznaczają drukowane strony.
  Nie wykonano ponownego porównania wszystkich tabel z obrazami stron PDF.
- Sprawdzono etap 25a, 25b, 25c i zapisane odstępstwa projektu. Pomocniczo:
  [materiał wydawcy o języku kultury pochodzenia](https://rtalsoriangames.com/2020/10/16/cyberpunk-red-alert-lifepath/).
- Porównanie lokalnego `creation.json` z ponownym wynikiem parsera **w pamięci**:
  brak różnic; 10 kompletnych szablonów Ról, 10 list po 20 umiejętności,
  13 podstawowych. Jedno ostrzeżenie dotyczy odtworzenia brakującej komórki
  tabeli Solo z przykładu na tej samej stronie. Zgodność z parserem nie
  stanowi niezależnego dowodu poprawności każdej jego rekonstrukcji tabel.
- Testy: **48 tworzenia + 30 Ścieżki Życia w shared oraz 36 serwera — wszystkie
  przeszły**. Pięć dodatkowych, tymczasowych prób odtworzyło zachowania opisane
  niżej; plik prób usunięto po audycie. Testy bazowe używają danych przykładowych,
  więc ich powodzenie samo w sobie nie potwierdza zgodności z podręcznikiem.
- Po uruchomieniu dev frontend `localhost:5173` i `/health` serwera na porcie
  3001 odpowiadają HTTP 200. Pierwszy start serwera w piaskownicy zakończył się
  błędem środowiska `uv_os_get_passwd`; ponowny start poza nią powiódł się.
- **Nie wykonano oględzin w przeglądarce ani pełnego ręcznego przejścia**:
  narzędzie nie udostępniło żadnej przeglądarki, próby Chrome i przeglądarki
  w aplikacji zakończyły się odmową dostępności. Wnioski o wyglądzie opierają
  się na zgłoszeniu MG i CSS. Nie są pomiarami wyrenderowanego interfejsu.

Materiały prywatne i wypełnione tabele podręcznika pozostają poza repozytorium.

## Co już działa

Serwer wykonuje rzuty Cech i Ścieżki Życia; odmawia ręcznego ustawiania Cech
Krawędziarza. Pilnuje zakresu Cech, górnego limitu umiejętności, minimów
podstawowych, listy Roli i przekroczenia budżetów. Koszt umiejętności ×2 jest
liczony podwójnie. Darmowy język trafia na kartę na poziomie 4. Testy potwierdzają
wznowienie szkicu po ponownym połączeniu, zapis biografii, zakupów i reszty pieniędzy,
własność postaci oraz utworzenie żetonu przy aktywnej scenie.

## Ustalenia audytu

Priorytet **P1**: poprawność postaci lub niezawodność zapisu. **P2**: czytelność,
prowadzenie użytkownika i kompletność wyniku. „Ryzyko” oznacza brak pełnej
reprodukcji w działającym UI lub przy awarii.

| ID  | Priorytet i status                                  | Problem, dowód i skutek                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | P1 — błąd potwierdzony próbą logiki                 | **Krawędziarz dopuszcza zawodową umiejętność na poziomie 1.** `creationIssues` sprawdza dolny limit 2 tylko dla podstawowych; pozostałe akceptuje od 1. Tymczasem s. 88 wymaga minimum 2 dla wybranej umiejętności tej metody. Nie należy przenosić tego ograniczenia na wszystkie opcjonalne umiejętności Kompletnego Pakietu (s. 90).                                                                                                                     |
| A2  | P1 — brak kontroli MG potwierdzony w kodzie         | **Gracz sam wybiera Rangę Postaci i większą pulę Cech.** `StatsStep` pokazuje wszystkie pule również graczowi; zwykły `creation:patch` przyjmuje dowolny znany `statRankId`. Próba potwierdziła akceptację większej puli. Według s. 78 pulę określa MG. Serwer powinien egzekwować wybór MG, a kreator gracza go objaśniać.                                                                                                                                 |
| A3  | P1 — ryzyko utraty zmian, odtworzone na danych      | **Kolejka nie zabezpiecza szybkich zmian przed nadpisaniem.** `SkillRow` buduje cały zestaw `skills` z ostatniej odpowiedzi serwera; kolejka w `creationStore` wysyła już przygotowane zestawy. Dwa kliknięcia przed odpowiedzią mogą użyć tego samego starego stanu. Sekwencyjna próba dwóch takich zapisów cofnęła pierwszą zmianę. Analogicznie trzeba sprawdzić Cechy i pola zagnieżdżone; skali zjawiska w UI nie zmierzono.                           |
| A4  | P2 — zachowanie potwierdzone próbą                  | **Niewydane punkty nie wywołują ostrzeżenia.** Walidacja sprawdza tylko przekroczenie puli. Można uzyskać „Postać gotowa”, pozostawiając punkty Cech i umiejętności. Podręcznik każe rozdzielić pule (s. 78, 88–90); co najmniej potrzebne jest jawne ostrzeżenie, żeby gracz nie stracił ich przypadkiem. Sposób zakończenia niepełnego przydziału wymaga decyzji MG.                                                                                      |
| A5  | P2 — problem zgłoszony przez MG, przyczyna w kodzie | **Wymagania są wyjaśniane dopiero w podsumowaniu.** Pełna lista `creationIssues` jest renderowana wyłącznie w ostatnim kroku. W umiejętnościach podstawowa ma tylko przygaszoną kropkę z `title`. Nie ma etykiety minimum, stanu „brakuje 2”, legendy kropki ani przejścia z błędu do pola. Klasa `creator-skill--basic` nie daje osobnego wyróżnienia w CSS.                                                                                               |
| A6  | P2 — potwierdzone deklaracje CSS                    | **Ważne informacje są zbyt drobne.** Koszty i skróty Cech: 0,68 rem; opisy: 0,72–0,74 rem; nazwy umiejętności: 0,82 rem. Przy bazie 16 px to odpowiednio ok. 10,9, 11,5–11,8 i 13,1 px. Dodatkowo często używany jest przygaszony kolor. Potrzebna jest zmiana hierarchii i układu, z odbiorem przy rzeczywistej skali ekranu MG.                                                                                                                           |
| A7  | P2 — ograniczenie modelu i niespójność podglądu     | **Język kultury i specjalizacje nie są w pełni obsłużone.** Język ma jeden wspólny poziom, darmowy koszt i sufit 4; model nie pozwala kupić osobnych języków ani wielu dziedzin tej samej umiejętności. W Kompletnym Pakiecie wiersz języka może pokazywać 0, mimo że karta otrzyma 4. Próba potwierdziła też kartę z językiem 4 bez wybranej nazwy. Darmowe 4 poziomy są poprawne (s. 45); brak nazwy i wielu niezależnych dziedzin to osobne zagadnienia. |
| A8  | P2 — sprzeczne komunikaty w kodzie                  | **Wiedza lokalna może wyglądać na wymaganą do uzupełnienia, choć nie blokuje zakończenia.** Pole specjalizacji dostaje stan błędu i podpowiedź „Bez tego nie da się skończyć postaci”, ale walidacja świadomie pomija podstawowe umiejętności. Należy ujednolicić komunikat i ustaloną zasadę, bez automatycznego zaostrzania walidacji NPC.                                                                                                                |
| A9  | P2 — niepełna informacja o kasowaniu danych         | **Zmiana metody/Roli usuwa więcej, niż zapowiada interfejs.** Ostrzeżenie mówi o Cechach; zmiana metody usuwa również koszyk, zmiana Roli odpowiedzi jej Ścieżki, a niedozwolone umiejętności są odfiltrowywane. Użytkownik powinien znać konkretny skutek przed zmianą, najlepiej z możliwością cofnięcia.                                                                                                                                                 |
| A10 | P2 — luka prowadzenia użytkownika                   | **Rola na randze 4 nie oznacza zakończonej konfiguracji Zdolności.** Kreator ustawia rangę, ale pozostawia domyślne puste przydziały Medycyny, Twórcy, Zmysłu Walki, zespołu i floty. Część obsługuje późniejsza karta. Potrzebna jest lista właściwych dla Roli decyzji oraz wyraźne przejście do ich uzupełnienia; nie każda z nich musi blokować tworzenie.                                                                                              |
| A11 | P1 — ryzyko awarii potwierdzone strukturą kodu      | **Zakończenie nie jest jedną odporną operacją.** `creationFinishEvent` zapisuje kartę i usuwa szkic w transakcji, a dopiero potem rozlicza wyposażenie i stawia żeton. Awaria późniejszego kroku może pozostawić częściowy wynik bez szkicu do ponowienia. `discard` klienta z kolei ignoruje wynik odmowy serwera. Wymaga testu wymuszonej awarii; w audycie nie wywoływano jej na danych kampanii.                                                        |

### Świadome odstępstwa — nie klasyfikować jako nowe błędy

Zgodnie z wcześniejszymi decyzjami MG w plikach etapów:

- **25a:** obsługiwane są dwie metody; Ulicznik pozostaje poza kreatorem.
- **25b:** ogólna Ścieżka Życia nie blokuje tworzenia; część binarnych pytań
  Ról rozstrzyga się poza tabelami. Nie należy wymuszać całej biografii.
- **25c:** pakiet wyposażenia Krawędziarza dokłada MG; moda i jej osobny budżet
  nie są rozliczane; cyborgizacje instaluje się później; zakupy startowe mają
  stały poziom dostępności 1, również dla MG.

To powoduje, że postać wychodząca z kreatora może wymagać dalszej pracy MG.
Taką informację trzeba pokazać przy wyborze metody i zakończeniu. Sam napis
„Postać gotowa” nie powinien obiecywać pełnego wyposażenia z podręcznika.

## Etap 1 — poprawne zasady i niezawodny szkic

**Status: ✅ ukończony 16.09.2026** (wdrożenie 15–16.09, domknięcie w drugiej sesji 16.09).

- [x] Minimum Krawędziarza i wspólne limity; blokada niewydanych punktów dla wszystkich.
- [x] Ranga szkicu wybierana indywidualnie przez MG, egzekwowana na serwerze i po wznowieniu.
- [x] Darmowy język: poziom i koszt w UI, obowiązkowa nazwa; specjalizacje podstawowe bez fałszywej blokady.
- [x] Aktualizacje na najnowszym stanie, kontrola rewizji, ponowienia, błędy połączenia i kasowania.
- [x] Atomowe zapisanie karty, zakupów, salda i rejestru; ponowne zakończenie bez duplikatów.
- [x] Oddzielna informacja o żetonie i ponowienie po awarii albo braku sceny.
- [x] Regresje: 55 testów shared, 44 serwera, 9 klienta dla kreatora; pełny przebieg wszystkich pakietów zielony.
- [x] Chrome na osobnej bazie: MG/gracz, ranga, dwa zapisy, ×2, zachowanie po F5.
- [x] Końcowy przegląd zmian i potwierdzenie uruchomienia zwykłego dev po wyłączeniu instancji testowej.
- [x] Formalne zamknięcie etapu 1.

**Ustalenia z realizacji:** brak wydania całej puli blokuje także MG; rangi są indywidualne,
nie kampanijne. Stare szkice graczy wymagają zatwierdzenia rangi przez MG; nie kasujemy
rozdzielonych Cech ani umiejętności. Istniejące karty nie zmieniają mechanicznych danych.
Wiele języków i specjalizacji to osobny projekt (`POMYSLY.md`). Automatyczny przydział
minimów pozostaje w etapie 2 zgodnie z poniższym zakresem.

**Ustalenia z domknięcia (16.09, przegląd końcowy):**

- **Slang uliczny kosztuje 2 pkt — decyzja MG.** `language` jest jednocześnie podstawowym
  „Językiem (slang uliczny)” i darmowym językiem kultury, więc darmowe 4 poziomy spełniały
  minimum slangu za 0 pkt: każda postać miała 2 punkty więcej niż w przykładzie z s. 90
  (po trzynastu podstawowych zostaje 60 z 86). `creationFreeLanguageCharge` dolicza koszt
  minimum do wydanych punktów. Karta nadal ma jeden wiersz „Język 4” — osobny slang przyjdzie
  z projektem wielu języków. Szkic z rozdzieloną pulą pokaże „pozostało −2”.
- **Zmiana rangi przez MG nie podbija już `revision`.** Zapis gracza w drodze (albo wysłany po
  chwilowym rozłączeniu) dostawał `DRAFT_CHANGED`, którego „Ponów zapis” nie mógł przejść,
  a „Wczytaj zapis serwera” kasował zmianę. Ranga ma osobną kolumnę, łata gracza jej nie nadpisze.
- **Pola Cech, dziedziny i imienia trzymają tekst lokalnie podczas edycji** (`useDraftFieldText`).
  Pole związane wprost ze stanem serwera traciło znaki przy opóźnieniu, dwa szybkie ↑ w Cesze
  wysyłały dwa razy tę samą wartość, a imię po „Wczytaj zapis serwera” zostawało stare.
  Sprawdzone w Chrome z opóźnieniem 250 ms na gnieździe.
- **Ponowienie i wstrzymane zmiany idą w jednej turze kolejki**, w pierwotnej kolejności;
  wcześniej zmiana kliknięta w trakcie ponowienia mogła wyprzedzić starsze intencje.
- Przy zatrzymywaniu dev w tle na Windows zostają procesy potomne na portach 3001/5173
  (stąd `EADDRINUSE` z poprzedniej sesji) — pułapka w `testy`.


**Cel:** gracz tworzy legalną postać, a jego zmiany nie giną.

Zakres ogólny:

- Rozdzielić wymagania umiejętności według metody; minimum Krawędziarza,
  podstawowe i koszt ×2 wyliczać w jednym miejscu w `shared`.
- Przenieść decyzję o puli Cech do MG i egzekwować ją na serwerze, także po
  wznowieniu szkicu i zmianie metody.
- Uzgodnić traktowanie niewydanych punktów; zachować je w szkicu i jasno
  rozliczać przed zakończeniem, bez zamiany na PD lub pieniądze.
- Uporządkować darmowy język, nazwę języka i specjalizacje. Zaprojektować
  kompatybilność istniejących szkiców/kart, jeżeli powstaną osobne wpisy dziedzin.
- Zapisywać intencje lub aktualizacje pojedynczych pól w sposób odporny na
  nieaktualny stan; obsłużyć błędy, ponowienia, rozłączenie i usuwanie szkicu.
- Uodpornić ukończenie: karta, pieniądze i zakupy mają spójny wynik; nieudane
  postawienie żetonu daje osobny komunikat i możliwość naprawy bez duplikatu karty.

**Odbiór:** testy wykrywają A1–A3 i A11; dwie szybkie zmiany zachowują oba wyniki;
gracz nie podnosi sobie puli; awaria zakończenia nie gubi szkicu ani zakupów;
powtórzenie operacji nie tworzy drugiej postaci. Ustalona polityka języka
i niewydanych punktów ma testy regresji. Dane podręcznika nie trafiają do testów publicznych.

**Kolejność przy priorytecie MG:** najpierw pula Cech, podstawowe umiejętności,
język i zachowanie zapisów Kompletnego Pakietu; minimum Krawędziarza poprawić
w ramach rozdzielenia wspólnej walidacji.

## Etap 2 — czytelny kreator, który prowadzi przez decyzje

**Zależność:** etap 1. **Cel:** wymagania są widoczne tam, gdzie się je spełnia.

**Podział z 16.09 (trzecia sesja, za zgodą MG):** zakres poniżej nie mieści się w jednym oknie
kontekstu razem z obowiązkowym odbiorem w pięciu konfiguracjach ekranu, więc idzie w trzech
częściach, po jednej sesji każda:

- **2a — minima i prowadzenie w umiejętnościach.** Automatyczne minima podstawowych w obu
  metodach (stary szkic: bilans i przycisk, bez cichej zmiany); u Krawędziarza „+” z 0 skacze
  na 2, a „−” z 2 schodzi na 0. Wiersz umiejętności: „Podstawowa · min. 2”, brakujące punkty,
  koszt ×2, pełna nazwa Cechy i suma Cecha + poziom, znacznik listy Roli jako podpowiedzi.
  Przyklejony licznik, wyszukiwanie, filtr braków, osobny wiersz darmowego języka. Walidacja
  przy polach, stan kroków na zakładkach (tylko kroki już odwiedzone), podsumowanie pogrupowane
  po krokach z „Przejdź do pola”. Gracz nie wpisuje Cech Kompletnego Pakietu przed zatwierdzeniem
  rangi (serwer też odmawia; stare szkice zachowują Cechy). Skala pisma kreatora podniesiona
  do celu (treść 16 px, pomocnicze 14 px) — bez pełnego odbioru ekranów.
- **2b — skutki zmian i panel MG.** Potwierdzenie w oknie kreatora z konkretną listą strat przy
  zmianie Roli albo metody (bez cofania). Krótkie objaśnienia Ról, Cech i umiejętności,
  obsługa klawiatury. Panel rang w zakładce „Postaci” z licznikiem na zakładce, na żywo, tylko
  Kompletny Pakiet, bez zakładania szkicu MG. Łączenie zapisów pola tekstowego.
- **2c — typografia, kontrast i odbiór.** Układ wszystkich kroków przy nowej skali, kontrast obu
  motywów, powiększenie; pełny odbiór w przeglądarce według akapitu „Odbiór” niżej.
  **Zmienione przez MG 16.09 (piąta sesja):** odbiór rozdzielczości 4K/3440/2560 odpada („obecna
  skala mi odpowiada, gracze mogą zmienić skalę widoku”); w zamian skórki karty i kreatora na
  naturalnej teksturze papieru z sieci.

### Część 2a — status: ✅ ukończona 16.09.2026 (trzecia sesja)

- [x] `skillMinimaAuto` w szkicu; minima podstawowych w obu metodach, raz na rachunku, także po F5.
- [x] Stary szkic: bilans „X → 2”, koszt i pula po przydziale, przycisk „Przydziel minima”; nic nie spada.
- [x] `creationSkillRow`: „Podstawowa · min. 2”, ×2, „lista Roli” jako podpowiedź, brakujące punkty,
      Cecha + poziom; przyciski przeskakują poziom 1 (Krawędziarz), podstawowa nie schodzi pod 2.
- [x] Przyklejony licznik, wyszukiwarka bez polskich znaków, filtry Wszystkie/Braki/Wybrane/Lista Roli,
      osobna karta darmowego języka z przejściem do Ścieżki Życia.
- [x] Zakładki: ✓ albo liczba braków na krokach już odwiedzonych; stopka „N braków — pokaż”.
- [x] Podsumowanie pogrupowane po krokach, nieustalone Cechy w jednym wierszu, „Przejdź” skupia pole.
- [x] Cechy Kompletnego Pakietu zablokowane graczowi do zatwierdzenia rangi (serwer `CREATION_RANK_PENDING`),
      odblokowanie na żywo po decyzji MG.
- [x] Skala pisma kreatora: treść 1rem, pomocnicze ≥ 0.875rem; okno do 1180 px; ciemne pola liczbowe Cech.
- [x] Testy: 11 nowych w shared, 2 nowe i 1 przerobiony na serwerze, 2 nowe u klienta; pełny przebieg zielony.
- [x] Chrome na `.creation-ui.db` (okno 1456–2078 px CSS, DPR 1,25): stary szkic i bilans, nowy gracz
      z 60 z 86 po podstawowych (jak s. 90), F5, blokada i odblokowanie Cech, Krawędziarz 0 → 2 → 0,
      Nauka bez dziedziny → filtr „Braki” → „Przejdź”, motyw dzienny kroku Umiejętności.

**Ustalenia z realizacji 2a:**

- Stan kroków jest pamięcią okna (`visited` w magazynie), nie polem szkicu: po F5 ocenia kroki do
  bieżącego. Skok prosto do podsumowania oznacza wszystkie wcześniejsze kroki jako przejrzane —
  „Wyposażenie ✓” pojawi się także bez wejścia do sklepu (pusty koszyk nie jest brakiem).
- Pole „Dziedzina” pokazuje się dopiero przy poziomie > 0 (albo gdy już ma treść); przy Wiedzy lokalnej
  (podstawowej) jest opisane jako opcjonalne, zgodnie z decyzją z etapu 1.
- Nie sprawdzono jeszcze: 4K/150%, 3440×1440, 2560×1440, powiększeń 125/150% i obsługi klawiaturą
  poza „Przejdź” — to zakres 2c. Układ tabeli Cech (wartości daleko po prawej) też zostaje na 2c.

### Część 2b — status: ✅ ukończona 16.09.2026 (czwarta sesja)

- [x] `creationChangeEffect` w `shared` liczy straty zmiany Roli albo metody z tego samego
      `mergeCreationDraft`, który stosuje serwer: Cechy (wylosowane albo rozdzielone), zdjęte
      i obniżone umiejętności, koszyk z nazwami i ceną, odpowiedzi Ścieżki Życia Roli. W notatkach:
      przydzielane minima, poziom 1 niedozwolony w Krawędziarzu, zmiana puli i pieniędzy.
- [x] Okno potwierdzenia w kreatorze (`CreatorDialog`) tylko wtedy, gdy coś przepada: fokus na
      „Anuluj”, `Tab` zostaje w oknie, `Esc` zamyka, fokus wraca do kontrolki. To samo okno dla
      „Wyrzuć szkic” (lista tego, co przepada, i nazwa kampanii spoza poligonu) i „Wczytaj zapis
      serwera”; `window.confirm` w kreatorze już nie ma.
- [x] Objaśnienia: jedno zdanie na Rolę (`roles.json`, pole `summary`, napisane dla VTT), podpowiedź
      pod każdą Cechą (`CPRED_STAT_HINTS`, `aria-describedby`), „?” przy umiejętności rozwija opis
      z prywatnego `skills.json` (bez danych prywatnych przycisku nie ma).
- [x] Klawiatura: poziom umiejętności to `spinbutton` (↑/↓, jeden przystanek `Tab` na wiersz,
      przyciski −/+ poza kolejnością), `Esc` czyści wyszukiwarkę, `Esc` w polu Ścieżki Życia cofa
      tekst bez zapisu, `aria-pressed` na kartach Ról, widoczny `:focus-visible` w kreatorze.
      Kreator i karta postaci mają `data-owns-keys` — klawisze z ich przycisków nie sterują mapą.
- [x] Panel rang w zakładce „Postacie” (`CreationRankPanel`): wyłącznie szkice graczy w Kompletnym
      Pakiecie, oczekujące pierwsze, ranga zatwierdzana przyciskiem; serwer rozsyła listę
      `creation:ranks-sync` do pokoju MG; znaczek z liczbą oczekujących na zakładce. Panel zniknął
      z kreatora, więc MG nie zakłada już pustego szkicu.
- [x] Łączenie zapisów pola: `creationStore.patch(łata, { field })` podmienia zapis, który jeszcze
      nie wyszedł; `useDraftFieldText(…).write` nie odtwarza stanów pośrednich po wyjściu z pola.
- [x] Testy: 4 nowe w `shared`, 1 nowy na serwerze, 2 nowe u klienta; pełny przebieg zielony
      (2133 / 1183 / 223), `tsc`, ESLint, Prettier czyste.
- [x] Chrome na `.creation-ui.db` (MG na `localhost`, gracz na `[::1]`, okno 2078×1171 CSS, DPR 1,25):
      opisy Ról i Cech, „?” i `spinbutton` prawdziwymi klawiszami, zmiana Roli bez strat (bez okna),
      zmiana metody z oknem („Nauka 1”, pula 59 → 60, 2550 → 500 ed), `Tab` w oknie, `Esc` z powrotem
      fokusu, „Wyrzuć szkic”, znaczek „1” u MG na żywo, zatwierdzenie rangi samą klawiaturą
      i odblokowanie Cech gracza, okno z „Rozdzielone Cechy (1): INT 5”, opóźnienie 250 ms:
      15 znaków ksywy = 2 ramki i żadnego stanu pośredniego, F5, `Tab` w karcie postaci.

**Ustalenia z realizacji 2b:**

- **Błąd spoza audytu, naprawiony:** nasłuch klawiatury mapy (`MapArea`) omijał tylko pola tekstowe,
  więc fokus na przycisku kreatora albo karty oddawał mu `Tab` (fokus stał, przełączała się figura),
  `Delete`/`Backspace` (kasowanie zaznaczonego obiektu sceny) i litery narzędzi. Potwierdzone
  w przeglądarce: po zdjęciu `data-owns-keys` z karty fokus po `Tab` zostaje na „Karta”.
  Skutek przyjęty przez MG: cyfry paska akcji nie działają, póki fokus stoi na przycisku karty.
  Pozostałe okna (edytor botów, edytor architektury i okno runu Sieci) — `POMYSLY.md`.
- **Zmiana Roli w Kompletnym Pakiecie nadal kasuje Cechy** (decyzja MG z 16.09), choć ta metoda ich
  nie czyta z szablonu Roli. Okno strat to wymienia.
- Zmiana, która niczego nie zabiera (pierwsza Rola, zmiana metody na pustym szkicu), idzie bez okna.
- Rangę MG zatwierdza przyciskiem: strzałki na zamkniętej liście w Chrome zmieniają wartość, więc
  zapis na `change` zatwierdzałby po drodze każdą pulę.
- Nie sprawdzono: 4K/150%, 3440×1440, 2560×1440, powiększeń 125/150%, motywu dziennego okna strat
  i panelu rang ani czytnika ekranu — zakres 2c. Na bazie testowej szkic „Test 2a” założono od nowa
  (Solo, Kompletny Pakiet, ranga „Postać początkująca”, ksywa „Zgrzyt z Kabuki”, INT 5), a MG ma
  kartę „Test klawiatury 2b”.

### Część 2c — status: ✅ ukończona 16.09.2026 (piąta sesja)

- [x] Skórka „stara kartka” dla karty postaci i kreatora (`sheet-window--paper`): pożółkły papier
      w kremie głównego UI (dzień), czarny karton (noc), wytarcia nad drukiem, pęknięcia na czerwonych
      ramkach i belce tytułowej. Tekstury z sieci: „Old paper6” (Wikimedia, domena publiczna)
      i ambientCG „Asphalt 011” (CC0), obrobione `tools/art/sheet-paper.py`, razem ~0,56 MB.
- [x] Wnętrze kreatora na palecie karty: chrom (`--bg-*`, `--border`, `--text`) przestawiony w oknie
      na papier i tusz; listy wyboru kreatora ostylowane (były gołymi kontrolkami przeglądarki).
- [x] Układ: tabela Cech na szerokość treści z rowkami między wierszami (pole wartości stało ~700 px
      od nazwy); zakładki kroków zawijają się w wąskim oknie (od ~1120 px CSS „Podsumowanie” wypadało
      poza pasek).
- [x] Błąd motywu dziennego spoza kreatora: `--accent-ink` (#fff1ef) dawał niemal biały napis
      `.small-button--primary` na jasnym tle — „Rzuć całą Ścieżkę”, „Utwórz postać” i 3 inne przyciski.
- [x] Kontrast policzony dla obu motywów z uwzględnieniem wytarć (`docs/assety-karta-postaci.md`).
- [x] Test: `theme.test.ts` pilnuje, że pliki pęknięć mają kolor `--cp-paper`; 224 testy klienta.
- [x] Chrome na `.creation-ui.db`: karta (4 zakładki) i kreator (7 kroków, okno strat) w obu motywach;
      okno 1708×882 CSS (4K, skala 150%, powiększenie 150%) i 1102×576 — nawigacja i stopka widoczne.

**Ustalenia z realizacji 2c:**

- **Decyzje MG o wyglądzie (16.09):** kierunek „papier i druk”, subtelnie, para dzień/noc jak dotąd;
  papier jak na tapecie logowania, ale jaśniejszy; **żadnych ciemnych drobinek ani plam** („kojarzą
  się z zabrudzeniami”) — tylko wytarcia i pęknięcia; pęknięcia na czerwonych ramkach (propozycja MG);
  mocniejsze wytarcia.
- **Świadomy koszt kontrastu (decyzja MG):** wytarcia leżą nad tekstem, więc w dzień przygaszony
  napis na papierze spada w 5% najbardziej wytartej powierzchni do ~3,8:1 (punktowo ~3,0:1). Wariant
  „wytarcia jako tło belek, pod tekstem” MG odrzucił.
- **Pęknięcia nie leżą nad treścią:** pierwsza wersja wymazywała litery w polach; są obrazem tła
  czerwieni. Z czarnych belek i zakładek zdjęte, bo jasna rysa pod drobnym białym napisem zjadała
  kontrast numerów kroków.
- **Powiększenie sprawdzone rozmiarem okna, nie `zoom` CSS** — `zoom` na dokumencie mnoży `vh`
  i okno kreatora wychodziło poza ekran, czego prawdziwe powiększenie nie robi (pułapka w `ogledziny`).
- **Nie sprawdzono:** portretu na papierze (postać testowa go nie ma — wytarcia mają go omijać,
  `z-index: 4`), Safari/iPada (`mask-mode: luminance`), czytnika ekranu, prawdziwego powiększenia
  przeglądarki ani płynności przewijania na słabszym sprzęcie graczy — pozycja w `zaleglosci.md`.

Zakres ogólny:

- Ustalić typografię: proponowana baza treści i pól 16 px, pomocnicze teksty
  co najmniej 14 px przy domyślnym powiększeniu. Zachować powiększanie, zawijanie
  tekstu i dostęp do przycisków przy mniejszym oknie; dobrać kontrast obu motywów.
- W umiejętnościach pokazywać **„Podstawowa · min. 2”**, bieżący poziom,
  brakującą liczbę punktów i koszt ×2. Cecha powiązana z umiejętnością ma mieć
  zrozumiałą nazwę; wymagania podręcznika odróżnić od rekomendacji dla Roli.
- **Decyzja MG:** przydzielić wymagane minima automatycznie i od razu
  potrącić ich koszt z puli. Dla starszych szkiców przed zmianą pokazać bilans;
  nie kasować samodzielnie wybranych poziomów.
- Dodać widoczny licznik „pozostało”, podgląd sumy Cecha + poziom umiejętności,
  wyszukiwanie i filtr braków. Jasno pokazywać osobno darmowy język.
- Wyświetlać walidację przy polach i oznaczać stan kroków. Podsumowanie grupuje
  pozostałe problemy z przyciskiem prowadzącym do pola. Można swobodnie wracać
  między krokami; niewypełnione przyszłe kroki nie powinny straszyć lawiną błędów.
- Uzupełnić krótkie objaśnienia Ról, Cech i umiejętności, komunikaty utraty
  danych po zmianie wyboru, obsługę klawiatury i zgodność komunikatów specjalizacji.
- **Rangi szkiców po stronie MG (dopisane 16.09, decyzja MG):** dziś panel „MG: rangi szkiców
  postaci” istnieje tylko wewnątrz kreatora, więc MG musi go otworzyć, co zakłada mu pusty
  własny szkic. MG nie dostaje sygnału, że gracz czeka na rangę, lista odświeża się ręcznie
  i pokazuje też szkice Krawędziarza, dla których ranga nic nie znaczy. Potrzebne: wejście
  bez tworzenia szkicu, powiadomienie lub znacznik oczekiwania, żywa lista, tylko szkice
  Kompletnego Pakietu.
- Przy wielu zapisach w kolejce (bardzo szybkie pisanie przy dużym opóźnieniu) pole po wyjściu
  z niego przez chwilę odtwarza pośrednie stany serwera, zanim dojdzie do ostatniego. Dane
  się nie gubią; do rozważenia łączenie zapisów pola tekstowego.

**Odbiór:** gracz dostrzega obowiązkowe minimum Perswazji i Skradania się bez
wchodzenia do podsumowania; wymagania nie zależą wyłącznie od koloru lub najechania.
Nowy Kompletny Pakiet ma automatycznie przydzielone minima podstawowych
umiejętności, ich koszt odjęty od puli i widoczne etykiety „Podstawowa · min. 2”.
Ponowne otwarcie szkicu nie nalicza tego kosztu drugi raz.
Główny odbiór: ekran **4K, skala Windows 150%, powiększenie przeglądarki 100%** — MG
potwierdził, że w tej konfiguracji czcionka jest za mała. To okno ok. **2560 px CSS**
szerokości (mniej o ramkę i paski przeglądarki), więc 1 px CSS = 1,5 piksela ekranu.
Sprawdzić wszystkie kroki, oba motywy i klawiaturę. Dodatkowo sprawdzić okna
3440x1440 i 2560x1440 oraz powiększenie 125% i 150%. Czytelność przy 4K/100%
ma wynikać z poprawionego interfejsu, bez konieczności zwiększania zoomu przez MG.
Powiększenie nie może odcinać nawigacji ani zasłaniać pól. Rzeczywisty odbiór
w przeglądarce jest obowiązkowy, sam przegląd CSS nie wystarczy.

## Etap 3 — gotowość do gry i odbiór obu metod

**Zależność:** etapy 1–2. **Cel:** użytkownik wie, co postać ma i co zostało do zrobienia.

**Podział z 17.09 (za zgodą MG), rozszerzony tego samego dnia:** wątki wdrożenia i pełny odbiór
obu metod w przeglądarce nie mieszczą się w jednym oknie kontekstu, więc etap idzie w czterech
częściach, po jednej sesji. **Zlecenie MG z drugiej sesji 17.09** — „wykonać lepszy podział
kategorii dostępności wyposażenia (obecny jest oparty tylko na koszcie, co jest nieadekwatne)" —
dołożyło czwarty wątek, więc sklep został w 3b, a czynności Roli i gotowość przeszły do 3c:

- **3a — podsumowanie zgodne z kartą i uczciwe wyposażenie.** Podsumowanie liczone z tej samej karty,
  którą zapisze serwer (Cechy, pochodne, darmowy język, Zdolność, wiersze zakupów, saldo, właściciel,
  żeton, Poziom życia); jedna lista „czego kreator nie wydaje” (pakiet Krawędziarza, Moda,
  cyborgizacje, amunicja) w sklepie, podsumowaniu i po zakończeniu; ekran końcowy z wynikiem żetonu.
- **3b — sklep: dostępność i podgląd przedmiotu.** Nowy podział poziomów dostępności (rodzaj
  rzeczy, nie sama cena), wyjątki MG na wpisie, narzędzia Roli w kreatorze i rozwijany podgląd
  właściwości przedmiotu przed zakupem.
- **3c — co zostało po kreatorze.** Lista czynności wynikających z Roli (Zmysł Walki, Medycyna,
  Twórca, zespół Korpo, Tabor Nomady — także jego opcje Zakwaterowania z Moto, cyberdek Netrunnera)
  z przejściem do paneli karty; **znacznik gotowości do gry nadawany przez MG** (decyzja MG
  z 17.09): świeża postać „czeka na MG”, MG widzi w zakładce „Postacie” listę z tym, co zostało,
  i zatwierdza; znaczek z liczbą jak przy rangach; nowe pole w bazie.
- **3d — odbiór obu metod.** Pełne przejście według akapitu „Odbiór” niżej: MG i gracz, obie metody,
  Role z dodatkowymi decyzjami, zapis i wznowienie, zmiana Roli/metody, brak portretu, brak aktywnej
  sceny, opóźnienie i zerwanie połączenia; poprawki tego, co wyjdzie.

### Część 3a — status: ✅ ukończona 17.09.2026

- [x] `creationOutcome` w `shared`: karta, jaką zapisze „Utwórz postać” — `creationToCharacterData`,
      wiersze `purchasedSheetRow` dla każdej sztuki koszyka, reszta eurodolców i Poziom życia.
      Test serwera porównuje ją z kartą po `creation:finish` (bez identyfikatorów wierszy).
- [x] Poziom życia na start (s. 105, decyzja MG): `creationLifestyle` — „Na karmie · Kontener”,
      Korpo (po nazwie Zdolności) „Dobry prepak · Korporacyjny konap”; NPC MG bez rachunków.
      Serwer zapisuje go przy zakończeniu, gdy postać ma właściciela.
- [x] `creationLeftOutside`: pakiet Roli (Krawędziarz), Moda (Kompletny Pakiet), cyborgizacje
      (losowana UC po kreatorze), amunicja — zwinięte w kroku Wyposażenie, rozwinięte w podsumowaniu
      i na ekranie końcowym.
- [x] Podsumowanie: właściciel (gracz „Ty”, MG lista), żeton z nazwą aktywnej sceny albo „brak
      aktywnej sceny”, Zdolność z rangą, dziesięć Cech, pięć wartości pochodnych („—” do ustalenia
      wszystkich Cech), umiejętności jak na karcie z oznaczonym darmowym językiem, wiersze broni
      (OBR, LA, magazynek), pancerza (OB, miejsce) i sprzętu, saldo i Poziom życia.
- [x] Stopka „Postać gotowa” → „Wymagania kreatora spełnione”.
- [x] Ekran końcowy zamiast cichego zamknięcia: wynik żetonu, saldo, Poziom życia, ponowienie
      postawienia (bez drugiej karty), lista „czego kreator nie wydał”, „Pokaż kartę” i „Zamknij kreator”.
- [x] Poprawka spoza kreatora (osobny commit): pełny montaż wszczepu pobierał cenę **i** opłatę
      za montaż; podręcznik wlicza operację w cenę (s. 111), a opłata z s. 375 dotyczy tylko
      znalezionego wszczepu.
- [x] Testy: 4 nowe w `shared`, 1 nowy i 2 rozszerzone na serwerze (kreator), 2 poprawione (wszczepy);
      pełny przebieg 2137 / 1184 / 224, `tsc`, ESLint, Prettier czyste.
- [x] Chrome na `.creation-ui.db` (MG `localhost`, gracz `[::1]`, 2082×1172 CSS): gracz w Kompletnym
      Pakiecie kupuje 2 × broń, pancerz i apteczkę → podsumowanie (2350 ed, kontener) → „Utwórz
      postać” bez aktywnej sceny → ekran końcowy z ponowieniem; karta obok zgodna (PW 45, Poważnie
      Ranny ≤ 23, Człowieczeństwo 50, Język (Polski) 4), dane serwera zgodne (2350 ed, 2 bronie,
      Kevlar, apteczka, kontener); MG włącza scenę → „Ponów” stawia żeton, bez drugiej karty.
      MG: Krawędziarz Korpo — „Pakiet Roli” na liście, NPC „bez rachunków”, po zmianie właściciela
      „Dobry prepak · Korporacyjny konap — 600 ed / mies.”; motyw dzienny podsumowania.

**Ustalenia z realizacji 3a:**

- **Poziom życia wybiera Rola po nazwie Zdolności** („Praca Zespołowa” = Korpo), jak każda Rola
  w silniku. Nomada dostaje kontener; jego opcje z Moto (s. 165) idą na listę czynności w 3c.
- **Pierwszy miesiąc bez opłat nie ma pola** — rozliczenie miesiąca uruchamia MG, więc podsumowanie
  tylko o tym przypomina. Postać utworzona tuż przed pierwszym dniem miesiąca zapłaci przy
  najbliższym rozliczeniu, jeśli MG go nie pominie.
- **Po zamknięciu ekranu końcowego gracz nie ponowi już żetonu** — szkic znika, a ⊕ przy postaci
  jest tylko u MG. Ekran o tym mówi.
- **Wiersze tej samej broni kupionej dwa razy stoją osobno** — bo tak stoją na karcie.
- **Nie sprawdzono:** wąskiego okna i powiększenia nowego podsumowania, opóźnienia i zerwania
  połączenia przy zakończeniu (zakres 3d).

### Część 3b — status: ✅ ukończona 17.09.2026 (druga sesja)

- [x] **Poziom dostępności mówi, jak legalna jest rzecz, a nie ile kosztuje** (`shopTierVerdict`
      w `shared/systems/cpred/shop.ts`): typ broni, OB pancerza, rodzina wszczepu, klasa Programu,
      sprzęt cyberdeku; doskonała jakość broni +1; cena tylko **podnosi** (1000 ed → min. 2,
      5000 ed → 4). Rodzaj bez reguły (własny wpis MG) spada na starą drabinę cenową.
- [x] Nazwy poziomów: 1 Uliczne, 2 Zawodowe, **3 Wojskowe** (było „Korporacyjne”), 4 Czarny rynek;
      opisy pod przełącznikiem mówią, co tam stoi, a nie do ilu eurodolców.
- [x] Przypisania, których z danych nie da się wyczytać (sprzęt ogólny, amunicja, dodatki, bojowy
      chrom, broń egzotyczna — 108 pozycji) w `data/private/cpred/shop-tiers.json`; publiczna
      próbka z wymyślonymi identyfikatorami w `data/public/cpred/shop-tiers.json` pilnowana
      strażnikiem licencji.
- [x] **Wyjątek MG na wpisie** (`Campaign.shopTierOverrides`, migracja `20260917180000`):
      lista „Poziom w tej kampanii” na karcie wpisu w Kompendium — także dla wpisów z importu,
      których MG nie edytuje. Zdarzenie `shop:entry-tier` rozsyła zmianę na żywo, stan wiezie
      `state:sync`, a eksport kampanii zabiera kolumnę.
- [x] Karta wpisu mówi **skąd** poziom: „2 — Zawodowe (typ broni: Ciężki pistolet)”,
      „4 — Czarny rynek (Czarny LOD)”, „3 — Wojskowe (ustawione przez MG w tej kampanii)”.
- [x] **Narzędzia Roli w kreatorze** (decyzja MG): poziom 1 dla wszystkich plus narzędzia własnej
      Roli do poziomu 2 — Netrunner deki i ulepszenia, Medyk torbę i skanery, Technik przybornik,
      Solo i Stróż Prawa broń krótką i strzelby, Nomada wyrzutnię haków. Wiersz nosi znacznik
      „narzędzie Roli”; serwer odmawia `CREATION_SHOP_LOCKED`.
- [x] Zmiana Roli zdejmuje z koszyka narzędzia poprzedniej Roli (`creationBasketForRole`), a okno
      strat je wymienia; pozycja, której półka już nie niesie, jest brakiem w podsumowaniu
      („Usuń z koszyka”) i blokuje „Utwórz postać”.
- [x] **Podgląd przedmiotu w sklepie kreatora**: klik w nazwę rozwija liczby (OBR, LA, magazynek,
      chwyt, ukrycie, jakość, typ, Umiejętność; OB, miejsca, kara; gniazda deku), zdanie
      o dostępności i opis z kompendium. Kupno ma osobny przycisk „+ Dołóż” — do 17.09 cały wiersz
      był przyciskiem kupna, więc obejrzenie przedmiotu kosztowało zakup.
- [x] Testy: 29 w `shop.test.ts` (16 nowych), 2 nowe w `creation.test.ts` w `shared`, 4 nowe na
      serwerze (narzędzia Roli, wyjątek MG na żywo, odmowa w Kompendium, odmowy), 1 nowy strażnik
      licencji; pełny przebieg 2155 / 1189 / 224, `tsc`, ESLint i Prettier czyste.
- [x] Chrome na `.creation-ui.db` (MG `localhost`, gracz `[::1]`, 2084×1172 CSS): Medyk kupuje
      torbę medyka ze znacznikiem, rozwinięty podgląd średniego pistoletu i średniej kurtki;
      zmiana Roli na Solo z oknem „Koszyk (1 szt. za 100 ed): Torba medyka”; półka Solo z bronią
      krótką; MG przestawia „Ciężki pistolet” na 3 → u gracza znika z półki, w koszyku dostaje
      zdanie odmowy, a podsumowanie każe go usunąć; powrót na „Automatycznie” przywraca wpis;
      gracz w Kompendium widzi „Kruk — Czarny rynek (Czarny LOD)” i nie ma listy MG.

**Ustalenia z realizacji 3b:**

- **Poziom zmienił się w 150 z 336 wpisów katalogu.** Najwięcej po stronie broni (wyrzutnie rakiet
  i miotacz ognia z 2 na 4, karabiny i granatniki na 3, duża broń biała i tanie pistolety na 1)
  oraz Sieci (Czarny LOD z 1–3 na 4, agresorzy na 3). Raport z pełną listą powstawał skryptem
  jednorazowym w scratchpadzie — nie ma go w repo, bo wypisuje nazwy z podręcznika.
- **Doskonała jakość broni podnosi poziom o 1**, więc doskonały karabin szturmowy ląduje na
  Czarnym rynku, a doskonały średni pistolet na Zawodowych. To decyzja MG z tabeli; gdyby uwierało,
  wystarczy zdjąć gałąź `quality === 'excellent'` w `kindTier`.
- **Poziom wpisu nie dotyczy montażu wszczepów** (decyzja z 13.09 zostaje) — dla cyborgizacji jest
  wyłącznie informacją na karcie wpisu i tarczą dla „Kup”.
- **Programów nie da się kupić nigdzie w VTT** (`purchasedSheetRow` ich nie zna), a cyberdek i
  Programy wybiera się na karcie postaci za darmo — kupiony w kreatorze „Cyberdek” jest osobnym
  wierszem sprzętu i nie wchodzi do pola `cyberdeck`. Dlatego narzędzia Netrunnera to deki
  i ulepszenia sprzętowe, a nie Programy. Oba braki zapisane w `POMYSLY.md`.
- **Nie sprawdzono w przeglądarce:** motywu dziennego rozwiniętego podglądu i karty wpisu, wąskiego
  okna i powiększenia, półek Netrunnera, Technika i Nomady, zakupu z Kompendium przy wyjątku MG
  u gracza z pieniędzmi (pokryte testem serwera) — pozycja w `zaleglosci.md`.

### Część 3c — status: ✅ ukończona 17.09.2026 (trzecia sesja)

- [x] `cpredRoleChores` w `shared/systems/cpred/readiness.ts`: siedem czynności, które kreator
      zostawia — Zmysł Walki (Solo), Medycyna (Medyk), Twórca (Technik), zespół (Korpo), Tabor
      i Zakwaterowanie (Nomada), cyberdek (Netrunner). **Liczone z samej karty**, więc rozdzielone
      punkty zdejmują wiersz same; zero stanu do odhaczania.
- [x] Każdy wiersz niesie zakładkę karty i nazwę panelu; „Przejdź” otwiera kartę, przełącza
      zakładkę i podświetla panel (`data-sheet-panel`, `characterStore.focusPanel`).
- [x] Ta sama lista w czterech miejscach z jednego komponentu `RoleChoresList`: zapowiedź
      w podsumowaniu kreatora, ekran końcowy, pas „Po kreatorze zostało” na stronie pierwszej karty
      i lista MG w zakładce „Postacie”.
- [x] **Znacznik gotowości do gry** (`Character.playReady`, migracja `20260917210000`): postać
      z kreatora **z właścicielem** czeka na MG, NPC MG i wszystko sprzed 3c jest gotowe od razu.
      `character:play-ready` (tylko MG) nadaje i cofa; znacznik **niczego nie blokuje**.
- [x] Znaczek z liczbą na zakładce „Postacie” sumuje szkice bez rangi (2b) i postaci czekające na
      gotowość — jedna plakietka, dwa powody w `title`.
- [x] Testy: 9 nowych w `shared`, 3 nowe na serwerze (kreator: kto czeka, kto nie, kto zatwierdza),
      5 nowych u klienta (strażnik: każdy panel z listy istnieje w karcie, żądanie „Przejdź”);
      pełny przebieg 2164 / 1192 / 229, `tsc`, ESLint i Prettier czyste.
- [x] Chrome na `.creation-ui.db` (MG `localhost`, gracz `[::1]`, 2084×1172 CSS, DPR 1,25): gracz
      buduje Nomadę „Wiatr z Taboru” → zapowiedź w podsumowaniu → ekran końcowy z dwiema
      czynnościami → „Przejdź” do Taboru (zakładka „Karta”) i do Zakwaterowania (zakładka
      „Ekwipunek”); pas na karcie gracza z „Czeka na MG”; u MG znaczek „1”, panel z listą,
      „Przyjmij do gry” gasi znaczek i napis **u gracza na żywo**; „Cofnij gotowość” wraca; zmiana
      Zakwaterowania na pojazd **zdejmuje wiersz sama**; Solo, Medyk i Netrunner (przełączana Rola)
      dają swoje wiersze; motyw dzienny paska i panelu; okno karty zwężone do 620 px CSS — wiersz
      zawija się, „Przejdź” zostaje w oknie, bez przewijania w poziomie.

**Ustalenia z realizacji 3c:**

- **Znacznik jest odpowiedzią na „czy ja mam jeszcze coś z tą postacią zrobić”, a nie bramką**
  (decyzja MG): nie dotyka inicjatywy, żetonu ani rzutów. Domyślna wartość kolumny to `true`, bo
  karta powstaje na sto sposobów (ręcznie, z importu, z pliku kampanii, jako statysta) i żaden nie
  prosi MG o zgodę — czekają wyłącznie karty z kreatora z właścicielem.
- **Gotowość cofa się z karty, nie z listy.** Lista MG pokazuje tylko czekających, więc bez tego
  guzika nie dałoby się wrócić do postaci przyjętej za szybko; w zamian lista nie rośnie bez końca.
- **Lista czynności nie jest listą błędów.** Zakwaterowanie Nomady stoi na niej także wtedy, gdy
  Tabor jest pełny — to wybór (kontener za 1000 ed albo pojazd bez czynszu, s. 165), nie brak.
- **Czasownik odmienia się razem z liczebnikiem** — pierwsza wersja składała stałe „Zostało”
  z odmienianym rzeczownikiem i napisała „Zostało 4 wpisy” (wyszło przy oględzinach). Całą frazę
  daje teraz jedna funkcja `leftPhrase`, pilnuje jej test.
- **Netrunner może dziś kupić dek w kreatorze (narzędzie Roli z 3b), ale trafia on do Wyposażenia
  jako zwykły wiersz** — pole `cyberdeck` zostaje puste, więc wiersz czynności mówi wprost: wskaż
  go w sekcji „Cyberdek”. Podpięcie zakupu do pola jest w `POMYSLY.md` od 3b.
- **Nie sprawdzono:** półek Stróża Prawa i Fixera (Zdolności bez przydziału — lista ich nie
  dotyczy), powiększenia przeglądarki, czytnika ekranu. Na bazie testowej został gracz „Test 2a”
  z postaciami „Zgrzyt z Kabuki” i „Wiatr z Taboru” (obie przyjęte do gry).

Zakres ogólny przy zachowaniu dotychczasowych uproszczeń:

- Przebudować informację o wyposażeniu: zakupy, pakiet od MG, moda i późniejsze
  cyborgizacje mają być jasno rozliczone. W sklepie dodać podgląd właściwości
  przedmiotu przed zakupem; obecnie wiersz podaje głównie nazwę i cenę.
- Dodać krótką listę pozostałych czynności wynikających z Roli, z przejściem
  do odpowiednich paneli karty. Wyraźnie odróżnić zakończenie kreatora od
  potwierdzenia gotowości do sesji przez MG.
- Podsumowanie ma odpowiadać faktycznie tworzonej karcie: także darmowy język,
  pochodne, zakupy, saldo, właściciel i wynik stawiania żetonu.
- Przejść obie metody jako MG i gracz, w tym role z dodatkowymi decyzjami
  (Medyk, Technik, Nomada/Korpo), zapis i wznowienie, zmianę Roli/metody,
  brak portretu, brak aktywnej sceny oraz opóźnienie i przerwanie połączenia.
- Sprawdzić całość na osobnych danych testowych; zachować istniejące postaci
  i sceny kampanii. Po realizacji zaktualizować dokumentację i zacommitować zmiany.

**Odbiór:** oba pełne przebiegi kończą się poprawną kartą, bez utraty wyborów;
jej dane i saldo zgadzają się z podsumowaniem. Żaden świadomie pominięty element
podręcznika nie zostaje ukryty pod komunikatem „gotowa”. MG odbiera czytelność
i rozumie, jakie czynności zostały po jego stronie.

**Potwierdzony zakres:** zachować uproszczenia 25c. Automatyczne pełne pakiety
Ról, zakupy mody i instalowanie cyborgizacji w kreatorze nie wchodzą do tej naprawy.

## Pytania i założenia do ustalenia przed realizacją

Podczas audytu zadano MG pytania o zakres metod, konfigurację ekranu, inne
przeszkody, zachowanie uproszczeń wyposażenia i automatyczny przydział minimów.
MG potwierdził priorytet Kompletnego Pakietu, ekran 4K i zoom przeglądarki 100%,
zachowanie uproszczeń wyposażenia oraz automatyczny przydział minimów.
Otwarte kwestie wskazano poniżej.

1. **Metody — ustalone:** przede wszystkim Kompletny Pakiet; Krawędziarz
   uzupełniająco, zgodnie z zakresem istniejącego kreatora i decyzją 25a.
2. **Wyposażenie — ustalone:** zachować uproszczenia 25c, poprawić zasady
   i wygodę w obecnym zakresie.
3. **Minima — ustalone:** przydzielać automatycznie, odejmować koszt od puli
   i pokazywać etykiety wymagań przy umiejętnościach.
4. **Ekran — ustalone 16.09:** 4K, skala Windows 150%, zoom przeglądarki 100%;
   to główna konfiguracja odbioru (okno ok. 2560 px CSS).
5. **Niewydane punkty — ustalone 15.09:** blokada zakończenia dla wszystkich, także MG;
   punkty pozostają w szkicu, a interfejs pokazuje resztę.
6. **Specjalizacje — ustalone 15.09:** wiele języków i dziedzin to osobny projekt, obejmujący
   kartę, rzuty, rozwój i migrację danych. Teraz naprawiamy obecny pojedynczy model.
7. **Ranga Cech — ustalone 15.09:** MG ustala rangę indywidualnie dla każdego szkicu.
8. **Slang uliczny — ustalone 16.09:** w obecnym jednym wierszu „Język” kreator pobiera
   2 pkt za minimum slangu; osobny wpis slangu dopiero w projekcie wielu języków.
9. **Panel rang MG — ustalone 16.09:** wygoda obsługi po stronie MG wchodzi do etapu 2.
10. **Minima w obu metodach — ustalone 16.09 (trzecia sesja):** Krawędziarz też dostaje
    automatyczne minima podstawowych po wyborze Roli; poziom 1 wybranej umiejętności jest
    pomijany przyciskami („+” z 0 na 2, „−” z 2 na 0).
11. **Utrata danych przy zmianie Roli/metody — ustalone 16.09:** potwierdzenie z listą strat
    w oknie kreatora, bez cofania.
12. **Panel rang — ustalone 16.09:** zakładka „Postaci”, licznik na zakładce jak przy prośbach
    o Test, lista na żywo, tylko Kompletny Pakiet.
13. **Cechy przed rangą — ustalone 16.09:** gracz nie wpisuje Cech Kompletnego Pakietu, dopóki
    MG nie zatwierdzi rangi; serwer odmawia, a wcześniej wpisane Cechy zostają.
14. **Objaśnienia — ustalone 16.09 (czwarta sesja):** Role i Cechy opisane własnymi zdaniami w repo;
    opisy umiejętności z prywatnych danych, rozwijane „?” przy wierszu.
15. **Potwierdzenia — ustalone 16.09 (czwarta sesja):** jedno okno w kreatorze także dla „Wyrzuć
    szkic” i „Wczytaj zapis serwera”.
16. **Klawiatura — ustalone 16.09 (czwarta sesja):** klawisze z przycisków kreatora **i karty
    postaci** nie sterują mapą; pozostałe okna osobno.
17. **Cechy przy zmianie Roli w Kompletnym Pakiecie — ustalone 16.09 (czwarta sesja):** nadal
    kasowane; okno strat o tym mówi.
18. **Rozdzielczość — zmienione 16.09 (piąta sesja):** odbiór 4K/3440/2560 odpada, obecna skala
    odpowiada MG; gracze zmieniają skalę widoku sami, więc powiększenie nie może ucinać nawigacji.
19. **Skórki — ustalone 16.09 (piąta sesja):** karta i kreator na naturalnej teksturze z sieci
    (CC0/domena publiczna), papier i druk, subtelnie, para dzień/noc; pożółkły, jaśniejszy papier;
    bez ciemnych drobinek i plam; wytarcia (mocniejsze) i pęknięcia na czerwonych ramkach.
20. **Kontrast pod wytarciami — ustalone 16.09 (piąta sesja):** zostaje obecna budowa (wytarcia nad
    tekstem) mimo spadku kontrastu przygaszonych napisów w najbardziej wytartych miejscach.
21. **Podział etapu 3 — ustalone 17.09, zmienione tego samego dnia:** 3a (podsumowanie
    i wyposażenie), 3b (dostępność i sklep), 3c (czynności Roli i gotowość), 3d (odbiór).
22. **Gotowość do gry — ustalone 17.09, wykonane w 3c:** znacznik nadawany przez MG na karcie,
    lista w zakładce „Postacie” ze znaczkiem liczby, nowe pole w bazie (`Character.playReady`).
    **Niczego nie blokuje**; dotyczy wyłącznie postaci z kreatora mających właściciela, a lista
    czynności liczy się z karty, bez odhaczania.
23. **Poziom życia na start — ustalone 17.09:** według podręcznika (kontener „Na karmie”, Korpo
    konap „Dobry prepak”), tylko dla postaci z właścicielem; pierwszy darmowy miesiąc przy MG.
24. **Dostępność — ustalone 17.09 (druga sesja):** poziom liczy się z **rodzaju** rzeczy
    (typ broni, OB, rodzina wszczepu, klasa Programu), cena tylko podnosi; cztery poziomy według
    legalności (Uliczne / Zawodowe / Wojskowe / Czarny rynek); pozycje, których rodzaj nie
    rozstrzyga, przypisane po nazwie w prywatnym pliku; MG nadpisuje pojedynczy wpis w Kompendium.
25. **Narzędzia Roli w kreatorze — ustalone 17.09 (druga sesja):** poziom 1 dla wszystkich plus
    narzędzia własnej Roli do poziomu 2, z listami zatwierdzonymi przez MG (Solo i Stróż Prawa
    także broń i pancerz).
26. **Podgląd w sklepie — ustalone 17.09 (druga sesja):** rozwijany wiersz z osobnym przyciskiem
    kupna.
27. **Plik przypisań — ustalone 17.09 (druga sesja):** `data/private/cpred/shop-tiers.json`
    (poza gitem, do skopiowania na VPS razem z kompendium); publiczna próbka w repo jest wymyślona.
28. **Opłata za montaż wszczepu — ustalone 17.09:** poprawiona od razu (sama cena przy nowym
    wszczepie); stała Utrata Człowieczeństwa przy tworzeniu postaci do `POMYSLY.md`.

## Mapa kodu dla późniejszej realizacji

- `packages/client/src/components/CharacterCreator.tsx` — kroki, pola i komunikaty.
- `packages/client/src/stores/creationStore.ts` — kolejka, szkic i obsługa błędów.
- `packages/client/src/styles.css` — sekcja `.creator-*`.
- `packages/shared/src/systems/cpred/creation.ts` — zasady i konwersja na kartę.
- `packages/server/src/realtime/creation.ts` — zapis, losowania, zakupy i zakończenie.
- `packages/shared/src/systems/cpred/character.ts` — model karty i specjalizacji.
- `tools/import/parse-creation.py`, `tools/import/parse-lifepath.py` — dane prywatne.
- Testy odniesienia: `creation.test.ts` w shared i na serwerze oraz `lifepath.test.ts`.

Ten dokument nie otwiera etapu 28 ani nie zmienia statusów ukończonych etapów 25a–25c.
