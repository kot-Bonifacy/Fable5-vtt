# Etap 16d — Granaty, wzorce obszarowe i amunicja specjalna 🏁 Pełny ostrzał

**Faza:** D — Walka · **Wymaga etapów:** 16b, 16c

## Cel sesji

Ostrzał przestaje być „jedna kula, jeden cel": granat, śrut i wyrzutnia rażą obszar,
a rodzaj naboju wreszcie coś znaczy. Po tym etapie walka dystansowa CP RED jest kompletna.

**Pochodzenie:** dopisany 2026-07-31 razem z 16b (wtedy jako 16c; przenumerowany, gdy 16b
podzielił się na 16b i 16c). Zbiera trzy wpisy z POMYSLY, które etap 16
świadomie zostawił („granaty i wzorce obszarowe" z 28.07, „rzut przedmiotem" z 31.07,
„amunicja specjalna" z 27.07) — dane są sparsowane od etapu 13, brakuje modelu i UI.

## Zakres

- [ ] **Szablony obszaru na mapie**: kwadrat 10×10 m eksplozji, stożek śrutu 6 m przed
      strzelającym, promień — jako kształty na warstwie rysowania z 17b (geometria i warstwa
      są gotowe, brakuje kształtów i wiązania z zasadami). Podgląd przed rzutem, ten sam
      obraz u MG i u gracza
- [ ] **Granaty jako pozycja ekwipunku**: rzut ZW + Atletyka, zasięg 25 m, PT z wiersza
      Granatnika; **pudło odchyla obszar** wg zasady z podręcznika, zamiast go anulować
- [ ] **Rozliczenie obszarowe**: każdy token w obszarze dostaje osobną kartę obrażeń
      (MG stosuje je ścieżką z etapu 15, „Cofnij" działa na każdą z osobna); **linia strzału
      z 16b decyduje, kogo osłania mur** — token za ścianą w zasięgu wybuchu nie obrywa
- [ ] **Rzut przedmiotem** (POMYSLY 31.07) — ta sama ścieżka co granat, bez obszaru:
      14d zrobił Rzut osobą, rzucanie rzeczami zostało
- [ ] **Amunicja specjalna** — typy z podręcznika (tabela sparsowana od etapu 13), wybór
      naboju na wierszu broni, efekt liczony w matematyce obrażeń z etapu 15:
  - przeciwpancerna: połowa SP celu (zaokrąglenie wg podręcznika)
  - zapalająca: nakłada Podpalonego — wpina się w gotowy DoT z 14e
  - gumowa: obrażenia nieśmiercionośne
  - EMP, biotoksyczna, ekspansywna, inteligentna, snajperska i reszta tabeli
  - **śrut** jako typ amunicji przełączający atak na stożek 6 m
- [ ] Testy: geometria obszaru i stożka (wartości graniczne), odchylenie przy pudle,
      przeciwpancerna vs pancerz, zapalająca nakładająca Podpalonego, token za murem
      pominięty przez wybuch

## Poza zakresem

- **Dodatki do broni** (6 pozycji z „Nowej ekonomii ulicznej") i ekwipunek ogólny —
  zostają przy etapie 23, jak ustalono 27.07
- **Trucizny z pełnym testem Odporności** — biotoksyczna amunicja korzysta z generycznego
  DoT z 14e; pełna mechanika trucizn ma własny wpis w POMYSLY
- Niszczenie osłon obszarem ponad to, co daje 16c (wybuch obejmuje osłonę tak samo jak token)

## Kryteria ukończenia

- Granat rzucony w grupę trzech tokenów tworzy trzy karty obrażeń; czwarty token, stojący
  za murem w tym samym obszarze, nie dostaje nic
- Pudło granatem odchyla obszar zgodnie z zasadą i rozlicza go w nowym miejscu
- Amunicja przeciwpancerna: pancerz SP 11 liczy się jak 5, karta obrażeń pokazuje to jako
  nazwany wpis rozbicia (wzorzec „Trzymanie −2" z 14d), nie jako cichą korektę
- Zapalająca nakłada Podpalonego, który pali na końcu tury ścieżką z 14e
- Strzał śrutem rysuje stożek 6 m i rozlicza wszystkich w nim
- Testy jednostkowe: przynależność punktu do obszaru i do stożka, matematyka amunicji

## Wskazówki techniczne

- Typ amunicji to **dane w kompendium**, nie gałąź w kodzie: wiersz naboju niesie flagi
  maszynowe (`armorHalved`, `appliesStatus`, `nonLethal`, `pattern`) — ten sam wzorzec, co
  flagi ran krytycznych z 14e i kary pancerza z 14c
- Broń ma już pole na rodzaj naboju od etapu 16 (`ammoType`) — rozszerz je o odniesienie do
  kompendium zamiast dokładać drugie pole
- Obszar liczy **serwer** z tych samych współrzędnych, które dostaje klient do podglądu;
  klient rysuje kształt, ale nie decyduje, kto w nim stoi
- Karta obszarowa to N kart obrażeń, nie jedna zbiorcza — inaczej „Cofnij" z etapu 15
  przestanie działać na pojedynczy cel
