# Etap 13 — Inicjatywa i tury

**Faza:** D — Walka · **Wymaga etapów:** 08

## Cel sesji

Tracker inicjatywy sterujący przebiegiem walki: rzuty inicjatywy, kolejność, aktywna tura, rundy.

## Zakres

- [ ] Model `Combat` per scena: uczestnicy (tokeny), wartości inicjatywy, kolejność, wskaźnik aktywnej tury, licznik rund, status (aktywna/zakończona)
- [ ] Rozpoczęcie walki: MG zaznacza tokeny / dodaje z menu kontekstowego; przycisk „rzuć wszystkim" (`1d10 + REF` przez silnik z etapu 06) + rzut indywidualny gracza dla własnej postaci
- [ ] Panel trackera: lista wg kolejności (portret, imię, wartość inicjatywy, HP dla MG), aktywny uczestnik wyróżniony, przyciski następna/poprzednia tura, licznik rund
- [ ] Remisy: rozstrzyganie wg REF, a ostatecznie przeciąganie ręczne (drag w trackerze, tylko MG)
- [ ] Podświetlenie aktywnego tokenu na mapie + delikatne wskazanie czyja tura (baner/obwódka)
- [ ] Dodawanie uczestnika w trakcie walki (wchodzi wg swojego rzutu), usuwanie (śmierć/ucieczka)
- [ ] Ukryci uczestnicy: wróg niewidoczny dla graczy nie pojawia się w ich trackerze (filtrowanie serwerowe, jak w etapie 05)
- [ ] Zakończenie walki czyści stan; historia rund nie musi być trwała

## Poza zakresem

- Automatyka obrażeń (etap 14), zasięgi/DV (etap 15), tury botów-towarzyszy (etap 19 — ale tracker musi ich po prostu traktować jak zwykłe tokeny)

## Kryteria ukończenia

- Pełna walka testowa: 2 postacie graczy + 3 NPC, „rzuć wszystkim", 2 rundy przechodzone przyciskiem, dodanie posiłków w rundzie 2, zakończenie — wszystko na żywo u dwóch klientów
- Ukryty NPC niewidoczny w trackerze gracza (payload sprawdzony)
- Remis inicjatywy rozstrzygalny ręcznie

## Wskazówki techniczne

- Tracker to czysty stan realtime — wykorzystaj wzorce z etapu 03 (intencje, broadcast, resync); po reconnect walka musi wrócić w całości
- Nie wiąż trackera na sztywno z zasadami CP RED (rdzeń: uczestnicy+kolejność; CP RED dostarcza tylko formułę rzutu) — separacja rdzeń/system
