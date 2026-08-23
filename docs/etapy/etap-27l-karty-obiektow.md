# Etap 27l — Karty obiektów sceny

**Faza:** I — Wykończenie · **Wymaga etapów:** 27k (zaznaczanie i `Delete`)

> **Dopisany 2026-08-23** przy podziale przeprojektowania edycji sceny (decyzja MG). 27k daje
> **jeden gest** na wszystko, co stoi na mapie; ta sesja daje **jedno miejsce**, w którym się to
> coś ogląda i zmienia.

## Cel sesji

Dwuklik w dowolny obiekt sceny otwiera jego kartę. Dziś kartę mają trzy typy z siedmiu
(gniazdo, strefa broniona, notatka), a właściwości ściany, osłony, światła i rysunku ustawia się
**zanim** się je postawi — po fakcie trzeba skasować i zrobić od nowa. Po tej sesji nie trzeba.

## Dlaczego to osobny etap

Zakres przeprojektowania z 23.08 nie mieścił się w jednej sesji. 27k zamyka pytanie „jak to
skasować" i już samo w sobie działa; 27l zamyka pytanie „jak to zmienić". Podział zaproponowany
przeze mnie, przyjęty przez MG tego samego dnia.

## Zaległość, którą to zamyka

Etap 18d zostawił w kodzie ślad tego braku (`MapArea.tsx:600`, komentarz z 22.08):
przełącznik oka na pasku dotyczy **nowych** otworów, więc okno postawione z domyślnym
„tylko dla MG" trzeba było skasować i postawić od nowa. Doraźnym obejściem był czwarty tryb
narzędzia ścian („udostępnij"), który po 27k i tak nie ma gdzie mieszkać.

## Zakres

- [ ] **Karta ściany, drzwi i okna** — rodzaj (ściana / drzwi / okno), zamek, „gracze mogą
      otwierać", długość odcinka w metrach. Zastępuje tryby `lock` i `share` narzędzia ścian,
      które po 27k zostają jako ostatnie tryby-nie-gumki na pasku
- [ ] **Karta osłony** — preset, nazwa, PW bieżące i maksymalne (czyli także **naprawa** osłony
      rozwalonej w poprzedniej walce, czego dziś nie da się zrobić inaczej niż stawiając nową)
- [ ] **Karta światła** — promień jasny i przyćmiony, kolor, migotanie, włącznik, „dopasuj do
      pokoju". Zastępuje pomostowe „dwuklik przestraja lampę do ustawień z paska" z 27k
- [ ] **Karta rysunku** — kolor, grubość, wypełnienie, przeniesienie między warstwą MG a wspólną
      (dziś `drawGmOnly` dotyczy wyłącznie **następnego** kształtu)
- [ ] **Uchwyty przesuwania i skalowania** przy zaznaczonym obiekcie — przeciągnięcie obrysu
      przesuwa, uchwyt w rogu skaluje prostokąt osłony i strefy. Ściany dostają uchwyty na
      końcach odcinka
- [ ] **Jedno miejsce dla wszystkich kart** — istniejące karty gniazda, strefy i notatki
      przechodzą na ten sam mechanizm okna (`useWindowPlacement` + `<WindowResizeGrip />`,
      umowa kodu z 27f), żeby siedem kart nie miało siedmiu zachowań

## Poza zakresem

- Cofanie edycji właściwości — `Ctrl+Z` z 27k cofa **usunięcia**, nie zmiany pól
- Karta żetonu — figura ma własny panel i menu pod PPM, nie ruszamy tego
- Kopiowanie i wklejanie obiektów, biblioteka gotowych elementów sceny

## Kryteria ukończenia

- [ ] **Każdy z siedmiu typów obiektów ma kartę pod dwuklikiem** i każda karta zachowuje się
      tak samo: to samo okno, to samo zamykanie, ta sama reakcja na `Esc`
- [ ] **Okno postawione jako „tylko dla MG" da się udostępnić graczom bez kasowania go** —
      ścieżka, która była powodem komentarza w `MapArea.tsx` z 22.08
- [ ] **Rozwaloną osłonę da się naprawić z karty**, bez stawiania nowej
- [ ] **Lampę da się przestroić z karty**, a pomostowe zachowanie z 27k („dwuklik przestraja
      do ustawień paska") znika razem z powodem, dla którego istniało
- [ ] **Zaznaczony obiekt da się przesunąć i przeskalować** bez kasowania i stawiania od nowa
- [ ] **Testy:** walidacja pól kart na serwerze (osłona nie przyjmie PW ponad maksimum, światło
      promienia poza zakresem); `a11y.test.ts` i `theme.test.ts` zielone po dołożeniu siedmiu kart
