# Etap 29b — Wieloklasowość

**Faza:** H — Świat CP RED · **Wymaga etapów:** 29a (jest czym zapłacić), 30a–30d (Zdolności,
które mają działać obok siebie)

> **Podział z 2026-08-30** — patrz `etap-29-rozwoj-postaci-pd.md`.

## Cel sesji

„W Czasie Czerwieni możesz zmienić Rolę zawsze, gdy poziom Zdolności Specjalnej poprzedniej
Roli wynosi co najmniej 4" (s. 143). Karta ma dziś jedno `roleId` i jedną `roleAbilityRank`,
więc Solo, który wszedł do watahy Nomadów, musi wybrać, którym z dwóch jest.

## Zakres

- [ ] **Lista Ról na karcie** — `roleId` przestaje być jedynym miejscem; bieżąca Rola zostaje
      tą, przez którą widzi cię Ulica, poprzednie zostają z własnymi rangami
- [ ] **Bramka zmiany Roli** — Zdolność Roli **bieżącej** ≥ 4; przy trzeciej Roli pyta się
      o drugą, nie o pierwszą
- [ ] **Nowa Rola startuje od poziomu 1** i kosztuje pierwszy szczebel drabinki Zdolności
      z 29a (60 PD)
- [ ] **Stare Zdolności rosną dalej i dalej działają** — „cały czas możesz podnosić poziom
      Zdolności Specjalnej poprzedniej Roli i korzystać z oferowanych przez nią korzyści"
- [ ] **`cpredRoleAbilityRank` pyta o wszystkie Role**, nie o jedną — to jeden punkt, przez
      który przechodzi wszystkie dziesięć Zdolności z etapu 30
- [ ] **Karta pokazuje kilka paneli Zdolności naraz** (Solo + Nomada to Zmysł Walki i Moto
      obok siebie)
- [ ] Testy: bramka ≥ 4 przy drugiej i trzeciej Roli, nowa Rola od 1, stara rośnie dalej,
      dwa panele naraz, statysta i kreator bez regresu

## Poza zakresem

- Zmiana Roli **bez** wieloklasowości (zwykła pomyłka MG przy tworzeniu karty) — to zostaje
  edycją pola u MG, jak dziś
- Ograniczenia fabularne, kto może zostać kim — podręcznik ich nie ma

## Kryteria ukończenia

- [ ] Druga Rola daje się dodać dopiero przy Zdolności bieżącej Roli ≥ 4 i startuje od
      poziomu 1
- [ ] Solo, który został Nomadą, ma na karcie działający Zmysł Walki **i** Moto
- [ ] Ulica (Reputacja z 23c, opis żetonu, karta) widzi Rolę nową

## Wskazówki techniczne

- `cpredRoleAbilityRank` bierze dziś `Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank'>`
  w dwunastu miejscach — najtaniej wprowadzić alias typu i podmienić go raz
- Statysta (`combatProfileSheet`) i pracownik zespołu z 30c budują pełną kartę: nowe pole
  wywróci kompilację obu, i o to chodzi
- Kreator z 25a nadaje jedną Rolę i tak zostaje — wieloklasowość zaczyna się po kreatorze
