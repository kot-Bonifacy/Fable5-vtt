# Etap 24a — Handouty

**Faza:** H — Świat CP RED · **Wymaga etapów:** 04 (upload grafik), 03 (realtime i czat)

> **Podział (uzgodniony 09.08.2026):** pierwotny etap 24 obejmował naraz trzy niezależne
> funkcje — handouty z uploadem i udostępnianiem, przebudowę dziennika kampanii z 19c
> (oś czasu, wyszukiwanie, widoczność dla graczy) oraz generator screamsheetów na LLM
> z szablonem gazetowym. Wydzielono:
> [24b — dziennik kampanii dla stołu](etap-24b-dziennik-kampanii.md) oraz
> [24c — screamsheets](etap-24c-screamsheets.md).
> Handouty idą pierwsze, bo 24c „zapisuje i udostępnia jak handout", a 24b linkuje do handoutów.

## Cel sesji

MG podaje graczom materiał do ręki: grafikę (mapa dzielnicy, zdjęcie z monitoringu, wizytówka)
i/lub sformatowany tekst. Wybiera, kto go dostaje — i tylko ci go dostają, także w payloadach.

## Zakres

- [x] **Model handoutu**: tytuł, treść markdown, opcjonalna grafika z uploadu; jeden handout =
      jedna grafika + jeden tekst (oba pola opcjonalne, ale przynajmniej jedno musi być)
- [x] **Upload grafik** do `uploads/handouts/` — ta sama droga co mapy i portrety (etap 04)
- [x] **Udostępnianie**: MG zaznacza odbiorców (wszyscy / wybrani gracze) i cofa udostępnienie
- [x] **Zakładka „Handouty"** dla wszystkich przy stole — u gracza tylko to, co dostał
- [x] **Okno handoutu otwiera się samo** u odbiorców w chwili udostępnienia, a na czacie ląduje
      linia „MG udostępnił handout: «…»" widoczna wyłącznie dla odbiorców i MG
- [x] **Renderer markdown** w `packages/shared` (podzbiór: nagłówki, pogrubienie, kursywa, listy,
      cytat, linia pozioma, kod, linki) — bez `dangerouslySetInnerHTML` i bez nowej zależności
- [x] **Filtrowanie serwerowe**: gracz bez udostępnienia nie dostaje handoutu w żadnym payloadzie
- [x] Testy: parser markdown (`shared`), walidacja handoutu (`shared`), filtr udostępnień na
      żywych gniazdach (serwer)

## Poza zakresem

- Galeria wielu grafik w jednym handoucie, foldery/kategorie, podgląd z zoomem (decyzja MG 09.08)
- Dziennik kampanii i screamsheets — 24b i 24c
- Notatki graczy i współdzielona edycja (POMYSLY.md)

## Kryteria ukończenia

- [x] MG udostępnia handout-grafikę dwóm z trzech graczy — wyskakuje tym dwóm, trzeci nie widzi go
      nawet w payloadach (`handout:list` u trzeciego wraca bez tego wpisu)
- [x] Cofnięcie udostępnienia zdejmuje handout z zakładki gracza natychmiast, bez przeładowania
- [x] Tekst markdown renderuje się z nagłówkami i listami; treść z `<script>` w środku pokazuje się
      jako tekst, a nie wykonuje

## Wskazówki techniczne

- Handouty to te same uploady co mapy — reużyj mechanizmu z etapu 04 z osobnym katalogiem
- Okno handoutu: wzorzec pływającego okna z etapu 07 (`CharacterSheets`), nie modal blokujący
- Linia na czacie idzie wzorcem szeptu (`deliverChatMessageTo`) — jeden wiersz na odbiorcę, żeby
  historia po przeładowaniu pokazała ją tym samym ludziom
- Parser markdown zwraca **drzewo bloków**, nie HTML; klient renderuje je na elementy React

## Jak wyszło (09.08.2026)

**Trzy rozstrzygnięcia MG przed kodem:** okno u odbiorcy **otwiera się samo** (plus linia na
czacie), markdown renderuje **własny parser w `shared`** zamiast biblioteki, a zakres został
minimalny — jedna grafika plus tekst, płaska lista.

**Renderer nie tworzy HTML-u.** `parseMarkdown` zwraca drzewo bloków, `Markdown.tsx` zamienia
każdy węzeł na element React — nie ma `dangerouslySetInnerHTML` ani sanitizera. Przy handoutach
MG to wygoda; w **24c**, gdzie treść pisze model językowy, to będzie jedyna rzecz między stołem
a wstrzykniętym znacznikiem. `[kliknij](javascript:…)` przestaje być odnośnikiem i zostaje
tekstem (`isSafeMarkdownHref`).

**Udostępnienie jest zdarzeniem, nie stanem.** `handout:share` przyjmuje **pełną listę**
odbiorców i sam liczy różnicę: kto doszedł — dostaje okno i wiersz na czacie, kto już był —
nie dostaje nic. Bez tego dopisanie trzeciego gracza wyskakiwałoby dwóm pierwszym drugi raz.

**Kryteria 1 i 2 odhaczone na dwóch drogach:** filtr serwerowy i trafianie rozgłoszeń — 15
testami na żywych gniazdach (m.in. „trzeci gracz nie widzi handoutu nawet w payloadzie",
„powtórne udostępnienie nie wyskakuje temu, kto już ma", „cofnięcie zdejmuje tylko temu
jednemu"); **wygląd u gracza** — nieoglądany, bo wymaga drugiego profilu Chrome (ten sam powód
co przy 14b/14c). Lista w `POSTEP.md` → „Otwarte zaległości".

**Migracja `20260809145400_stage24a_handouts`:** `Handout` + `HandoutShare`. Udostępnienie
wisi na **koncie, nie na postaci** — handout czyta człowiek, więc gracz z dwiema postaciami
dostaje jedną kopię.
