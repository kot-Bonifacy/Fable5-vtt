"""Step 2.5 of the compendium pipeline: translate item descriptions to Polish.

The free DLCs are English, but the table plays in Polish, so item cards read
badly next to the Polish stat labels. This runs the descriptions through the
campaign's own local model (stage 09) — nothing leaves the machine, and the
translations land in `data/private` like the rest of the rulebook-derived data.

Choices that matter for quality:
  - Proper names stay English. "Militech Avenger" is a brand, and the Polish
    edition keeps such names untranslated too.
  - The original text is kept in `descriptionOriginal`, so a bad translation is
    always recoverable and reviewable without re-running the import.
  - Results are cached by content hash in
    `data/private/rulebook/manual/translations.json`, so re-running the importer
    does not re-translate what has not changed — and hand-corrected entries in
    that file survive future runs.

Run (needs llama-server from `pwsh ai-gateway/scripts/start-gateway.ps1`):

    uv run --with httpx python tools/import/translate-descriptions.py
    uv run --with httpx python tools/import/translate-descriptions.py --check

`--check` only reports what would be translated, without calling the model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPENDIUM_DIR = REPO_ROOT / "data" / "private" / "cpred" / "compendium"
CACHE_PATH = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "translations.json"
# Hand-written translations keyed by entry id; they beat both cache and model.
OVERRIDE_PATH = REPO_ROOT / "data" / "private" / "rulebook" / "manual" / "translations-override.json"

LLAMA_URL = "http://127.0.0.1:8080/v1/chat/completions"

SYSTEM_PROMPT = """Jesteś tłumaczem materiałów do gry fabularnej Cyberpunk RED.
Tłumaczysz z angielskiego na polski opisy przedmiotów (broni, pancerzy, sprzętu).

Zasady:
1. Zachowaj nazwy własne bez zmian: marki i modele (Militech, Arasaka, Dai Lung,
   Mark III), nazwy miejsc (Night City, Watson) i nazwy gangów.
2. Zachowaj żargon Cyberpunka: eddiesy, ripperdok, netrunner, korpo, choomba.
3. Terminy mechaniki po polsku: Poor/Standard/Excellent Quality to „niska/zwykła/
   doskonała jakość", Heavy Pistol to „ciężki pistolet", Assault Rifle to
   „karabin szturmowy", Shotgun to „strzelba", SP to OB, ROF to LA, DV to PT.
4. Ton: zwięzły, uliczny, jak w podręczniku. Nie dopisuj niczego od siebie.
5. Odpowiadasz WYŁĄCZNIE polskim tłumaczeniem. Bez komentarzy, bez cudzysłowów,
   bez wyjaśnień, bez powtarzania oryginału."""


def content_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def load_overrides() -> dict[str, str]:
    """Corrections by entry id. A 9B model translating gun-shop slang needs a
    human pass; whatever lands here survives every future import."""
    if not OVERRIDE_PATH.exists():
        return {}
    return json.loads(OVERRIDE_PATH.read_text(encoding="utf-8"))


def load_cache() -> dict[str, str]:
    if not CACHE_PATH.exists():
        return {}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def save_cache(cache: dict[str, str]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def translate(client, text: str) -> str | None:
    """One description -> Polish, or None when the model refuses to cooperate."""
    response = client.post(
        LLAMA_URL,
        json={
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            # Deterministic enough to be reproducible, warm enough to read well.
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": 600,
            "chat_template_kwargs": {"enable_thinking": False},
            "reasoning_budget": 0,
        },
        timeout=180.0,
    )
    response.raise_for_status()
    payload = response.json()
    content = (payload["choices"][0]["message"].get("content") or "").strip()
    if not content:
        return None
    # The model occasionally wraps the answer in quotes despite the instruction.
    if content.startswith(("„", '"', "«")) and content.endswith(("”", '"', "»")):
        content = content[1:-1].strip()
    return content or None


def suspicious(original: str, translated: str) -> str | None:
    """Cheap sanity checks — a wrong translation is worse than none."""
    if len(translated) < len(original) * 0.4:
        return "podejrzanie krótkie"
    if len(translated) > len(original) * 2.5:
        return "podejrzanie długie"
    lowered = translated.lower()
    for marker in ("translation:", "tłumaczenie:", "here is", "oto tłumaczenie"):
        if marker in lowered:
            return "model dopisał komentarz"
    # No Polish diacritics at all in a long text means it probably did not translate.
    if len(translated) > 60 and not any(ch in translated for ch in "ąćęłńóśźż"):
        return "brak polskich znaków"
    return None


# Function words that are common in English and are not Polish words.
_ENGLISH_WORDS = frozenset(
    """the this that these those with and of is are was were for you your it its has have had
    can could which when where from they them their but not all any one two into out over off
    by as at on in to a an""".split()
)
# Polish function words; none of them is an English word.
_POLISH_WORDS = frozenset(
    """jest są nie się który która które to na do za przez oraz ale może jak tego tym przy jego
    jej ich lub albo bez pod nad gdy czy już tylko także wszystko jeden jedna dwa trzy być ma
    mają można sobie nią nim""".split()
)
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
_POLISH_LETTERS = frozenset("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ")


def looks_english(text: str) -> bool:
    """Whether this description still needs translating.

    Most of the compendium came from the Polish rulebook (stage 13); only the
    branded weapons of the free DLCs are English. `descriptionOriginal` cannot
    tell them apart — the Polish entries never went through this script, so they
    have no such field either, and running the model over them would have it
    "translate" good Polish into whatever a 9B makes of it.

    Deliberately biased towards leaving text alone: a missed English entry stays
    readable and can be forced by hand, while a mangled Polish one is damage.
    """
    words = [word.lower() for word in _WORD.findall(text)]
    english = sum(1 for word in words if word in _ENGLISH_WORDS)
    polish = sum(1 for word in words if word in _POLISH_WORDS)
    polish += sum(1 for ch in text if ch in _POLISH_LETTERS)
    return english > polish


def collect_entries() -> tuple[list[tuple[Path, dict, list[dict]]], int]:
    """Every compendium file with the entries that still need a translation,
    plus how many were left alone for already being Polish."""
    files: list[tuple[Path, dict, list[dict]]] = []
    skipped = 0
    for path in sorted(COMPENDIUM_DIR.glob("*.json")):
        if path.name == "import-report.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        pending = []
        for entry in data.get("entries", []):
            description = entry.get("description")
            if not description or entry.get("descriptionOriginal"):
                continue
            if not looks_english(description):
                skipped += 1
                continue
            pending.append(entry)
        if pending:
            files.append((path, data, pending))
    return files, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report only, no model calls")
    parser.add_argument("--force", action="store_true", help="ignore the cache")
    args = parser.parse_args()

    files, skipped = collect_entries()
    total = sum(len(pending) for _, _, pending in files)
    polish_note = f", {skipped} pominięto jako już polskie" if skipped else ""
    if total == 0:
        print(f"Nic do tłumaczenia — wszystkie opisy mają już wersję polską{polish_note}.")
        return 0

    cache = {} if args.force else load_cache()
    overrides = load_overrides()
    cached = sum(
        1
        for _, _, pending in files
        for entry in pending
        if content_key(entry["description"]) in cache
    )
    print(
        f"do przetłumaczenia: {total} opisów "
        f"({cached} już w pamięci podręcznej{polish_note})"
    )
    for path, _, pending in files:
        print(f"  {path.name}: {len(pending)}")
    if args.check:
        return 0

    try:
        import httpx
    except ImportError:
        print("brak httpx — uruchom przez: uv run --with httpx python ...", file=sys.stderr)
        return 1

    warnings: list[str] = []
    done = 0
    started = time.monotonic()

    with httpx.Client() as client:
        try:
            client.get("http://127.0.0.1:8080/health", timeout=5.0)
        except Exception:
            print(
                "llama-server nie odpowiada na :8080 — uruchom\n"
                "  pwsh ai-gateway/scripts/start-gateway.ps1",
                file=sys.stderr,
            )
            return 1

        for path, data, pending in files:
            for entry in pending:
                original = entry["description"]
                key = content_key(original)
                translated = overrides.get(entry["id"]) or cache.get(key)
                if translated is None:
                    translated = translate(client, original)
                    if translated is None:
                        warnings.append(f"{entry['name']}: model nie zwrócił tekstu")
                        continue
                    cache[key] = translated
                    save_cache(cache)  # crash-safe: never lose finished work

                problem = None if entry["id"] in overrides else suspicious(original, translated)
                if problem:
                    warnings.append(f"{entry['name']}: {problem}")

                entry["descriptionOriginal"] = original
                entry["description"] = translated
                done += 1
                print(f"  [{done}/{total}] {entry['name']}")

            path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )

    elapsed = time.monotonic() - started
    print(f"\nprzetłumaczono {done}/{total} w {elapsed:.0f} s")
    if warnings:
        print(f"do sprawdzenia ({len(warnings)}):")
        for warning in warnings:
            print(f"  - {warning}")
        print(f"\nPopraw ręcznie w {CACHE_PATH.relative_to(REPO_ROOT)} i uruchom ponownie.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
