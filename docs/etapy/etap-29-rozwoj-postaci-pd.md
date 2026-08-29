# Etap 29 — Rozwój postaci za Punkty Doświadczenia

**Faza:** H — Świat CP RED · **Wymaga etapów:** 07 (karta postaci), 25a (Rola i Umiejętności),
27c (druga strona karty)

> **Pochodzenie:** dopisany 29.08.2026 po audycie zgodności z podręcznikiem głównym (decyzja MG:
> „wciągnij do etapów"). Do tego dnia siedział w `POMYSLY.md` jako „największa dziura z audytu
> obok Zdolności Ról".

## Cel sesji

Kampania zyskuje awans. Dziś `improvementPoints` to goły licznik na karcie, a `multiplier` przy
umiejętnościach nosi komentarz „unused until stage 24" — postać po dziesięciu sesjach jest
dokładnie tą samą postacią, którą wyszła z kreatora.

## Zakres

- [ ] **Drabinka kosztów** (s. 410–411) — 60/120/180/…/600 PD za kolejny poziom, ×2 dla
      umiejętności podwójnych (to jest właśnie `multiplier`, który czeka od 25a)
- [ ] **Zakaz przeskakiwania poziomów** — z 3 na 4, nigdy z 3 na 5; wydatek walidowany
      w `shared`, nie w formularzu
- [ ] **Wydawanie PD z karty** — jeden ekran: co mogę podnieść, ile to kosztuje, ile mi zostanie
- [ ] **Przyznawanie PD po sesji** (s. 410) — MG wpisuje pulę, wg stylu gry; VTT nie zgaduje
- [ ] **Ślad w dzienniku** — co i kiedy podniesiono (24b ma już dziennik kampanii)
- [ ] **Wieloklasowość** (s. 143) — zmiana Roli przy Zdolności Specjalnej ≥ 4, nowa Rola startuje
      od poziomu 1, obie rosną dalej, na Ulicy widzi się nową. Karta ma dziś jedno `roleId`
      i jedno `roleAbilityRank`
- [ ] Testy: drabinka kosztów, odmowa przeskoku, pula po wydatku, druga Rola od poziomu 1

## Poza zakresem

- Podnoszenie Cech za PD — RAW tego nie przewiduje poza wyjątkami, których podręcznik nie
  tabelaryzuje
- Automatyczne przyznawanie PD za czyny w grze — MG wpisuje pulę sam (ta sama decyzja co
  przy Reputacji w 23c)

## Kryteria ukończenia

- [ ] Postać po sesji dostaje PD od MG i wydaje je na karcie bez ręcznej edycji liczb
- [ ] Próba przeskoczenia poziomu jest odmawiana zdaniem, nie milczeniem
- [ ] Druga Rola daje się dodać dopiero przy Zdolności Specjalnej ≥ 4 i startuje od poziomu 1

## Wskazówki techniczne

- `multiplier` przy umiejętności **już istnieje** w danych z 25a — to on decyduje o ×2, więc nie
  dokładaj drugiego pola
- Wieloklasowość zmienia kształt karty (`roleId` → lista), więc dotknie 25a, 27a i kreatora;
  to jest powód, dla którego siedzi tu, a nie w osobnym etapie
- Zdolność Specjalna Netrunnera jest jedyną z mechaniką (`netrun.ts`) — podniesienie jej
  poziomu musi tam natychmiast działać, i to jest test tego etapu, a nie etapu 30
