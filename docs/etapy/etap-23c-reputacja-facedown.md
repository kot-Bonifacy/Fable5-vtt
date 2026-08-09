# Etap 23c — Reputacja i Facedown

**Faza:** H — Świat CP RED · **Wymaga etapów:** 07 (karta postaci), 06 (silnik kości)

> **Pochodzenie:** wydzielony z etapu 23 dnia 09.08.2026 (decyzja MG). Trzecia z trzech części
> i jedyna, która nie zależy od 23a ani 23b — można ją zrobić w dowolnej kolejności po nich.

## Cel sesji

Sława na Ulicy dostaje liczbę i skutek. Postać ma Reputację z listą „skąd", a Facedown
rozstrzyga się rzutem przeciwstawnym na czacie, zamiast dyskusją przy stole.

## Zakres

- [x] **Reputacja na karcie** — wartość i lista źródeł (notatka „za co", data)
- [x] **Akcja Facedown** — rzut przeciwstawny wg zasad, karta na czacie z wynikiem i skutkiem
      dla przegranego
- [x] **Reputacja w rzutach społecznych** — tam, gdzie zasady jej używają jako modyfikatora
- [x] Testy: rozstrzygnięcie Facedownu, remis, wpływ Reputacji na wynik

## Poza zakresem

- Reputacja frakcji/gangów wobec drużyny (POMYSLY.md)
- Automatyczne przyznawanie Reputacji za czyny w grze — MG dopisuje ręcznie

## Kryteria ukończenia

- [x] Facedown między dwiema postaciami rozstrzyga się jednym rzutem przeciwstawnym na czacie
- [x] Reputacja widoczna na karcie ze źródłami, edytowalna przez MG

## Wskazówki techniczne

- Rzut przeciwstawny ma już wzorzec w 14d (Pochwycenie z „Broń się") — nie buduj drugiego

## Jak wyszło (09.08.2026)

**Polska nazwa Facedownu to „Konfrontacja"** (s. 193–194) i tak nazywa się w całym UI.

**Sprostowanie do zakresu:** punkt „Reputacja w rzutach społecznych" nie ma pokrycia w RAW —
Reputacja **nie jest** ogólnym modyfikatorem do Perswazji ani Wygadania. Podręcznik używa jej
w dokładnie dwóch miejscach i oba są zrobione: w Konfrontacji (`CHA + Reputacja* + 1k10`) oraz
w rzucie na rozpoznanie przy pierwszym spotkaniu (1k10 **niższe** od Reputacji = „znasz tę osobę").

**Cztery rozstrzygnięcia MG przed kodem:**

1. **VTT egzekwuje −2** — status „Onieśmielony" plus adres przeciwnika w `Token.statusData`;
   kara dokleja się sama do rzutów wymierzonych **w tego jednego** przeciwnika.
2. **Reputacja jest wyliczana z listy wyczynów**, nie wpisywana — RAW zastępuje ją tylko wyższą,
   więc osobne pole liczbowe byłoby drugim źródłem prawdy dla jednego faktu.
3. **Rzut na rozpoznanie wchodzi w zakres** (przycisk „Czy go znam?" w menu tokenu).
4. **Konfrontacja nie kosztuje Akcji** — podręcznik stawia ją *przed* walką i nie ma jej
   w katalogu akcji z 14b.

**Odstępstwo od decyzji 1, zgodne z RAW:** −2 **nie nakłada się automatycznie**. „Przegrany
może: Wycofać się… albo Nie wycofywać się, ale otrzymać modyfikator −2" — to wybór przegranego,
więc karta na czacie stawia mu dwa przyciski, a serwer zapisuje to, co kliknie.
