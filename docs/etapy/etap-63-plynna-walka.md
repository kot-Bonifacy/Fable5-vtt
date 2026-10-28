# Etap 63 — Płynna walka gracza

**Faza:** przed betą (zlecenie MG z 28.10 spoza planu) · **Wymaga etapów:** 14b (budżet tury),
16f/27h (pasek akcji), 43a (zakładka „Walka”), 55 (komunikaty), wezwanie Uniku i kubek obrażeń
(14.10, 17.10)

## Skąd ten etap

MG (28.10): „przebieg walki jest mało płynny z punktu widzenia zwykłych graczy. Gracz powinien
dostawać lepsze powiadomienie dźwiękowe, że teraz jest jego kolej (obecny dźwięk myli się
z czymś innym), komunikaty na czacie o tym, że teraz jest czas na rzut na trafienie, teraz na
obrażenia, a teraz na unik, zlewają się, nie wiadomo intuicyjnie, czy ma się jeszcze jakiś atak,
czy nie, unik powinien być checkboxem gdzieś na belce postaci, bo większość graczy zawsze go
używa, i powinien być wyrzucany automatycznie (przy zaznaczonym checkboksie, który domyślnie
powinien być zaznaczony)”.

Przed etapem: `turn.wav` i `request.wav` to to samo stukanie w drewno (JohnsonBrandEditing),
różnią się tylko liczbą stuknięć. Rzut na trafienie, Unik (pasek nad kubkiem) i obrażenia
(kubek) to trzy osobne wezwania i trzy karty na czacie. Budżet tury miał pipsy „Ataki”, ale slot
broni nie mówił nic o drugim strzale z SS 2.

## Decyzje MG z 28.10 (pytania na starcie)

1. **Dźwięk tury: cyberpunkowy sygnał** — wyjątek od zasady „naturalne odgłosy” (`docs/assety-audio.md`),
   tylko dla „Twoja tura”. Bez dużego napisu na mapie.
2. **Kroki ataku: jedna karta na czacie + pasek kroku** — karta ataku rośnie na żywo
   (① trafienie ✓ → ② Unik celu → ③ obrażenia), a nad kubkiem stoi pasek „Krok 3/3 · Rzuć
   obrażenia 3k6”.
3. **„Czy mam jeszcze atak”: kropki ataków na slocie broni i pulsujące „Kończę turę”**, gdy
   z tury nie zostało nic poza ruchem. Bez osobnego komunikatu po ataku.
4. **Auto-unik: bez Szczęścia, kości 3D lecą.** Serwer rzuca Unik sam od razu po trafieniu;
   kto chce dorzucić Szczęście, odznacza checkbox i rzuca ręcznie.
5. **Auto-unik dotyczy postaci graczy i botów-towarzyszy** (boty zawsze). Checkbox zapisany na
   karcie (przetrwa F5 i sesje), domyślnie zaznaczony. NPC-e MG bez zmian.
6. **Odskok przed eksplozją: ten sam checkbox** („Unik i Odskok automatycznie”).
7. **Miejsce checkboksa: pod banerem portretu** w lewym panelu.
8. **Podział: 63a → 63b → 63c**, jedna część na sesję.

## 63a — dźwięk tury, kropki ataków, pulsujące „Kończę turę” ✅

- [x] Slot broni ma `attacks: { left, max }` (`hotbarSlotsFor`, `weaponAttacksLeft`): `max` to 2
      dla pojedynczego strzału z broni SS 2, inaczej 1 (seria, ogień zaporowy, SS 1); `left`
      z budżetu tury, także u MG. Status albo rana, które zabrały Akcję, dają 0. Pusty magazynek
      nie (to odmowa slotu, nie budżetu). Null poza walką.
- [x] Pasek rysuje kropki (romby jak pipsy budżetu: zapalony = do wydania) przed licznikiem
      magazynka; `attacks` jest w `hudSignature`.
- [x] `cpredTurnExhausted` (`hotbar.ts`): Akcja wydana albo zabrana, Akcja Ataku bez miejsca
      na drugi strzał, Akcje Sieci wyczerpane, żaden rzut nie czeka. Metry się nie liczą.
- [x] „Kończę turę” (pełny i zwinięty) pulsuje jasnością (`hud-end-turn--done`; `clip-path`
      ścina poświatę), ale nie wtedy, gdy kubek trzyma jeszcze rzut gracza (obrażenia za
      trafienie, Unik, załadowany atak albo Test). Bez animacji przy `prefers-reduced-motion`.
- [x] Przy okazji: pipsy „Ataki” w budżecie gasną, gdy Akcja poszła na co innego albo zabrała
      ją rana (wcześniej świeciły 2/2 obok wydanej Akcji).
- [x] **Nowy dźwięk tury (28.10, druga część sesji)** — MG dostarczył własny plik: krótką
      zapowiedź głosową z ttsMP3.com (`tools/audio/turn-voice.mp3`, `prepare-natural.py
      --turn-only` → `turn.wav`, 0,62 s). FAQ serwisu pozwala na użycie bez podawania źródła;
      uznanie i tak w `ATTRIBUTION.md`. To nagranie w pliku, nie TTS w aplikacji — decyzja
      z 09.08 o głosie dotyczy mowy botów i poleceń, nie stałej próbki.
- [x] ~~Dźwięk z banków CC0~~ — dwa zestawy CC0 z OpenGameArt (bart „Interface beeps”, HaelDB „UI
      sounds”) i dwa pakiety Kenneya (Interface Sounds, Sci-fi Sounds, przez OpenGameArt)
      odsłuchane przez MG 28.10: **żaden nie pasuje**. Strona kenney.nl blokuje pobieranie
      spoza przeglądarki. Następny krok: MG wskazuje własny plik albo dalsze źródło; podmiana
      to `turn.wav` + wpis w `ATTRIBUTION.md` i `tools/audio` (skrypt, `sources.json`).

## 63b — auto-unik z checkboksem ✅

- [x] Karta ma `autoDodge?: boolean` — **brak pola znaczy „tak”** (domyślnie zaznaczony,
      karty sprzed etapu bez migracji); czyta `cpredAutoDodge`. Zwykła łata karty, także
      w walce (to nie rozwój postaci).
- [x] Checkbox „Unik i Odskok automatycznie” pod banerem portretu w lewym panelu
      (`AutoDodgeToggle` w `CombatHud.tsx`): tylko przy karcie z właścicielem i tylko dla
      właściciela albo MG. Bot-towarzysz i NPC go nie mają.
- [x] Serwer po karcie ataku sam rzuca Unik (pojedynczy cel) albo Odskok (wiersz wybuchu,
      stożka) za postać gracza z zaznaczonym polem i za bota-towarzysza (zawsze), bez
      Szczęścia, tą samą drogą co `attack:evade`; kości 3D lecą w kolorze kości właściciela
      (bot — MG). Także po „Popraw strzał” (`attack:smart`), gdy poprawka trafiła.
- [x] Karta niesie `autoEvasion` od zapisu, więc kubek, pasek wezwania, guziki „Unik” /
      „Odskocz” / „Bez uniku” i pulsowanie „czeka na mnie” nie mrugają przez sekundę lotu kości.
- [x] Nieudany rzut serwera (np. karta „czeka na gracza”) zdejmuje figurę z `autoEvasion`
      i woła obrońcę jak dawniej — obrażenia nie czekają bez końca.

**Rozstrzygnięcia bez pytań (63b):** checkbox widzi i zmienia też MG (sędzia zmienia każdą
kartę gracza); bot unika zawsze, także w trybie kontrolowanym (decyzja 5: „boty zawsze”);
NPC MG z kartą — bez zmian, mimo że MG mógłby chcieć auto-uniku i dla nich (do `POMYSLY.md`);
dopisek na karcie ataku jest ten sam co przy ręcznym Uniku („Unik X: 14 vs 16 → …”) — wygląd
kroków karty to 63c.

## 63c — jedna karta ataku i pasek kroku ✅

- [x] Karta ataku ma trzy kroki z numerem w kółku (`attackStepStates`, `attack-steps.ts`):
      ① trafienie (rzut strzelca przeciw PT), ② Unik albo Odskok celu, ③ obrażenia. Stany:
      zrobione, nieudane, „teraz”, czeka, nie dotyczy. Po pudle (bez obszaru) karta kończy się
      na ①; chybiony ładunek obszarowy idzie dalej. Ogień zaporowy kroków nie ma.
- [x] Odpowiedź obrońcy to pole karty, nie dopisek w `detail`: `RollAttackMeta.dodge`
      (pojedynczy cel) i `RollAreaTarget.jump` (wiersz wybuchu, stożka) — `{ name, total,
      luckSpent?, auto?, declined?, hit }`. „Bez uniku” MG to `declined`. Karty sprzed 63c
      zostają ze słowami w `detail`.
- [x] Rzut obrażeń i rozliczenia na celach wchodzą w krok ③ karty ataku w kanale klienta
      (`foldAttackCards`): serwer zapisuje je dalej osobno, filtr idzie za kartą ataku, a karta
      ataku dziedziczy „do mnie” z rozliczenia na mojej figurze. Rzut, którego atak nie doszedł
      do kanału, stoi sam.
- [x] Nad kubkiem pasek „Krok X/3 · …”: 1/3 „Rzuć na trafienie” (załadowany atak, poprawka
      naboju), 2/3 „Rzuć Unik: X (przebij N)” u obrońcy, 2/3 „Czeka na Unik: X” u strzelca,
      którego obrażenia czekają, 3/3 „Rzuć obrażenia 3k6”. Pasek i licznik Szczęścia stoją
      w jednej kolumnie, a lewy panel podnosi rezerwę, żeby „Kończę turę” nie chowało się pod
      nimi.

**Rozstrzygnięcia bez pytań (63c):** krok ② zawsze ma numer 2, także gdy cel nie może unikać
(„Cel nie unika”) — pasek zawsze liczy do 3, zgodnie z decyzją 2; pasek strzelca czeka także na
Unik rzucany przez serwer (sekunda lotu kości) zamiast znikać; rzut obrażeń w kroku ③ pokazuje
kości, sumę i plakietkę rany, bez osobnego nagłówka i godziny; dopisek „· sam” przy Uniku
rzuconym przez serwer.

## Kryteria ukończenia

- [x] Gracz słyszy przy swojej turze sygnał, którego nie myli z prośbą ani kubkiem.
- [x] Slot broni pokazuje, ile ataków zostało w tej turze; „Kończę turę” pulsuje, gdy nic poza
      ruchem nie zostało.
- [x] Unik i Odskok rzucają się same przy zaznaczonym (domyślnie) checkboksie pod portretem.
- [x] Atak to jedna karta na czacie z krokami, a nad kubkiem stoi „Krok X/3”.
- [x] Oględziny gracza w Firefoksie, testy zielone.
