# Audio stołu — 21.09.2026

## Obsługa

- **Sygnał kubka:** Ustawienia → Naturalne powiadomienia. Suwak 0–100
  i przycisk odsłuchu. Jeden odgłos przy aktywacji; wezwanie MG i przygotowany
  z niego Test mają wspólny identyfikator, więc przygotowanie nie dzwoni drugi raz.
  Sygnał słyszy tylko użytkownik swojego kubka. Nie zależy od animacji 3D.
- **Muzyka:** przycisk nut w górnym pasku. MG wgrywa MP3/OGG/WAV do 40 MB,
  wybiera utwór, pauzuje, wznawia, zatrzymuje, zapętla i ustawia głośność stołu.
  Każdy ma dodatkowy lokalny suwak. Biblioteka jest osobna dla kampanii.
- **YouTube — sam dźwięk:** MG wkleja link i opcjonalną nazwę, wybiera „Pobierz
  dźwięk do biblioteki”, potem „Odtwórz”. Serwer pobiera strumień audio i zapisuje
  MP3 (128 kb/s); nie ma odtwarzacza ani okna wideo. Import w tle pokazuje postęp
  i ma przycisk anulowania. Obsługiwane pojedyncze zakończone filmy do 2 godzin
  i 128 MB. Nazwa pusta pobiera tytuł filmu. Link zapisany przez poprzednią
  wersję ma przycisk „Pobierz dźwięk” i po imporcie staje się MP3 w tym samym wpisie.
  Zakończone nagranie jest przechowywane prywatnie w `uploads/music/`; do jego
  odtwarzania nie jest już potrzebne YouTube. Błędy źródła nie blokują gry.
  Instalacja narzędzi na nowym serwerze: `tools/audio/README.md`.
- **Otoczenie:** okno muzyki → Otoczenie sceny. MG wybiera deszcz, wiatr, ogień,
  ulicę albo ciszę dla oglądanej sceny. Każdy słyszy własną oglądaną scenę;
  zapowiedzi nieaktywnej sceny MG nie trafiają do graczy. Osobny lokalny suwak
  pozwala wyciszyć otoczenie bez muzyki. Nowe i dotychczasowe sceny startują
  z ciszą, dopóki MG nie dobierze odgłosu.
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

## Dodatkowe dźwięki — wszystkie zatwierdzone i wdrożone 20.09

1. **Początek własnej tury** — dwa miękkie stuknięcia drewna; największa korzyść
   przy graczach patrzących poza mapę. Foundry ma tematy dźwiękowe początku walki,
   kolejnej i własnej tury: https://foundryvtt.com/article/settings/.
2. **Szept do gracza** — krótki szelest papieru, tylko u odbiorcy.
3. **Prośba o Test do MG** — pojedyncze stuknięcie o blat, tylko u MG.
4. **Przekazany handout lub przedmiot czekający na odbiór** — kartka przesunięta
   po stole lub brzęk przedmiotu; tylko u adresata.
5. **Otoczenie sceny** — deszcz, wiatr, ogień, ruch uliczny. Osobna warstwa
   od muzyki, przypisana do całej sceny. Inspiracja ambientami Foundry:
   https://foundryvtt.com/article/ambient-sound/.

Powiadomienia 1–4 są domyślnie włączone; każdy ma własny wyłącznik i odsłuch
w Ustawieniach → Naturalne powiadomienia. Używają wspólnego suwaka powiadomień.
Odtwarzają wyłącznie nowe zdarzenia, bez historii i synchronizacji; zmiana
budżetu Akcji nie powtarza sygnału tury. Nieodblokowana przeglądarka pomija
stare powiadomienia (wyjątkiem nadal oczekujący kubek).

Prawdziwe nagrania terenowe i przedmiotów, CC0: JohnsonBrandEditing (drewno),
keweldog (papier), kbnevel (monety), Rvgerxini (deszcz), Aeonemi (wiatr),
soundofsong (ogień), mzui (ulica). Dokładne strony autorów i adresy publicznych
podglądów: `tools/audio/sources.json`, uznania w
`packages/client/public/ambience/ATTRIBUTION.md`. Skrypt `tools/audio/prepare-natural.py`
dokumentuje wycinki, normalizację i półsekundowe połączenia pętli; bez syntezy
i zmiany wysokości. Pięć sygnałów WAV trwa 0,29–1,45 s, otoczenia 4,5–29,5 s.

## Umowa techniczna

- `Campaign.music` zawiera JSON biblioteki i odtwarzania; migracja
  `20260920180000_campaign_music`. Zapis transakcyjny przez `updateMusic`.
- REST `POST /api/music/:campaignId/upload` przyjmuje pliki wyłącznie od MG,
  sprawdza limit i sygnaturę kontenera, nadaje losową nazwę.
- `music:control` wyłącznie MG; `music:request` dla członka stołu. Broadcast
  `music:state` ma własną rewizję, bez konsumowania `seq` czatu. Lista przyszłych
  utworów nigdy nie idzie do gracza; otrzymuje tylko bieżące odtwarzanie.
- `POST/GET /api/music/:campaignId/youtube` rozpoczyna import/odczytuje status,
  `POST .../youtube/cancel` anuluje. Wszystkie wyłącznie MG, jeden import naraz.
  Walidacja domeny i jedenastoznakowego identyfikatora; helper dostaje kanoniczny
  adres YouTube, nigdy dowolny adres lub polecenie powłoki. Limit 15 minut,
  skończone próby sieci, anulowanie całego drzewa własnego procesu i sprzątanie
  katalogu tymczasowego. MP3 dodawany dopiero po weryfikacji formatu i rozmiaru.
  Wymagane [yt-dlp](https://github.com/yt-dlp/yt-dlp) i FFmpeg z imageio-ffmpeg;
  wersje przypięte w `tools/audio/requirements.txt`. Zainstalowane na dev.
  Stary link zachowany w bibliotece wymaga importu; `readMusic` pomija jego
  odtwarzanie, a serwer odrzuca próbę grania strony HTML jako audio.
- `Scene.ambience` zapisuje tylko identyfikator z białej listy, przez istniejące
  `scene:update` MG. Migracja `20260920210000_scene_ambience`, eksport/import sceny
  i kampanii zachowują wartość. Audio otoczenia nie importuje logiki CP RED.
- Dźwięki powiadomień powstają z już odfiltrowanych `chat:message`, `handout:open`
  i `combat:update`. Szept tylko do człowieka wskazanego jako adresat, prośba
  tylko u MG, otwarta propozycja przedmiotu tylko u właściciela karty odbiorcy.
- Klient pomija stare rewizje i odpowiedzi innej kampanii. Czas serwera plus
  zegar monotoniczny klienta określają pozycję; synchronizacja co 5 s koryguje
  odchylenie >0,8 s. To wspólny podkład sesji, nie synchronizacja studyjna.
- `uploads-gc` uwzględnia biblioteki wszystkich kampanii; osierocony plik
  po usunięciu z listy podlega zwykłej godzinie łaski. Eksport kampanii zawiera
  `music`, a snapshot obejmuje bazę i `uploads/`.
- Sprawdzone: rzeczywisty import krótkiego nagrania przez helper i most Node,
  wynik MP3 305 989 bajtów; uprawnienia MG, sprzątanie, anulowanie, uszkodzony
  wynik, eksport i GC w testach serwera. Chrome: włączone przełączniki i odsłuch
  sygnałów; istniejący link MG przekonwertowany do MP3 w tym samym wpisie,
  odtwarzanie i pauza bez filmu. Safari/iPad oraz odsłuch przez dwóch ludzi pozostają do oceny przy
  stole; automatyczne testy nie oceniają jakości brzmienia.
