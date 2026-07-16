# Etap 27 — Wdrożenie na VPS 🏁 Produkcja

**Faza:** I — Wykończenie · **Wymaga etapów:** minimum 01–03; pełny sens po 21 (TURN) — ale etap jest samodzielny i można go wykonać wcześniej, gdy zechcesz grać zdalnie

## Cel sesji

Produkcyjne wdrożenie na VPS (home.pl, 8 GB / 4 vCPU / Ubuntu 24.04): Docker Compose, HTTPS, Tailscale do lokalnego PC z LLM, automatyczne backupy, podstawowe utwardzenie.

## Zakres

- [ ] Obrazy produkcyjne: multi-stage Dockerfile serwera (Node) i klienta (build → statyki), `docker-compose.prod.yml`: serwer VTT, Caddy (reverse proxy + statyki klienta), coturn (TURN dla WebRTC), wolumeny (SQLite, uploads)
- [ ] Caddy: HTTPS automatyczny dla `vtt.tatanga.eu` (po delegacji DNS); do tego czasu wariant przejściowy `http://217.154.210.181:8088` — odnotuj, że mikrofon (STT) i WebRTC wymagają HTTPS, więc delegacja domeny to priorytet
- [ ] Tailscale: VPS i PC z GPU w jednym tailnecie; serwer VTT woła gateway po adresie tailnetowym (env); gateway nasłuchuje wyłącznie na interfejsie Tailscale; test degradacji — PC offline ⇒ boty offline, VTT działa
- [ ] Firewall (ufw): tylko 80/443 (+ zakres TURN), SSH po kluczu (bez hasła), fail2ban dla SSH
- [ ] Backupy automatyczne (cron/systemd timer): kopia SQLite przez `sqlite3 .backup` lub litestream, archiwum `uploads/` i `data/private/`; retencja (np. 7 dziennych + 4 tygodniowe); kopia off-site (rclone na dysk chmurowy lub pobieranie na PC domowy); **test odtworzenia** — obowiązkowy
- [ ] coturn skonfigurowany i wpięty w konfigurację ICE klienta (env z etapu 21); test głosu przez internet (dwie sieci — np. komputer + telefon LTE)
- [ ] Deploy powtarzalny: skrypt `deploy.sh` (pull → build → migracje → restart) + krótka instrukcja w `docs/DEPLOY.md`; zmienne środowiskowe prod w `.env.prod` poza repo
- [ ] Monitoring minimalny: healthcheck kontenerów, powiadomienie o padzie (choćby uptime-kuma lub cron+mail), monitoring miejsca na dysku
- [ ] Smoke test produkcji: pełna mini-sesja zdalna (mapa, tokeny, rzuty, karta, bot przez Tailscale, głos, STT)

## Poza zakresem

- CI/CD z automatycznym deployem (POMYSLY.md), skalowanie, CDN, WAF — skala prywatna

## Kryteria ukończenia

- Sesja działa pod `https://vtt.tatanga.eu` z dwóch różnych sieci: mapa+tokeny+rzuty+karta+czat oraz bot odpowiadający przez Tailscale i głos WebRTC przez TURN
- Wyłączenie domowego PC: boty i STT oznaczone offline, cała reszta działa
- Backup wykonuje się z harmonogramu, a odtworzenie z backupu na czystym katalogu podnosi działającą aplikację z danymi (przetestowane!)
- Porty poza 80/443/TURN/SSH zamknięte (skan `nmap` z zewnątrz)

## Wskazówki techniczne

- SQLite w kontenerze: wolumen na dysku hosta, `PRAGMA journal_mode=WAL`; backup NIGDY przez zwykłe `cp` działającej bazy — tylko `.backup`/litestream
- coturn: wymaga publicznego IP (jest) i zakresu portów UDP w ufw; ustaw `min-port`/`max-port` wąsko (np. 49160–49200)
- home.pl VPS: sprawdź, czy nic nie zajmuje portów 80/443 po instalacji systemowej; Docker + ufw potrafią się mijać (Docker omija ufw przy publikacji portów — publikuj tylko na 127.0.0.1 i wystawiaj przez Caddy)
- Ustaw automatyczne aktualizacje bezpieczeństwa (unattended-upgrades) i restart polityki kontenerów `unless-stopped`
