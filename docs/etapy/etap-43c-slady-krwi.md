# Etap 43c — Plamy krwi zostające na mapie do końca walki

**Faza:** UI stołu · **Wymaga etapów:** 43b

> **Pochodzenie:** zlecenie MG z 26.09.2026, rozpisane w sesji 43a. **Tylko krew** — bez łusek
> i osmaleń (decyzja MG).

## Zakres

- [ ] Plama krwi pod figurą przy trafieniu z obrażeniami (wielkość rośnie z obrażeniami)
- [ ] Zapis **na serwerze, przy walce** (`Combat.systemState` albo osobna kolumna — do decyzji
      w sesji): widzi ją gracz po F5 i ten, kto dołączy w trakcie
- [ ] „Zakończ walkę” czyści plamy
- [ ] Plamy pod mgłą i zasłoną nie zdradzają, że ktoś tam oberwał

## Kryteria ukończenia

- Oględziny: plama przeżywa F5, znika z końcem walki.
- Testy dymne serwera, lint czysty.
