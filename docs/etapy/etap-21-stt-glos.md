# Etap 21 — STT: polecenia głosowe

**Faza:** G — Głos · **Wymaga etapów:** 11

## Cel sesji

Mowa na tekst po polsku: push-to-talk w przeglądarce, transkrypcja faster-whisper na GPU, tryby publiczny/szept do bota, uprawnienia per gracz.

## Zakres

- [ ] Gateway — moduł STT: faster-whisper **medium** na GPU; najpierw pomiar VRAM z działającym LLM **i z TTS z etapu 12** (jeśli TTS siedzi na GPU, rezerwa jest o 2–3 GB mniejsza niż zakładał etap 09) — jeśli ciasno, fallbacki w kolejności: medium int8 → small na GPU → medium int8 na CPU (4 rdzenie VPS to nie tu — CPU lokalnego PC); endpoint `POST /transcribe` (audio → tekst PL), kolejka niezależna od kolejki LLM i od kolejki TTS; model musi umieć się **wyładować na żądanie** (arbiter zasobów GPU z etapu 12 może poprosić o pamięć na czas syntezy mowy)
- [ ] Klient — push-to-talk: konfigurowalny klawisz (domyślnie np. `~`), nagrywanie MediaRecorder (opus/webm) przy wciśniętym, wysyłka po puszczeniu przez serwer VTT do gatewaya; wskaźnik nagrywania i „transkrybuję…"
- [ ] Tryby wyniku (wybór w UI obok wskaźnika PTT):
  - **publiczny** — transkrypcja jako wiadomość na czacie (z edycją przed wysłaniem — opcja „potwierdź przed publikacją" per użytkownik)
  - **szept do bota** — transkrypcja idzie prywatnie do wybranego bota (tryb z ankiety), odpowiedź bota szeptem
  - **komenda** — transkrypcja do pola czatu bez wysyłania (użytkownik dokańcza/zatwierdza)
- [ ] Uprawnienia: MG włącza/wyłącza polecenia głosowe per gracz i per sesja (zgodnie z ankietą)
- [ ] Degradacja: gateway/STT offline → przycisk PTT wyszarzony z komunikatem

## Poza zakresem

- Komunikacja głosowa graczy między sobą (etap 22 — WebRTC), rozpoznawanie intencji („rzuć za mnie na Handel" jako parsowana komenda — POMYSLY.md, wróci po etapie 20 jako złożenie STT+bot), transkrypcja ciągła bez PTT

## Kryteria ukończenia

- Przytrzymujesz klawisz, mówisz zdanie po polsku (z polskimi nazwami własnymi), puszczasz — tekst pojawia się w wybranym trybie w < 5 s
- Szept głosowy do bota: pełna pętla głos → transkrypcja → odpowiedź bota widoczna tylko Tobie (i MG)
- Gracz z wyłączonym uprawnieniem nie ma aktywnego PTT; równoległa transkrypcja i generacja LLM nie zakleszczają się
- Zmierzone i zapisane w `ai-gateway/README.md`: zużycie VRAM łączne (LLM + TTS + STT — pełny bilans karty, zaktualizowany po etapie 12), czas transkrypcji 10-sekundowej próbki
- PTT i mowa botów działają w tej samej sesji: transkrypcja w trakcie mówienia bota nie zakleszcza się ani nie wywala się na braku VRAM

## Wskazówki techniczne

- Wysyłaj audio po zakończeniu nagrania (nie streaming) — przy poleceniach 3–15 s prostota wygrywa; limit długości nagrania ~30 s
- faster-whisper: `language="pl"`, `vad_filter=True` (ucina ciszę), initial_prompt z terminologią kampanii poprawia nazwy własne
- Mikrofon w przeglądarce wymaga HTTPS lub localhost — w dev działa, na VPS zadziała po etapie 28 (odnotuj w POSTEP.md przy testach zdalnych)
