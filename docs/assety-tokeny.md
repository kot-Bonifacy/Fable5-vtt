# Assety tokenów — źródła i prompty

## Co jest w repo

- `data/public/tokens/` — 3 przykładowe portrety (własne, generowane skryptem
  `scripts/generate-sample-tokens.mjs`, wolne od praw): `solo-red.png`,
  `netrunner-cyan.png`, `fixer-gold.png`.
- `data/public/cpred/status-icons/` — 13 ikon statusów z
  [game-icons.net](https://game-icons.net) (CC BY 3.0, atrybucja w
  `ATTRIBUTION.md` obok ikon). Definicje: `data/public/cpred/statuses.json`.

## Darmowe źródła portretów/tokenów

- **game-icons.net** — 4000+ ikon SVG (CC BY 3.0), dobre na szybkie tokeny NPC.
- **2minutetabletop.com** — paczki tokenów top-down, część darmowa (licencja
  na prywatny użytek), klimaty również sci-fi.
- **Forgotten Adventures** (forgotten-adventures.net) — darmowe paczki
  tokenów/assetów do użytku prywatnego.
- **artbreeder.com / thispersondoesnotexist** — portrety "ludzi, których nie ma"
  (sprawdź licencję przed użyciem publicznym; do prywatnej gry OK).

Token w VTT jest przycinany do koła z kolorową obwódką — najlepiej działają
**portrety popiersia, wykadrowane na twarz, kwadratowe** (idealnie 512×512,
limit uploadu: 8 MB / 2048 px).

## Prompty do generatorów grafik (Midjourney / SDXL / DALL-E / Flux)

Wspólna końcówka do każdego promptu:

> square portrait, centered head and shoulders, dark moody neon background,
> cyberpunk 2077 comic art style, bold ink shading, high contrast, no text

- **Solo (najemnik):**
  "Cyberpunk mercenary portrait, scarred face, glowing red cybernetic eye,
  tactical armored jacket, short military haircut" + końcówka
- **Netrunnerka:**
  "Female netrunner portrait, neon cyan mohawk, mirrored AR visor over eyes,
  interface plugs on temples, holographic code reflections" + końcówka
- **Fixer:**
  "Corporate fixer portrait, sharp suit with gold chains, cybernetic jaw
  implant, confident smirk, golden neon accents" + końcówka
- **Rockerboy:**
  "Rockerboy portrait, leather jacket with spikes, chrome arm, stage lights,
  long wild hair, microphone" + końcówka
- **Cyberpsychol (ukryty NPC):**
  "Cyberpsycho portrait, face half replaced by chrome plating, twitching
  optics, exposed cables on neck, menacing stare" + końcówka
- **Bouncer / ochroniarz:**
  "Heavy bouncer portrait, massive neck, subdermal armor plates on skull,
  earpiece, bored expression" + końcówka

Po wygenerowaniu: wykadruj do kwadratu i wgraj przez zakładkę **Tokeny →
Wgraj grafikę tokenu** (biblioteka per kampania, pliki lądują w `uploads/tokens/`).
