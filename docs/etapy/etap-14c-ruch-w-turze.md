# Etap 14c — Ruch w turze: budżet metrów na mapie

**Faza:** D — Walka · **Wymaga etapów:** 14b

## Cel sesji

Akcja Ruchu przestaje być umowna: przeciąganie tokenu w walce zlicza metry po ścieżce,
serwer pilnuje limitu RUCH × 2 m, Bieg dodaje drugą Akcję Ruchu, a rany i pancerz
modyfikują efektywny RUCH.

## Decyzje projektowe (ustalone z użytkownikiem 2026-07-30)

- **Metry po ścieżce, nie pola siatki:** budżet ruchu to długość łamanej w metrach wg skali
  sceny (kratka = 2 m, spójnie z linijką i zasięgami z etapu 16). RAW dopuszcza ten wariant
  wprost („RUCH × 2 w metrach"); wariant polowy (skos = 1 pole, metryka Chebysheva) odrzucony,
  bo wymagałby przyciągania tokenów do siatki i rozjeżdżał się z metrową linijką.
- **Twarda walidacja jak w 14b:** ruch gracza ponad budżet lub poza turą wraca na miejsce
  (snap-back) z czytelnym powodem; MG bez limitów (budżet jego NPC się liczy, ale nie blokuje);
  poza aktywną walką `token:move` działa jak dotąd — zero limitów.

## Zakres

- [x] Budżet ruchu w silniku tury (`shared/systems/cpred`, czyste funkcje + testy):
      RUCH × 2 m na Akcję Ruchu, kumulacja przez całą turę (rozdzielanie: ruch → atak → ruch),
      Bieg (Akcja z 14b) dodaje drugie RUCH × 2 m
- [x] Efektywny RUCH liczony w shared z metadanych, nie hardkodu per przypadek:
      baza z karty + kara ciężkiego pancerza (REF/ZW/RUCH — dziś nieliczona nigdzie,
      dane pancerza mają pole kary od etapu 13) + Śmiertelnie Ranny −6 (minimum 1, etap 15)
      + modyfikatory ran krytycznych (Zapadnięte płuco −2, Złamana noga −4, Odcięta noga −6,
      minimum 1) — wartości efektów przy statusach jako dane (wzorzec z etapu 15)
- [x] `token:move` świadomy walki: dla uczestnika aktywnej walki serwer liczy długość ścieżki
      (klient wysyła łamaną z przeciągania; pojedynczy drag bez punktów pośrednich = odcinek),
      odejmuje od budżetu, odrzuca nadmiar i ruch poza turą (gracz); wynik odmowy w payload —
      UI robi snap-back z dymkiem
- [x] **Wspólny punkt walidacji ruchu** na serwerze: budżet tury ORAZ (w przyszłości) kolizje
      ze ścianami z odłożonej sesji (decyzja 30.07, POMYSLY) przechodzą przez jedno miejsce —
      kolizje mają się dopiąć bez przebudowy
- [x] Tryb ruchu utrudnionego (pływanie/wspinaczka/teren: 2 m budżetu za 1 m ścieżki) jako
      przełącznik przy aktywnej turze (gracz deklaruje, MG widzi); skoki i upadki bez automatyki
- [x] Blokady ruchu ze statusów: Przewrócony (ruch dopiero po Akcji Wstania z 14b),
      Unieruchomiony/Pochwycony (bez własnej Akcji Ruchu; relacja „kto kogo trzyma" i ciągnięcie
      dopiero w 14d), Nieprzytomny (nic)
- [x] Licznik metrów przebytych pieszo w turze — zapisywany w stanie tury (konsumują go
      automaty 14d: Złamane żebra / Ciało obce „ruch > 4 m", Uraz ucha)
- [x] UI: resztka ruchu przy pasku walki (np. „7,5 / 12 m"), orientacyjna obwódka zasięgu
      pozostałego ruchu wokół aktywnego tokenu (okrąg; klient nie zna ścian — zaznacz w UI,
      że to orientacja, prawda jest na serwerze), ślad ścieżki podczas przeciągania
- [x] Testy: matematyka budżetu i efektywnego RUCH (minimum 1!), test dymny `token:move`
      (odrzucenie ponad budżet, snap-back, reset na nowej turze, Bieg, ruch MG bez blokady,
      ruch poza walką bez limitu)

## Poza zakresem

- Kolizje ruchu ze ścianami/drzwiami — osobna sesja (decyzja MG 30.07, wpis w POMYSLY)
- Przyciąganie tokenów do siatki, ruch po polach
- Skoki, upadki (40 m/turę, 2k6 za 10 m), spadanie — MG ręcznie; automatyka ewentualnie w POMYSLY
- Ciągnięcie Pochwyconego przy ruchu trzymającego (etap 14d — wymaga relacji Trzymania)

## Kryteria ukończenia

- Postać z RUCH 6 w swojej turze: przeciągnięcie o 11 m przechodzi, o dalsze 3 m wraca
  (budżet 12 m); po Biegu suma 24 m przechodzi
- Ruch → atak → dokończenie ruchu w jednej turze działa (budżet wspólny, nie per przeciągnięcie)
- Złamana noga obniża budżet zgodnie z modyfikatorem; Śmiertelnie Ranny z RUCH 6 liczy
  6 − 6 → minimum 1, czyli budżet 2 m (test brzegowy minimum)
- Przewrócony token nie ruszy się przed Wstaniem; po Akcji Wstania ruch działa w tej samej turze
- MG przestawia cudzy token i tokeny poza walką bez żadnych limitów
- Licznik metrów w turze zgadza się z sumą ścieżek (weryfikacja w teście dymnym)

## Wskazówki techniczne

- Długość ścieżki licz na serwerze z punktów łamanej — nie ufaj metrom przysłanym przez klienta
  (wzorzec „intencja → walidacja" z etapu 03/05)
- Snap-back już istnieje jako wzorzec odrzuconego `token:move` — rozszerz payload o powód
  zamiast wymyślać nowe zdarzenie
- Obwódka zasięgu to `Graphics` w warstwie podświetleń z etapu 14 (aktywny token) — skaluj
  grubość linii odwrotnie do zoomu jak w etapie 16 (lekcja z linijki)
- Kara pancerza: bierz maksymalny modyfikator z noszonych elementów (nie sumuj — RAW s. 185);
  jeśli karta z etapu 15 nie ma pola kary przy pancerzu, uzupełnij dane, nie kod
