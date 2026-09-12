# Etap 28 — Wdrożenie na VPS 🏁 Produkcja

**Faza:** I — Wykończenie · **Wymaga etapów:** minimum 01–03 — etap jest samodzielny i można go wykonać w dowolnym momencie, gdy zechcesz grać zdalnie

## Cel sesji

Produkcyjne wdrożenie na VPS (home.pl, 8 GB / 4 vCPU / Ubuntu 24.04): Docker Compose, HTTPS, Tailscale do lokalnego PC z LLM, automatyczne backupy, podstawowe utwardzenie.

## Zakres

- [ ] Obrazy produkcyjne: multi-stage Dockerfile serwera (Node) i klienta (build → statyki), `docker-compose.prod.yml`: serwer VTT, Caddy (reverse proxy + statyki klienta), wolumeny (SQLite, uploads). **Bez coturn** — WebRTC wypadł z projektu 09.08.2026 razem z całą fazą G
- [ ] Caddy: HTTPS automatyczny dla `vtt.tatanga.eu` (po delegacji DNS); do tego czasu wariant przejściowy `http://217.154.210.181:8088`
- [ ] Tailscale: VPS i PC z GPU w jednym tailnecie; serwer VTT woła gateway po adresie tailnetowym (env); gateway nasłuchuje wyłącznie na interfejsie Tailscale; test degradacji — PC offline ⇒ boty offline, VTT działa
- [ ] Firewall (ufw): tylko 80/443, SSH po kluczu (bez hasła), fail2ban dla SSH
- [ ] **Przeniesienie `data/private/` na VPS jako krok deployu, nie ręczna czynność.** Cały pipeline z etapu 13 pisze do `data/private/` (gitignore), więc obraz zbudowany z repo **nie zawiera** ani 66 umiejętności, ani kompendium, ani danych kreatora, Ścieżek Życia i architektury Sieci. Katalog jedzie osobno (`rsync`/wolumen), a `deploy.sh` ma odmówić wdrożenia, jeśli go nie zastanie
- [ ] **Mapa powitalna gracza jedzie razem z `uploads/`.** Tło, które widzi gracz przy pustym stole (`uploads/art/welcome-map.webp`, 11.09.2026), jest poza repozytorium — darmowa mapa do użytku prywatnego, a repo jest publiczne. Obraz zbudowany z repo **go nie zawiera**, a brak pliku nie jest awarią: ekran po cichu wraca do zdania „Brak aktywnej sceny", czyli funkcja zniknie i nikt tego nie zgłosi. Wolumen `uploads/` ma więc nieść **cały** katalog, nie tylko to, co wgrał MG przez UI. Opis: `docs/assety-mapy.md`
- [ ] **Ostrzeżenie startowe „stoję na próbce".** `loadCpredRegistry` i `loadCompendium` (`packages/server/src/cpred.ts`, `compendium.ts`) celowo milczą, gdy plik prywatny nie istnieje — na dev to normalne, na produkcji oznacza cichy zjazd na dane przykładowe: **42 umiejętności z listy Easy Mode** zamiast 66 i wymyślone kompendium zamiast podręcznikowego. Serwer ma to powiedzieć raz, przy starcie (`log.warn` z listą plików, które wypadły), a panel MG — pokazać to MG
- [ ] Backupy automatyczne (cron/systemd timer): kopia SQLite przez `sqlite3 .backup` lub litestream, archiwum `uploads/` i `data/private/`; retencja (np. 7 dziennych + 4 tygodniowe); kopia off-site (rclone na dysk chmurowy lub pobieranie na PC domowy); **test odtworzenia** — obowiązkowy
- [ ] Deploy powtarzalny: skrypt `deploy.sh` (pull → build → migracje → restart) + krótka instrukcja w `docs/DEPLOY.md`; zmienne środowiskowe prod w `.env.prod` poza repo
- [ ] Monitoring minimalny: healthcheck kontenerów, powiadomienie o padzie (choćby uptime-kuma lub cron+mail), monitoring miejsca na dysku
- [ ] Smoke test produkcji: pełna mini-sesja zdalna (mapa, tokeny, rzuty, karta, bot przez Tailscale)

## Poza zakresem

- CI/CD z automatycznym deployem (POMYSLY.md), skalowanie, CDN, WAF — skala prywatna

## Kryteria ukończenia

- Sesja działa pod `https://vtt.tatanga.eu` z dwóch różnych sieci: mapa+tokeny+rzuty+karta+czat oraz bot odpowiadający przez Tailscale
- Wyłączenie domowego PC: boty oznaczone offline, cała reszta działa
- Backup wykonuje się z harmonogramu, a odtworzenie z backupu na czystym katalogu podnosi działającą aplikację z danymi (przetestowane!)
- Porty poza 80/443/SSH zamknięte (skan `nmap` z zewnątrz)
- Karta postaci na produkcji pokazuje **66 umiejętności**, a nie 42 z próbki — i gdyby kiedyś pokazała 42, log startowy mówi dlaczego

## Wskazówki techniczne

- SQLite w kontenerze: wolumen na dysku hosta, `PRAGMA journal_mode=WAL`; backup NIGDY przez zwykłe `cp` działającej bazy — tylko `.backup`/litestream
- home.pl VPS: sprawdź, czy nic nie zajmuje portów 80/443 po instalacji systemowej; Docker + ufw potrafią się mijać (Docker omija ufw przy publikacji portów — publikuj tylko na 127.0.0.1 i wystawiaj przez Caddy)
- Ustaw automatyczne aktualizacje bezpieczeństwa (unattended-upgrades) i restart polityki kontenerów `unless-stopped`
- `data/private/` nie da się odtworzyć z repo — pipeline importu (`tools/import/`) potrzebuje PDF-ów podręcznika, których w repo nie ma i nie będzie. Katalog jest **jedynym** miejscem, gdzie leżą dane CP RED, i dlatego stoi na liście backupów wyżej. Kolejność deployu: najpierw katalog, potem migracje, na końcu start serwera
