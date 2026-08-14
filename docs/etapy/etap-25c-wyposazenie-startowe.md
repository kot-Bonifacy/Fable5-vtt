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
a nie w tabelach CP RED. Do rozstrzygnięcia na starcie sesji (propozycja niżej):

**Propozycja: cztery poziomy, wyliczane z pasma ceny, z ręcznym nadpisaniem na wpisie.**
Pasmo ceny jest w podręczniku dokładnie tym, czym w praktyce jest dostępność („Tanie" to
rzeczy z każdego kiosku, „Luksusowe" to rzeczy, po które trzeba iść do Fixera), więc poziom
liczy się za darmo dla wszystkich 130 wpisów, a MG poprawia pojedyncze pozycje ręcznie:

| #   | Nazwa        | Pasma ceny                      | Co tam jest                                  |
| --- | ------------ | ------------------------------- | -------------------------------------------- |
| 1   | Uliczne      | Tanie, Codzienne, Drogie (≤ 50) | pistolet, nóż, kurtka skórzana, apteczka     |
| 2   | Zawodowe     | Premium, Kosztowne (100–500)    | karabin, kamizelka, porządny sprzęt          |
| 3   | Korporacyjne | Bardzo kosztowne (1000)         | broń ciężka, pancerz bojowy, dobra chromówka |
| 4   | Czarny rynek | Luksusowe i wyżej (5000+)       | reszta                                       |

- Kampania ma **jeden odblokowany poziom** (`Campaign.shopTier`, domyślnie 1); MG podnosi go
  suwakiem w Panelu MG.
- **Zakupy startowe w kreatorze zawsze stoją na poziomie 1** — o to prosił MG wprost.
- **MG widzi cały katalog zawsze** (jest autorytatywny); ograniczenie dotyczy „Kup" u gracza
  i kroku wyposażenia w kreatorze.

## Zakres

- [ ] **Poziom dostępności jako dana kompendium** — pole `tier` na wpisie (1–4), domyślnie
      wyliczane z `costCategory`; edytor MG pozwala je nadpisać
- [ ] **Poziom kampanii** (`Campaign.shopTier`) + suwak w Panelu MG; „Kup" u gracza odmawia
      ponad poziom po polsku, a lista w Kompendium pokazuje wpisy zablokowane przygaszone
      z chipem poziomu (nie chowa ich — gracz ma widzieć, po co warto sięgnąć)
- [ ] **Krok „Wyposażenie startowe"** w kreatorze — zakupy z kompendium za startowe eurodolce
      (Krawędziarz: pakiet Roli + 500 ed; Kompletny Pakiet: 2550 ed + 800 ed na modę),
      przez ten sam mechanizm co „Kup" z etapu 23b, ograniczony do poziomu 1
- [ ] **Krok „Dane opisowe"** — ksywa i portret (upload jak w etapie 07)
- [ ] **Ukończenie tworzy postać z żetonem** (dziś kreator z 25a/25b tworzy samą kartę)

## Poza zakresem

- Generator kompletnych NPC jedną akcją (POMYSLY.md), wydruk karty, sklep z asortymentem
  zmiennym w czasie („co dziś ma Fixer")

## Kryteria ukończenia

- Postać przechodzi kreator od Roli do żetonu na scenie, z bronią i pancerzem na karcie
- Zakup ponad odblokowany poziom odmawia po polsku — sprawdzone testem i na koncie gracza
- Podniesienie poziomu przez MG natychmiast odblokowuje wpisy u gracza (rozgłoszenie)
- Zakupy startowe idą tą samą drogą co „Kup" z 23b (jedno `applyBalance`, wiersz audytu)

## Wskazówki techniczne

- Poziom **wylicza się**, gdy wpis go nie ma — tak samo jak cena wylicza się z pasma
  (`entryPrice` w `shared/systems/cpred/economy.ts`). Jedno miejsce, jedna funkcja.
- Odmowa musi stać **przed** `applyBalance`, nie za nim: bot działa kontem MG (20a), a MG jest
  zwolniony z blokad — ten sam wniosek co przy ruchu w `realtime/movement.ts:216`.
- Sesja zerowa z drużyną to najlepszy test **25b + 25c razem** — zaplanuj ją po tym etapie.
