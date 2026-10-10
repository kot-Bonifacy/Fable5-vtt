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

### 50b — MG prowadzi figurę w turze; klik w walce celuje; marsz tylko prowadzoną

- [ ] Zmiana tury: MG dostaje zaznaczenie i kadr figury NPC-a w turze; w turze gracza
      zaznaczenie MG schodzi
- [ ] W walce u MG figury inne niż prowadzona zachowują się jak cudze u gracza: klik
      z bronią w ręku = cel (bez `Alt`), bez broni = podgląd; przeciąganie zostaje
- [ ] Marsz klikiem w walce tylko prowadzoną figurą
- [ ] Świadome wzięcie innej figury: klik w portret w pasie inicjatywy / pozycja menu
- [ ] Skróty i podpowiedzi (`shortcuts.ts`) zaktualizowane; testy klienta, oględziny

### 50c — trwały cel (T, podwójny prawy klik), znacznik dla stołu, broń strzela w cel

- [ ] `T` nad figurą i podwójny prawy klik przełączają cel (osobno dla każdego widza)
- [ ] Ulotne zdarzenie celu rozsyłane tym, którzy widzą obie figury (wzór `token:aim`)
- [ ] Znacznik celu na figurze w kolorze wskazującego; zejście przy zmianie sceny, końcu walki
- [ ] Klik broni na pasku przy wskazanym celu ładuje kubek na ten cel
- [ ] Testy serwera (izolacja: ukryta figura nie wycieka), oględziny w Firefoksie
