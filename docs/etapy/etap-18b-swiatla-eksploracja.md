# Etap 18b — Ciemność i źródła światła

**Faza:** E — Widoczność · **Wymaga etapów:** 18a

> Wydzielone z pierwotnego etapu 18 (decyzja z 29.07.2026), a następnie zwężone
> (decyzja z 30.07.2026): pierwotny 18b mieścił światła, pamięć eksploracji,
> nadpisanie mgły i mechanikę drzwi/okien — cztery niezależne funkcje z
> filtrowaniem serwerowym, migracją i renderowaniem. Eksploracja i mgła MG
> poszły do **18c**, interakcje z drzwiami i oknami do **18d**.

## Cel sesji

Ciemność jako element gry: w ciemnej scenie token widzi tylko tam, gdzie coś
świeci — a to, co stoi poza światłem, nie trafia do jego danych.

## Zakres

- [x] Przełącznik „ciemna scena" (edytor sceny, obok trybu widoczności): działa
      tylko w trybie `dynamic`, bo tylko tam widoczność bierze się z tokenów
- [x] Ustawienie sceny „widoczność po omacku" — minimalny promień widzenia bez
      światła, domyślnie 2 m (jedna kratka); czarny ekran nigdy nie ma czytać
      się jako błąd aplikacji
- [x] Źródła światła jako obiekty na mapie (MG): zasięg jasny/przyćmiony, kolor,
      opcjonalne migotanie, przełącznik włącz/wyłącz; edycja i usuwanie
- [x] Światło przypięte do tokenu (latarka): zasięg i kolor w edytorze tokenu,
      wędruje z tokenem; **przełącznik zapal/zgaś dostępny kontrolującemu
      graczowi**, nie tylko MG
- [x] Filtrowanie serwerowe rozszerzone o światło: token w nieoświetlonym
      miejscu nie trafia do payloadu gracza, nawet jeśli leży w polu widzenia
- [x] Renderowanie w Pixi: kompozycja światła i widoczności, barwna warstwa
      świetlna nad tokenami; cel 60 fps przy ~50 segmentach ścian i ~10
      światłach — **z pomiarem, nie „na oko"**

## Poza zakresem

- Pamięć eksploracji i ręczna mgła jako nadpisanie MG — **etap 18c**
- Otwieranie drzwi z dystansu, zamki, zaglądanie przez okna — **etap 18d**
- Widzenie w ciemności jako cecha postaci (cyberoko — etap 23), osłony w walce
  ze ścian, pola widzenia stożkowe, elewacja/piętra

## Kryteria ukończenia

- [x] Scenariusz z etapu 18: ciemny korytarz, zamknięte drzwi, NPC w pokoju za
      nimi — gracz nie widzi NPC (również w payloadach); otwarcie drzwi **i
      latarka** odsłaniają pokój i NPC
- [x] Token bez światła w ciemnej scenie widzi swój najbliższy otok (promień „po
      omacku"), a nie czarny ekran
- [x] Latarka zgaszona przez gracza natychmiast zabiera mu widok korytarza (i
      zabiera NPC z jego payloadu)
- [x] 60 fps przy ruchu tokenu ze światłem na mapie testowej; brak zauważalnego
      laga syncu — zmierzone, liczba zapisana w `POSTEP.md`

## Wskazówki techniczne

- Światło i widzenie to ta sama geometria: wielokąt z `shared/vision.ts` liczony
  z innego środka i innego promienia — nie pisz drugiego raycastu
- Migotanie rób w rendererze (alfa w tickerze), nie w danych — inaczej każde
  mrugnięcie to zdarzenie po sieci
- **Uwaga na wyciek planu budynku (reguła z 18a).** Wielokąt światła jest
  przycięty ścianami, więc wysłany graczowi w całości zdradza kształt
  oświetlonego pokoju za ścianą — dokładnie to, czego 18a nie wysyła. Pole
  widzenia zostaje ostrym wielokątem, a „co w nim jest oświetlone" idzie jako
  drobna maska komórkowa ograniczona do prostokąta obejmującego pole widzenia
