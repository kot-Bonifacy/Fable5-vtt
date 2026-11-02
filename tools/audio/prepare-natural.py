"""Prepare licensed recordings; pip install numpy soundfile, then pass the MP3 cache folder.

Source files in cache: vtt-wood.mp3, vtt-paper.mp3, etc.; URLs in sources.json.
A source with a `mirror` (car) is that file, saved as vtt-<name>.ogg.
A source shipped as a ZIP (doorlock) is the named `file` from it, saved as vtt-<name>.wav.
No synthesized tones or pitch changes. Output PCM16 mono WAV for browser compatibility.
"""
import json
import pathlib
import sys

import numpy as np
import soundfile as sf

root = pathlib.Path(__file__).resolve().parents[2]
cache = pathlib.Path(sys.argv[1]) if sys.argv[1:] != ["--turn-only"] else None
public = root / "packages/client/public"


def read(name, start, end):
    path = cache / f"vtt-{name}.mp3"
    for ext in ("wav", "ogg"):
        if not path.exists():
            path = cache / f"vtt-{name}.{ext}"
    data, rate = sf.read(path, always_2d=True)
    return data[int(start * rate):int(end * rate)].mean(axis=1), rate


def save(folder, name, data, rate, peak):
    data = data - data.mean()
    data *= peak / max(float(np.abs(data).max()), 0.001)
    target = public / folder
    target.mkdir(exist_ok=True)
    sf.write(target / f"{name}.wav", data, rate, subtype="PCM_16")


def cue(source, start, end):
    data, rate = read(source, start, end)
    attack, tail = int(rate * 0.005), int(rate * 0.035)
    data[:attack] *= np.linspace(0, 1, attack)
    data[-tail:] *= np.linspace(1, 0, tail)
    return data, rate


def turn_voice():
    # Sygnał tury od 28.10 (etap 63a, decyzja MG): nagranie z ttsMP3.com, które
    # MG dostarczył sam; trzymane w repo, bo nie ma publicznego adresu.
    data, rate = sf.read(pathlib.Path(__file__).parent / "turn-voice.mp3", always_2d=True)
    data = data[int(0.03 * rate):int(0.65 * rate)].mean(axis=1)
    attack, tail = int(rate * 0.005), int(rate * 0.03)
    data[:attack] *= np.linspace(0, 1, attack)
    data[-tail:] *= np.linspace(1, 0, tail)
    return data, rate


if __name__ == "__main__" and sys.argv[1:] == ["--turn-only"]:
    save("notifications", "turn", *turn_voice(), 0.8)
    sys.exit(0)


wood, rate = cue("wood", 0.20, 0.49)
save("notifications", "request", wood, rate, 0.55)
data, rate = turn_voice()
save("notifications", "turn", data, rate, 0.8)
for name, source, start, end, peak in [
    ("whisper", "paper", 1.0, 1.53, 0.55),
    ("handout", "paper", 1.67, 2.39, 0.55),
    ("inventory", "coins", 0.20, 1.65, 0.45),
    # Odmowa w kanale komunikatów (etap 55): dwa szarpnięcia zamkniętej klamki.
    ("refusal", "doorlock", 0.03, 0.42, 0.5),
]:
    data, rate = cue(source, start, end)
    save("notifications", name, data, rate, peak)

# Jazda samochodem (02.11.2026): domyślne otoczenie scen pościgu zamiast ulicy.
for name, start, end in [
    ("rain", 2, 30),
    ("wind", 0.5, 8.5),
    ("fire", 0, 5),
    ("street", 10, 40),
    ("car", 2, 32),
]:
    data, rate = read(name, start, end)
    # Resample without changing speed; half-second overlap joins the loop seamlessly.
    data = np.interp(np.arange(0, len(data), rate / 32000), np.arange(len(data)), data)
    overlap = 16000
    blend = np.linspace(0, 1, overlap)
    data = np.concatenate([data[overlap:-overlap], data[-overlap:] * (1 - blend) + data[:overlap] * blend])
    save("ambience", name, data, 32000, 0.7)

sources = json.loads((pathlib.Path(__file__).parent / "sources.json").read_text(encoding="utf-8"))
credits = "# Naturalne nagrania\n\nWszystkie źródła: CC0-1.0, zweryfikowane 20.09.2026 na stronie autora.\nPrzetwarzanie: `tools/audio/prepare-natural.py`; pobrane publiczne podglądy HQ MP3.\n\n"
credits += "\n".join(
    f"- {s['name']}: {s['url']} (CC0-1.0{'; ' + s['note'] if 'note' in s else ''})" for s in sources
)
(public / "ambience/ATTRIBUTION.md").write_text(credits + "\n", encoding="utf-8")
