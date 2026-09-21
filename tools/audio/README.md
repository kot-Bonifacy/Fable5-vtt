# Narzędzia audio

Import YouTube pobiera **wyłącznie strumień audio**, konwertuje go do MP3
(128 kb/s) i dodaje do prywatnego `uploads/music/`. Limit: pojedyncze zakończone
nagranie do 2 godzin i 128 MB. Bez okna wideo, cookies przeglądarki ani konta YouTube.
Nie omija ograniczeń logowania, dostępu ani DRM. Niedostępny film daje błąd w UI;
stół i istniejące utwory pozostają sprawne.

## Instalacja na serwerze VTT

Python 3.10+ i istniejący Node.js 22+ z aplikacji. Z katalogu repo:

```powershell
python -m venv tools/audio/.venv
tools/audio/.venv/Scripts/python.exe -m pip install -r tools/audio/requirements.txt
```

Linux/VPS:

```sh
python3 -m venv tools/audio/.venv
tools/audio/.venv/bin/python -m pip install -r tools/audio/requirements.txt
```

`imageio-ffmpeg` dostarcza własny FFmpeg; nie jest potrzebna instalacja systemowa.
`yt-dlp[default]` instaluje solver EJS, który używa Node procesu VTT.
Serwer automatycznie szuka tej `.venv` w `tools/audio`; opcjonalny `AUDIO_PYTHON`
wskazuje inny interpreter z tymi zależnościami. Przy wdrożeniu trzeba dostarczyć
także `tools/audio/import_youtube.py` (poza bundlowanym JS serwera).
Wirtualne środowisko i pobrane utwory są ignorowane przez Git.

Wersje są przypięte w `requirements.txt`. Jeśli YouTube zmieni odtwarzacz,
zaktualizować yt-dlp wraz z jego zależnościami i sprawdzić krótki import.
Nie pobieramy programu ani solvera automatycznie podczas żądania gracza.

Źródła: [yt-dlp](https://github.com/yt-dlp/yt-dlp),
[obsługa EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS),
[imageio-ffmpeg](https://github.com/imageio/imageio-ffmpeg).

## Zachowanie

- MG: okno muzyki → link → „Pobierz dźwięk do biblioteki”. Nazwa pusta pobiera
  tytuł nagrania. Import działa w tle, pokazuje postęp i można go anulować.
- Jedno zadanie naraz na serwer. Zamknięcie okna go nie przerywa; otwarcie
  odczytuje status. Restart serwera przerywa zadanie, trzeba uruchomić je ponownie.
- Limit wykonania 15 minut, skończona liczba prób sieci; anulowanie zatrzymuje
  całe drzewo własnego procesu, również konwersję. Przejściowe pliki są usuwane.
- Plik jest dodawany do biblioteki dopiero po udanej konwersji, sprawdzeniu
  formatu i rozmiaru. Zmiana aktywnej kampanii odrzuca zapis końcowy.
- Gotowy MP3 podlega standardowym pauzie, pętli, synchronizacji, eksportowi,
  kopiom i GC muzyki. Do odtwarzania YouTube nie jest już potrzebny.

## Naturalne próbki

`sources.json` wymienia publiczne podglądy nagrań CC0. `prepare-natural.py`
wycina i normalizuje powiadomienia, a otoczeniom dodaje łagodne łączenia pętli.
Wymaga `numpy` i `soundfile`; nie są zależnościami serwera VTT.
