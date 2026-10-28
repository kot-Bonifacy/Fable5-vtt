# Etap 61 — Skradanie się

**Faza:** przed betą (zlecenie MG z 28.10 spoza planu) · **Wymaga etapów:** 32/40 (wezwanie
i prośba o Test), 56 (walka z zauważenia), 58d (ukryta figura przeciw Percepcji), panel decyzji
MG (24.10)

## Skąd ten etap

MG (28.10): „dodaj mechanikę (chyba jej nie ma) skradania się (dostępną w lewym panelu pod
przyciskiem). Powinna ona być połączona z modyfikatorem sytuacji/trudności MG”.

Przed etapem skradała się tylko figura MG (ukryta, 58d: gracz w 4 m rzuca Percepcję przeciw jej
Skradaniu). Gracz nie miał jak się skradać — MG rozgrywał to „Odwołaj” na starciu z zauważenia.
Podręcznik daje tylko tyle: Skradanie się (ZW) przeciw Percepcji (INT), s. 130 i opis
Umiejętności; nie ma Akcji „Ukrycie”, kary do ruchu ani premii za zaskoczenie.

## Decyzje MG z 28.10 (pytania na starcie)

1. **Tryb skradania** (przełącznik jak w BG3/Foundry): slot „Skradanie” w lewym pasku. Gracz
   rzuca Skradanie raz, kubkiem — wynik staje się PT Percepcji wrogów. Wrogowie rzucają
   Percepcję w ukryciu (serwer). Kto nie zauważył, nie wyzwala walki z zauważenia (56);
   zauważenie kończy tryb.
2. **Modyfikator MG przy wejściu:** wejście w tryb to sprawa w panelu decyzji MG — MG wybiera
   modyfikator sytuacyjny (ciemno +2, żwir −2) albo odmawia; obowiązuje do końca tego skradania,
   a gracz rzuca dopiero po zgodzie.
3. **Kiedy wróg rzuca:** gdy ma figurę w polu widzenia (ta sama miara co mgła, ściany i światło,
   liczona z oczu tego NPC-a), raz na jedno skradanie. Nowy rzut dopiero po ponownym wejściu
   w tryb.
4. **Koszt:** poza walką darmowe, w trwającej rundzie wejście kosztuje Akcję. Ruch bez zmian.
5. **Co kończy tryb:** zauważenie, przycisk gracza, przycisk MG, **atak**, **Bieg** i **zmiana
   sceny / koniec sesji** (Skok nie).
6. **Atak z ukrycia (zasada domowa):** cel, który nie zauważył atakującego, nie dostaje Uniku
   przy tym jednym ataku. Bez premii do rzutu.
7. **Kto patrzy:** wszystkie NPC-e poza Przyjaznymi i pojemnikami. Wrogi, który zauważy,
   zakłada walkę (56); Neutralny daje MG pasek „X zauważa Y”, dalej decyduje MG.
8. **Co wie gracz:** swoją kartę rzutu Skradania i znaczek trybu; nie wie, kto i jak rzucał
   Percepcję. Zauważenie poznaje po końcu trybu (pasek „Zauważono cię”). Rzuty Percepcji zna MG.
   **Figura w trybie jest półprzezroczysta** (jak ukryte obiekty u MG) — dla każdego, kto ją
   widzi.

## Rozstrzygnięcia bez pytań (do słowa MG)

- **Zauważenie przez Neutralnego też kończy tryb** — decyzja 5 mówi „zauważenie”, bez wyjątku.
  Gracz może poprosić o skradanie od nowa.
- **Oczy skradającego się nie zaczynają walki.** Etap 56 zakładał starcie, gdy drużyna _zobaczy_
  wroga; skradający się widzi wroga, zanim ten zobaczy jego. Starcie zakłada więc: wróg widziany
  oczami figury, która się nie skrada (jak dotąd), albo wrogi NPC, który zauważył skradającego
  się. Oczy drużyny działają dalej — gracze widzą to, co skradający się — tylko nie wyzwalają.
- **NPC bez karty nie rzuca Percepcji** i sam nikogo nie zauważy (jak 58d: figura bez karty bez
  PT nie jest zauważana). Statysta od 38a ma kartę, więc dotyczy to tylko gołych żetonów.
- **Unik wręcz:** w walce wręcz obrona to bierne PT z ZW + Unik celu; atak z ukrycia zabiera
  tylko prawdziwy rzut Uniku (przycisk „Unik” na karcie), bierne PT zostaje — „bez premii”.
- **Pochwycenie nie kończy trybu** (to nie Atak); kończy go dopiero cios.
- **Bot-NPC w turze** nie widzi skradającego się, którego jego figura nie zauważyła (nie strzeli
  w niego ani nie poda go w liście celów).
- **Towarzysze-boty się nie skradają** (bez slotu w ich narzędziach) — w `POMYSLY.md`.
- Prośba czeka jak każda prośba o Test („Czeka na MG”, „Wycofaj”); druga prośba tej samej figury
  przed odpowiedzią — `SNEAK_PENDING`. Akcję w walce serwer bierze **przy rzucie** (odmowa przed
  kośćmi, jak Ustabilizowanie), a przy prośbie sprawdza ją tylko na sucho.

## Zakres

- [x] `shared`: stan skradania figury (`Token.sneak`, odczyt/zapis, `TokenView.sneaking`
      publicznie, szczegóły u MG), akcja katalogu `sneak` i slot w pasku (przełącznik
      „Skradanie” / „Przestań się skradać”), testy
- [x] Serwer: `sneak:request` (prośba o Test Skradania w kanale próśb), zgoda MG z modyfikatorem
      bez PT, rozliczenie rzutu (Akcja w walce, stan na figurze), `sneak:stop`
- [x] Serwer: rzuty Percepcji NPC-ów przy każdej zmianie tego, co widać (wspólne wejście
      z `checkSighting`), zauważenie → koniec trybu, pasek gracza, wiersz i pasek MG; wrogi
      zauważający zakłada walkę
- [x] Serwer: koniec trybu przy ataku (cel bez Uniku), Biegu, zmianie sceny i końcu sesji; bot
      nie widzi niezauważonego
- [x] Klient: slot w lewym pasku, półprzezroczysta figura, drabinka modyfikatora w panelu decyzji
      i na karcie prośby, menu figury MG („Przerwij skradanie”, kto zauważył)
- [x] Testy serwera, oględziny w Firefoksie

## Kryteria ukończenia

- Gracz poza walką klika „Skradanie”, MG dostaje panel z drabinką modyfikatora, po zgodzie gracz
  rzuca kubkiem, figura robi się półprzezroczysta; wrogi NPC, który ją widzi i nie zauważy, nie
  zakłada walki, a ten, który zauważy, zakłada ją i kończy tryb.
- W walce wejście kosztuje Akcję, atak ze skradania nie daje celowi Uniku i kończy tryb.
- Bieg, zmiana sceny i koniec sesji kończą tryb; MG przerywa go z menu figury.
- Testy `shared` i serwera przechodzą, aplikacja się buduje.
