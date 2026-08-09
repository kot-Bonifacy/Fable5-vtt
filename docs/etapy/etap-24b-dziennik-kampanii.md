# Etap 24b — Dziennik kampanii dla stołu

**Faza:** H — Świat CP RED · **Wymaga etapów:** 19c (dziennik i streszczenia sesji), 24a (handouty)

> **Pochodzenie:** wydzielony z etapu 24 dnia 09.08.2026 (decyzja MG). Druga z trzech części.
> Etap 19c zbudował dziennik jako narzędzie MG i źródło dla botów; tutaj dziennik wychodzi
> do graczy i przestaje być płaską listą.

## Cel sesji

Dziennik przestaje być zakładką MG. Dostaje oś czasu, wyszukiwanie po treści i trzeci stan
widoczności — „pokaż graczom" — dzięki któremu streszczenie poprzedniej sesji trafia do drużyny.

## Zakres

- [ ] **Trzeci stan widoczności wpisu**: dziś `gm` / `bots`; dochodzi „widoczny dla graczy"
      (POMYSLY 08.08). Uwaga: to nie jest prosty trzeci szczebel — bot czyta przez tagi, gracz
      przez udostępnienie, więc zdecyduj, czy widoczność dla graczy jest **osobną flagą** obok
      istniejącej `visibility`
- [ ] **Zakładka „Dziennik" u gracza** — tylko wpisy oznaczone jako widoczne, tylko do odczytu
- [ ] **Oś czasu** zamiast płaskiej listy: grupowanie po dacie sesji, zwijanie starszych
- [ ] **Wyszukiwanie pełnotekstowe** po tytule i treści wpisów (SQLite FTS5 jest już w projekcie
      z etapu 19a — sprawdź, czy warto go tu reużyć, czy wystarczy `LIKE` na kilkudziesięciu wpisach)
- [ ] **Markdown w treści wpisu** — renderer z 24a
- [ ] **Powiązanie wpis ↔ handout**: wpis dziennika może wskazywać handouty (z 24a), a gracz
      widzi je jako odnośniki w treści
- [ ] Testy: filtr widoczności na żywych gniazdach, wyszukiwanie, migracja zgodna wstecz

## Poza zakresem

- Eksport dziennika do PDF, współdzielona edycja notatek przez graczy (POMYSLY.md)
- Zmiany w samym streszczaniu sesji (to jest domknięte w 19c)

## Kryteria ukończenia

- MG dopisuje wpis ręczny i oznacza go jako widoczny dla graczy — pojawia się u gracza
  w zakładce „Dziennik", a wpis nieoznaczony nie dociera do niego w żadnym payloadzie
- Dziennik pokazuje streszczenie ostatniej sesji na osi czasu; wyszukiwarka znajduje wpis
  po słowie z jego treści
- Wpis linkujący do handoutu otwiera ten handout u gracza, który go ma; u gracza bez
  udostępnienia odnośnik się nie pokazuje

## Wskazówki techniczne

- `JournalEntry.visibility` niesie dziś uprawnienie **botów** — nie przeciążaj go trzecim
  znaczeniem bez zastanowienia; osobna kolumna boolean bywa tu uczciwsza
- Wpisy dziennika jadą dziś wyłącznie do `gmRoom` (`realtime/journal.ts`) — kanał do gracza
  trzeba dopiero otworzyć, razem z filtrem w zapytaniu, nie po fakcie
