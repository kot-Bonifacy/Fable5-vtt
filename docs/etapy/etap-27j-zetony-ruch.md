# Etap 27j — Żetony i czytelny ruch

**Faza:** I — Wykończenie · **Wymaga etapów:** 05 (tokeny), 14c (budżet metrów), 16e (ruch klikiem), 27i (warstwa efektów)

> **Dopisany 2026-08-20** przy podziale etapu 27i (decyzja MG). 27i zamyka efekty walki;
> ta sesja zajmuje się tym, jak wygląda i porusza się **sama figura**.

## Cel sesji

Żeton przestaje być kółkiem z paskiem nad głową. Po tej sesji na mapie widać, kto stoi na
nogach, kto się wykrwawia i w którą stronę patrzy — a przejście przez pokój czyta się bez
liczenia kratek.

## Decyzja MG (2026-08-20)

**Punkty Wytrzymałości to łuk wokół żetonu**, nie prostokątny pasek nad głową (wzór: Argon
Combat HUD i „ładne" moduły Foundry). Pasek znika; miejsce nad głową zostaje wolne dla liczb
obrażeń z 27i.

## Zakres

- [x] **Token 2.0** — podstawka z cieniem, **łuk PW** wokół figury zamiast paska, wyraźny
      stan: ranny, nieprzytomny, martwy; wyróżnienie aktywnej tury mocniejsze niż dzisiejsza
      amber-aureola
- [x] **Kierunek patrzenia** — figura pokazuje, w którą stronę jest zwrócona. **Rozstrzygnięte
      21.08 (decyzja MG): jedno i drugie.** Pole `Token.facing` w bazie, pisane automatycznie
      przez ruch (ostatni odcinek trasy) i strzał (w stronę celu), nadpisywalne ręcznie gałką na
      pierścieniu zaznaczenia — ręczny kąt trzyma się do następnego ruchu. CP RED nie zna reguł
      fasowania, więc to czysta czytelność, nie mechanika
- [x] **Ruch czytelny** — trasa z kosztem odcinków w metrach, podświetlenie pól w zasięgu
      bieżącego budżetu, ślad zanikający po marszu
- [x] **Krok** — dźwięk kroku w warstwie SFX z 27i (ten sam suwak), o ile nie zmęczy przy stole

## Poza zakresem

- Przepisywanie renderera mapy; animowane portrety i tokeny wideo
- Efekty walki, dźwięki broni i wybuchów — zrobione w **27i**

## Kryteria ukończenia

- [x] Po zrzucie ekranu mapy widać bez pytania, kto jest ranny, kto nieprzytomny i czyja jest tura
      — sprawdzone 21.08 na Poligonie przy zoomie stołowym, cztery stany naraz (patrz notatka
      sesji w `POSTEP.md`)
- [x] Trasa marszu mówi, ile metrów kosztuje, zanim gracz kliknie — koszt **każdego odcinka**
      plus suma przy znaku stop, a pod figurą zacieniona podłoga w zasięgu budżetu tury
- [x] Fps na scenie testowej nie spada względem pomiaru z 27i — warstwy 27j rysują się
      **na zmianę stanu**, nie na klatkę: zalew Dijkstry ma cache na (figura, pozycja, budżet),
      trasa na docelową kratkę, a w tickerze chodzą tylko gasnący ślad i puls tury (jedna liczba
      alfa na jedną figurę). Pomiar liczbowy dla sceny z dynamiczną widocznością nadal nie
      istnieje — ta sama zaległość, którą zostawił 27i
