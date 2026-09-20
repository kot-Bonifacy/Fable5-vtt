# Audio stołu — 20.09.2026

## Obsługa

- **Sygnał kubka:** Ustawienia → Gotowość rzutu → Sygnał kubka. Suwak 0–100
  i przycisk odsłuchu. Jeden odgłos przy aktywacji; wezwanie MG i przygotowany
  z niego Test mają wspólny identyfikator, więc przygotowanie nie dzwoni drugi raz.
  Sygnał słyszy tylko użytkownik swojego kubka. Nie zależy od animacji 3D.
- **Muzyka:** przycisk nut w górnym pasku. MG wgrywa MP3/OGG/WAV do 40 MB,
  wybiera utwór, pauzuje, wznawia, zatrzymuje, zapętla i ustawia głośność stołu.
  Każdy ma dodatkowy lokalny suwak. Biblioteka jest osobna dla kampanii.
- Przeglądarka może wymagać pierwszego kliknięcia/klawisza. Zablokowana muzyka
  pokazuje przycisk włączenia; oczekujący sygnał kubka zagra po geście tylko,
  jeśli ten sam rzut nadal czeka. Brak lub błąd audio nie blokuje gry.
- Odtwarzanie jednego utworu naraz, z domyślną pętlą. Po rozłączeniu muzyka
  milknie; po synchronizacji dołącza do wspólnej pozycji. Plik niezapętlony
  kończy się sam; ponowne „Odtwórz” uruchamia go od początku.

## Brzmienie i źródła

**Decyzja MG: naturalne odgłosy fizycznych przedmiotów, bez elektronicznych
powiadomień.** Dotyczy nowego sygnału i propozycji dalszego udźwiękowienia.

`public/notifications/cup-ready.wav` to 470 ms fizycznego nagrania kości
wrzucanych do kubka: **2BACH, Dice (3) in cup on table.wav**, CC0.
Źródło: https://freesound.org/people/2BACH/sounds/185971/.
Pełne pochodzenie i parametry obróbki: `public/notifications/ATTRIBUTION.md`.
Próbka jest w repo; prywatne podkłady MG pozostają w ignorowanym `uploads/music/`.

Inspiracja obsługą: osobne poziomy głośności i sterowanie utworami w
[playlistach Foundry](https://foundryvtt.com/article/playlists/).
Nie kopiujemy plików dźwiękowych Foundry.

## Propozycje czekające na decyzję MG

1. **Początek własnej tury** — dwa miękkie stuknięcia drewna; największa korzyść
   przy graczach patrzących poza mapę. Foundry ma tematy dźwiękowe początku walki,
   kolejnej i własnej tury: https://foundryvtt.com/article/settings/.
2. **Szept do gracza** — krótki szelest papieru, tylko u odbiorcy.
3. **Prośba o Test do MG** — pojedyncze stuknięcie o blat, tylko u MG.
4. **Przekazany handout lub przedmiot czekający na odbiór** — kartka przesunięta
   po stole lub brzęk przedmiotu; tylko u adresata.
5. **Otoczenie sceny** — deszcz, wiatr, ogień, ruch uliczny. Osobna warstwa
   od muzyki, ewentualnie zależna od miejsca jak ambienty Foundry:
   https://foundryvtt.com/article/ambient-sound/.

Nie włączono tych zdarzeń. Dokładne nagrania zostaną dobrane po wyborze MG,
z udokumentowaną licencją pozwalającą na umieszczenie ich w publicznym repo.

## Umowa techniczna

- `Campaign.music` zawiera JSON biblioteki i odtwarzania; migracja
  `20260920180000_campaign_music`. Zapis transakcyjny przez `updateMusic`.
- REST `POST /api/music/:campaignId/upload` przyjmuje pliki wyłącznie od MG,
  sprawdza limit i sygnaturę kontenera, nadaje losową nazwę.
- `music:control` wyłącznie MG; `music:request` dla członka stołu. Broadcast
  `music:state` ma własną rewizję, bez konsumowania `seq` czatu. Lista przyszłych
  utworów nigdy nie idzie do gracza; otrzymuje tylko bieżące odtwarzanie.
- Klient pomija stare rewizje i odpowiedzi innej kampanii. Czas serwera plus
  zegar monotoniczny klienta określają pozycję; synchronizacja co 5 s koryguje
  odchylenie >0,8 s. To wspólny podkład sesji, nie synchronizacja studyjna.
- `uploads-gc` uwzględnia biblioteki wszystkich kampanii; osierocony plik
  po usunięciu z listy podlega zwykłej godzinie łaski. Eksport kampanii zawiera
  `music`, a snapshot obejmuje bazę i `uploads/`.
- Oględziny UI i uruchomienie odsłuchu w Chrome; docelowy Safari/iPad oraz długi odsłuch
  muzyki przez dwóch ludzi pozostają do oceny przy stole.
