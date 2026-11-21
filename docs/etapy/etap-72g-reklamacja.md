# Etap 72g — scena przykładowa pościgu „Reklamacja”

**Faza:** przed betą (zlecenie MG z 21.11, część etapu 72) · **Wymaga:** 72a–72f3 (model prędkości
i pasów, Wyścig, kokpit, autopilot, okno „Pościg”, plan rund), 66 (wzorce scen), 67 (modele aut)
· **Stan:** 🟨 72g1 ✅ 21.11 — wzorzec `data/public/scenes/reklamacja/` zrobiony i rozegrany
w przeglądarce (8 rund, wnioski wprowadzone); **72g2 ✅ 21.11** — decyzje MG, stały E2E
`48-poscig/t72g-reklamacja`, sprzątanie starego kodu jazdy; czeka na stół MG

## Skąd ten etap

MG (21.11): „oba scenariusze, czyli ostatni zjazd i zastaw, były tylko testowe, nigdy przeze mnie
nie zweryfikowane, więc możesz je skasować. Przydałby się za to kompletnie nowy scenariusz z nową
mechaniką, który chciałbym, aby opierał się (podobnie jak zastaw) na próbie odbicia kogoś (w tym
wypadku właściciela dziupli samochodowej i sprzedawcy broni w jednym) z furgonetki Militechu, który
to zabrał go, ponieważ montował w swoich autach sprzęt Militechu nielegalnie pozyskiwany”. Dopisek:
„scena ta ma stać się w przyszłości sceną przykładową w ramach pościgu”.

**Odpowiedzi MG (21.11, dwie rundy pytań):**

| pytanie          | decyzja MG                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------ |
| „nowa mechanika” | nowy model jazdy z etapu 72 (prędkości, pasy, Wyścig, autopilot, plan rund) — bez nowego kodu mechaniki |
| drużyna          | 2 postacie, auto z wzorca                                                                  |
| przeciwnicy      | sam furgon + posiłki z planu rund                                                          |
| posiłki          | NCPD opłacone przez Militech (jak w „Zastawie”) — da się dogadać                           |
| więzień          | skuty, przytomny; wygrana — furgon stoi, a on żyje                                         |
| plan rund        | przeszkody na pasach, kolczatka z furgonu                                                  |
| zakres sesji     | 72g1: skasować stare, scena, test, rozegranie; stały E2E i sprzątanie w 72g2               |

**Rozstrzygnięte bez pytań (do zmiany jednym słowem MG):** nazwa „Reklamacja”, imiona (Tłok —
od 21.11 **Piotrówna**, decyzja MG — Wektor, Kamień, Gil, Szpak), auto drużyny „Kombi z dziupli”
(Włóczęga z Pługiem i Nitro — sprzęt z dziupli Piotrówny), nagroda (stawka + ulepszenie z pasma 3000 ed i naprawa w dziupli + broń po cenie
hurtowej — spina się z etapem 68).

## Pomysł w jednym akapicie

**Piotrówna** (do 21.11 Tłok — MG zmienił imię i historię) prowadzi dziuplę samochodową po ojcu,
Piotrze, a na zapleczu handluje bronią. Sprzęt Militechu z kradzionych transportów wstawiał do
przerabianych aut jeszcze Piotr; córka przejęła po nim kontakty, długi i ten proceder. Piotra
zastrzelono lata temu na progu zakładu — sprawców nie znaleziono, a okrzyk Kamienia i tablet
w łupie podpowiadają, że to też była „reklamacja” Militechu. Militech namierzył numery seryjne
i nie poszedł na policję: dziś rano furgon konwojowy zabrał Piotrównę z warsztatu, skutą, „do
wyjaśnienia”. Drużyna (dwie postacie) rusza za furgonem kombi z dziupli, z pługiem i butlą nitro.
W kabinie furgonu jadą kierowca **Wektor** i ochroniarz **Kamień** z pistoletem maszynowym,
z tyłu skuta Piotrówna. W rundzie 3 od tyłu wjeżdża radiowóz NCPD (sierżant **Gil**, posterunkowy
**Szpak**), któremu Militech zapłacił za „eskortę”.

**Co pokazuje z etapu 72:** kompakt na kompakt (oba 100 mil/h od startu, gaz niczego nie daje),
więc dystans zmieniają **Wyścig** co rundę, Nitro, taran, kolczatka i przeszkody na pasach;
**autopilot** furgonu („Uciekaj”) sam omija przeszkody, radiowóz ma zamiar „Blokuj kombi”;
**plan rund** pyta MG o każde zdarzenie w panelu decyzji.

## Mapa i ustawienia

Wbudowana **Neonowa ulica** (35 × 24 kratki, jezdnia 6–18, trzy pasy: y = 8, 12, 16), jazda
w lewo, **Drużyna goni** (kombi w kadrze 30% od tylnej krawędzi), **prędkość startowa 100 mil/h**
(`chase.tempo` 20), widoczność otwarta, ruch graczy Stop, odgłos auta.

| auto             | środek (x, y) | stan       | zamiar           | ulepszenia                                    |
| ---------------- | ------------- | ---------- | ---------------- | --------------------------------------------- |
| Furgon Militechu | 12, 12        | w pościgu  | Uciekaj          | opancerzony kadłub, kuloodporne szyby, Nitro, kolczatka |
| Kombi z dziupli  | 24,5, 12      | w pościgu  | — (gracz)        | Pług, Nitro                                   |
| Radiowóz NCPD    | 32,5, 8       | w rezerwie | Blokuj kombi     | —                                             |

Odstęp na starcie: 6,5 m zderzak do zderzaka. Furgon ucieka, gdy straci kombi o ok. 15 kratek
(cały za przednią krawędzią).

**Plan rund** (`chase.plan`):

| runda | zdarzenie                                                                  |
| ----- | -------------------------------------------------------------------------- |
| 2     | auto cywilne na środkowym pasie przy przedniej krawędzi (przed furgonem)  |
| 3     | posiłki: radiowóz od tyłu na dolny pas, **200 mil/h**                      |
| 4     | notatka: Wektor zrzuca kolczatkę, gdy kombi jedzie za nim na jego pasie   |
| 5     | notatka: Tłok zrywa kabel wtrysku — MG wpisuje furgonowi 50 mil/h w oknie  |
| 6     | roboty drogowe na górnym i barykada na dolnym pasie — został środkowy      |

## Postacie niezależne

Statystyki wymyślone. Wektor: REF 7, Prowadzenie 6 (Wyścig 13 + 1k10), ciężki pistolet. Kamień:
pistolet maszynowy (od 72g2, decyzja MG; wcześniej karabin szturmowy) i ciężki pistolet, lekki
pancerz z hełmem. Piotrówna (do 21.11 Tłok): Unieruchomiona (skuta),
TECH 8, Naprawa pojazdów 6, Naprawa broni 6, Handel 5; „Kajdanki Militechu” w ekwipunku. Gil:
REF 7, Prowadzenie 5, ciężki pistolet. Szpak: strzelba. Portrety (21.11, `figures[].portrait`): Wektor — Avatar 14, Kamień — 44,
Piotrówna — 34 (tylko MG, kadr głowa i ramiona), Gil — 45, Szpak — 49. Notatki MG (📌 ❓ ⚠️ 💬 💰) — jak
w poprzednich wzorcach: o co chodzi, zanim ruszycie (skalowanie, kierowca drużyny), przebieg
rund, wstęp i okrzyki, zatrzymanie i zakończenia.

## Rozegranie 21.11 (72g1)

**Stół:** instancja E2E z punktu `role-start` (kampania „Nocna zmiana”), tymczasowy spec
`99-rozegranie/reklamacja-stol.spec.ts` (skasowany) postawił scenę ze wzorca i posadził w kombi
**Koleinę** (Nomada, REF 7, Prowadzenie 6, Moto 4 — gracz Damian, **Firefox**) za kierownicą
i **Brzytwę** (Solo, ciężki pistolet — gracz Ada, Chromium `[::1]`). MG w Chromium. Postacie
z `role-start` nie mają pancerza.

**Przebieg (8 rund):** R1 Kamień trafia Koleinę z karabinu (40 → 21). R1–R3 Brzytwa rozbija
tylną szybę furgonu (15 → 0) i trafia Wektora krytykiem, pancerz zatrzymuje. R2 plan: taksówka
na środkowym pasie — autopilot furgonu sam zjeżdża na górny pas, kombi za nim. R2 Kamień trafia
Brzytwę (40 → 11, Rana krytyczna). R3 plan: radiowóz wjeżdża; Koleina odpala Nitro i **taranuje**
furgon Pługiem (29 − OB 13 → furgon 50 → 34), wszyscy w furgonie z Raną krytyczną (Tłok też —
„sukces z kosztem”). R4 Wektor zrzuca kolczatkę z kokpitu, Koleina zdaje PT 17 (20). R5 plan:
Manewr Wektora na wezwanie — zdany 19 > 13. R6 plan: roboty i barykada; do R8 autopilot furgonu
zjeżdża na środkowy pas między nimi, radiowóz jedzie na barykadę. Wyścig: Koleina wygrała z Wektorem 6 z 8
(zrywy +1…+5); w R4 obaj z krytyczną porażką (naturalne 1).

**Co zadziałało:** Wyścig na kubku gracza i „Rzuć za gracza” MG (Moto 4 w rozkładzie), karty
planu w panelu decyzji (posiłki, przeszkody, notatki, „Zrobione”), autopilot omija przeszkody
i zmienia pasy, duch i miarka u gracza w Firefoksie, pytanie „Taranuj / Zwolnij za nim / Zmienię
plan”, Nitro dolicza się do „Jedź”, kolczatka z kokpitu NPC-a i automatyczny Test przy
przejeździe, „Cel za szybą” przy strzale w kabinę, auto bez „Jedź” jedzie samo na koniec tury.

**Błędy znalezione i naprawione w tej sesji:**

1. **Spóźniona inicjatywa rzucona we własnej turze oddawała rundę komuś, kto już grał**
   (MG: „problem z inicjatywą na początku walki występował już wcześniej”). Brzytwa bez
   inicjatywy dostała turę na końcu kolejki, rzuciła w niej 14 i usiadła nad Kamieniem (13) —
   `nextTurn` liczył od nowego miejsca i Kamień, a potem Koleina, grali rundę 1 drugi raz.
   Naprawa: `keepQueueForActiveSeat` (`realtime/combat.ts`) w `combat:roll`
   i `combat:set-initiative` zapisuje przed zmianą `resume` = to, dokąd kolejka i tak szła
   (wzór `lateRoundOneTurn`). Test `combat.test.ts` (pada bez poprawki).
2. **Manewr na wezwanie dla auta NPC-a (plan rund) nie miał u nikogo przycisku** — wiersz „MG
   wzywa / Wykonaj Manewr” w kokpicie był ukryty przed MG. Teraz MG widzi go przy kierowcy bez
   właściciela-gracza (`HudVehicle.tsx`); serwer i tak przyjmował Manewr MG bez kosztu.

**Wnioski z balansu (wprowadzone we wzorcu):**

- **Posiłki z prędkością pościgu nie dojeżdżają.** Radiowóz wjechał od tyłu ze 100 mil/h, a po
  Nitro i taranie kombi spadł prawie za tylną krawędź. Teraz wjeżdża z 200 mil/h.
- **Przeszkoda „8 m przed furgonem” stanęła przy krawędzi** — przed furgonem (x 10) było tylko
  6,5 m kadru. Furgon stoi teraz w x 12, przeszkody planu — przy przedniej krawędzi.
- **„Pomoc Tłoka” jako Gwałtowny skręt nic nie znaczyła** — Wektor (13) zdaje PT 13 zawsze poza
  krytyczną porażką (~10%). Teraz to notatka: MG zbija furgonowi prędkość do 50 mil/h w oknie
  „Pościg” (kombi zyskuje 2,5 m), a Kamień bije Tłoka zamiast strzelać.
- **Karabin Kamienia przeciw postaciom bez pancerza jest zabójczy** (19 i 29 obrażeń w dwóch
  trafieniach). Notatka „Zanim ruszycie” mówi: postacie bez pancerza — Kamień z pistoletu.
- **Rezerwa radiowozu na górnym pasie** — na dolnym stała na fladze startu drużyny.

**Decyzje MG (21.11, 72g2)** — pytania z rozegrania, w nawiasach odpowiedź:

- Karabin Kamienia przy dwóch startowych postaciach — zostawić z notatką czy dać mu na stałe
  pistolet maszynowy? (**pistolet maszynowy na stałe**; notatka „Zanim ruszycie”: mocnej
  drużynie MG daje Kamieniowi karabin na karcie)
- Nomada z Moto 4 wygrywa Wyścig z Wektorem (17 przeciw 13) średnio o 2 m na rundę i zdaje
  kolczatkę (PT 17) prawie zawsze — dla drużyny z Nomadą scena jest łatwa na drodze, trudna
  w strzelaniu. Notatka „Zanim ruszycie” tłumaczy skalę kierowcy; podnieść Wektora?
  (**Wektor zostaje przy 13**; notatka „Zanim ruszycie” podpowiada Prowadzenie 8 — Wyścig 15 —
  przy drużynie z Nomadą)
- Radiowóz z zamiarem „Blokuj” nie przebił się na pas kombi (środkowy zajmowała taksówka,
  autopilot zmienia pas o jeden na turę) — wystarczy, czy plan ma go wpuszczać na pas kombi?
  (**zostaje jak jest** — gdy radiowóz nie zdąży, to też wynik sceny)

## 72g2 — stały E2E i sprzątanie (✅ 21.11)

- [x] Stały E2E `48-poscig/t72g-reklamacja` na wzorcu (punkt `role-start`, Koleina-Nomada
      w Firefoksie, MG w Chromium): Wyścig z Moto 4 w rozkładzie i zrywem w kombi, Gwałtowny
      skręt z Moto (NOM-02), kolczatka z kokpitu MG i Test PT 17 z Moto przy dryfie na początku
      rundy 2, auto cywilne z planu na pasie furgonu i autopilot „Uciekaj”, który z niego
      zjeżdża, radiowóz z planu od tyłu na dolny pas z 200 mil/h; gracz bez planu i zamiarów.
- [x] Sprzątanie: martwy kod starej jazdy (`chaseMoveSquares`, `chaseDriftSquares`,
      `chaseDriftedCentre`, `chaseReturnCentre`, `cpredVehicleChase`, `cpredVehicleSpeed`,
      `cpredLostControlMove`) i jego testy; umowy `mapa` i `tura` przepisane pod etap 72;
      wpisy oględzin dryfu i czterech dróg w `zaleglosci.md` zamknięte jako zdezaktualizowane;
      podpowiedź „Zwykła jazda” w katalogu akcji mówi o Wyścigu.
- [x] Decyzje MG z listy wyżej wprowadzone we wzorcu; dwie zaległości z 21.11 rozstrzygnięte
      (okno „Pościg” domyślnie po lewej, „Po ruchu” bez zmian).
- [ ] Oględziny MG przy stole.
