# Etap 16c — Osłony jako obiekty sceny

**Faza:** D — Walka · **Wymaga etapów:** 16b

## Cel sesji

Samochód na ulicy przestaje być tłem. Osłona staje się obiektem, za którym da się schować,
który zatrzymuje kulę i który da się rozwalić — a wtedy przestaje chronić.

**Pochodzenie:** wydzielony z etapu 16b 2026-07-31 (decyzja MG). Geometria linii strzału
powstała w 16b; tu dochodzi obiekt, który tę linię przecina, choć nie zasłania wzroku.

## Zakres

- [x] **Nowy obiekt sceny „osłona"** (samochód, barykada, skrzynia, betonowy słupek):
  - stawiana przez MG narzędziem na mapie, ale to obiekt **widoczny** — w przeciwieństwie
    do ścian jedzie do klienta i rysuje się na mapie
  - **blokuje strzał, nie blokuje wzroku** — to jest jej definicja; osłona zasłaniająca
    wzrok byłaby po prostu ścianą. Wpina się w listę blokad pocisku z 16b
  - katalog typów jako dane (`data/public`), nie łańcuch ifów
- [x] **PW osłony wg RAW, bez SP** (decyzja MG z 31.07 — pierwotny opis 16b mówił „SP i PW",
      podręcznik mówi co innego: „Jeśli nie może zatrzymać kuli, nie jest to osłona i nie ma
      PW", s. 179). Katalog to **materiał × grubość** — sześć wierszy z tabeli na s. 180
      (stal, kamień, szyba kuloodporna, beton, drewno, gips/pianka/plastik), gdzie każdy
      materiał ma PW dla wersji grubej i cienkiej, a najsłabszy wariant wychodzi na 0
      („0 = to nie jest osłona"). **Liczby są w `data/private/cpred/covers.json`** — repo
      jest publiczne, więc w nim stoi ten sam kształt z wymyślonymi wartościami
      (patrz „Wskazówki techniczne")
- [x] **Ostrzeliwanie osłony**: atak można skierować w osłonę zamiast w token; obrażenia
      schodzą wprost z jej PW ścieżką z etapu 15 (bez pancerza, bez ran krytycznych, bez
      Testu Przeżywalności — to przedmiot). **Nadwyżka przepada**: „Jeśli PW osłony spadną
      do 0, pozostałe obrażenia tego ataku przepadają i postać za osłoną ich nie otrzymuje"
      (s. 179). Zniszczona osłona znika z mapy i przestaje blokować linię strzału
- [x] **Karta odmowy proponuje osłonę jako cel** — „cel za osłoną: ostrzelaj samochód"
      jednym kliknięciem (wzorzec karty odmowy z 14b)
- [x] **Strzelanie zza własnej osłony** — token stojący tuż za osłoną musi móc strzelać
      ponad nią, inaczej każda osłona jest pułapką. Próg: zasięg ręki z 18d (`WALL_REACH_M`),
      ta sama liczba, którą mierzy się „stoi przy tym"
- [x] **„Za osłoną" przy Ludzkiej tarczy** (14d) przestaje być adnotacją na karcie i zaczyna
      działać — domyka wpis POMYSLY z 31.07. RAW s. 181: „Dopóki zasłaniasz się Ludzką
      tarczą, uznaje się, że jesteś za osłoną"; PW tarczy to PW trzymanego
- [x] Testy: zniszczenie osłony odsłaniające cel, nadwyżka obrażeń przepadająca na zerze PW,
      strzał zza własnej osłony, osłona nieblokująca wzroku (widoczność bez zmian)

## Poza zakresem

- **Częściowa osłona z karą do trafienia** — RAW jej nie zna: „Nie ma czegoś takiego jak
  »częściowa« osłona" (s. 179)
- **Osłona dzielona na sekcje 2 m × 2 m** — RAW pozwala atakować obszar osłony o takich
  wymiarach, my dajemy PW całemu obiektowi; długą barykadę MG stawia z kilku osłon
- **Obrót osłony** — prostokąty równoległe do osi; obrócony samochód to wpis w POMYSLY
- **Tarcze noszone w ręku** (s. 180) — to pozycja ekwipunku, nie obiekt sceny; wraca razem
  ze śledzeniem broni w dłoniach
- **Pojazdy z PUK** (s. 186) — osobny model, etap poza planem
- Granaty niszczące osłony → **etap 16d** (obszar obejmuje osłonę tak samo jak token)

## Kryteria ukończenia

- Samochód postawiony w linii strzału blokuje trafienie; ostrzelanie samochodu zdejmuje mu
  PW, a po zniszczeniu strzał do celu przechodzi bez zmiany pozycji któregokolwiek tokenu
- Osłona nie zmienia niczego w widoczności: token za samochodem jest dalej widoczny na mapie
- Token stojący tuż za osłoną strzela ponad nią bez odmowy
- Trafienie zabierające więcej PW, niż osłona ma — niszczy ją i **nie** dotyka celu za nią
- Testy jednostkowe: PW z katalogu materiał × grubość, nadwyżka przepadająca na zerze

## Decyzje MG podjęte przy realizacji (2026-08-01)

Cztery rozstrzygnięcia spoza opisu etapu, uzgodnione przed startem:

1. **Osłona blokuje też ruch**, nie tylko strzał — samochód jest przeszkodą dla nóg.
   Blokada działa w planowaniu trasy u klienta (tak jak przy ścianach); serwer nadal
   waliduje sam dystans, kolizje serwerowe zostają wpisem w POMYSLY.
2. **Zniszczona osłona zostaje jako wrak** (0 PW, przygaszona, nie blokuje niczego)
   zamiast znikać z bazy. To jedyny wariant, w którym „Cofnij" z etapu 15 ma co
   przywrócić; „znika z mapy" w kryterium czytamy jako „przestaje być osłoną".
3. **PW osłony widzą wszyscy.** Reguła „PW tylko właściciel + MG" z etapu 05 dotyczy
   ludzi; samochód jest przedmiotem, na który patrzy cały stół.
4. **Blokada miękka zamiast twardej** — *odstępstwo od kryterium*. Strzał w cel za
   osłoną nie leci od razu, ale też nie jest bezwarunkowo odrzucany: zamiast kubka
   pojawia się karta „Cel za osłoną: Samochód (PW z katalogu)" z przyciskami **„Ostrzelaj
   osłonę"** i **„Strzelaj mimo osłony"**. Nikt nie strzela przez samochód
   przypadkiem (bo domyślnie nic nie leci), a stół ma ostatnie słowo jednym
   kliknięciem — wybór „mimo osłony" dopisuje się do karty rzutu na czacie.

## Wskazówki techniczne

- Osłona jedzie do klienta, ściana nie. To nie jest niekonsekwencja: ściana bywa informacją
  MG (tajne przejście), a samochód na ulicy widzą wszyscy. Zasada „dane niewidoczne dla
  gracza nie opuszczają serwera" dotyczy tego, co niewidoczne
- Osłona ostrzeliwana idzie ścieżką obrażeń z etapu 15, ale **nie ma ran krytycznych ani
  Testu Przeżywalności** — uważaj na wspólne gałęzie w `damage.ts`
- Cel ataku przestaje być „token" i staje się „token albo osłona" — rozszerz `targetTokenId`
  o wariant, zamiast dokładać drugi zestaw zdarzeń
- **Licencja:** tabela materiał × grubość jest treścią podręcznika (s. 180), a repozytorium
  jest publiczne. Prawdziwe wartości idą do `data/private/cpred/covers.json` (gitignore),
  a `data/public/cpred/covers.json` niesie ten sam **kształt** z wymyślonymi liczbami i
  deklaracją `source`. Prywatny plik zastępuje publiczny w całości, jak przy `skills.json`.
  Klient pobiera katalog z `GET /api/cpred/covers`, nie ze statycznego `/public/` — inaczej
  paleta MG obiecywałaby PW, których serwer nie używa. Strażnika dopisano do
  `licensing.test.ts`.
