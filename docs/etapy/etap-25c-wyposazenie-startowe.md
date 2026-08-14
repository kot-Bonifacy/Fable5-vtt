# Etap 25c — Kreator: wyposażenie startowe i poziomy dostępności

**Faza:** H — Świat CP RED · **Wymaga etapów:** 25b, 23b (ekonomia), 13 (kompendium), 07 (portret)

> Trzecia część podziału opisanego w `etap-25b-sciezka-zycia.md`.

## Cel sesji

Postać wychodzi z kreatora gotowa do gry: z bronią, pancerzem i sprzętem kupionym za startowe
eurodolce, z ksywą i portretem, i z żetonem na scenie. Przy okazji sklep dostaje **poziomy
dostępności** — MG odblokowuje kolejne pasma asortymentu w miarę kampanii, zamiast wystawiać
początkującej drużynie cały katalog.

## Życzenie MG (14.08), które ukształtowało zakres

> „Chciałbym, żeby zakupy startowe były ograniczone do najprostszych i najpopularniejszych
> przedmiotów — proponuję podział dostępnych do kupna rzeczy na kilka poziomów, które MG
> będzie mógł odblokowywać z czasem."

To **nie jest** zasada z podręcznika, tylko mechanizm kampanii — i dlatego siedzi na kampanii,
a nie w tabelach CP RED. **Zatwierdzone przez MG 14.08** w kształcie z propozycji:

**Cztery poziomy, wyliczane z pasma ceny, z ręcznym nadpisaniem na wpisie.**
Pasmo ceny jest w podręczniku dokładnie tym, czym w praktyce jest dostępność („Tanie" to
rzeczy z każdego kiosku, „Luksusowe" to rzeczy, po które trzeba iść do Fixera), więc poziom
liczy się za darmo dla wszystkich wpisów, a MG poprawia pojedyncze pozycje ręcznie:

| #   | Nazwa        | Pasma ceny                      | Co tam jest                                  |
| --- | ------------ | ------------------------------- | -------------------------------------------- |
| 1   | Uliczne      | Tanie, Codzienne, Drogie (≤ 50) | pistolet, nóż, kurtka skórzana, apteczka     |
| 2   | Zawodowe     | Premium, Kosztowne (100–500)    | karabin, kamizelka, porządny sprzęt          |
| 3   | Korporacyjne | Bardzo kosztowne (1000)         | broń ciężka, pancerz bojowy, dobra chromówka |
| 4   | Czarny rynek | Luksusowe i wyżej (5000+)       | reszta                                       |

- Kampania ma **jeden odblokowany poziom** (`Campaign.shopTier`, domyślnie 1); MG podnosi go
  jednym klikiem w zakładce „Kompendium".
- **Zakupy startowe w kreatorze zawsze stoją na poziomie 1** — o to prosił MG wprost, i to
  jedyne miejsce w projekcie, gdzie blokada obowiązuje **także MG** (inaczej byłaby sugestią).
- **MG kupuje przez wszystkie poziomy** poza kreatorem (jest autorytatywny); ograniczenie
  dotyczy „Kup" u gracza. Lista pokazuje wpisy ponad poziomem **przygaszone, z chipem poziomu**
  — gracz ma widzieć, po co warto sięgnąć.

## Zakres

- [x] **Poziom dostępności jako dana kompendium** — pole `tier` na wpisie (1–4), domyślnie
      wyliczane z ceny; edytor MG pozwala je nadpisać
- [x] **Poziom kampanii** (`Campaign.shopTier`) + przełącznik 1–4 w zakładce „Kompendium";
      „Kup" u gracza odmawia ponad poziom po polsku, a lista pokazuje wpisy zablokowane
      przygaszone z chipem poziomu
- [x] **Import tabeli Wyposażenia** (s. 351–356) — **poza pierwotnym zakresem, dopisane 14.08**:
      kompendium miało 5 pozycji „Sprzęt", więc sklep startowy nie miałby czym handlować
- [x] **Krok „Wyposażenie startowe"** w kreatorze — zakupy z kompendium za startowe eurodolce
      (Krawędziarz: 500 ed; Kompletny Pakiet: 2550 ed), przez ten sam `applyBalance` co „Kup"
      z etapu 23b, ograniczony do poziomu 1
- [x] **Krok „Opis"** — ksywa, portret (upload jak w etapie 07) i przełącznik żetonu
- [x] **Ukończenie tworzy postać z żetonem** na aktywnej scenie

## Poza zakresem

- Generator kompletnych NPC jedną akcją (POMYSLY.md), wydruk karty, sklep z asortymentem
  zmiennym w czasie („co dziś ma Fixer")
- **Odgórny pakiet Roli Krawędziarza** (broń, pancerz, ekwipunek, moda — s. 98 i 103):
  decyzja MG z 14.08 to na razie sama gotówka 500 ed, a pakiet dokłada MG przyciskiem
  „Dodaj za darmo". Parser tych trzech tabel to osobna robota — wpis w `POMYSLY.md`.
- **Tabela Mody** (s. 356) i 800 ed Kompletnego Pakietu przeznaczone tylko na nią: VTT nie
  prowadzi katalogu ubrań, więc krok wyposażenia mówi o tych pieniądzach, ale ich nie wydaje.
- **Cyborgizacje w kreatorze**: instaluje je `character:cyberware` (rzut na Utratę
  Człowieczeństwa), więc koszyk kreatora ich nie przyjmuje.

## Kryteria ukończenia

- [x] Postać przechodzi kreator od Roli do żetonu na scenie, z bronią i sprzętem na karcie
- [x] Zakup ponad odblokowany poziom odmawia po polsku — sprawdzone testem i w przeglądarce
- [x] Podniesienie poziomu przez MG natychmiast odblokowuje wpisy u gracza (rozgłoszenie
      `shop:tier`, pokryte testem na żywych gniazdach)
- [x] Zakupy startowe idą tą samą drogą co „Kup" z 23b (jedno `applyBalance`, wiersz audytu)

## Wskazówki techniczne

- Poziom **wylicza się**, gdy wpis go nie ma — tak samo jak cena wylicza się z pasma
  (`entryPrice` w `shared/systems/cpred/economy.ts`). Jedno miejsce, jedna funkcja
  (`shopTierOf` w `shared/systems/cpred/shop.ts`).
- Odmowa stoi **przed** `applyBalance`, nie za nim: bot działa kontem MG (20a), a MG jest
  zwolniony z blokad — ten sam wniosek co przy ruchu w `realtime/movement.ts:216`.
- Sesja zerowa z drużyną to najlepszy test **25b + 25c razem** — zaplanuj ją po tym etapie.
