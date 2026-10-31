# Etap 66 — Sceny przykładowe („Pościg na wiadukcie”)

**Faza:** przed betą (zlecenie MG z 31.10 spoza planu) · **Wymaga etapów:** 65 (scena pościgu
i walka pojazdów), 49a (karta NPC-a ze statbloku), 17 (notatki warstwy MG)

## Skąd ten etap

MG (31.10): „zaprojektuj mi scenę pościgu na mapie [Neonowy wiadukt nad cyberpunkowym miastem]
i dodaj ją do nowej kategorii scen »przykładowe«. W tej kategorii będą gotowe sceny do testów lub
szybkiego użycia dla wszystkich MG”.

## Decyzje MG z 31.10 (pytania na starcie)

1. **Wzorce w repo.** Gotowa scena to katalog `data/public/scenes/<id>/` (`scene.json` + tło).
   Każdy MG widzi w panelu scen sekcję „Przykładowe” i „Dodaj do kampanii” robi jego **własną
   kopię**. Wzorca nie zmienia się z aplikacji, nowe dokłada się commitem.
2. **Mapa wiaduktu jest MG** — trafia do publicznego repo (`map.webp`, 1448×1086, 24×18 kratek).
3. **Gotowe starcie:** ustawiona droga, auto drużyny, auto wrogów z załogą (NPC-e z wymyślonymi
   statystykami, nie z podręcznika) i notatki MG z przebiegiem.
4. **Pościg tylko górną jezdnią** (pas jezdni 3–9 kratek).
5. **Wrogowie: gang Maelstrom.** **Drużyna ucieka.** **Skala: 1–2 postacie z botami** — jedno auto
   wrogów, trzech gangerów.
6. **Auto drużyny jest w scenie** (pojazd MG bez właściciela, kierownicę daje MG „Może prowadzić”).

## Zrobione ✅ (31.10)

- [x] Rdzeń `shared/src/scene-templates.ts`: format wzorca (`SceneTemplate`), `readSceneTemplate`
      (odmawia w całości — zepsuty wzorzec ma wysypać test, a nie zgubić auto przy stole),
      położenia w **kratkach**, kategoria `examples` („Przykładowe”), tło tylko spod
      `/public/scenes/`. Liczby systemu w nieprzejrzanych polach `system`.
- [x] System `shared/src/systems/cpred/scene-template.ts`: auto to `catalogIds` (alternatywy)
      + `upgrades`, NPC to statblok + sloty broni i pancerza z alternatywami. Pierwsza
      alternatywa, którą zna kompendium kampanii, wygrywa — wzorzec staje na VPS z katalogiem
      z `data/private` i na świeżej kopii repo z samą próbką. Braki idą do `missing`.
- [x] Serwer: `scene-templates.ts` (odczyt katalogów przy każdym otwarciu listy, bez restartu),
      `realtime/scene-templates.ts` — `scene:templates` (MG, lista) i `scene:from-template`
      (MG): jedna transakcja zakłada scenę, pojazdy MG, `SceneVehicle`, karty NPC-ów
      (`npcSheetFrom`), figury w fotelach i notatki MG. Kopia o zajętej nazwie dostaje numer.
- [x] Klient: zwijana sekcja „Przykładowe” pod listą scen (`ScenePanel.tsx`), opis wzorca
      w podpowiedzi wiersza, „Dodaj do kampanii” pokazuje nową scenę; braki kompendium —
      komunikat z listą.
- [x] Wzorzec `poscig-wiadukt`: droga w lewo (ruch prawostronny, górna jezdnia), tempo 40,
      1 m/kratkę, otwarta, Stop; „Kradziona taksówka” (sportowy, wyrzutnia kolczatki) z przodu,
      „Pickup Maelstromu” (sportowy, Wzmocniona konstrukcja, Pług bojowy) z tyłu z Szczęką
      (kierowca), Bolcem i Rdzą (herszt); miejsce startu na dolnej jezdni; trzy notatki MG
      (o co chodzi, zanim ruszycie, zwroty akcji).
- [x] Testy: `shared` (odczyt, odmowy, alternatywy, każdy wzorzec z repo czytelny i z tłem),
      serwer (lista tylko dla MG, zła nazwa, scena z autami i fotelami na próbce, druga kopia),
      macierz izolacji kampanii.
- [x] Oględziny w **Firefoksie** (Playwright, izolowana instancja E2E z `data/private`): lista,
      dodanie, bieżnia jedzie, fotele i podpisy, druga kopia „… 2”, bez braków w kompendium.

## Rozstrzygnięcia bez pytań (31.10)

1. **Tło wzorca nie jest kopiowane do kampanii** — scena wskazuje `/public/scenes/…`, które jedzie
   w obrazie Dockera i na każdej instalacji (`isOwnUploadUrl` je przepuszcza). Paczka ZIP sceny
   ani kampanii go nie niesie i nie musi.
2. **Każda kopia ma własne auta i karty** — dwie kopie wzorca nie dzielą pickupa.
3. **Ksywki NPC-ów bez dopisku „(Maelstrom)”** — długie podpisy nachodziły na siebie pod autem
   (oględziny); gang podaje notatka MG.
4. **Kierunek „w lewo”** — górna jezdnia w ruchu prawostronnym; MG zmienia go w Edycji sceny.

## Do oceny MG

- Przebieg starcia przy stole (siła gangu na 1–2 postacie, tempo 40, odstęp aut 5,5 kratki).
- Czy NPC-e mają mieć portrety (dziś kółka z inicjałem).
