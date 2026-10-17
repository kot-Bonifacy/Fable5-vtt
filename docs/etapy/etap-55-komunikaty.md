# Etap 55 — Komunikaty wzorem Foundry: jeden kanał nad mapą, jedna skóra

**Faza:** przed betą (zlecenie MG z 17.10 spoza planu) · **Wymaga etapów:** 54 · **Stan:** 🟨
55a zrobiony 17.10, 55b do zrobienia (plan spisany tego samego dnia; MG zlecił etap przed
refaktoryzacją, jak 53 i 54).

## Skąd ten etap

MG (17.10): komunikaty wyskakujące graczom stoją w różnych miejscach ekranu i każdy wygląda inaczej
— ujednolicić. Spis z 17.10 (stan przed etapem):

| gdzie                                      | co                                                                      | wygląd                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| góra-środek nad mapą `.map-placement-hint` | „Ruch graczy: Stop”, stawianie figury, „X celuje…”, legenda śladów stóp | ciemny panel mapy, zaokrąglony, ramka akcentu / czerwieni          |
| czat: `chatStore.addNote` (~100 wywołań)   | odmowy ruchu, ataku, drzwi, Sieci, figur, kubka; „Złap oddech…”; sesja  | szara notka w strumieniu — bez otwartej zakładki czatu niewidoczna |
| lewy panel                                 | `.hud-refusal` pod slotem, baner „Tura tej figury”                      | bursztyn 12% / czerwony pasek ze ściętym rogiem                    |
| przy kursorze                              | `.aim-tooltip` z czerwoną odmową                                        | ciemny dymek                                                       |
| lewy dół nad mapą                          | wezwanie do Uniku `.evasion-prompt`                                     | papier panelu, gruba pulsująca czerwona ramka                      |
| prawy górny róg                            | dok wymiany z `.trade-notice`, u MG toasty „Czeka na MG”                | bursztynowy tekst / ciemny wiersz z paskiem akcentu                |
| w oknach                                   | `.net-run-notice`, odmowy kart obiektów, `auth-error`                   | każdy inny                                                         |

## Decyzje MG z 17.10

1. **Jeden kanał wzorem `ui.notifications` z Foundry** — wszystkie krótkie komunikaty w jednej
   kolumnie, **na górze-środku nad mapą** (tam, gdzie stał baner Stop). Stany trwałe (Stop,
   stawianie, celowanie, legenda śladów, postój marszu) to przypięte wiersze tej samej kolumny.
2. **Notki lokalne wychodzą z czatu** — podpowiedź dla jednej osoby nie jest zapisem gry. Czat
   zostaje dla rozmowy i kart serwera (karta „Odmowa” dalej zapisuje odmowę dla MG).
3. **Skóra: pasek HUD w kolorze rodzaju** — jak „Tura tej figury”: pełne tło w kolorze rodzaju,
   nagłówek wersalikami, ścięty róg, pęknięcia tuszu.
4. **Znikanie:**
   - komunikat z przyciskami (osłona, Ludzka tarcza, „Otwórz kreator”, „Otwórz kartę”) — **po
     wyborze** gracza albo ✕;
   - odmowa bez przycisku — przy **następnej próbie w tym samym temacie** (udana zamyka, nieudana
     podmienia) albo ✕;
   - informacja bez wyboru („MG rozpoczął sesję”, „Usunięto ścianę — Ctrl+Z cofa”) — **sama po
     kilku sekundach** (najechanie wstrzymuje) albo ✕;
   - stan przypięty — razem ze stanem.
5. **MG dostaje ten sam kanał** — te same komponenty służą obu stronom.
6. **Dźwięk tylko przy odmowie i wezwaniu** (komunikat z przyciskami), naturalny, z głośnością
   powiadomień z ustawień.
7. **Zakres — wzorem Foundry (decyzja przekazana):** do kanału idzie wszystko przejściowe, niezależnie
   od okna, z którego przyszło (notki, banery, odmowy po kliknięciu w oknach). Na miejscu, tylko
   w nowej skórze, zostaje to, co jest stanem albo dotyczy pola: zdanie pod slotem HUD, „Czeka na
   MG” (lista spraw z „Przejdź”), błędy przy polach formularzy, dymek celowania, wezwanie do Uniku.
   W czacie zostaje wszystko o botach (ślady akcji, „🤖 X: …”, „nie odpowiada”), wyniki i błędy
   komend `/…` (gracz pisze wtedy w czacie) oraz „Wczytywanie historii”.

## 55a — kanał, skóra, notki z czatu, banery nad mapą, dźwięk

- [x] Magazyn `noticeStore` + funkcje `notifyInfo` / `notifyRefusal` / `notifyChoice` /
      `clearNotices(topic)` / `noteAck(topic, ack, text)` (`notices.ts`), z testami (podmiana
      w temacie, czas informacji, przyciski zamykają, limit kolumny).
- [x] `NoticeColumn` na górze-środku `.map-area` i na plakacie „Między sesjami”; przypięte wiersze
      z `MapArea` (Stop, stawianie, celowanie, legenda śladów). `.map-placement-hint` znika.
- [x] Skóra `.notice` (`styles/21-notices.css`, tokeny w bloku „MAPA — zawsze noc”, pęknięcia
      w `chrome.css`), `prefers-reduced-motion`.
- [x] Przeniesienie wywołań `addNote` do kanału z tematem; boty i komendy `/…` zostają w czacie.
- [x] Marsz: `onWalkNote` podmienia temat `move`, ruszenie figury go zamyka.
- [x] Dźwięk odmowy i wezwania (`notices.ts` → `playNaturalNotification`), plik naturalny CC0
      z uznaniem.
- [x] E2E: `chatLine` i specy, które czytały `.chat-note` / `.map-placement-hint`, czytają kanał.
- [x] Oględziny: gracz w Firefoksie (Playwright), MG w Chromium.

## 55b — odmowy w oknach i skóra komunikatów na miejscu

- [ ] Odmowy po kliknięciu w oknach do kanału: Sieć (`net-run-notice`), Wymiana / sklep
      (`trade-notice`, `inventory-message`, `cp-shop-message`), karty obiektów sceny, zegar,
      panele kart (`setError` po `ack`).
- [ ] Nowa skóra (ten sam rodzaj, kolor i nagłówek) dla: `.hud-refusal`, `.evasion-prompt`,
      `.aim-tooltip-refusal`, `.gm-attention-toast`, błędów pól (`auth-error`, `creator-error`).
- [ ] Umowa w `ui` i oględziny jak w 55a.

## Rozstrzygnięcia przy implementacji 55a (17.10)

- **Tematy** (`NoticeTopic`): `move`, `attack`, `action`, `target`, `token`, `scene`, `net`,
  `exchange`, `check`, `table`, `clock`, `session`, `character`. „Następna próba w temacie” to
  `noteAck` (zgoda zamyka, odmowa podmienia) albo `clearNotices` tam, gdzie próba nie ma `ack`
  (kubek załadowany atakiem, figura ruszyła, cel marszu odwołany).
- **Kolory:** czerwień — odmowa, bursztyn — uwaga, pytanie i stan (Stop, „kliknij jeszcze raz”,
  „Złap oddech”), czerń z czerwonym brzegiem — informacja. Celowanie zostaje czerwone (atak).
  Pęknięcia tuszu tylko na czerwieni — na czerni jasne rysy wyglądały jak kurz, a nocne ciemne
  brudziły bursztyn (oględziny w Firefoksie).
- **Dźwięk:** odmowa — `refusal.wav`, dwa szarpnięcia zamkniętej klamki (CC0, OpenGameArt,
  Cough-E; `tools/audio/sources.json`); pytanie — istniejący `request.wav` (stuk w blat). Zgoda MG
  na postać i przyjęcie postaci grają dalej swój `handout`, więc ich paski milczą (`silent`).
  Seria kliknięć dzwoni raz na 0,7 s.
- **Odmowa z budżetu tury** (`CPRED_TURN_PROBLEM_MESSAGES`) staje teraz także na pasku gracza —
  karta „Odmowa” na czacie zostaje zapisem dla MG; pasek to nie czat, więc dubla nie ma.
- **„Ruch graczy: Stop”** nie dokłada odmowy pod przypiętym paskiem z tym samym zdaniem
  (`noteMove` w `MapArea`).
- Najwyżej 4 paski naraz (najpierw ustępuje najstarszy bez przycisków); to samo zdanie odświeża
  wiersz i liczy czas od nowa; zmiana kampanii czyści kanał.

## Poza zakresem

- Historia komunikatów (Foundry jej nie ma; zamknięte zdanie wraca przy następnej próbie).
- Statyczne podpowiedzi przy polach (`*-hint`) — to nie komunikaty.

## Kryteria ukończenia

- Gracz i MG widzą każdy przejściowy komunikat w jednej kolumnie nad mapą, w jednej skórze; czat
  nie dostaje już notek lokalnych poza botami i komendami.
- Znikanie zgodnie z decyzją 4, dźwięk zgodnie z decyzją 6.
- Testy jednostkowe kanału, lint, `tsc`, `theme.test` / `a11y.test` czyste; E2E `@szybkie` zielone
  oraz specy dotknięte zmianą selektorów.
- Oględziny w Firefoksie (gracz) i Chromium (MG).
