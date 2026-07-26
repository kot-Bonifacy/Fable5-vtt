# Etap 14 — Inicjatywa i tury

**Faza:** D — Walka · **Wymaga etapów:** 08

## Cel sesji

Tracker inicjatywy sterujący przebiegiem walki: rzuty inicjatywy, kolejność, aktywna tura, rundy.

## Zakres

- [x] Model `Combat` per scena: uczestnicy (tokeny), wartości inicjatywy, kolejność, wskaźnik aktywnej tury, licznik rund, status (aktywna/zakończona)
- [x] Rozpoczęcie walki: MG zaznacza tokeny / dodaje z menu kontekstowego; przycisk „rzuć wszystkim" (`1d10 + REF` przez silnik z etapu 06) + rzut indywidualny gracza dla własnej postaci
- [x] Panel trackera: lista wg kolejności (portret, imię, wartość inicjatywy, HP dla MG), aktywny uczestnik wyróżniony, przyciski następna/poprzednia tura, licznik rund
- [x] Remisy: rozstrzyganie wg REF, a ostatecznie przeciąganie ręczne (drag w trackerze, tylko MG)
- [x] Podświetlenie aktywnego tokenu na mapie + delikatne wskazanie czyja tura (baner/obwódka)
- [x] Dodawanie uczestnika w trakcie walki (wchodzi wg swojego rzutu), usuwanie (śmierć/ucieczka)
- [x] Ukryci uczestnicy: wróg niewidoczny dla graczy nie pojawia się w ich trackerze (filtrowanie serwerowe, jak w etapie 05)
- [x] Zakończenie walki czyści stan; historia rund nie musi być trwała

## Poza zakresem

- Automatyka obrażeń (etap 15), zasięgi/DV (etap 16), tury botów-towarzyszy (etap 20 — ale tracker musi ich po prostu traktować jak zwykłe tokeny)

## Kryteria ukończenia

- Pełna walka testowa: 2 postacie graczy + 3 NPC, „rzuć wszystkim", 2 rundy przechodzone przyciskiem, dodanie posiłków w rundzie 2, zakończenie — wszystko na żywo u dwóch klientów
- Ukryty NPC niewidoczny w trackerze gracza (payload sprawdzony)
- Remis inicjatywy rozstrzygalny ręcznie

## Ustalenia z sesji (2026-07-26)

- **Tracker w dwóch miejscach:** pasek nad mapą (runda, kolejka, czyja tura) + zakładka „Walka" w panelu bocznym (pełne sterowanie). Zakładka jest w rzędzie wspólnym — gracz też ją widzi.
- **Rzuty inicjatywy:** „Rzuć wszystkim" MG liczy się po cichu (bez kart na czacie), a gracz rzuca własną inicjatywę kubkiem i dostaje kartę jak przy każdym innym rzucie.
- **Turę przesuwa MG albo aktywny gracz** („Kończę turę"); serwer sprawdza, czyja to naprawdę tura.
- **Uczestnicy:** zaznaczenie tokenów sceny (postacie graczy zaznaczone domyślnie) + „Dodaj do walki" w menu kontekstowym tokenu.
- **Remisy — dwie ścieżki:** REF rozstrzyga automatycznie przy porządkowaniu po rzucie, a RAW Easy Mode („remisy należy rozstrzygnąć ponownym rzutem") dostał przycisk „Przerzuć remis". Ręczne przeciąganie jest ostateczne w obrębie tej samej inicjatywy; wyższa inicjatywa zawsze wyprzedza niższą.
- **Pasek nad mapą jest przesuwalny** (życzenie użytkownika po oględzinach): łapie się go za etykietę rundy — jedyne miejsce bez przycisku, więc chwyt nigdy nie koliduje ze sterowaniem. Pozycja jest zapamiętana w `localStorage` (jak szerokość panelu), przycinana do obszaru mapy przy przeciąganiu i przy zmianie rozmiaru okna; strzałki przesuwają skokowo, dwuklik wraca na środek u góry. Bez dymka z instrukcją — kursor „łapki” wystarcza, a podpowiedź wisząca nad mapą psuje klimat stołu.
- **Prawy przycisk należy do gry** (życzenie użytkownika): w widoku gry natywne menu przeglądarki jest wyłączone (`useGameContextMenu` w `App.tsx`) — poza dwoma wyjątkami, gdzie realnie coś robi: pola tekstowe (wklejanie) i zaznaczony tekst (kopiowanie kwestii z czatu). Na mapie blokada jest bezwarunkowa, bo tam prawy przycisk otwiera menu tokenu. Ekrany logowania i dołączania linkiem zachowują zwykłe menu.
- **Inicjatywa nie jest Testem:** krytyk/fumble z etapu 06 celowo NIE działa na `1d10 + REF` (zasada dotyczy Testów Umiejętności) — silnik kości dostał jawne `checkRule: false`.

## Wskazówki techniczne

- Tracker to czysty stan realtime — wykorzystaj wzorce z etapu 03 (intencje, broadcast, resync); po reconnect walka musi wrócić w całości
- Nie wiąż trackera na sztywno z zasadami CP RED (rdzeń: uczestnicy+kolejność; CP RED dostarcza tylko formułę rzutu) — separacja rdzeń/system
