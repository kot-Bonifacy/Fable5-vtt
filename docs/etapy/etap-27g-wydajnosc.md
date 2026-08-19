# Etap 27g — Wydajność

**Faza:** I — Wykończenie · **Wymaga etapów:** 27e, 27f (żeby mierzyć wersję docelową)

> **Podział z 2026-08-19** — patrz `etap-27d-kosci-kubek.md`.

## Cel sesji

Stół ma chodzić płynnie na sprzęcie graczy, a nie tylko na maszynie MG — i wchodzić szybko
przez łącze VPS-a, bo etap 28 stawia to wszystko za Caddym.

## Zakres

- [ ] **Re-rendery Reacta przy ruchu tokenów** — pomiar profilerem podczas przeciągania
      żetonu i podczas tury bota; selektory zustand zawężone tam, gdzie panel przerysowuje
      się bez powodu
- [ ] **Rozmiar bundle'a** — raport `rollup-plugin-visualizer`, lista największych pozycji
- [ ] **Lazy-loading ciężkich modułów** — `dice-box-threejs` (three.js + cannon-es) ładuje
      się już dynamicznie; do rozbicia zostaje okno Sieci, kreator postaci, screamsheety
      i edytor botów
- [ ] **Pixi: liczba `draw calls` i tekstur** przy scenie z kilkunastoma światłami, mgłą
      i eksploracją — 18b mierzył 160 fps przy 10 światłach, sprawdzić po dołożeniu 26f
- [ ] **Budżet pierwszego wejścia** — czas do pierwszego renderu stołu na zimnym cache

## Poza zakresem

- Optymalizacja pod wielu najemców i tysiące użytkowników (patrz `CLAUDE.md`: jedna sesja)
- Przepisywanie renderera mapy

## Kryteria ukończenia

- Przeciąganie żetonu nie przerysowuje paneli, które go nie dotyczą
- Wejście na stół nie ładuje kodu okna Sieci ani kreatora postaci
- Zmierzone i zapisane: rozmiar bundle'a przed i po, fps na scenie testowej
