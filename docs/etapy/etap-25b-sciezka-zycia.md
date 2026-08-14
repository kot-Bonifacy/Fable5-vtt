# Etap 25b — Kreator postaci: Ścieżka Życia

**Faza:** H — Świat CP RED · **Wymaga etapów:** 25a, 10 (edytor botów)

> **Podział z 2026-08-14 (druga sesja tego dnia).** Pierwotne 25b niosło w jednym worku
> tabele Ścieżek Życia, ekwipunek startowy, dane opisowe z portretem, token przy ukończeniu
> i wroga przerabianego na bota. Sam pipeline lifepath to **71 tabel i 522 wiersze** czytane
> ze zrzutu PDF-a, w którym każda tabela jest jednym ciągiem tekstu — to rozmiar
> `parse-creation.py`, czyli pół sesji. Do tego MG dopisał do zakresu **poziomy dostępności
> przedmiotów**, które dotykają kompendium i sklepu z 23b, a więc kodu poza kreatorem. Etap
> został więc podzielony:
>
> - **25b** — Ścieżka Życia: tabele w pipelinie, krok kreatora z serwerowymi rzutami, pola
>   biografii na karcie, wróg/przyjaciel/miłość → szkic bota.
> - **25c** — wyposażenie startowe z poziomami dostępności, ksywa i portret, token przy
>   ukończeniu.

## Cel sesji

Narracyjna połowa kreatora: wędrówka Ścieżkami Życia z tabel podręcznika — kultura pochodzenia
i język, styl, rodzina, przyjaciele, wrogowie, tragiczne miłości, cel życiowy i osobna Ścieżka
każdej z dziesięciu Ról — a na końcu wróg, który jednym kliknięciem staje się szkicem bota.

## Decyzje przed kodem (14.08)

1. **Ogólna Ścieżka to pola, Ścieżka Roli to odpowiedzi.** Kultura, fryzura, tło rodzinne
   i reszta to te same czternaście rubryk na każdej karcie, więc dostają nazwane pola, które
   27c rozrysuje. Pytania Ról różnią się Rola od Roli (Nomadę pyta się o wielkość watahy,
   Netrunnera o partnera), więc siedzą jako pary pytanie–odpowiedź. Nazywanie 52 pól, z których
   każde wypełnia jedna Rola, byłoby złym interesem.
2. **Szkic i karta mają ten sam kształt** (`CpredLifepath`) — ukończenie kreatora to kopia,
   nie tłumaczenie.
3. **Ścieżka Życia nie blokuje „Utwórz postać".** Podręcznik traktuje rozdział jako zestaw
   wskazówek („Jeśli wylosujesz coś, co nie pasuje do twojej wizji Postaci, odpowiednio zmień
   wynik", s. 44), a MG robiący pięciu NPC-ów w wieczór ma zostać przy tempie z 25a.

## Zakres

- [x] **Tabele Ścieżek Życia w pipelinie** (`tools/import/parse-lifepath.py` → rozdział
      „Uliczne opowieści", s. 43–70 → `data/private/cpred/lifepath.json`):
  - **ogólna** — kultura pochodzenia i języki, osobowość, ubiór, włosy, znaki szczególne,
    co cenisz najbardziej, stosunek do ludzi, najważniejsza osoba, najważniejszy przedmiot,
    tło rodzinne, kryzys rodzinny, środowisko, przyjaciele, wrogowie (trzy kolumny),
    słodka zemsta, tragiczne miłości, cele życiowe — **19 tabel**
  - **rolowe** — po jednej Ścieżce dla każdej z 10 Ról, **52 tabele**
  - próbka **własnego autorstwa** w `data/public/cpred/lifepath.json`, żeby świeży klon miał
    działającą Ścieżkę bez podręcznika
- [x] **Silnik w `packages/shared`** (`systems/cpred/lifepath.ts`) — czyste funkcje z testami:
      odczyt tabel, wiersze zakresowe („1–2"), licznik grupy (1k10 − 7, minimum 0), zapis
      wyniku w polu / w wierszu listy / w odpowiedzi Roli, przycinanie przy zmianie Roli
- [x] **Pola Ścieżki Życia w `CpredCharacterData`** — dzielone z etapem 27c
- [x] **Krok „Ścieżka Życia" w kreatorze** — każdy wiersz to „wylosuj albo wybierz", plus
      „Rzuć całą Ścieżkę" jednym rzutem; język ojczysty wybiera się z listy wylosowanej kultury
- [x] **Losowania idą przez serwerowy silnik kości** (etap 06) i zostawiają kartę na czacie
- [x] **Wróg / przyjaciel / dawna miłość → szkic bota** — nazwa, powód zatargu i zemsta trafiają
      do profilu z etapu 10 jednym kliknięciem, edytor otwiera się od razu (tylko MG)

## Poza zakresem

- Wyposażenie startowe, poziomy dostępności przedmiotów, ksywa i portret, token przy
  ukończeniu (**25c**)
- Generator kompletnych NPC jedną akcją (POMYSLY.md), lifepath rozszerzeń, wydruk karty
- Dwie binarne decyzje z Ścieżek Ról („mam partnera / pracuję sam", „w zespole / solo") —
  parser czyta wyłącznie tabele kostkowe; te dwa pytania MG rozstrzyga słowem

## Kryteria ukończenia

- Pełne przejście kreatora od Roli do gotowej karty z biografią ze Ścieżki Życia
- Losowania w kreatorze idą przez serwerowy silnik kości i zostawiają ślad na czacie
- Wróg z lifepath przekształcony w szkic bota pojawia się w edytorze botów

## Wskazówki techniczne

- Pola Ścieżki Życia w `CpredCharacterData` **dzieli z etapem 27c** — 25b je definiuje,
  27c dokłada widok na stronie drugiej karty.
- Parser anchoruje tabele na słowie **„Wynik"**, nie na zdaniu „Rzuć 1k10 lub wybierz…" —
  tabela Wrogów nie ma tego zdania („rzucając raz w każdej kolumnie poniższej tabeli")
  i przy kotwiczeniu na zdaniu przepada bez śladu.
- Numery wierszy czyta się **po kolei** (najpierw `1`, potem `2` za nim), a każdy musi być
  poprzedzony spacją i zakończony wielką literą — to jedyne, co odróżnia numer wiersza od
  „(1k6/2) przyjaciółmi" i „odejmij 7, by sprawdzić".
- Kolumny sklejone bez separatora rozdziela się na szwie **mała→WIELKA litera**; szew ze
  spacją dopuszcza się dopiero, gdy sklejonych jest za mało (inaczej „Przedstawiciel Korpo"
  pęka na pół).
- Ostatni wiersz każdej tabeli wchodzi w tekst drukowany obok — obcinany jest po kształcie
  (pytanie, nazwa Roli kapitalikami, rozstrzelona zakładka `z e s p ó ł`, „patrz str. 329"),
  a czego kształt nie złapie, poprawia `manual-overrides.json` (jak `roleSkills` w 25a).
- Sesja zerowa z drużyną to najlepszy test tego etapu — zaplanuj ją po **25c**, gdy postać
  będzie wychodzić z kreatora z ekwipunkiem.
