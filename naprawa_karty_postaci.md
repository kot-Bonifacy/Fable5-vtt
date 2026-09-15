# Naprawa kreatora postaci — audyt i projekt

Data: 15.09.2026. Stan: **projekt do późniejszej realizacji, bez zmian kodu aplikacji**.

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
Jeżeli zostanie wybrana pełna obsługa wyposażenia i wielu specjalizacji, zakres
trzeciego etapu trzeba ponownie oszacować przed implementacją.

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

Zakres ogólny:

- Ustalić typografię: proponowana baza treści i pól 16 px, pomocnicze teksty
  co najmniej 14 px przy domyślnym powiększeniu. Zachować powiększanie, zawijanie
  tekstu i dostęp do przycisków przy mniejszym oknie; dobrać kontrast obu motywów.
- W umiejętnościach pokazywać **„Podstawowa · min. 2”**, bieżący poziom,
  brakującą liczbę punktów i koszt ×2. Cecha powiązana z umiejętnością ma mieć
  zrozumiałą nazwę; wymagania podręcznika odróżnić od rekomendacji dla Roli.
- Proponowany start: przydzielić wymagane minima automatycznie i od razu
  potrącić ich koszt z puli. Dla starszych szkiców przed zmianą pokazać bilans;
  nie kasować samodzielnie wybranych poziomów.
- Dodać widoczny licznik „pozostało”, podgląd sumy Cecha + poziom umiejętności,
  wyszukiwanie i filtr braków. Jasno pokazywać osobno darmowy język.
- Wyświetlać walidację przy polach i oznaczać stan kroków. Podsumowanie grupuje
  pozostałe problemy z przyciskiem prowadzącym do pola. Można swobodnie wracać
  między krokami; niewypełnione przyszłe kroki nie powinny straszyć lawiną błędów.
- Uzupełnić krótkie objaśnienia Ról, Cech i umiejętności, komunikaty utraty
  danych po zmianie wyboru, obsługę klawiatury i zgodność komunikatów specjalizacji.

**Odbiór:** gracz dostrzega obowiązkowe minimum Perswazji i Skradania się bez
wchodzenia do podsumowania; wymagania nie zależą wyłącznie od koloru lub najechania.
Główny odbiór: ekran **4K, powiększenie przeglądarki 100%** — MG potwierdził,
że w tej konfiguracji czcionka jest za mała. Skalę Windows należy ustalić przed
odbiorem; rozdzielczość monitora nie oznacza takiego samego rozmiaru okna w pikselach CSS.
Sprawdzić wszystkie kroki, oba motywy i klawiaturę. Dodatkowo sprawdzić okna
1366×768 i 1920×1080 oraz powiększenie 125% i 150%. Czytelność przy 4K/100%
ma wynikać z poprawionego interfejsu, bez konieczności zwiększania zoomu przez MG.
Powiększenie nie może odcinać nawigacji ani zasłaniać pól. Rzeczywisty odbiór
w przeglądarce jest obowiązkowy, sam przegląd CSS nie wystarczy.

## Etap 3 — gotowość do gry i odbiór obu metod

**Zależność:** etapy 1–2. **Cel:** użytkownik wie, co postać ma i co zostało do zrobienia.

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

**Wariant rozszerzony:** pełne pakiety Ról, zakupy mody i cyborgizacje w kreatorze
wymagają świadomego zastąpienia decyzji 25c, importu danych prywatnych, poprawnego
rozliczenia oddzielnych budżetów i skutków instalacji. Nie są domyślnym zakresem
tego planu; mogą nie zmieścić się w jednej sesji razem z odbiorem.

## Pytania i założenia do ustalenia przed realizacją

Podczas audytu zadano MG pytania o zakres metod, konfigurację ekranu, inne
przeszkody, zachowanie uproszczeń wyposażenia i automatyczny przydział minimów.
MG potwierdził priorytet Kompletnego Pakietu oraz ekran 4K i zoom przeglądarki 100%.
Pozostałe pytania czekają na odpowiedzi.

1. **Metody — ustalone:** przede wszystkim Kompletny Pakiet; Krawędziarz
   uzupełniająco, zgodnie z zakresem istniejącego kreatora i decyzją 25a.
2. **Wyposażenie:** domyślnie zachować decyzje 25c; wariant pełny jest osobną
   decyzją zakresową.
3. **Minima:** automatyczny przydział jest propozycją. Alternatywa to ręczne
   rozdawanie z czytelnymi oznaczeniami i ostrzeżeniami przy polach.
4. **Ekran — częściowo ustalone:** 4K, zoom przeglądarki 100%; to główna
   konfiguracja odbioru. Skala Windows pozostaje nieznana.
5. **Niewydane punkty:** proponowana blokada zakończenia dla gracza i świadomy
   wyjątek MG dla NPC wymaga potwierdzenia; w każdym wariancie pokazywać resztę.
6. **Specjalizacje:** pełna obsługa kilku języków i dziedzin dotyka również karty,
   rzutów i rozwoju postaci. Najpierw ustalić, czy wchodzi do tych sesji, czy
   powstaje osobny projekt; nie udawać pełnej zgodności przez samo nowe pole tekstowe.

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
