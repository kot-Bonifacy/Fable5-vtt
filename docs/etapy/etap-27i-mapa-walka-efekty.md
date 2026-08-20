# Etap 27i — Mapa: efekty walki

**Faza:** I — Wykończenie · **Wymaga etapów:** 16b (atak z mapy), 16d (granaty), 16g/16h (amunicja), 27d (audio i „bez animacji"), 27h (HUD)

> **Dopisany 2026-08-20** na wniosek MG: „walka i przemieszczanie się tokenów wygląda zbyt
> prymitywnie". Pierwsza połowa pary z `etap-27h-panel-postaci.md`.
>
> **Zwężony 2026-08-20** (decyzja MG): Token 2.0 i czytelny ruch wyprowadzone do
> `etap-27j-zetony-ruch.md`. Ta sesja zamyka **efekty walki** w całości — od kanału
> zdarzeń na serwerze po dźwięk.

## Cel sesji

Strzał przestaje być wyłącznie wpisem na czacie. Dziś `MapRenderer` rysuje marsz, ślad trasy
i celownik — i na tym kończy się wszystko, co widać: trafienie, pudło, wybuch i obrażenia nie
mają na mapie **żadnej** reprezentacji. Po tej sesji przy stole widać, kto do kogo strzelił,
czy trafił i ile to kosztowało — bez czytania czatu.

## Decyzje MG (2026-08-20)

- Poziom efektów: **klatkowane sprite'y z paczek CC0 plus krótkie dźwięki SFX**. Odrzucone:
  wyłącznie rysowanie wektorowe w Pixi. Kubek do kości ma warstwę audio i suwak głośności
  od 27d — SFX walki idzie tą samą drogą, z własnym suwakiem.
- Dźwięki: **realistyczne** (prawdziwa broń, nie blastery), suwak startuje na **50** — tam,
  gdzie kości i kubek z 27d.

## Zakres

- [x] **Kanał zdarzeń dla efektów** — serwer mówi klientowi „strzał z A do B, trafienie,
      12 obrażeń". Efekt nie może odsłaniać niczego, czego widz nie ma prawa widzieć
      (ukryty żeton, nieodsłonięta mgła, ciemność, cudza scena) — filtr **przed** wysyłką,
      nie w rendererze
- [x] **Efekty strzału** — błysk u lufy, ślad pocisku do celu, trafienie/rykoszet na celu,
      pudło jako ślad mijający figurę. Osobno seria i zapora (16), stożek śrutu (16g),
      wręcz jako cięcie na celu
- [x] **Efekty obszarowe** — wybuch granatu (16d) i chmura gazu/dymu (16h) jako animacja,
      nie sam okrąg; podłoga elektryczna i pułapki strefowe z 26f dostają wyładowanie
- [x] **Liczby nad figurą** — obrażenia, „PUDŁO", „KRYTYK", leczenie: wypływający tekst nad
      żetonem, żeby czat nie był jedynym miejscem, gdzie widać wynik
- [x] **Dźwięki SFX** — strzał (pistolet/karabin/snajperka/strzelba), trafienie, rykoszet,
      cięcie, przeładowanie, wybuch, gaz, wyładowanie. Paczki CC0, hostowane u siebie,
      atrybucja w repo; własny suwak głośności w „⚙ Ustawienia" i wyłącznik, tą samą drogą
      co kości z 27d
- [x] **Budżet klatek** — efekty nie mogą zjeść fps na scenie ze światłami i mgłą; pomiar
      przed i po, wyłącznik „bez animacji" wspólny z 27d wycisza też mapę

## Poza zakresem

- Przepisywanie renderera mapy; animowane portrety i tokeny wideo
- Nowe reguły walki — to warstwa wizualna nad rozstrzygnięciami, które już zapadają na serwerze
- Wygląd samego żetonu, podstawka, łuk PW, kierunek patrzenia, czytelny ruch → **27j**

## Kryteria ukończenia

- Strzał, trafienie i wybuch są widoczne na mapie bez czytania czatu
- Efekt nigdy nie pokazuje figury ani zdarzenia, którego widz nie ma prawa widzieć
- Dźwięki dają się ściszyć i wyłączyć, a wyłączenie animacji wycisza też efekty mapy
- Fps na scenie testowej po dołożeniu efektów zmierzony i zapisany
