# Etap 50 — Start walki, prowadzenie figury i celowanie wzorem Foundry VTT

**Faza:** przed betą (zlecenie MG z 10.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
14 (inicjatywa), 16e (marsz klikiem), 16f (celowanie z paska), 35 (wiele figur), 43a (pas
inicjatywy)

## Skąd ten etap

MG (10.10): „zmień sposób rozpoczynania walki (na wzór Foundry VTT), bo obecnie MG zbyt często
się myli, sterując postacią, która ma atakować postać gracza. Przerób obecny system targetowania
i chodzenia, aby używając myszki nie dochodziło do tylu pomyłek”.

Jak było przed etapem:

- **Start:** „Włącz tryb turowy” zakładał kolejkę z samych figur graczy; NPC-ów MG dokładał
  osobno (menu figury, pasek grupy, zakładka „Walka”) — i to tylko, gdy walka już istniała.
- **Zaznaczanie:** MG steruje każdą figurą, więc zwykły klik w figurę gracza ją **zaznaczał**;
  atak wymagał `Alt`+klik przy broni w ręku. Nic nie zaznaczało się samo na początku tury.
- **Chodzenie:** klik w puste pole to marsz zaznaczonej figury — także figury gracza,
  zaznaczonej przypadkiem po poprzedniej pomyłce.

**Najczęstsze pomyłki przy stole (ankieta 10.10):** klik zaznacza zamiast atakować; NPC poza
kolejką.

## Decyzje MG z 10.10

1. **Start walki wzorem Foundry:** MG zaznacza figury (ramka / Shift) i przełącza je
   „⚔ W starciu” (menu figury, pasek grupy). Pierwsze przełączenie zakłada kolejkę w stanie
   „Przed walką” (runda 0). **Figury graczy są w starciu od razu**, NPC-ów MG dokłada.
   „Rozpocznij walkę” uruchamia rundę 1 i **NPC-om bez inicjatywy rzuca ją sam serwer**
   (gracze dalej rzucają kubkiem). **Przycisk ostrzega, gdy w kolejce nie ma żadnego NPC-a.**
2. **Na początku tury MG prowadzi figurę w turze:** w turze NPC-a zaznaczenie, kamera i pasek
   akcji przechodzą na nią same; w turze gracza MG nie prowadzi nic (klik tylko podgląda).
   Inną figurę MG bierze świadomie (np. z kolejki).
3. **Celowanie — hybryda:** w walce zwykły klik w dowolną figurę inną niż prowadzona to **cel**
   (bez `Alt`); do tego **trwały cel wzorem Foundry** — klawisz `T` nad figurą albo podwójny
   prawy klik; znacznik celu widzi stół.
4. **Chodzenie:** w walce marsz klikiem w puste pole dotyczy **wyłącznie prowadzonej figury**;
   każdą inną figurę MG dalej może przeciągnąć. Poza walką bez zmian.
5. **Broń + trwały cel:** klik broni na pasku przy wskazanym celu od razu ładuje kubek na ten
   cel (okno celowania jak dziś); bez celu broń tylko trafia do ręki.
6. **Trwały cel dostają wszyscy** (gracze też); dzisiejszy klik w cudzą figurę z bronią w ręku
   zostaje.

## Zakres

Trzy sesje, w kolejności zlecenia: 50a → 50b → 50c.

### 50a — start walki: „W starciu”, auto-inicjatywa NPC-ów, ostrzeżenie (✅ 10.10)

- [x] `combat:add` bez walki na scenie zakłada kolejkę „Przed walką” z figurami graczy
      i dodanymi figurami (Foundry: przełączenie stanu walki zakłada starcie)
- [x] Menu figury i pasek grupy: „⚔ Do starcia” / „Usuń ze starcia” **także bez walki**;
      menu działa na całą zaznaczoną grupę, gdy figura do niej należy
- [x] „Włącz tryb turowy” bierze figury graczy **i** zaznaczone figury
- [x] Znaczek „⚔” na figurach w kolejce (widzi MG)
- [x] Przejście z rundy 0 do 1 rzuca inicjatywę NPC-om (figura bez właściciela) bez wyniku
- [x] Pas inicjatywy w rundzie 0: przycisk „Rozpocznij walkę”, ostrzeżenie i drugi klik, gdy
      w kolejce nie ma NPC-a
- [x] Testy serwera; oględziny w Firefoksie

**Odstępstwa 50a:** przełącznik nazywa się „⚔ Do starcia” / „⚔ Usuń ze starcia” (menu figury,
pasek grupy), bez osobnego klawisza. Inicjatywę NPC-ów przy starcie serwer rzuca po cichu, jak
„Rzuć wszystkim” — bez kart na czacie. Przycisk w zakładce „Walka” to teraz „Załóż starcie (N)”,
a ▶ w rundzie 0 zastąpiło słowo „⚔ Rozpocznij walkę”. „Włącz tryb turowy” dokłada do drużyny
zaznaczoną grupę albo zaznaczoną figurę.

### 50b — MG prowadzi figurę w turze; klik w walce celuje; marsz tylko prowadzoną (✅ 10.10)

**Decyzje MG z 10.10 (pytania na starcie 50b):** blokada klikania działa **od rundy 1**
(w „Przed walką” MG zaznacza klikiem jak zawsze); kamera na NPC-u w turze **zawsze się
centruje** (także gdy figura jest w kadrze); w turze gracza pasek MG pokazuje **figurę gracza
w podglądzie**; klik w portret na pasie inicjatywy bierze figurę **tylko u MG**.

- [x] Zmiana tury: MG dostaje zaznaczenie i kadr figury NPC-a w turze; w turze gracza
      zaznaczenie MG schodzi
- [x] W walce u MG figury inne niż prowadzona zachowują się jak cudze u gracza: klik
      z bronią w ręku = cel (bez `Alt`), bez broni = podgląd; przeciąganie zostaje
- [x] Marsz klikiem w walce tylko prowadzoną figurą
- [x] Świadome wzięcie innej figury: klik w portret w pasie inicjatywy / pozycja menu
- [x] Skróty i podpowiedzi (`shortcuts.ts`) zaktualizowane; testy klienta, oględziny

**Odstępstwa 50b:** przejęcie z pasa to klik w cały kafel (poza polem inicjatywy), z przejazdem
kamery; pozycja menu „🕹 Prowadź tę figurę” kamery nie rusza (figura jest pod kursorem).
Zmiana tury przejmuje figurę tylko przy przejściu tury **w tej samej walce** — wejście na
scenę z trwającą walką i F5 zostawiają MG to, co miał. Z bronią w ręku cel rozstrzyga się
u MG dopiero przy puszczeniu przycisku (klik w miejscu = cel, przeciągnięcie = ruch figury),
bo inaczej figury z bronią w ręku nie dałoby się przesunąć. Świadome wzięcie to także `Shift`,
ramka, `Tab` i slot paska przy figurze w podglądzie. **Wyjątek od blokady:** figurę NPC-a w turze
klik dalej bierze — inaczej po `Esc` (zdejmuje zaznaczenie) MG nie miałby jej jak wziąć z mapy
(wyszło w E2E T4b). **Poza planem, znalezione na oględzinach:**
prawy klik w figurę (menu) wysyłał prowadzoną figurę marszem na jej pole — `clicked`
z `pixi-viewport` przychodził też dla prawego przycisku, a puszczenie lądowało na tle menu;
teraz klik w mapę to wyłącznie lewy przycisk (także poza walką).

### 50c — trwały cel (T, podwójny prawy klik), znacznik dla stołu, broń strzela w cel (✅ 11.10)

**Decyzje MG z 11.10 (pytania na starcie 50c):** cel należy do **figury-strzelca**, nie do konta
(każdy NPC prowadzony przez MG trzyma swój); **jeden cel na figurę**; stół widzi cel
**istniejącym grotem** strzelca — bez nowego znacznika na celu, kolor to obwódki, które już są;
**strzał celu nie zużywa** (schodzi przy zmianie sceny, końcu walki, skasowaniu figury, `T`).

- [x] `T` nad figurą i podwójny prawy klik przełączają cel prowadzonej figury
- [x] Ulotne zdarzenie celu rozsyłane tym, którzy widzą obie figury (wzór `token:aim`)
- [x] Grot strzelca stale na celu (u każdego, kto widzi obie figury); zejście przy zmianie
      sceny, końcu walki, skasowaniu figury
- [x] Klik broni na pasku przy wskazanym celu ładuje kubek na ten cel
- [x] Testy serwera (izolacja: ukryta figura nie wycieka), oględziny w Firefoksie

**Odstępstwa 50c:** zamiast „osobno dla każdego widza” — cel figury (decyzja MG 11.10), a zamiast
znacznika „w kolorze wskazującego” — grot strzelca; tylko prowadzący widzi u siebie bledsze
narożniki celownika na celu swojej figury. Cel żyje w pamięci serwera (nie w bazie): wraca
w `state:sync` po F5, ginie z restartem. `T` na prowadzonej figurze zdejmuje jej cel. Przy celu
**ponowny klik broni w ręku strzela znowu** zamiast ją odkładać (odkłada `Esc`); granat leci na
pole celu. Podwójny prawy klik łapie menu figury (pierwszy klik je otwiera, drugi trafia w jego
tło — `useDoubleRightTarget`, 400 ms). **Poza planem, z oględzin:** narożniki celownika liczone
od pola siadały na obrączce PW (od 12.09 wystaje poza pole) i były prawie niewidoczne — teraz
od `outerRadius`, także dla celownika pod kursorem. Gracz, który zobaczy obie figury dopiero po
ustawieniu celu, dostaje cel przy następnym `state:sync` (nie od razu).
