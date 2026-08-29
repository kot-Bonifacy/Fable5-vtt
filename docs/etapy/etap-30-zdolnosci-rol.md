# Etap 30 — Zdolności Specjalne dziewięciu Ról

**Faza:** H — Świat CP RED · **Wymaga etapów:** 07 (karta), 14b (ekonomia akcji), 15 (obrażenia),
16 (strzelanie), 25a (Rola na karcie)

> **Pochodzenie:** dopisany 29.08.2026 po audycie zgodności z podręcznikiem głównym (decyzja MG).
> Audyt nazwał go „największą nieodrobioną częścią podręcznika".

## Cel sesji

Rola przestaje być etykietą. Dziś mechanicznie działa **wyłącznie** Interfejs Netrunnera
(`netrun.ts`); `roleAbilityRank` pozostałych ośmiu Ról to liczba na karcie bez żadnego skutku —
dwie postacie tej samej Roli grają tak samo, a Solo na 6. poziomie Zmysłu Walki nie różni się
niczym od Solo na 1.

## Zakres

Dziewięć Zdolności z s. 144–161, każda z własnym rachunkiem:

- [ ] **Zmysł Walki** (Solo) — pięć osobnych efektów: Redukcja obrażeń, Błyskawiczna reakcja,
      Precyzyjny atak, Wykrycie słabości, Wyczucie zagrożenia
- [ ] **Medycyna** (Medyk) — Chirurgia, Kriosystemy, Farmaceutyka
- [ ] **Twórca** (Technik) — warsztat, ulepszenia, naprawa
- [ ] **Znajomości** (Fixer)
- [ ] **Moto** (Nomada)
- [ ] **Wsparcie** (Media), **Praca Zespołowa** (Netrunner — poza Interfejsem),
      **Wiarygodność** (Lawman/Exec wg podręcznika), **Efekt Charyzmy** (Rocker)
- [ ] Testy: każdy efekt osobno, na czystych funkcjach w `shared`

## Poza zakresem

- Wieloklasowość — jest w etapie 29 razem z rozwojem za PD
- Techniki Sztuk walki (wpis w `POMYSLY.md` z 30.07) — inna tabela, inny rozdział

## Kryteria ukończenia

- [ ] Każda z dziewięciu Zdolności ma skutek w grze albo **jawnie zapisane** w
      `decyzje-i-uproszczenia.md`, dlaczego zostaje prozą
- [ ] Poziom Zdolności na karcie zmienia wynik przynajmniej jednego rzutu albo jednej Akcji
- [ ] Zmysł Walki Solo działa w walce na mapie, nie tylko na karcie

## Wskazówki techniczne

- **To nie jest jedna sesja.** Dziewięć Zdolności to dziewięć niezależnych mechanik; przy
  planowaniu policz, ile z nich wchodzi realnie, i podziel na 30a/30b/… tak, jak podzieliło się
  26 i 27 — a nie odwrotnie
- Wzorzec jest gotowy: Interfejs Netrunnera pokazuje, jak poziom Zdolności wchodzi do rachunku
  (`netrun.ts`), a `CPRED_HOTBAR_NETRUNNER_ACTION_IDS` — jak Akcja trafia tylko do części figur
- Redukcja obrażeń Solo dotyka `resolveCpredDamage`, czyli tego samego wejścia, co `halvesArmor`
  z 29.08 — dokładaj **flagę na wejściu**, nie gałąź w silniku
