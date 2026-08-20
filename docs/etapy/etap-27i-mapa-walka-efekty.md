# Etap 27i — Mapa: tokeny, efekty walki i ruch

**Faza:** I — Wykończenie · **Wymaga etapów:** 16b (atak z mapy), 16e (ruch klikiem), 27h (HUD)

> **Dopisany 2026-08-20** na wniosek MG: „walka i przemieszczanie się tokenów wygląda zbyt
> prymitywnie". Druga połowa pary z `etap-27h-panel-postaci.md`.

## Cel sesji

Strzał przestaje być wyłącznie wpisem na czacie. Dziś `MapRenderer` rysuje marsz, ślad trasy
i celownik — i na tym kończy się wszystko, co widać: trafienie, pudło, wybuch i obrażenia nie
mają na mapie **żadnej** reprezentacji. Po tej sesji przy stole widać, kto do kogo strzelił,
czy trafił i ile to kosztowało.

## Decyzja MG (2026-08-20)

Poziom efektów: **klatkowane sprite'y z paczek CC0 plus krótkie dźwięki SFX** (kubek do kości
ma warstwę audio i suwak głośności od 27d — SFX walki idzie tą samą drogą, z własnym suwakiem).
Odrzucone: wyłącznie rysowanie wektorowe w Pixi.

## Zakres

- [ ] **Token 2.0** — podstawka z cieniem, pierścień PW jako łuk wokół figury (dzisiejszy pasek
      nad głową zostaje jako opcja albo znika), wyraźny stan: ranny, nieprzytomny, martwy;
      wyróżnienie aktywnej tury mocniejsze niż dzisiejsza amber-aureola; kierunek patrzenia
- [ ] **Efekty strzału** — błysk u lufy, ślad pocisku do celu, trafienie/rykoszet na celu,
      pudło jako ślad mijający figurę. Osobno seria i zapora (16), stożek śrutu (16g)
- [ ] **Efekty obszarowe** — wybuch granatu (16d) i chmura gazu/dymu (16h) jako animacja,
      nie sam okrąg; podłoga elektryczna i pułapki strefowe z 26f dostają wyładowanie
- [ ] **Liczby nad figurą** — obrażenia, „PUDŁO”, „KRYTYK”, leczenie: wypływający tekst nad
      tokenem, żeby czat nie był jedynym miejscem, gdzie widać wynik
- [ ] **Dźwięki SFX** — strzał (lekki/ciężki), trafienie, przeładowanie, wybuch, krok. Paczki
      CC0 (Kenney, OpenGameArt), hostowane u siebie, atrybucja w repo; własny suwak głośności
      w „⚙ Ustawienia” i wyłącznik, tą samą drogą co kości z 27d
- [ ] **Ruch czytelny** — trasa z kosztem odcinków w metrach, podświetlenie pól w zasięgu
      bieżącego budżetu, ślad zanikający po marszu
- [ ] **Kanał zdarzeń dla efektów** — serwer musi powiedzieć klientowi „strzał z A do B,
      trafienie, 12 obrażeń”. Sprawdzić, czy wystarczy to, co już jedzie w `attack:*`, czy
      trzeba dołożyć zdarzenie; efekt nie może odsłaniać niczego, czego gracz nie widzi
      (ukryty token, cudza scena)
- [ ] **Budżet klatek** — efekty nie mogą zjeść fps na scenie ze światłami i mgłą; pomiar
      przed i po, wyłącznik „bez animacji” wspólny z 27d

## Poza zakresem

- Przepisywanie renderera mapy; animowane portrety i tokeny wideo
- Nowe reguły walki — to warstwa wizualna nad rozstrzygnięciami, które już zapadają na serwerze

## Kryteria ukończenia

- Strzał, trafienie i wybuch są widoczne na mapie bez czytania czatu
- Efekt nigdy nie pokazuje figury ani zdarzenia, którego widz nie ma prawa widzieć
- Dźwięki dają się ściszyć i wyłączyć, a wyłączenie animacji wycisza też efekty mapy
- Fps na scenie testowej po dołożeniu efektów zmierzony i zapisany
