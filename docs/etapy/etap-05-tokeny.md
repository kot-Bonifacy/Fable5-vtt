# Etap 05 — Tokeny

**Faza:** B — Stół MVP · **Wymaga etapów:** 04

## Cel sesji

Tokeny na mapie z pełną synchronizacją: drag&drop ze snapem, paski HP, ikony statusów, widoczność sterowana przez MG i uprawnienia ruchu.

## Zakres

- [x] Model `Token`: scena, pozycja, rozmiar (1×1, 2×2…), grafika, nazwa, przypisany właściciel (gracz), widoczność dla graczy, HP bieżące/max (na razie lokalnie — spięcie z kartą w etapie 08), lista statusów
- [x] Tworzenie tokenu: upload grafiki lub wybór z wgranych wcześniej (prosta biblioteka assetów per kampania)
- [x] Drag&drop w Pixi: snap do kratki w trybie grid, swobodny ruch w gridless; ghost/podgląd podczas przeciągania
- [x] Synchronizacja ruchu: optymistycznie u przesuwającego, autorytatywnie z serwera dla reszty (`token:move`)
- [x] Uprawnienia: gracz rusza tylko tokenami, których jest właścicielem; MG — wszystkimi
- [x] Pasek HP nad tokenem (kolor wg progu), nazwa pod tokenem
- [x] Ikony statusów CP RED (nakładki na token): ogłuszony, poważnie ranny, podpalony, oślepiony, unieruchomiony itp. — zestaw ikon CC0/własnych, definicje w `data/public/`
- [x] Widoczność: MG przełącza token ukryty/widoczny; ukryte tokeny NIE są wysyłane graczom (filtrowanie na serwerze), u MG renderowane półprzezroczyście
- [x] Menu kontekstowe tokenu (prawy przycisk): widoczność, statusy, usuń
- [x] Test: payload gracza nie zawiera ukrytych tokenów

## Poza zakresem

- Powiązanie z kartą postaci (etap 08), vision/oświetlenie (etap 17), martwe pola walki

## Kryteria ukończenia

- Dwóch klientów widzi wzajemnie ruch tokenów na żywo, ze snapem do siatki
- Gracz nie może ruszyć cudzego tokenu (UI to blokuje, serwer odrzuca mimo wszystko)
- Token ukryty przez MG znika u graczy natychmiast i nie występuje w ich ruchu sieciowym

## Wskazówki techniczne

- Interakcje Pixi: `eventMode: 'static'` na tokenach; rozróżnij klik/drag progiem odległości
- Przy przesuwaniu wysyłaj throttlowane pozycje pośrednie (np. 20/s) + finalną z zapisem do DB
- Statusy trzymaj jako tablicę identyfikatorów — definicje (ikona, nazwa PL) w danych, nie w kodzie
