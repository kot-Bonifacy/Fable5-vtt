# Wdrożenie VTT na VPS (etap 28 — próba)

Instrukcja dla VPS z `C:\AI\vps_home_pl_konfiguracja.md`: Ubuntu, `root`, projekty w `/opt/docker-apps/`,
Nginx Proxy Manager (NPM) na 80/443 z certyfikatami Let's Encrypt, IP `217.154.210.181`.

**Decyzje MG z 18.10.2026:**

- HTTPS robi **NPM**, a nie Caddy z planu etapu 28, bo porty 80/443 na VPS należą do NPM.
- NPM dochodzi do VTT **siecią Dockera**: `vtt-web:80`. Port 8088 jest związany tylko z `127.0.0.1`, więc VTT nie dokłada VPS-owi żadnego publicznego portu.
- Próba jest **bez botów**: boty pokazują się jako niedostępne. Tailscale to drugi krok (sekcja 9).
- Na VPS jedzie **kopia obecnej `dev.db`** razem z `uploads/` i `data/private/cpred/`.
- Rejestracja kont MG zostaje **otwarta** (`VTT_REGISTRATION=open`).

> **Dlaczego od razu HTTPS, a nie `http://IP:8088`:** klient używa `crypto.subtle` (kubek kości),
> `crypto.randomUUID` (kreator postaci) i `navigator.clipboard` (linki zaproszeń). Przeglądarka daje je
> wyłącznie w bezpiecznym kontekście (HTTPS albo localhost). Na gołym HTTP po IP te funkcje się wysypią.

## 0. Jak to stoi

```
przeglądarka ──HTTPS──▶ NPM (:443, Let's Encrypt)
                         │ sieć Dockera NPM (np. npm_default)
                         ▼
                   vtt-web (nginx:80)  ── statyki klienta (Vite build)
                         │ /api /uploads /public /socket.io
                         ▼
                   vtt-server (Node :3001) ── /data/{db,uploads,private,backups}
                                               = /opt/docker-apps/vtt-data/* na hoście
```

| Na VPS                                  | Co to                                                          |
| --------------------------------------- | -------------------------------------------------------------- |
| `/opt/docker-apps/vtt/`                 | klon publicznego repo (`git pull` przy aktualizacji)           |
| `/opt/docker-apps/vtt/deploy/.env.prod` | sekrety i wybory — **tylko na VPS**, nigdy w repo              |
| `/opt/docker-apps/vtt-data/db/`         | `vtt.db` (SQLite, WAL)                                         |
| `/opt/docker-apps/vtt-data/uploads/`    | mapy, tokeny, portrety, muzyka, `art/welcome-map.webp`         |
| `/opt/docker-apps/vtt-data/private/`    | `cpred/` — dane z podręcznika (66 umiejętności, kompendium)    |
| `/opt/docker-apps/vtt-data/backups/`    | kopie serwera co godzinę (baza + uploads), rotacja 24 + 14 dób |

Pliki w repo: `deploy/` (Dockerfile'e, `docker-compose.yml`, `nginx.conf`, `deploy.sh`,
`server-entrypoint.sh`, `pack-data.ps1`, `.env.prod.example`) i `.dockerignore`. Obrazy budują się
na VPS. Kontekstem jest korzeń repo, bo `packages/shared` to źródła TS współdzielone przez serwer i klienta.

Entrypoint serwera robi trzy rzeczy po kolei:

1. Odmawia startu bez `private/cpred/skills.json`, czyli nie zjedzie po cichu na 42 umiejętności z próbki.
2. Odmawia startu bez pliku bazy, gdy w `uploads/campaigns` leżą pliki (powód w sekcji 8).
3. Wykonuje `prisma migrate deploy`, a potem startuje serwer.

## 1. DNS (home.pl) — zrób najpierw, propagacja trwa do 1 h

Rekord **A**: `vtt` → `217.154.210.181` (czyli `vtt.tatanga.eu`). Sprawdzenie z PC:

```powershell
Resolve-DnsName vtt.tatanga.eu
```

## 2. Rozpoznanie VPS (raz)

```bash
ssh root@217.154.210.181
docker --version && docker compose version        # Compose v2 (polecenie "docker compose")
df -h /opt && free -h                             # build potrzebuje ~3 GB dysku i ~1,5 GB RAM
docker ps --format '{{.Names}}' | grep -i -E 'npm|proxy'
# nazwa sieci kontenera NPM (podstaw nazwę kontenera z linii wyżej):
docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' <kontener-npm>
```

Zapisz nazwę sieci (np. `npm_default`). Jeśli jest inna, wpiszesz ją w `.env.prod` jako `NPM_NETWORK`.

## 3. Kod na VPS

```bash
cd /opt/docker-apps
git clone https://github.com/kot-Bonifacy/Fable5-vtt.git vtt
chmod +x vtt/deploy/deploy.sh
```

## 4. Dane z PC na VPS

Na PC, w `C:\AI\web\VTT`. Serwer dev może chodzić, bo kopia bierze spójną migawkę przez `VACUUM INTO`:

```powershell
pwsh deploy/pack-data.ps1        # -> %TEMP%\vtt-deploy\vtt-data.tgz, na końcu "Skills ...: 66"
scp $env:TEMP\vtt-deploy\vtt-data.tgz root@217.154.210.181:/opt/docker-apps/
```

Archiwum ma ~60 MB. Niesie bazę (`db/vtt.db`), **cały** `uploads/` (z mapą powitalną) i `private/cpred/`.
PDF-y, podręcznik dla RAG i stare kopie zostają na PC. Gateway czyta podręcznik z dysku PC.

Na VPS:

```bash
mkdir -p /opt/docker-apps/vtt-data
tar -xzf /opt/docker-apps/vtt-data.tgz -C /opt/docker-apps/vtt-data
mkdir -p /opt/docker-apps/vtt-data/backups
chown -R 1000:1000 /opt/docker-apps/vtt-data     # uid użytkownika "node" w obrazie
ls /opt/docker-apps/vtt-data                     # backups db private uploads
rm /opt/docker-apps/vtt-data.tgz
```

**Od tej chwili źródłem prawdy jest VPS.** Gra na lokalnym `pnpm dev` dalej działa, ale niczego nie synchronizuje.
Ponowne wgranie kopii z PC nadpisze wszystko, co zdarzyło się na VPS.

## 5. `.env.prod`

```bash
cd /opt/docker-apps/vtt/deploy
cp .env.prod.example .env.prod && chmod 600 .env.prod
openssl rand -hex 32          # -> COOKIE_SECRET
nano .env.prod
```

Do uzupełnienia:

| Zmienna         | Wartość                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GM_PASSWORD`   | nowe, mocne hasło MG. **Wpisuje się na konto MG przy każdym starcie** (lokalne hasło z dev przestaje działać na VPS). |
| `COOKIE_SECRET` | wynik `openssl rand -hex 32`                                                                                          |
| `NPM_NETWORK`   | tylko gdy sieć NPM nie nazywa się `npm_default`                                                                       |
| `VTT_ADMIN_*`   | **zostaw puste** — skopiowana baza ma już konto `pantosz` z jego hasłem                                               |

Reszta (`CLIENT_ORIGIN=https://vtt.tatanga.eu`, `VTT_REGISTRATION=open`, kopie co 60 min,
`BOT_DECISION_LOG=` wyłączony) jest już ustawiona. Ścieżki, porty i `TRUST_PROXY=1` siedzą
w `docker-compose.yml`.

## 6. Pierwsze uruchomienie

```bash
cd /opt/docker-apps/vtt/deploy
./deploy.sh --no-pull        # pierwszy build: kilka minut
```

`deploy.sh` najpierw sprawdza `.env.prod`, `private/cpred/skills.json`, `uploads/art/` i sieć NPM, a potem
robi build, `up -d`, `ps` i czeka, aż serwer będzie `healthy`, a nginx odpowie na `127.0.0.1:8088`.
W logu serwera (`docker compose logs server | head -40`) powinno być `No pending migrations to apply.`
albo lista zastosowanych migracji. **Nie powinno być** `cpred rulebook data missing` ani `compendium missing`.

## 7. Nginx Proxy Manager

Panel `http://217.154.210.181:81` → Proxy Hosts → Add Proxy Host:

| Pole                  | Wartość                                                        |
| --------------------- | -------------------------------------------------------------- |
| Domain Names          | `vtt.tatanga.eu`                                               |
| Scheme                | `http`                                                         |
| Forward Hostname / IP | **`vtt-web`** (nazwa kontenera, nie IP — idzie siecią Dockera) |
| Forward Port          | **`80`**                                                       |
| Websockets Support    | **ON** (Socket.IO)                                             |
| Block Common Exploits | ON                                                             |
| SSL                   | Request a new certificate, Force SSL, HTTP/2                   |

To jedyne miejsce, gdzie VTT różni się od pozostałych projektów: one wskazują `217.154.210.181:808x`.
Jeśli NPM zwróci 502, kontener NPM nie widzi `vtt-web`: zła sieć w `NPM_NETWORK` (sekcja 2).

Po wdrożeniu dopisz VTT do `C:\AI\vps_home_pl_konfiguracja.md`: `vtt.tatanga.eu`, port 8088 (tylko localhost),
NPM → `vtt-web:80`, Websockets ON.

## 8. Smoke test próby

Z PC w Firefoksie, a gracza z **innej sieci** (telefon na LTE albo znajomy):

- [x] `https://vtt.tatanga.eu` — kłódka, ekran logowania; MG loguje się `MG` + nowym `GM_PASSWORD`
- [x] kampanie, sceny i mapy są te same co lokalnie; „Połączono” w pasku
- [x] karta postaci: **66 umiejętności**
- [x] gracz wchodzi linkiem zaproszenia (stare ciasteczka z `localhost` nie działają na nowej domenie, więc link „Kopiuj” z panelu graczy wysyłasz od nowa)
- [x] ruch tokenu widoczny u drugiej osoby na żywo; rzut kubkiem (animacja 3D); czat i szept
- [x] wgranie mapy lub portretu (sprawdza `client_max_body_size` i zapis do wolumenu)
- [x] gracz przy pustym stole widzi mapę powitalną, a nie „Brak aktywnej sceny”
- [x] boty i asystent: oznaczone jako niedostępne, reszta działa (ścieżka degradacji)
- [x] panel administratora jako `pantosz` (jego dotychczasowe hasło); rejestracja otwarta
- [x] po godzinie: `ls /opt/docker-apps/vtt-data/backups` pokazuje nową kopię `snapshot-…`

## 9. Krok drugi: boty przez Tailscale

Wykonane 18.10.2026: PC `komputer-pc` = `100.81.235.36`, VPS = `100.110.152.1` (ten sam tailnet).

1. Tailscale na PC (`winget install Tailscale.Tailscale`, logowanie z ikony w zasobniku) i na VPS
   (`curl -fsSL https://tailscale.com/install.sh | sh && tailscale up`). **Nie przerywaj `tailscale up`**
   przed zalogowaniem przez link. Sprawdzenie z VPS: `tailscale ping -c 3 <adres PC>`.
2. `ai-gateway/.env` na PC:
   - `GATEWAY_HOST=0.0.0.0`. Gateway startuje też bez Tailscale, a lokalny dev dalej chodzi na `127.0.0.1`.
   - `GATEWAY_API_KEY=<openssl rand -hex 32>`. **Klucz obowiązuje każdego, także localhost**, więc ten
     sam idzie do `packages/server/.env` (`AI_GATEWAY_API_KEY`) i do zmiennej użytkownika Windows
     `E2E_AI_GATEWAY_API_KEY` (suita E2E nie czyta `.env` serwera).
   - Zapora Windows (PowerShell jako administrator) wpuszcza 8100 tylko z puli Tailscale:
     `New-NetFirewallRule -DisplayName 'VTT AI Gateway (Tailscale only)' -Direction Inbound -Protocol TCP -LocalPort 8100 -RemoteAddress 100.64.0.0/10 -Action Allow -Profile Any`.
     Gdy Windows zapyta o dostęp dla `python.exe`, wybierz **Anuluj** — zgoda otworzyłaby port całej sieci lokalnej.
   - Restart gatewaya. `/chat` bez klucza ma oddać 401, `/health` zostaje otwarty.
3. W `deploy/.env.prod` na VPS: `AI_GATEWAY_URL=http://<adres PC>:8100` i `AI_GATEWAY_API_KEY=<ten sam klucz>`,
   potem `docker compose --env-file .env.prod up -d server`. Sprawdzenie bez wypisywania klucza:
   `awk -F= '/^AI_GATEWAY/{print $1, length($2)}' .env.prod` (oczekiwane 25 i 64).
4. Ruch z Dockera idzie przez `tailscale0` hosta:
   `docker exec vtt-server node -e "fetch('http://<adres PC>:8100/health').then(r=>r.text()).then(console.log)"`.
   W logu gatewaya na PC widać wtedy `GET /health` z adresu VPS co ~10 s.
5. Test degradacji: wyłączasz gateway lub PC, boty gasną w ciągu ~10 s, a stół gra dalej; po starcie gatewaya wracają same.

## Aktualizacja i wycofanie

```bash
cd /opt/docker-apps/vtt/deploy && ./deploy.sh
```

Skrypt robi kopię bazy z działającego serwera, potem `git pull --ff-only`, build i restart. Migracje
wykonuje entrypoint przed startem.

Wycofanie kodu: `git -C .. checkout <poprzedni-commit> && ./deploy.sh --no-pull`.
Jeśli nowsza wersja zdążyła wykonać migrację, cofnij też bazę (niżej).

## Kopie i odtworzenie

Serwer sam robi kopię przy starcie i co `BACKUP_INTERVAL_MINUTES` do `vtt-data/backups/` (baza przez
`VACUUM INTO` + pliki `uploads/`). Ręcznie:

```bash
cd /opt/docker-apps/vtt/deploy
docker compose --env-file .env.prod exec server node_modules/.bin/tsx scripts/snapshot.ts      # kopia teraz
docker compose --env-file .env.prod exec server node_modules/.bin/tsx scripts/restore.ts       # lista
```

Odtworzenie wymaga **zatrzymanego serwera**, a nazwę kopii wpisujesz ręcznie:

```bash
docker compose --env-file .env.prod stop
docker compose --env-file .env.prod run --rm --no-deps --entrypoint node_modules/.bin/tsx server \
  scripts/restore.ts snapshot-RRRR-MM-DD-GGMM
docker compose --env-file .env.prod up -d
```

> **Uwaga z próby lokalnej (18.10, Docker Desktop na Windows):** jedno z pięciu odtworzeń padło po
> zrobieniu kopii bezpieczeństwa i zostawiło brak bazy. Serwer wstał na pustej bazie, a sprzątacz `uploads-gc`
> skasował pliki starsze niż godzina. Do tego startowa kopia w tej samej minucie nadpisała kopię
> o tej samej nazwie. Stąd w entrypoincie bezpiecznik „brak bazy + pliki w `uploads/campaigns`
> = odmowa startu”. Zasady:
>
> - po odtworzeniu sprawdź, że wypisało `Przywrócono …`, **zanim** zrobisz `up -d`;
> - jeśli entrypoint odmawia startu, odtwórz bazę z `backups/przed-przywroceniem-…`
>   (kopia stanu sprzed próby: `cp …/db.sqlite /opt/docker-apps/vtt-data/db/vtt.db` przy zatrzymanym
>   serwerze, `chown 1000:1000`);
> - `VTT_ALLOW_EMPTY_DB=1` stosuj tylko świadomie (celowo czysta baza).

Kopia off-site — PC MG ściąga ją sam (od 18.10). Zadanie Harmonogramu „VTT pull backup” codziennie
o 23:30 (wyłączony PC nadrabia przy najbliższej okazji) puszcza `deploy/pull-backup.ps1`: najnowsza
kompletna kopia (z `manifest.json`, który serwer pisze na końcu) idzie przez `scp` do `D:\kopie-vtt\`,
skrypt sprawdza rozmiar bazy i liczbę plików z manifestem oraz `PRAGMA integrity_check`, zapisuje
`verified.txt` i trzyma 14 ostatnich. Dziennik: `D:\kopie-vtt\pull-backup.log`.

```powershell
pwsh deploy/pull-backup.ps1              # teraz, ręcznie
pwsh deploy/pull-backup.ps1 -Register    # (ponowna) rejestracja zadania
Get-ScheduledTaskInfo "VTT pull backup"  # LastTaskResult 0 = ok
```

Wymaga `ssh vps` kluczem z agenta Windows (Windows OpenSSH, nie `ssh` z Gita).

## Czego próba jeszcze nie robi (reszta etapu 28)

- [x] Tailscale i boty (sekcja 9, 18.10)
- [x] kopia off-site z harmonogramu — pobieranie na PC (`deploy/pull-backup.ps1`, 18.10)
- [ ] **test odtworzenia na VPS**
- [ ] utwardzenie: ~~SSH tylko po kluczu~~ (18.10: `/etc/ssh/sshd_config.d/00-hardening.conf`, klucz `id_ed25519_vps` w agencie Windows, alias `ssh vps`), fail2ban, unattended-upgrades. **ufw „tylko 80/443” nie da się
      włączyć bez zmian w innych projektach**, bo NPM przekazuje im ruch na publiczne `217.154.210.181:808x`.
      VTT żadnego portu nie wystawia. Decyzja o pozostałych to sprawa całego VPS.
- [ ] monitoring padu i miejsca na dysku; `nmap` z zewnątrz
- [ ] komunikat „stoję na próbce” w panelu MG (log już jest, entrypoint dodatkowo odmawia startu)
- [ ] import muzyki z YouTube nie działa w kontenerze (brak `tools/audio` i Pythona); wgrywanie MP3 działa

## Kłopoty

| Objaw                             | Co sprawdzić                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| 502 z NPM                         | `docker compose ps`; czy `vtt-web` jest w sieci NPM (`docker network inspect <sieć>`)        |
| serwer w pętli restartów          | `docker compose logs server` — odmowa entrypointu (brak `cpred` lub bazy) albo błąd migracji |
| „Rozłączono” / brak ruchu na żywo | Websockets Support w NPM                                                                     |
| 413 przy wgrywaniu                | plik > 64 MB (`deploy/nginx.conf`)                                                           |
| logowanie MG nie działa           | hasło to `GM_PASSWORD` z `.env.prod`, nie lokalne                                            |
| `permission denied` w `/data/...` | `chown -R 1000:1000 /opt/docker-apps/vtt-data`                                               |
| certyfikat się nie wydaje         | DNS jeszcze się nie rozpropagował (`dig vtt.tatanga.eu`)                                     |
