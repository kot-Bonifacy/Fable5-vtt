# Etap 43a — Zakładka „Walka” z portretami, obrączka PW dla wszystkich, „Postacie” w dwa wiersze

**Status:** ✅ ukończony 26.09.2026 · **Faza:** UI stołu · **Wymaga etapów:** 14a–14e (walka), 16f (lewy panel), 27h (efekty mapy),
27j (żeton), 38a (statysta), 39 (efekty czasowe)

> **Pochodzenie:** zlecenie MG z 26.09.2026 — „zaprojektować ładniejsze przedstawienie walki
> w zakładce WALKA […] wyraźne portrety, które w zależności od obrażeń stają się od dołu do góry
> coraz bardziej czerwone […] z ikonami efektów” oraz „zakładka Postacie inaczej zorganizowana
> (dwa wiersze na postać), większy obrazek”. Dopisek w trakcie: „obrażenia powinno być też widać
> na tokenach”.

## Decyzje MG (26.09.2026, pytania zadane w sesji)

1. **Podział na trzy etapy:** 43a (ten), 43b (animacja trafienia: portret w zakładce, reakcja
   figury, iskry i odpryski, cięcie wręcz na mapie), 43c (plamy krwi zostające na mapie do końca
   walki, zapisane na serwerze). 43a robimy od razu, potem T4b.
2. **Układ zakładki „Walka”: lista z dużym portretem** — jeden wiersz na figurę: portret, imię,
   ikony efektów, budżet tury. Kolejność jak w kolejce.
3. **Czerwień na portrecie:** odsetek utraconych PW barwi portret **od dołu** czerwono-czarnym
   monochromem (40 % obrażeń = 40 % wysokości). **0 PW** (Śmiertelnie ranny) = cały portret
   czerwono-czarny; **czarno-biały dopiero przy naklejce „Martwy”**.
4. **Dokładny odsetek PW widzą wszyscy przy stole** — świadome odstępstwo od zasady „dane ukryte
   nie opuszczają serwera”: gracz dostaje dla cudzej figury ułamek i szczebel ran (**bez liczb
   PW**). Figury ukryte i schowane w mgle dalej nie jadą wcale.
5. **Na mapie: obrączka PW widoczna dla wszystkich** (dopisek MG) — ta sama, którą dziś widzi MG
   i właściciel; twarz na żetonie bez czerwieni. Górny pas kolejki i lewy panel bez zmian.
6. **Ikony na portretach:** naklejki stanów (bez „Poważnie/Śmiertelnie ranny” — to mówi
   czerwień), efekty czasowe na Cechach, chwyt i wstrzymana Akcja, kary z ran krytycznych
   („owes”).
7. **Inicjatywa znika z zakładki; jej narzędzia idą na górny pas** — rzut wszystkim / przerzut,
   rzut własnej inicjatywy gracza (kubek), ręczny wpis MG, remisy, przeciąganie kolejności.
8. **„Postacie”: portret na dwa wiersze; wiersz 1 — pełne imię i psychoza, wiersz 2 — rola ·
   właściciel tekstem i przyciski MG (⚄ ⊕ ✕); wybór właściciela chowa się pod kliknięciem.**
9. **Akcje grającego pod jego kartą** (uwaga MG w trakcie sesji: „nie podoba mi się rozdzielenie
   portretu z informacjami o danej postaci, które są dużo niżej”) — sekcja „Akcje — …” doklejona
   pod kartę tego, kto gra, w tej samej ramce, zamiast pod całą listą.

## Zakres

- [x] `TokenView.hpShare` (ułamek + szczebel) dla widza bez prawa do PW, liczony na serwerze;
      publiczne rozgłoszenie żetonu dostaje kartę powiązaną; test dymny (gracz ma `hpShare`,
      nie ma `hp`)
- [x] Obrączka PW na mapie z `hpShare`, gdy `hp` brak
- [x] Zakładka „Walka”: lista portretów z czerwienią od dołu, czarno-biały „Martwy”, ikony
      efektów, budżet tury; bez liczb inicjatywy
- [x] Górny pas: narzędzia inicjatywy MG i kubek gracza
- [x] „Postacie” w dwa wiersze
- [x] Oględziny: Chromium (MG) + Firefox (gracz), tryb nocny i dzienny

## Kryteria ukończenia

- Gracz widzi czerwień na portretach wszystkich widocznych uczestników i obrączkę PW na cudzych
  żetonach, a w danych gniazda nie ma liczb PW cudzych figur.
- MG rozgrywa inicjatywę (rzut, przerzut, remis, ręczny wpis, kolejność) bez zakładki „Walka”.
- Testy, ESLint, Prettier i `tsc --noEmit` czyste; aplikacja się uruchamia.

## Przebieg (26.09.2026)

- **Serwer:** `toTokenView` liczy PW raz i daje je jako `hp` (MG, właściciel) albo `hpShare`
  (reszta; `null` przy figurze bez PW — spread u klienta). Publiczne `token:upsert` dostaje kartę.
  `tokenHpShareOf` zaokrągla do setnych, ale żywa figura nie spada do 0, a draśnięta nie wraca do
  1; `tokenCondition` bierze stan z `hpShare`, gdy `hp` brak.
- **Mapa:** obrączka PW z `tokenHpShare(token)` — cudze figury też ją mają.
- **„Walka”:** `CombatantCard` + `WoundPortrait` (ramka 6,25 × 7,5 rem, kadr właściciela przez
  `usePortraitFrameStyle`), linia wody na granicy ran, do 4 ikon + „+N”; gracz widzi „Rany N%”,
  MG i właściciel „PW a/b”. Zniknęły: nagłówek rundy, „Rzuć/Przerzuć wszystkim”, remisy, liczby
  inicjatywy, przeciąganie wierszy, podpowiedź o kolejności.
- **Pas:** „Rzuć wszystkim” (tylko gdy ktoś nie ma inicjatywy), ⟳ przerzut wszystkim, „Remis”
  (przerzuca każdą grupę remisu; żetony w remisie mają przerywaną obwódkę), klik w liczbę —
  MG wpis, gracz kubek (🎲, póki nie rzucił), przeciąganie żetonów u MG. ▶ w Rundzie 0 ma nazwę
  „Start” (E2E).
- **„Postacie”:** karta w dwa wiersze z portretem 3,9 rem, `OwnerPicker`.
- **E2E T4a:** kubek gracza klikany na pasie (`Rzuć inicjatywę: …`), reszta nazw bez zmian.

**Oględziny:** Chromium (MG) i Firefox (gracz Mara) na „Test2”, noc i dzień w Chromium. Rany
cudzych figur u gracza obejrzane na widokach wstrzykniętych do magazynu (statysty stały pod mgłą,
więc serwer słusznie ich nie wysyłał); dostarczenie `hpShare` pilnuje test serwera.
