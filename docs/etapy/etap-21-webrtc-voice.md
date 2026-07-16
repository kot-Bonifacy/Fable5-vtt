# Etap 21 — WebRTC: czat głosowy graczy

**Faza:** G — Głos · **Wymaga etapów:** 03

## Cel sesji

Wbudowana komunikacja głosowa graczy: mesh P2P WebRTC z signalingiem przez Socket.IO. Pełny test przez internet dopiero po etapie 27 (TURN na VPS) — w tej sesji działa w LAN/localhost.

## Zakres

- [ ] Signaling przez istniejący Socket.IO: oferta/odpowiedź SDP + ICE candidates w pokoju kampanii; dołączanie/opuszczanie kanału głosowego niezależnie od bycia w sesji
- [ ] Topologia mesh P2P (każdy z każdym) — przy limicie ~5–6 uczestników zgodnie ze skalą z ankiety
- [ ] Panel głosowy: lista uczestników kanału, wskaźnik mówienia (analiza poziomu audio), mute własny, deafen, głośność per uczestnik (lokalnie)
- [ ] Wybór urządzeń: mikrofon/wyjście, zapamiętane per użytkownik; echo cancellation i noise suppression (constraints przeglądarki)
- [ ] STUN: publiczne serwery (Google) w konfiguracji; struktura konfiguracji ICE gotowa na coturn z etapu 27 (env)
- [ ] Obsługa zmian: reconnect socketa odbudowuje połączenia P2P; wejście nowego gracza spina go ze wszystkimi
- [ ] Rozdzielenie od PTT z etapu 20: osobne strumienie (PTT nagrywa do STT, kanał głosowy nadaje ciągle z mute) — sprawdź, że oba działają jednocześnie na jednym mikrofonie

## Poza zakresem

- SFU (mediasoup/LiveKit) — niepotrzebne przy tej skali; wideo; nagrywanie sesji; muzyka/ambient (ankieta: poza platformą); TURN/coturn (etap 27)

## Kryteria ukończenia

- Trzy przeglądarki (w tym jedna na innym urządzeniu w LAN) rozmawiają ze sobą; wskaźniki mówienia działają; mute faktycznie ucisza (potwierdzone u odbiorcy)
- Odświeżenie strony jednego uczestnika odbudowuje mu głos bez ingerencji pozostałych
- PTT do bota działa podczas aktywnego kanału głosowego
- W POSTEP.md odnotowane: „test przez internet — do wykonania po etapie 27"

## Wskazówki techniczne

- Czyste API WebRTC + własna, mała warstwa zarządzania peerami będzie czytelniejsza niż stare biblioteki (simple-peer nie jest już utrzymywany); trzymaj logikę peerów w jednym module
- `getUserMedia` wymaga HTTPS poza localhost — do testów LAN użyj `vite --host` + wyjątek przeglądarki albo lokalnego certyfikatu (mkcert)
- Perfect negotiation pattern (z dokumentacji MDN) oszczędza race conditions przy równoczesnym dołączaniu
