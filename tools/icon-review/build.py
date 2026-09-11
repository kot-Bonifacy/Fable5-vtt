#!/usr/bin/env python3
"""Buduje samodzielny plik HTML do przeglądu ikon VTT.

Po co: ikona ma znaczenie, a nie tylko wygląd — „granatnik” musi wyglądać jak
granatnik, nie jak wyrzutnia rakiet. Ten skrypt zbiera wszystkie 57 plików SVG
z trzech katalogów, wkleja je do jednej strony razem z opisem „do czego to
służy” i daje MG przełącznik OK / do zmiany. Wynik eksportuje się jako gotowa
paczka (prompt + JSON + kod SVG) dla modelu, który narysuje zamienniki.

Plik wynikowy jest **samodzielny**: wszystkie sylwetki siedzą w nim wklejone,
więc otwiera się z dysku (file://) bez serwera i bez sieci.

Uruchomienie:  python tools/icon-review/build.py
"""

from __future__ import annotations

import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HUD = ROOT / "packages/client/public/icons/hud"
UI = ROOT / "packages/client/public/icons"
STATUS = ROOT / "data/public/cpred/status-icons"
OUT = pathlib.Path(__file__).resolve().parent / "przeglad-ikon.html"

BG_RECT = '<path d="M0 0h512v512H0z"/>'

# --------------------------------------------------------------------------
# Trzy sposoby rysowania — i trzy różne wymagania wobec pliku.
# --------------------------------------------------------------------------
TECH = {
    "mask": {
        "label": "maska CSS",
        "hint": (
            "Rysowana jako maska CSS (HudIcon → background: currentColor). Liczy się "
            "wyłącznie alfa: kolor w pliku jest bez znaczenia, a każdy nieprzezroczysty "
            "piksel stanie się kolorem tekstu. Plik NIE MOŻE mieć prostokąta tła — "
            "zakryłby całą ikonę jednolitą plamą."
        ),
        "bg": False,
    },
    "tint": {
        "label": "sprite z barwieniem",
        "hint": (
            "Rysowana przez Pixi jako sprite barwiony `tint`-em na mapie. Biała "
            "sylwetka, przezroczyste tło — prostokąt tła zakryłby mapę pod ikoną."
        ),
        "bg": False,
    },
    "sprite": {
        "label": "sprite / <img> bez barwienia",
        "hint": (
            "Rysowana jeden do jednego: jako sprite nad cudzą grafiką na mapie i jako "
            "<img> w panelu. Dlatego — jako jedyna grupa — ZACHOWUJE czarny prostokąt "
            "tła z game-icons: biała sylwetka bez podkładu zniknęłaby na jasnym żetonie."
        ),
        "bg": True,
    },
}

# --------------------------------------------------------------------------
# Katalog ikon: co każda ma przedstawiać i gdzie widać ją w aplikacji.
# „should” to zdanie dla modelu rysującego — opis rzeczy, nie obecnego pliku.
# --------------------------------------------------------------------------
Icon = dict

SECTIONS: list[dict] = [
    {
        "id": "bron",
        "title": "Panel postaci — sloty broni",
        "lead": (
            "Kafel broni w lewym panelu. Sylwetkę wybiera <code>cpredWeaponIcon()</code> "
            "na podstawie typu broni z kompendium — 20 typów podręcznikowych mapuje się "
            "na 19 sylwetek (dwa rodzaje pistoletu dzielą jedną). Pod ikoną stoi nazwa "
            "broni, więc ikona ma mówić <em>klasę</em>, nie model."
        ),
        "dir": HUD,
        "tech": "mask",
        "icons": [
            ("pistol", "Pistolet — średni i ciężki", "Dwa typy CP RED na jednej sylwetce: „Średni pistolet” i „Ciężki pistolet”. Zwykły pistolet półautomatyczny."),
            ("revolver", "Bardzo ciężki pistolet", "Najcięższa broń ręczna w podręczniku. Dziś rewolwer; równie dobrze pasowałby wielki pistolet typu Desert Eagle."),
            ("smg", "Pistolet maszynowy", "Lekki, krótki PM trzymany jedną ręką — musi czytać się jako mniejszy od ciężkiego PM niżej."),
            ("smg-heavy", "Ciężki pistolet maszynowy", "PM z kolbą, wyraźnie większy od zwykłego PM — ale wciąż broń na pasie, nie karabin i nie karabin maszynowy na trójnogu."),
            ("rifle", "Karabin szturmowy", "Podstawowa broń długa walki — karabin automatyczny z magazynkiem. Najczęściej widziana ikona w całym panelu."),
            ("sniper", "Karabin snajperski", "Długa broń precyzyjna. Sygnałem rozpoznawczym jest LUNETA — bez niej myli się z karabinem szturmowym."),
            ("shotgun", "Strzelba", "Strzelba; ta sama ikona obsługuje dodatek „Strzelba podwieszana”."),
            ("flamethrower", "Miotacz ognia", "Broń ciężka miotająca ogień."),
            ("grenade", "Granat", "Granat ręczny rzucany Atletyką."),
            ("launcher", "Granatnik (także podwieszany)", "Granatnik — broń TRZYMANA W RĘKACH, wystrzeliwująca granaty. Ta sama ikona obsługuje dodatek „Granatnik podwieszany” pod karabinem, więc nie może wyglądać na wyrzutnię naziemną ani artylerię."),
            ("rocket", "Wyrzutnia rakiet", "Wyrzutnia rakiet — sama WYRZUTNIA, nie lecący pocisk. Broń ciężka odpalana z ramienia."),
            ("crossbow", "Kusza", "Kusza, Umiejętność Łucznictwo."),
            ("bow", "Łuk", "Łuk, Umiejętność Łucznictwo."),
            ("knife", "Lekka broń biała", "Nóż i jemu podobne. Ta sama ikona obsługuje dodatek „Bagnet”."),
            ("sword", "Średnia broń biała", "Broń biała jednoręczna średniej wielkości — dziś katana."),
            ("broadsword", "Duża broń biała", "Cięższa broń biała, wyraźnie masywniejsza od średniej."),
            ("two-handed-sword", "Bardzo duża broń biała", "Najcięższa broń biała, oburęczna."),
            ("fist", "Bijatyka — atak bez broni", "Atak gołymi rękami (Umiejętność Bijatyka). Pięść."),
            ("martial-arts", "Sztuki walki", "Atak wyszkolony (Umiejętność Sztuki Walki) — kopnięcie lub postawa, coś innego niż zwykła pięść wyżej."),
        ],
    },
    {
        "id": "akcje",
        "title": "Panel postaci — Akcje i sloty",
        "lead": (
            "Kafle Akcji z katalogu tury. Trzy ostatnie należą tylko do figur, które mają "
            "daną Zdolność Roli albo sprzęt — reszta stoi na pasku każdej postaci."
        ),
        "dir": HUD,
        "tech": "mask",
        "icons": [
            ("reload", "Slot „Przeładuj”", "Załadowanie świeżego magazynka do broni."),
            ("first-aid", "Akcja „Ustabilizowanie”", "Ratowanie konającego — pierwsza pomoc, apteczka."),
            ("grab", "Akcja „Zwarcie” / „Pochwycenie”", "Chwyt: złapanie i trzymanie przeciwnika."),
            ("hourglass", "Akcja „Wstrzymanie Akcji”", "Odłożenie swojej Akcji na później w tej samej rundzie — upływ czasu, czekanie."),
            ("stand-up", "Akcja „Wstanie”", "Podniesienie się z ziemi po powaleniu. Ta sama ikona oznacza pusty panel („nie wybrano figury”)."),
            ("run", "Akcja „Bieg”", "Bieg — postać w ruchu."),
            ("scanner", "Akcja „Skaner” (Sieć)", "Wyszukanie punktów dostępu do Sieci w zasięgu — skanowanie, radar. Tylko dla postaci z interfejsem i cyberdekiem."),
            ("combat-awareness", "Zdolność Solo: „Zmysł Walki”", "Nadludzka czujność Solo w walce — wyczuwanie zagrożenia wokół siebie."),
            ("backup", "Zdolność Lawmana: „Wezwanie Wsparcia”", "Wezwanie posiłków policyjnych przez radio."),
        ],
    },
    {
        "id": "chipy",
        "title": "Panel postaci — chipy statystyk",
        "lead": (
            "Małe znaczniki z liczbą obok: pancerz, ruch, Empatia. Dwie ostatnie pozycje "
            "leżą w repo, ale <strong>żaden kod ich dziś nie używa</strong> — zostały jako "
            "rezerwa etapu 27i. Oceń je, jeśli chcesz je kiedyś włączyć; inaczej zostaw."
        ),
        "dir": HUD,
        "tech": "mask",
        "icons": [
            ("armor", "Chip SP — pancerz", "Punkty Pancerza na korpusie i głowie. Dziś kamizelka kuloodporna."),
            ("move", "Chip RUCH", "Cecha RUCH — ile metrów postać przechodzi na Akcję Ruchu."),
            ("emp", "Chip EMP — Empatia", "Cecha EMPATIA, wyliczana z bieżącego Człowieczeństwa (spada od cyborgizacji). Dziś mózg — do rozważenia, czy Empatię lepiej oddaje serce, twarz albo dłoń."),
            ("hp", "NIEUŻYWANA — znacznik PW", "Punkty Wytrzymałości. Plik leży w repo jako rezerwa, kod go nie woła."),
            ("ammo", "NIEUŻYWANA — zapas amunicji", "Zapas amunicji poza magazynkiem. Plik leży w repo jako rezerwa, kod go nie woła."),
        ],
    },
    {
        "id": "celowanie",
        "title": "Celowanie w część ciała",
        "lead": (
            "Guziki menu Celowania nad mapą. Wybór miejsca trafienia zmienia PT i pancerz, "
            "który trzeba przebić — ikona ma jednoznacznie wskazywać część ciała."
        ),
        "dir": HUD,
        "tech": "mask",
        "icons": [
            ("aim-body", "Strzał bez celowania (korpus)", "Zwykły strzał w sylwetkę, bez wskazanej lokacji — cel na muszce."),
            ("aim-head", "Celowanie: głowa", "Strzał w głowę."),
            ("aim-hand", "Celowanie: trzymany przedmiot", "Strzał w rzecz, którą cel TRZYMA (wytrącenie broni z ręki) — nie w samą dłoń. Dziś otwarta dłoń, co czyta się raczej jako „stop”."),
            ("aim-leg", "Celowanie: noga", "Strzał w nogę."),
        ],
    },
    {
        "id": "mapa",
        "title": "Ikony mapy i interfejsu",
        "lead": "Trzy sylwetki spoza panelu postaci — dwie rysuje renderer mapy, jedna stoi w listach i na czacie.",
        "dir": UI,
        "tech": "tint",
        "icons": [
            ("jack-plug", "Punkt dostępu do Sieci", "Gniazdo, do którego netrunner wpina cyberdek — rysowane na mapie w miejscu punktu dostępu."),
            ("boot-print", "Ślad buta na trasie ruchu", "Pojedynczy odcisk buta; renderer układa z nich ścieżkę planowanego ruchu, jeden ślad = jeden metr. UWAGA: nazwy tego pliku nie wolno zmieniać — pilnuje jej test „walk-bands.test.ts”."),
            ("newspaper", "Screamsheet", "Uliczna gazeta / ulotka z ogłoszeniem zlecenia — na liście handoutów i w wierszu czatu."),
        ],
    },
    {
        "id": "statusy",
        "title": "Naklejki statusów",
        "lead": (
            "Rysowane w rogu żetonu na mapie i jako chip w panelu. To JEDYNA grupa, która "
            "zachowuje czarny prostokąt tła — sylwetka musi być czytelna nad cudzą grafiką "
            "mapy. Zamiennik też musi mieć to tło."
        ),
        "dir": STATUS,
        "tech": "sprite",
        "icons": [
            ("stunned", "Ogłuszony", "Postać oszołomiona ciosem — klasyczne „gwiazdki nad głową”."),
            ("seriously-wounded", "Poważnie ranny", "Rana ciężka, ale postać stoi — krew."),
            ("mortally-wounded", "Śmiertelnie ranny", "Postać kona, rzuca Ratunek przed Śmiercią — musi czytać się GORZEJ niż „Poważnie ranny” wyżej."),
            ("unconscious", "Nieprzytomny", "Postać żyje, ale jest nieprzytomna."),
            ("dead", "Martwy", "Postać nie żyje."),
            ("on-fire", "Podpalony", "Postać się pali."),
            ("blinded", "Oślepiony", "Postać nie widzi."),
            ("deafened", "Ogłuszony (słuch)", "Postać nie słyszy. Musi odróżniać się od „Ogłuszonego” (oszołomienia) na pierwszej pozycji listy."),
            ("immobilized", "Unieruchomiony", "Postać nie może się ruszyć z miejsca — skrępowana, przygwożdżona sprzętem."),
            ("slowed", "Spowolniony", "Postać porusza się wolniej niż zwykle."),
            ("grappled", "Pochwycony", "Ktoś trzyma postać w zwarciu — para z ikoną Akcji „Zwarcie” w panelu."),
            ("prone", "Powalony", "Postać leży na ziemi."),
            ("poisoned", "Zatruty", "Trucizna albo substancja chemiczna działająca na postać."),
            ("drowning", "Tonięcie", "Postać tonie / dusi się pod wodą. Ikona własna projektu, nie z game-icons."),
            ("emp", "EMP", "Impuls elektromagnetyczny — uderza w elektronikę i cyberware. Ikona własna projektu. UWAGA: to CO INNEGO niż chip „EMP = Empatia” w panelu postaci, mimo tej samej nazwy."),
            ("suppressed", "Przygwożdżony", "Postać przygwożdżona ogniem osłaniającym — kule bijące wokół, głowa w dół."),
            ("intimidated", "Onieśmielony", "Postać zastraszona w Facedownie — spuszczony wzrok, uległość. Ikona własna projektu."),
        ],
    },
]


def read_attribution() -> dict[pathlib.Path, tuple[str, str]]:
    """Oryginalna nazwa i autor z tabel ATTRIBUTION.md, po pełnej ścieżce pliku.

    Klucz musi być ścieżką, nie nazwą: `emp.svg` leży i w `hud/` (mózg — chip
    Empatii), i w `status-icons/` (impuls elektromagnetyczny), a to dwa różne
    rysunki dwóch różnych autorów. Ścieżkę z komórki tabeli rozwiązujemy
    względem katalogu, w którym stoi sam plik atrybucji — dzięki temu wiersz
    `hud/rifle.svg` z tabeli w `icons/` trafia tam, gdzie trzeba.
    """
    out: dict[pathlib.Path, tuple[str, str]] = {}
    for path in (UI / "ATTRIBUTION.md", STATUS / "ATTRIBUTION.md"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            cells = [c.strip() for c in line.split("|")]
            if len(cells) < 4 or not cells[1].startswith("`"):
                continue
            name, author = cells[2], cells[3]
            if not name or set(name) <= {"-", " "}:
                continue
            out[(path.parent / cells[1].strip("`")).resolve()] = (name, author)
    return out


def load_svg(path: pathlib.Path) -> tuple[str, str, str, bool]:
    """Cały plik, jego viewBox, wnętrze bez ramki `<svg>` i czy ma prostokąt tła.

    Wnętrze idzie raz do arkusza `<symbol>`, a kafle rysują je przez `<use>` —
    inaczej ta sama sylwetka siedziałaby w pliku pięć razy (dwa duże podglądy
    i trzy w rozmiarze rzeczywistym), co puchło do pół megabajta.
    """
    svg = path.read_text(encoding="utf-8").strip()
    match = re.match(r"<svg\b[^>]*>(.*)</svg>\s*$", svg, re.S)
    if not match:
        raise ValueError(f"nie rozpoznaję kształtu pliku: {path}")
    view = re.search(r'viewBox="([^"]+)"', svg)
    return svg, (view.group(1) if view else "0 0 512 512"), match.group(1), BG_RECT in svg


def symbol_html(key: str, view_box: str, inner: str, themeable: bool) -> str:
    """Jedna sylwetka w arkuszu, gotowa do `<use>`.

    Ikony rysowane maską albo barwionym sprite'em biorą kolor z motywu, więc
    w podglądzie też mają go brać (`currentColor`). Naklejki statusów rysują
    się w aplikacji jeden do jednego — i tu też muszą, razem z czarnym tłem,
    bo właśnie to widać w motywie dziennym.
    """
    if themeable:
        inner = inner.replace('fill="#fff"', 'fill="currentColor"')
    return f'<symbol id="i-{key}" viewBox="{view_box}">{inner}</symbol>'


def glyph(key: str, px: int) -> str:
    """Podgląd sylwetki w zadanym rozmiarze."""
    return f'<svg class="glyph" width="{px}" height="{px}" aria-hidden="true"><use href="#i-{key}"/></svg>'


def build() -> None:
    attribution = read_attribution()
    data: list[dict] = []
    cards_html: list[str] = []
    symbols: list[str] = []
    nav: list[str] = []
    missing: list[str] = []
    unattributed: list[str] = []

    for section in SECTIONS:
        tech = TECH[section["tech"]]
        sec_cards: list[str] = []
        for stem, purpose, should in section["icons"]:
            path = section["dir"] / f"{stem}.svg"
            if not path.exists():
                missing.append(str(path))
                continue
            svg, view_box, inner, has_bg = load_svg(path)
            rel = path.relative_to(ROOT).as_posix()
            key = f"{section['id']}-{stem}"
            symbols.append(symbol_html(key, view_box, inner, themeable=not tech["bg"]))
            orig_name, orig_author = attribution.get(path.resolve(), ("—", "—"))
            if orig_name == "—":
                unattributed.append(rel)
            warn = ""
            if has_bg != tech["bg"]:
                warn = (
                    "Plik ma prostokąt tła, a ta grupa go nie chce."
                    if has_bg
                    else "Plik nie ma prostokąta tła, a ta grupa go wymaga."
                )
            data.append(
                {
                    "key": key,
                    "section": section["title"],
                    "file": f"{stem}.svg",
                    "path": rel,
                    "purpose": purpose,
                    "should": should,
                    "tech": tech["label"],
                    "needsBg": tech["bg"],
                    "viewBox": view_box,
                    "origin": f"{orig_name} ({orig_author})" if orig_name != "—" else "—",
                    "svg": svg,
                }
            )
            sec_cards.append(card_html(key, purpose, should, rel, orig_name, orig_author, warn))
        nav.append(
            f'<a href="#sec-{section["id"]}">{html.escape(section["title"])} '
            f'<span class="nav-count">{len(sec_cards)}</span></a>'
        )
        cards_html.append(
            f'<section id="sec-{section["id"]}" data-section="{section["id"]}">'
            f'<div class="sec-head"><h2>{html.escape(section["title"])}</h2>'
            f'<button type="button" class="ghost" data-ok-section="{section["id"]}">'
            f"Cała sekcja OK</button></div>"
            f'<p class="lead">{section["lead"]}</p>'
            f'<p class="tech">Sposób rysowania: <strong>{html.escape(tech["label"])}</strong>. '
            f'{html.escape(tech["hint"])}</p>'
            f'<div class="grid">{"".join(sec_cards)}</div></section>'
        )

    if missing:
        print("BRAKUJĄCE PLIKI:", *missing, sep="\n  ", file=sys.stderr)
    if unattributed:
        # Repozytorium jest publiczne, a zestaw stoi na CC BY — brak wiersza
        # w ATTRIBUTION.md to nie kosmetyka, tylko dziura w atrybucji.
        print("BEZ WPISU W ATTRIBUTION.md:", *unattributed, sep="\n  ", file=sys.stderr)

    page = TEMPLATE.replace("__NAV__", "".join(nav))
    page = page.replace("__SPRITE__", "".join(symbols))
    page = page.replace("__CARDS__", "".join(cards_html))
    page = page.replace("__DATA__", json.dumps(data, ensure_ascii=False))
    page = page.replace("__TOTAL__", str(len(data)))
    OUT.write_text(page, encoding="utf-8")
    print(f"{OUT}  —  {len(data)} ikon, {OUT.stat().st_size // 1024} KB")


def card_html(key, purpose, should, rel, orig_name, orig_author, warn) -> str:
    e = html.escape
    origin = f"{orig_name} — {orig_author}" if orig_name != "—" else "rysunek własny projektu"
    warn_html = f'<p class="warn">⚠ {e(warn)}</p>' if warn else ""
    return f"""
<article class="card" data-key="{e(key)}" data-state="none">
  <div class="art">
    <div class="art-pane art-dark" title="tak wygląda w motywie nocnym">{glyph(key, 64)}</div>
    <div class="art-pane art-light" title="tak wygląda w motywie dziennym">{glyph(key, 64)}</div>
    <div class="art-pane art-real" title="rozmiar rzeczywisty w interfejsie (22 px)">
      {glyph(key, 22)}{glyph(key, 22)}{glyph(key, 22)}
    </div>
  </div>
  <h3>{e(purpose)}</h3>
  <p class="should">{e(should)}</p>
  <p class="meta"><code>{e(rel)}</code></p>
  <p class="meta dim">Obecny rysunek: {e(origin)}</p>
  {warn_html}
  <div class="verdict">
    <label class="pick pick-ok">
      <input type="radio" name="v-{e(key)}" value="ok" data-key="{e(key)}"> <span>✓ Pasuje</span>
    </label>
    <label class="pick pick-bad">
      <input type="radio" name="v-{e(key)}" value="change" data-key="{e(key)}"> <span>✗ Do zmiany</span>
    </label>
  </div>
  <textarea class="reason" data-key="{e(key)}" rows="3"
    placeholder="Co jest nie tak i co ma przedstawiać zamiennik? Im konkretniej, tym lepszy rysunek wróci."></textarea>
</article>"""


TEMPLATE = r"""<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Przegląd ikon — VTT Cyberpunk RED</title>
<style>
  :root {
    --bg: #101319; --panel: #171b23; --panel-2: #1d222c; --line: #2b323f;
    --ink: #e9edf5; --dim: #99a3b5; --accent: #7fe3ff;
    --ok: #4ade80; --ok-bg: rgb(74 222 128 / 9%); --bad: #fb7185; --bad-bg: rgb(251 113 133 / 10%);
    --warn: #fbbf24;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 15px/1.5 system-ui, "Segoe UI", sans-serif; }
  header { position: sticky; top: 0; z-index: 10; background: rgb(16 19 25 / 96%);
           border-bottom: 1px solid var(--line); padding: 14px 24px;
           backdrop-filter: blur(6px); }
  h1 { margin: 0 0 4px; font-size: 19px; }
  .sub { margin: 0; color: var(--dim); font-size: 13px; max-width: 78ch; }
  .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  button { font: inherit; font-size: 13px; cursor: pointer; border-radius: 8px;
           border: 1px solid var(--line); background: var(--panel-2); color: var(--ink);
           padding: 7px 13px; }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); color: #05202a; border-color: var(--accent);
                   font-weight: 700; }
  button.ghost { padding: 4px 10px; font-size: 12px; color: var(--dim); }
  .counts { margin-left: auto; display: flex; gap: 14px; font-size: 13px; align-items: center; }
  .counts b { font-variant-numeric: tabular-nums; }
  .chip-ok { color: var(--ok); } .chip-bad { color: var(--bad); } .chip-left { color: var(--dim); }
  nav { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  nav a { font-size: 12px; color: var(--dim); text-decoration: none;
          border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; }
  nav a:hover { color: var(--accent); border-color: var(--accent); }
  .nav-count { opacity: .55; }
  main { padding: 20px 24px 80px; }
  .rules { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--warn);
           border-radius: 10px; padding: 14px 18px; margin: 0 0 26px; max-width: 96ch; }
  .rules h2 { margin: 0 0 8px; font-size: 14px; color: var(--warn); }
  .rules ul { margin: 0; padding-left: 20px; font-size: 13px; color: var(--dim); }
  .rules li { margin: 5px 0; }
  .rules strong { color: var(--ink); }
  section { margin: 0 0 38px; }
  .sec-head { display: flex; align-items: center; gap: 12px; }
  h2 { font-size: 16px; margin: 0; color: var(--accent); }
  .lead, .tech { margin: 6px 0 0; font-size: 13px; color: var(--dim); max-width: 96ch; }
  .tech { margin-bottom: 14px; }
  .tech strong { color: var(--ink); }
  code { font-family: ui-monospace, "Cascadia Code", monospace; font-size: 12px; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
          padding: 12px 14px 14px; display: flex; flex-direction: column; }
  .card[data-state="ok"] { border-color: rgb(74 222 128 / 45%); background: var(--ok-bg); }
  .card[data-state="change"] { border-color: rgb(251 113 133 / 50%); background: var(--bad-bg); }
  .art { display: flex; gap: 8px; align-items: stretch; margin-bottom: 10px; }
  .art-pane { border-radius: 8px; padding: 8px; display: flex; gap: 6px;
              align-items: center; justify-content: center; }
  /* Kolor kafla podglądu jest kolorem sylwetki: ikony panelu i mapy biorą go
     z motywu (fill="currentColor" w arkuszu), więc w kaflu dziennym robią się
     ciemne — dokładnie jak w aplikacji. Naklejki statusów zachowują własne
     wypełnienie i czarne tło, więc w obu kaflach wyglądają tak samo. To nie
     jest niedoróbka podglądu, tylko prawda o tym, jak się rysują. */
  .art-dark { background: #0a0c11; color: #e9edf5; }
  .art-light { background: #efeae1; color: #14120f; }
  .art-real { background: #0a0c11; color: #e9edf5; flex: 1; }
  .glyph { display: block; }
  h3 { margin: 0 0 4px; font-size: 14px; }
  .should { margin: 0 0 8px; font-size: 13px; color: var(--dim); flex: 1; }
  .meta { margin: 0; font-size: 12px; color: var(--dim); }
  .meta.dim { opacity: .72; margin-bottom: 10px; }
  .warn { margin: 6px 0 0; font-size: 12px; color: var(--warn); }
  .verdict { display: flex; gap: 8px; }
  .pick { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
          border: 1px solid var(--line); border-radius: 8px; padding: 7px; cursor: pointer;
          font-size: 13px; user-select: none; background: var(--panel-2); }
  .pick input { accent-color: currentColor; margin: 0; }
  .card[data-state="ok"] .pick-ok { border-color: var(--ok); color: var(--ok); }
  .card[data-state="change"] .pick-bad { border-color: var(--bad); color: var(--bad); }
  .reason { display: none; margin-top: 9px; width: 100%; font: inherit; font-size: 13px;
            background: #0d1015; color: var(--ink); border: 1px solid var(--line);
            border-radius: 8px; padding: 8px; resize: vertical; }
  .card[data-state="change"] .reason { display: block; }
  .card.hidden { display: none; }
  dialog { background: var(--panel); color: var(--ink); border: 1px solid var(--line);
           border-radius: 14px; padding: 0; width: min(980px, 94vw); }
  dialog::backdrop { background: rgb(0 0 0 / 62%); }
  .dlg-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px;
              border-bottom: 1px solid var(--line); }
  .dlg-head h2 { flex: 1; }
  .dlg-body { padding: 14px 18px 18px; }
  .dlg-body textarea { width: 100%; height: 54vh; font-family: ui-monospace, monospace;
                       font-size: 12px; line-height: 1.45; background: #0d1015; color: var(--ink);
                       border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .hint { font-size: 12px; color: var(--dim); margin: 0 0 8px; }
  .empty { color: var(--warn); font-size: 13px; }
  .nostore { margin: 10px 0 0; font-size: 13px; color: var(--warn);
             border: 1px solid rgb(251 191 36 / 40%); background: rgb(251 191 36 / 8%);
             border-radius: 8px; padding: 8px 12px; max-width: 96ch; }
  .nostore strong { color: var(--ink); }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">__SPRITE__</svg>
<header>
  <h1>Przegląd ikon — VTT Cyberpunk RED</h1>
  <p class="sub">Każda ikona z opisem, co ma przedstawiać. Zaznacz „Pasuje” albo „Do zmiany”
    i przy tych drugich napisz, co jest nie tak — potem „Eksportuj paczkę” da gotowy prompt
    dla modelu rysującego. Oceny zapisują się w przeglądarce, więc plik można zamknąć.</p>
  <div class="bar">
    <button type="button" class="primary" id="export">Eksportuj paczkę dla modelu</button>
    <button type="button" id="all-ok">Wszystko na „Pasuje”</button>
    <button type="button" id="filter">Pokaż: wszystkie</button>
    <button type="button" id="save-file">Zapisz postęp</button>
    <button type="button" id="load-file">Wczytaj postęp</button>
    <input type="file" id="load-input" accept="application/json,.json" hidden>
    <button type="button" id="reset">Wyczyść oceny</button>
    <div class="counts">
      <span class="chip-ok">pasuje <b id="c-ok">0</b></span>
      <span class="chip-bad">do zmiany <b id="c-bad">0</b></span>
      <span class="chip-left">nieocenione <b id="c-left">__TOTAL__</b></span>
    </div>
  </div>
  <nav>__NAV__</nav>
  <p class="nostore" id="nostore" hidden>⚠ Ta przeglądarka nie pozwala tej stronie nic zapamiętać
    (zdarza się przy otwieraniu pliku prosto z dysku). Oceny znikną przy zamknięciu karty —
    klikaj <strong>„Zapisz postęp”</strong>, żeby zrzucić je do pliku, i <strong>„Wczytaj
    postęp”</strong>, żeby wrócić do pracy.</p>
</header>
<main>
  <div class="rules">
    <h2>Zanim wyślesz to modelowi — twarde wymagania projektu</h2>
    <ul>
      <li><strong>Nazwy plików są nośne.</strong> <code>fx.ts</code> wiesza na nich styl pocisku
        i dźwięk strzału, a <code>walk-bands.test.ts</code> pilnuje istnienia
        <code>boot-print.svg</code>. Zamiennik musi trafić pod <em>tę samą</em> nazwę —
        podmieniamy rysunek, nigdy nazwę.</li>
      <li><strong>Prostokąt tła: tylko naklejki statusów.</strong> Ikony panelu i mapy są maską
        albo barwionym sprite'em — pełnowymiarowy prostokąt zamieniłby je w jednolitą plamę.
        Statusy odwrotnie: bez czarnego podkładu znikną na jasnym żetonie.</li>
      <li><strong>Czytelność w 22 px</strong> jest ważniejsza niż detal. Trzeci podgląd na każdym
        kaflu pokazuje dokładnie ten rozmiar — ikona ma działać właśnie tam.</li>
      <li><strong>Licencja.</strong> Obecny zestaw to game-icons.net na CC BY 3.0. Każdy plik
        narysowany przez model przestaje być cudzym dziełem — trzeba wtedy poprawić wiersz
        w <code>ATTRIBUTION.md</code> na rysunek własny projektu. Repozytorium jest publiczne,
        więc atrybucja musi zgadzać się z tym, co faktycznie leży w katalogu.</li>
      <li><strong>Uczciwe ostrzeżenie:</strong> modele językowe rysują sylwetki broni nierówno —
        w 22 px łatwo dostać plamę zamiast karabinu. Jeśli zamiennik wróci słaby, tańszą drogą
        bywa wybór gotowej ikony z katalogu game-icons (4239 sztuk, ta sama kreska).</li>
    </ul>
  </div>
  __CARDS__
</main>

<dialog id="dlg">
  <div class="dlg-head">
    <h2>Paczka dla modelu rysującego</h2>
    <button type="button" id="copy">Kopiuj</button>
    <button type="button" id="download">Pobierz .md</button>
    <button type="button" id="close">Zamknij</button>
  </div>
  <div class="dlg-body">
    <p class="hint">Prompt, lista ikon do zmiany z Twoim uzasadnieniem, obecny kod SVG każdej
      z nich i ten sam zestaw w JSON-ie na końcu. Wklej całość do modelu rysującego.</p>
    <textarea id="out" readonly></textarea>
  </div>
</dialog>

<script>
const ICONS = __DATA__;
const KEY = 'vtt-icon-review-v1';

/* Plik otwierany prosto z dysku bywa dla przeglądarki źródłem bez tożsamości
   i localStorage potrafi wtedy rzucić wyjątkiem albo po cichu nic nie zapisać.
   Sprawdzamy to raz, na starcie: jeśli pamięć nie działa, mówimy o tym wprost,
   bo cicha utrata 57 ocen jest gorsza niż ostrzeżenie. Zapis i odczyt z pliku
   działa zawsze i jest wtedy jedyną drogą. */
const CAN_STORE = (() => {
  try {
    localStorage.setItem(KEY + '-probe', '1');
    localStorage.removeItem(KEY + '-probe');
    return true;
  } catch { return false; }
})();

const state = load();

function load() {
  if (!CAN_STORE) return {};
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function save() {
  if (!CAN_STORE) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

/* Polska odmiana po liczbie: 1 ikonę, 2-4 ikony, 5+ ikon (z wyjątkiem nastek). */
function ikon(n) {
  const t = n % 10, s = n % 100;
  if (n === 1) return '1 ikonę';
  if (t >= 2 && t <= 4 && (s < 12 || s > 14)) return n + ' ikony';
  return n + ' ikon';
}

function paint() {
  let ok = 0, bad = 0;
  for (const card of document.querySelectorAll('.card')) {
    const key = card.dataset.key;
    const row = state[key];
    const verdict = row && row.verdict;
    card.dataset.state = verdict || 'none';
    if (verdict === 'ok') ok++;
    if (verdict === 'change') bad++;
    const radio = card.querySelector(`input[value="${verdict}"]`);
    if (radio) radio.checked = true;
    else card.querySelectorAll('input').forEach(i => { i.checked = false; });
    const area = card.querySelector('.reason');
    if (row && typeof row.reason === 'string' && area.value !== row.reason) area.value = row.reason;
  }
  document.getElementById('c-ok').textContent = ok;
  document.getElementById('c-bad').textContent = bad;
  document.getElementById('c-left').textContent = ICONS.length - ok - bad;
  applyFilter();
}

let filter = 'all';
const FILTERS = { all: 'wszystkie', none: 'nieocenione', change: 'do zmiany', ok: 'pasujące' };
function applyFilter() {
  for (const card of document.querySelectorAll('.card')) {
    const s = card.dataset.state;
    card.classList.toggle('hidden', filter !== 'all' && s !== filter);
  }
}

document.addEventListener('change', (e) => {
  const input = e.target.closest('input[type="radio"]');
  if (!input) return;
  const key = input.dataset.key;
  state[key] = Object.assign({}, state[key], { verdict: input.value });
  save(); paint();
});

document.addEventListener('input', (e) => {
  const area = e.target.closest('.reason');
  if (!area) return;
  const key = area.dataset.key;
  state[key] = Object.assign({}, state[key], { reason: area.value });
  save();
});

document.addEventListener('click', (e) => {
  const secBtn = e.target.closest('[data-ok-section]');
  if (!secBtn) return;
  const sec = document.getElementById('sec-' + secBtn.dataset.okSection);
  for (const card of sec.querySelectorAll('.card')) {
    if (!state[card.dataset.key] || !state[card.dataset.key].verdict) {
      state[card.dataset.key] = Object.assign({}, state[card.dataset.key], { verdict: 'ok' });
    }
  }
  save(); paint();
});

document.getElementById('all-ok').addEventListener('click', () => {
  for (const icon of ICONS) {
    if (!state[icon.key] || !state[icon.key].verdict) {
      state[icon.key] = Object.assign({}, state[icon.key], { verdict: 'ok' });
    }
  }
  save(); paint();
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Skasować wszystkie oceny i uzasadnienia?')) return;
  for (const k of Object.keys(state)) delete state[k];
  save(); paint();
});

document.getElementById('save-file').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'przeglad-ikon-postep.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

document.getElementById('load-file').addEventListener('click', () => {
  document.getElementById('load-input').click();
});

document.getElementById('load-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const loaded = JSON.parse(await file.text());
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('kształt');
    const known = new Set(ICONS.map(i => i.key));
    let taken = 0, skipped = 0;
    for (const [key, row] of Object.entries(loaded)) {
      // Plik postępu może pochodzić ze starszego wydania strony — wtedy część
      // kluczy nie ma już swojego kafla. Bierzemy to, co pasuje, i mówimy ile.
      if (!known.has(key) || !row || typeof row !== 'object') { skipped++; continue; }
      state[key] = { verdict: row.verdict, reason: typeof row.reason === 'string' ? row.reason : '' };
      taken++;
    }
    save(); paint();
    alert('Wczytano ocen: ' + taken + (skipped ? ('. Pominięto wpisów nie z tej strony: ' + skipped) : '.'));
  } catch {
    alert('Nie umiem odczytać tego pliku — spodziewam się JSON-a zapisanego przyciskiem „Zapisz postęp”.');
  } finally {
    e.target.value = '';
  }
});

document.getElementById('filter').addEventListener('click', (e) => {
  const order = ['all', 'change', 'none', 'ok'];
  filter = order[(order.indexOf(filter) + 1) % order.length];
  e.target.textContent = 'Pokaż: ' + FILTERS[filter];
  applyFilter();
});

function buildPackage() {
  const changes = ICONS.filter(i => state[i.key] && state[i.key].verdict === 'change');
  const okCount = ICONS.filter(i => state[i.key] && state[i.key].verdict === 'ok').length;
  if (changes.length === 0) {
    return 'Nie zaznaczono żadnej ikony jako „do zmiany”. Zaznacz co najmniej jedną i spróbuj ponownie.';
  }
  const L = [];
  L.push('# Zamienniki ikon dla VTT Cyberpunk RED');
  L.push('');
  L.push('Jesteś modelem rysującym grafikę SVG. Poniżej ' + ikon(changes.length) + ' do przerysowania.');
  L.push('Reszta zestawu (' + ikon(okCount) + ') zostaje bez zmian i wyznacza styl, w który masz trafić.');
  L.push('');
  L.push('## Styl, w który masz trafić');
  L.push('');
  L.push('Zestaw pochodzi z game-icons.net: **pełna, jednolita sylwetka**, bez konturu, bez');
  L.push('gradientów, bez cieniowania, bez tekstu. Kształt czytelny z samego obrysu, detale');
  L.push('wycięte jako dziury w sylwetce. Rysunek wypełnia kwadrat niemal po brzegi.');
  L.push('');
  L.push('## Wymagania techniczne — każde naruszenie psuje ikonę w aplikacji');
  L.push('');
  L.push('1. `xmlns="http://www.w3.org/2000/svg"`, bez `width` i `height` — rozmiar nadaje');
  L.push('   aplikacja. `viewBox` weź z pola „viewBox" przy każdej ikonie (dla prawie całego');
  L.push('   zestawu to `0 0 512 512`, ale nie dla każdej — nie zgaduj).');
  L.push('2. Tylko elementy kształtu (`path`, ewentualnie `circle`/`rect` jako część rysunku).');
  L.push('   ZERO: `<style>`, `<script>`, `<image>`, `<use>`, `<text>`, `<filter>`, gradientów,');
  L.push('   `class=`, odwołań do plików zewnętrznych, komentarzy.');
  L.push('3. Sylwetka biała: `fill="#fff"`. Bez `stroke` — kreskę zamień na wypełniony kształt.');
  L.push('4. **Prostokąt tła** — dwie różne reguły, patrz pole „tło” przy każdej ikonie:');
  L.push('   - `tło: BEZ` — plik NIE MOŻE zawierać `<path d="M0 0h512v512H0z"/>` ani innego');
  L.push('     pełnowymiarowego prostokąta. Ikona jest maską CSS lub barwionym sprite\'em:');
  L.push('     każdy nieprzezroczysty piksel zostanie zamalowany kolorem tekstu, więc');
  L.push('     prostokąt tła zamieniłby ikonę w jednolity kwadrat.');
  L.push('   - `tło: WYMAGANE` — plik MUSI zaczynać się od `<path d="M0 0h512v512H0z"/>`');
  L.push('     (czarne tło), a sylwetka idzie na nim jako `fill="#fff"`. To naklejka rysowana');
  L.push('     jeden do jednego nad grafiką mapy; bez podkładu zniknie na jasnym żetonie.');
  L.push('5. **Czytelność w 22 px** jest ważniejsza niż detal — tyle ikona ma w interfejsie.');
  L.push('   Cienkie kreski, drobne wycięcia i wąskie przewężenia znikną. Testuj myślą:');
  L.push('   „czy z odległości dwóch centymetrów dalej widać, co to jest?”.');
  L.push('6. Sylwetka ma być zwrócona w tę samą stronę co reszta zestawu (broń lufą w prawo');
  L.push('   albo ukośnie w prawo-górę) i wypełniać kadr — nie zostawiaj szerokich marginesów.');
  L.push('7. Nazwy plików SĄ NOŚNE w kodzie. Zwróć każdą ikonę pod DOKŁADNIE tą samą nazwą');
  L.push('   i ścieżką, co w liście niżej. Nie proponuj nowych nazw.');
  L.push('');
  L.push('## Format odpowiedzi');
  L.push('');
  L.push('Dla każdej ikony: nagłówek ze ścieżką pliku, a pod nim blok kodu z kompletną');
  L.push('zawartością pliku `.svg` — jedna linia zaczynająca się od `<svg` i kończąca `</svg>`.');
  L.push('Bez komentarzy w środku pliku. Krótkie zdanie „co narysowałem” możesz dać POZA blokiem.');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Do przerysowania: ' + ikon(changes.length));
  changes.forEach((icon, n) => {
    const reason = (state[icon.key].reason || '').trim();
    L.push('');
    L.push('### ' + (n + 1) + '. `' + icon.path + '`');
    L.push('');
    L.push('- **Ma przedstawiać:** ' + icon.purpose);
    L.push('- **Szczegóły:** ' + icon.should);
    L.push('- **Gdzie w aplikacji:** ' + icon.section + ' (' + icon.tech + ')');
    L.push('- **viewBox:** `' + icon.viewBox + '`');
    L.push('- **tło:** ' + (icon.needsBg ? 'WYMAGANE (czarny prostokąt 512×512 pod spodem)' : 'BEZ (żadnego prostokąta tła)'));
    L.push('- **Dlaczego obecna nie pasuje:** ' + (reason || '(MG nie podał powodu — kieruj się opisem „ma przedstawiać”)'));
    L.push('- **Obecny rysunek:** ' + icon.origin);
    L.push('');
    L.push('Obecna zawartość pliku (do podmiany w całości):');
    L.push('');
    L.push('```svg');
    L.push(icon.svg);
    L.push('```');
  });
  L.push('');
  L.push('---');
  L.push('');
  L.push('## To samo w JSON (gdyby było wygodniejsze)');
  L.push('');
  L.push('```json');
  L.push(JSON.stringify(changes.map(icon => ({
    path: icon.path,
    file: icon.file,
    purpose: icon.purpose,
    details: icon.should,
    section: icon.section,
    rendering: icon.tech,
    viewBox: icon.viewBox,
    backgroundRect: icon.needsBg,
    reason: (state[icon.key].reason || '').trim(),
    currentOrigin: icon.origin,
    currentSvg: icon.svg,
  })), null, 2));
  L.push('```');
  return L.join('\n');
}

const dlg = document.getElementById('dlg');
document.getElementById('export').addEventListener('click', () => {
  document.getElementById('out').value = buildPackage();
  dlg.showModal();
});
document.getElementById('close').addEventListener('click', () => dlg.close());
document.getElementById('copy').addEventListener('click', async (e) => {
  const text = document.getElementById('out').value;
  try {
    await navigator.clipboard.writeText(text);
    e.target.textContent = 'Skopiowane ✓';
  } catch {
    document.getElementById('out').select();
    e.target.textContent = 'Zaznaczone — Ctrl+C';
  }
  setTimeout(() => { e.target.textContent = 'Kopiuj'; }, 1800);
});
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([document.getElementById('out').value], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zamienniki-ikon.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

document.getElementById('nostore').hidden = CAN_STORE;
paint();
</script>
</body>
</html>
"""


if __name__ == "__main__":
    build()
