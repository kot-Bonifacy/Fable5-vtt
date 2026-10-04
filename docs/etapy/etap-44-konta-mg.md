# Etap 44 — Konta MG: wielu MG, izolacja kampanii, dwie sesje naraz, AI właściciela

**Faza:** przed betą (warunek bety, `testy.md` 7.2 pkt 7) · **Wymaga etapów:** 02, 03, 33 (wszystkie
ukończone) · **Części:** 44a → 44b → 44c → 44d · **Odbiór:** T9a (po 44b) i T9b (po 44d) — **oba zaliczone 04.10.2026** (`testy.md` 6.5)

> **Pochodzenie:** decyzje MG z 26.09.2026 przy projekcie testów (`zaleglosci.md`, pozycje 1, 2
> i 4; `testy.md` sekcje 2 i 11) i sesja projektowa 03.10.2026 (piąta tego dnia). Zlecenie MG:
> „teraz kolej na T9”. T9 jest odbiorem tego etapu, którego nie było w planie ani w kodzie, więc
> sesja go rozpisała.

## Stan wyjściowy (03.10.2026, z kodu)

- **Logowanie MG samym hasłem.** `POST /api/auth/login` bierze pierwszego `User` z `role = GM`.
  Konto zakłada i synchronizuje `.env` (`ensureGmUser` w `auth/seed.ts`, `GM_NAME` domyślnie
  `MG`, `GM_PASSWORD`).
- **`User.role` jest globalne, a `User.name` unikalne na całym serwerze.**
- **Jedna aktywna kampania na serwer** (`Campaign.active`, `getActiveCampaign` w ~30 plikach).
  `campaign:activate` przenosi **każde** podłączone gniazdo (`activateCampaign`, pętla po
  `io.sockets.sockets`).
- **Gracz to samo imię, bez hasła.** `POST /api/join/:token` z dowolnym ważnym linkiem kampanii
  i imieniem istniejącego gracza daje sesję jego konta. Przy jednym MG to nie szkodzi. Przy wielu
  MG to przejęcie cudzego konta (B1).
- **144 zdarzenia gniazda z `role: ROLE_GM` i 17 tras REST z `requireGm`/`gmOnly`** ufają każdemu
  MG wobec każdej kampanii. ~98 miejsc porównuje `campaignId` z kampanią gniazda, ale nikt nie
  sprawdza, czy MG jest właścicielem kampanii.
- **Kopie całej bazy** (`archive:list`, `archive:snapshot`) widzi każdy MG. Odtworzenie idzie
  z wiersza poleceń.
- **Jeden gateway** (`AI_GATEWAY_URL`), a `broadcastAiStatus` rozsyła status do wszystkich gniazd.
- **Uploady wymagają zalogowania, ale nie członkostwa w kampanii.** Katalogi
  `uploads/{maps,tokens,handouts,portraits,music}` są płaskie, bez kampanii w ścieżce.

## Decyzje MG

**Z 26.09** (zaległości, poz. 1, 2 i 4): otwarta rejestracja i własne hasło MG; każdy MG widzi
i steruje tylko swoim; aktywna kampania per MG; imienne linki graczy; pliki kampanii tylko dla jej
członków; kompendium z `data/private/` wspólne; **najwyżej dwie sesje naraz** (env, domyślnie 2),
a slot zajmuje start gry, nie logowanie; **prośba MG o AI właściciela**; właściciel to flaga
konta, a nie rola; AI obsługuje jedną kampanię naraz; kanał przez Tailscale. Paczka instalacyjna
AI dla innych MG jest **po becie** i poza tym etapem (zaległości, poz. 3).

**Z 03.10** (sesja projektowa, pytania zadane MG):

1. **Kolejność:** „Konta MG” idą **teraz**, a refaktoryzacja całości **po nich**. To korekta
   kolejności z 26.09, gdzie było odwrotnie. T9 dzieli się na T9a i T9b.
2. **Osobne konta MG i gracza.** `User.role` zostaje globalne: konto MG jest zawsze MG, a gra
   u innego MG to osobne konto gracza z imiennego linku. Właściciel trzyma co najmniej dwa konta,
   więc **flaga właściciela może stać na kilku kontach** (jego konto MG i jego konta graczy).
3. **Gracz: imienny link = klucz.** MG wystawia link dla konkretnego imienia. Pierwsze użycie
   zakłada konto i ciasteczko, a link się zużywa. Nowy komputer albo zgubione ciasteczko: MG
   wystawia temu graczowi **link odnowienia** do tego samego konta. Gracz nie ma hasła, a jego
   konto należy do jednej kampanii. **Imię jest unikalne w kampanii, nie na serwerze**, więc Kuba
   u MG-A i Kuba u MG-B to dwa konta.
4. **Zapomniane hasło MG:** właściciel w swoim panelu klika „Zresetuj hasło” i dostaje
   jednorazowy link ważny 24 h, który przekazuje MG poza VTT (Discord). Konto MG właściciela
   dalej bierze hasło z `GM_PASSWORD` w `.env`.
5. **Kopie całej bazy tylko dla właściciela.** Zwykły MG ma eksport swojej kampanii oraz import
   kart i scen, jak dziś. Import całej kampanii zostaje zadaniem Z10.
6. **Przygotowanie to nie sesja.** MG pracuje w dowolnej swojej kampanii bez slotu i jest wtedy
   przy stole sam. „Rozpocznij sesję” zajmuje slot i wpuszcza graczy na stół, a „Zakończ sesję”
   go zwalnia.
7. **Między sesjami gracz widzi kartę, bez stołu.** Ma swoją kartę, dziennik, handouty i czat do
   czytania. Nie ma mapy, ruchu, rzutów ani botów i nie zajmuje slotu. Kartę zmienia tylko tam,
   gdzie dziś wolno mu ją zmieniać bez MG.
8. **Bezczynność:** slot zwalnia się, gdy przy stole nie ma żadnego gniazda przez **15 min** albo
   gdy przez **3 h** nie było żadnego zdarzenia gry. Oba progi są w env.
9. **Zgoda na AI jest per konto MG** i obejmuje wszystkie jego kampanie, także przyszłe.
10. **AI dla innych MG wymaga obecności właściciela i przełącznika.** W panelu właściciela jest
    „Udostępniam AI”, domyślnie wyłączony po każdym wejściu. Działa tylko wtedy, gdy któreś konto
    właściciela ma otwarte gniazdo. Po zamknięciu ostatniego wyłącza się sam po 2 min (karencja na
    F5). Kampanie właściciela (z jego konta MG) używają AI bez przełącznika. Powód MG: nie chce,
    żeby podczas innej gry na jego PC jakiś MG dostał bez jego wiedzy dostęp do karty graficznej.
11. **Zajętość AI: pierwszy i „Przejmij”.** AI trzyma pierwsza trwająca sesja, która ma do niego
    prawo, aż do jej końca albo utraty prawa. Wtedy AI przechodzi na drugą uprawnioną sesję, jeśli
    taka trwa. Właściciel ma w panelu „Przejmij AI”: odbiera AI drugiej sesji bez cofania jej zgody,
    a tamten stół dostaje „AI zajęte przez inną sesję” i gra dalej bez botów.

## Podział i kolejność

| część | nazwa                                        | sedno                                                                                                          | wymaga |
| ----- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| 44a   | Konta MG: rejestracja, logowanie, właściciel | rejestracja, logowanie loginem, hasła, flaga i panel właściciela, `Campaign.gmId`, kopie tylko dla właściciela | —      |
| 44b   | Izolacja kampanii i imienne linki            | strażnik własności na 144 zdarzeniach i trasach REST, uploady per kampania, linki imienne                      | 44a    |
| 44c   | Sesje i sloty                                | przygotowanie a sesja, aktywna kampania per MG, limit dwóch, bezczynność, widok między sesjami                 | 44b    |
| 44d   | AI właściciela                               | prośba, zgoda, przełącznik i obecność, dzierżawa AI, „Przejmij”, brama przed gatewayem                         | 44c    |

**Kolejność sesji:** 44a → 44b → **T9a** (rejestracja, izolacja, uploady, linki, kopie,
kompendium) → 44c → 44d → **T9b** (dwie grupy naraz, AI właściciela, limit sesji) → refaktoryzacja
→ T10. Każda część zostawia `pnpm test:e2e` zielony: suitę poprawia ta część, która zmienia jej
założenia (logowanie w 44a, dołączanie graczy w 44b, start sesji w 44c).

**Między 44a a 44c serwer nie jest gotowy na wielu MG naraz:** aktywacja jest jeszcze globalna.
To stan wyłącznie na dev i nie jedzie na VPS.

## Poza etapem

Paczka instalacyjna AI (zaległości, poz. 3), e-mail i reset hasła pocztą, OAuth, 2FA, kwoty miejsca
na uploady per MG (`POMYSLY.md`), import całej kampanii (Z10).
