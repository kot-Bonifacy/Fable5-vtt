# Etap 41 — Oględziny wyposażenia figury

**Faza:** H — Świat CP RED · **Wymaga etapów:** 38a (statysta jako karta postaci), 16f (celowanie
kursorem i HUD walki), 15 (pancerz i lokacje trafień), 32 + 40 (wezwanie i prośba o Test)

> **Pochodzenie:** zlecenie MG z 10.09.2026 — „dodaj możliwość skanowania założonego/używanego
> wyposażenia przez inne tokeny (żeby móc sprawdzić np. czy wroga/sojusznicza postać ma hełm na
> głowie, albo jaki rodzaj broni), bo teraz tego nie wiadomo, co utrudnia ocenę i uniemożliwia
> określenie, w jaki element ciała wroga celować".

## Cel sesji

Od etapu 16f gracz celuje kursorem, a od 31.08 wybiera **punkt Celowania**: głowa, trzymany
przedmiot, noga (s. 170). Wybór ten zapada dziś **w ciemno**. O cudzej figurze gracz wie tylko to,
co niesie `TokenView`: nazwę, obrazek, naklejki, zwrot i rany krytyczne. Karta NPC nie jedzie do
graczy w ogóle (`characterAudience` w `character-io.ts`), więc „czy ten ganger ma hełm" nie ma
żadnej drogi do stołu — a to jest **dokładnie ta liczba**, na której stoi cała opłacalność strzału
w głowę: obrażenia mnożą się dopiero po przejściu przez pancerz głowy.

Etap dokłada dwie warstwy wiedzy o cudzej figurze i jeden brakujący stan świata:

1. **Rzut oka — za darmo, bez kości.** To, co widać z drugiej strony ulicy: czy coś ma na głowie,
   czy nosi pancerz na korpusie, jakiej **klasy** broń trzyma, jaki chrom rzuca się w oczy.
2. **Oględziny — po Teście Percepcji.** Liczby: „OB 11", nazwa i obrażenia broni, stan magazynka,
   nazwy wszczepów. PT ustala MG, wzorem etapu 40.
3. **Broń dobyta** — stan figury, którego w modelu nie było. Bez niego „jaką broń trzyma"
   znaczyłoby „jaką broń ma na karcie", czyli razem z tym, co leży w plecaku.

## Sześć decyzji MG przed kodem (10.09.2026)

1. **Dwie warstwy, nie jedna.** Rzut oka jest darmowy i ciągły; liczby wymagają Testu. Wariant
   „wszystko za darmo" odrzucony (snajper w oknie wiedziałby tyle, co postać stojąca metr od celu),
   wariant „wszystko po Teście" też (rzut przed każdym strzałem spowalnia dokładnie ten moment,
   który zlecenie miało przyspieszyć).
2. **PT ustala MG za każdym razem** — oględziny idą torem prośby o Test z etapu 40, a nie własną
   drabinką liczoną z odległości. Automat z mapy został rozważony i **odrzucony**.
3. **W walce oględziny kosztują Akcję**, poza walką są darmowe — wzorem Zmysłu Walki z 30a.
4. **Widać: pancerz (lokacja + OB), broń (nazwa + obrażenia), widoczny chrom, rany i stan.**
5. **Figura, której nikt nie kazał dobywać broni, trzyma pierwszą broń ze swojej karty.** Dzięki
   temu funkcja działa na całym poligonie od pierwszej chwili i MG nie musi obchodzić czterdziestu
   gangerów. „Puste ręce" wymagają świadomego kliknięcia.
6. **Dobycie broni jest egzekwowane w walce od razu** — atak bronią, której figura nie ma w rękach,
   odpada jak atak zaciętą bronią. MG wybrał ten wariant, znając ostrzeżenie, że dotyka planera
   ataku i testów z etapów 16–16h, 20b i 31.

## Co widać, a czego nie

**Chrom rozstrzyga rodzina, nie flaga przy wpisie.** Sześć rodzin widać z zewnątrz z definicji —
Cybermoda, Cyberoptyka, Cyberaudio, Cyborgizacje zewnętrzne, Cyberkończyny, Borgizacje — a dwie są
pod skórą: Cybersynapsy i Cyborgizacje wewnętrzne. Neuroprocesor nie jest widoczny i nie ma być.

**Pancerz liczy się tylko założony** (`equipped !== false`). Kurtka w plecaku nie chroni od etapu
15 i tak samo nie ma jej być widać.

## Zakres

- [x] `CpredCharacterData.drawnWeaponRowIds` — **lista** (ręce są dwie); brak pola = „nikt nie
      pytał", `[]` = puste ręce
- [x] `weapon:draw` — dobycie (za darmo), schowanie (Akcja) i upuszczenie (za darmo), wzorem
      `weapon:clear-jam`
- [x] `WEAPON_NOT_DRAWN` w planerze ataku i wyszarzony slot paska — wzorem `WEAPON_JAMMED`
- [x] `systems/cpred/sighting.ts` — `cpredSightingGlance` i `cpredSightingDetail`, czyste funkcje
- [x] `TokenView.sighting` — rzut oka jedzie z żetonem, nieprzezroczysty dla rdzenia (jak
      `injuries` od 31.08)
- [x] Dymek celownika pokazuje rzut oka: głowa, korpus, broń w rękach
- [x] Okno „Oględziny" z menu figury — **menu figury udostępnione graczom** w wersji okrojonej
- [x] Test Percepcji na oględziny: `plan.sighting`, karta czatu z liczbami widoczna dla proszącego
      i MG
- [x] Testy: `sighting.test.ts` w `shared` (22) i na serwerze (13), plus dwa w `hotbar.test.ts`

## Kryteria ukończenia

1. Gracz najeżdżający celownikiem na wrogą figurę widzi w dymku, czy ma coś na głowie i co trzyma.
2. Gracz otwiera „Oględziny" z menu figury i widzi rzut oka bez żadnego rzutu.
3. Prośba o dokładniejsze oględziny dochodzi do MG, a po zdanym Teście gracz dostaje liczby.
4. Wróg bez hełmu i wróg w hełmie różnią się w dymku, zanim padnie strzał w głowę.
5. Atak bronią, której figura nie trzyma, odpada zdaniem — a dobycie jej jest darmowe.
6. Karta NPC nadal nie jedzie do graczy; do klienta idzie wyłącznie to, co widać.

## Odstępstwa od planu

**Decyzja 6 została zawężona w trakcie sesji, po zmierzeniu skutków.** „Egzekwuj od razu" miało
obowiązywać także figury bez zadeklarowanych rąk — i wywróciło **39 testów serwera**, bo karta
z pistoletem, karabinem i nożem mogłaby strzelać wyłącznie z pierwszego wiersza, dopóki ktoś nie
przełoży broni ręcznie. MG rozstrzygnął: **domysł pokazuje, deklaracja zabrania.** Egzekwowanie
jest pełne, ale zaczyna obowiązywać figurę **od pierwszego `weapon:draw`**.

**Ręce są dwie, nie jedna.** Pierwszy szkic trzymał jedno id; s. 168 mówi o **wolnej ręce**, więc
pistolet i nóż muszą mieścić się naraz. Stan jest listą, a ile rąk zajmuje broń, rozstrzyga
katalog po stronie serwera.

**Rzut oka nie jedzie na `TokenView`, tylko zdarzeniem `sighting:look`.** Klasa broni bierze się
z typu w kompendium, a kompendium czyta się z bazy — doklejenie tego do żetonu kazałoby każdej
synchronizacji sceny czekać na katalog.

## Co zostało

**Oględziny w przeglądarce — pięć pozycji, w `zaleglosci.md`.** Oba wejścia (menu figury, dymek
pod celownikiem) są dla automatyki zamknięte; do kliknięcia ręką MG razem z długiem 38a/38b.
