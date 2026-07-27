import fs from 'node:fs';
import path from 'node:path';

/**
 * Cyberpunk RED — przebudowa tekstowego zrzutu podręcznika na czytelny markdown.
 *
 * Skrypt jest parserem, nie treścią: struktura rozdziałów (tytuły + strony) leży
 * w `data/private/rulebook/manual/structure.json`, poza repozytorium.
 *
 *   node tools/rulebook/build-manual.mjs <plik-zrodlowy.md> <katalog-wyjsciowy>
 */
const SRC = process.argv[2];
const OUT_DIR = process.argv[3];
const STRUCTURE = process.argv[4] || path.join(OUT_DIR ?? '.', 'structure.json');

if (!SRC || !OUT_DIR) {
  console.error(
    'Użycie: node tools/rulebook/build-manual.mjs <zrodlo.md> <katalog-wyjsciowy> [structure.json]',
  );
  process.exit(1);
}
if (!fs.existsSync(STRUCTURE)) {
  console.error(
    `Brak pliku struktury: ${STRUCTURE}\n` +
      'Zawiera tytuły rozdziałów podręcznika, więc trzymamy go w data/private/ (poza repo).',
  );
  process.exit(1);
}
const structure = JSON.parse(fs.readFileSync(STRUCTURE, 'utf8'));
const stats = {};

// ─────────────────────────── 0. wczytanie i podział na strony ───────────────────────────
const raw = fs.readFileSync(SRC, 'utf8');
const MARK = /adDownload to read ad-free/g;
const marks = [];
let m;
while ((m = MARK.exec(raw))) marks.push({ s: m.index, e: MARK.lastIndex });

const tocRaw = raw.slice(0, marks[0].s);
const pagesRaw = marks.map((mk, i) => ({
  page: 4 + i,
  text: raw.slice(mk.e, i + 1 < marks.length ? marks[i + 1].s : raw.length),
}));
stats.stron = pagesRaw.length;

// ─────────────────────────── 1. normalizacja znaków ───────────────────────────
const LIG = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
};
let ligCount = 0;
function normalizeChars(s) {
  s = s.replace(/[\uFB00-\uFB06]/g, (c) => {
    ligCount++;
    return LIG[c];
  });
  s = s.replace(/[\u00A0\u2007\u202F\u2009\u200A\u2002-\u2006]/g, ' ');
  s = s.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
  s = s.replace(/\u2010/g, '-');
  return s.replace(/\s+/g, ' ');
}

// ─────────────────────────── 2. słownik korpusu ───────────────────────────
const flat = normalizeChars(raw);
const VOCAB = new Set();
const HYPH = new Map();
for (const w of flat.split(/[^\p{L}-]+/u)) {
  if (!w) continue;
  const lw = w.toLowerCase();
  if (w.includes('-')) HYPH.set(lw, (HYPH.get(lw) || 0) + 1);
  else if (w.length >= 2) VOCAB.add(lw);
}
stats.slownik = VOCAB.size;

// ─────────────────────────── 3. rozstrzelone napisy ozdobne ───────────────────────────
let spacedRemoved = 0;
function dropLetterSpaced(s) {
  return s.replace(/(?:(?<=^|\s)\p{L} ){7,}\p{L}(?=\s|$)/gu, () => {
    spacedRemoved++;
    return ' ';
  });
}

// ─────────────────────────── 4. kapitaliki / inicjały ───────────────────────────
// "S TRÓŻ P RAWA" → "STRÓŻ PRAWA";  "T worzenie" → "Tworzenie"
const ONE_LETTER = new Set(['A', 'I', 'O', 'U', 'W', 'Z']);
let scJoined = 0,
  scKept = 0;
function fixSmallCaps(s) {
  // wariant WIELKIE: "S TRÓŻ"
  s = s.replace(/(?<![\p{L}])(\p{Lu}) (\p{Lu}{2,})(?![\p{Ll}])/gu, (full, a, rest) => {
    if (ONE_LETTER.has(a) && !VOCAB.has((a + rest).toLowerCase())) {
      scKept++;
      return full;
    }
    scJoined++;
    return a + rest;
  });
  // wariant inicjał + małe litery: "T worzenie"
  s = s.replace(/(?<![\p{L}])(\p{Lu}) (\p{Ll}{2,})/gu, (full, a, rest) => {
    const joined = (a + rest).toLowerCase();
    if (!VOCAB.has(joined)) {
      scKept++;
      return full;
    }
    // "w stanie" ≠ "wstanie" — przy polskich jednoliterowych przyimkach ufamy rozdzieleniu,
    // jeśli drugi człon sam jest poprawnym wyrazem
    if (ONE_LETTER.has(a) && VOCAB.has(rest.toLowerCase())) {
      scKept++;
      return full;
    }
    scJoined++;
    return a + rest;
  });
  return s;
}

// ─────────────────────────── 5. dzielenie wyrazów ───────────────────────────
// Łącznik między małymi literami prawie zawsze pochodzi z przeniesienia wiersza w PDF.
// Sklejamy domyślnie; łącznik zostaje tylko tam, gdzie wygląda na prawdziwe złożenie.
const COMPOUND_PREFIX = new Set([
  'eks',
  'wice',
  'super',
  'mini',
  'pseudo',
  'quasi',
  'post',
  'anty',
  'arcy',
  'eko',
  'euro',
  'cyber',
  'neo',
  'ultra',
  'hiper',
  'mega',
  'multi',
  'makro',
  'mikro',
  'auto',
  'tele',
  'radio',
  'audio',
  'foto',
  'kontr',
  'przeciw',
  'około',
  'ponad',
  'niby',
  'wpół',
  'pół',
  'video',
  'wideo',
  'non',
]);
let hyphJoined = 0,
  hyphKept = 0;
const keptSamples = new Map();

const ELLIPSIS_TAIL = new Set(['lub', 'albo', 'oraz', 'czy']); // "jedno- lub dwuręczna"

// rdzenie wyrazów korpusu — pozwalają rozpoznać odmianę ("implantowaniu" ~ "implantowany")
const STEMS = new Set();
for (const w of VOCAB) for (let k = 6; k <= Math.min(14, w.length); k++) STEMS.add(w.slice(0, k));
function looksLikeInflection(joined) {
  if (joined.length < 8) return false;
  return (
    STEMS.has(joined.slice(0, joined.length - 2)) || STEMS.has(joined.slice(0, joined.length - 3))
  );
}

// "mięśniowo-kostny": człon na -o, od którego istnieje przymiotnik ("mięśniowy")
function isAdverbialStem(a) {
  const la = a.toLowerCase();
  if (!la.endsWith('o') || la.length < 4) return false;
  return VOCAB.has(la) || VOCAB.has(la.slice(0, -1) + 'y') || VOCAB.has(la.slice(0, -1) + 'a');
}

function isRealCompound(a, b, full, spaced) {
  if ((HYPH.get(full.toLowerCase().replace(/\s+/g, '')) || 0) >= 3) return true;
  if (COMPOUND_PREFIX.has(a.toLowerCase())) return true;
  if (ELLIPSIS_TAIL.has(b.toLowerCase())) return true;
  // odmiana znanego wyrazu ⇒ to było przeniesienie wiersza, nie złożenie
  if (looksLikeInflection((a + b).toLowerCase())) return false;
  if (isAdverbialStem(a)) return true;
  if (spaced) return false; // odstęp po łączniku = przeniesienie wiersza
  if (
    a.length >= 4 &&
    b.length >= 4 &&
    VOCAB.has(a.toLowerCase()) &&
    VOCAB.has(b.toLowerCase()) &&
    !VOCAB.has((a + b).toLowerCase())
  )
    return true;
  return false;
}

function fixHyphenation(s) {
  const join = (spaced) => (full, a, b) => {
    if (VOCAB.has((a + b).toLowerCase())) {
      hyphJoined++;
      return a + b;
    }
    if (isRealCompound(a, b, full, spaced)) {
      hyphKept++;
      keptSamples.set(
        full.toLowerCase().replace(/\s+/g, ' '),
        (keptSamples.get(full.toLowerCase().replace(/\s+/g, ' ')) || 0) + 1,
      );
      return spaced ? a + '-' + b : full;
    }
    hyphJoined++;
    return a + b;
  };
  s = s.replace(/(\p{Ll}{2,})-\s+(\p{Ll}{2,})/gu, join(true));
  s = s.replace(/(\p{Ll}{2,})-(\p{Ll}{2,})/gu, join(false));
  return s;
}

// ─────────────────────────── 5b. odstępy przy interpunkcji ───────────────────────────
function fixSpacing(s) {
  s = s.replace(/ +([,.;:!?…])/g, '$1'); // "narracyjny ." → "narracyjny."
  s = s.replace(/\( +/g, '(').replace(/ +\)/g, ')'); // "( str. 189 )" → "(str. 189)"
  s = s.replace(/([”"])(\p{L})/gu, '$1 $2'); // "gadaj.”Hornet" → "gadaj.” Hornet"
  s = s.replace(/(\p{L})(„)/gu, '$1 $2');
  s = s.replace(/ {2,}/g, ' ');
  return s;
}

// ─────────────────────────── 6. zwijanie sąsiadujących duplikatów ───────────────────────────
let dupCollapsed = 0;
const MAXRUN = 14;
function collapseDuplicates(s) {
  let words = s.split(' ');
  for (let pass = 0; pass < 6; pass++) {
    const out = [];
    let i = 0,
      changed = false;
    while (i < words.length) {
      let hit = 0;
      for (let n = Math.min(MAXRUN, (words.length - i) >> 1); n >= 1; n--) {
        let same = true;
        for (let k = 0; k < n; k++)
          if (words[i + k] !== words[i + n + k]) {
            same = false;
            break;
          }
        if (!same) continue;
        if (words.slice(i, i + n).join(' ').length < 4) continue;
        hit = n;
        break;
      }
      if (hit) {
        for (let k = 0; k < hit; k++) out.push(words[i + k]);
        i += hit * 2;
        dupCollapsed++;
        changed = true;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    words = out;
    if (!changed) break;
  }
  return words.join(' ');
}

// ─────────────────────────── 7. rozdziały ───────────────────────────
const TOP_LEVEL = structure.topLevel;
const RUNNING_HEAD = structure.runningHead ?? {};
const FRONT_MATTER_TITLE = structure.frontMatterTitle ?? 'Przedmowa';

const tocEntries = [];
const TOC_RE = /([^.\d][^.]*?)\s*\.{3,}\s*(\d{1,3})/g;
while ((m = TOC_RE.exec(normalizeChars(tocRaw)))) {
  const title = m[1]
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^spis treści\s*/i, '');
  if (title.length > 2) tocEntries.push({ title, page: +m[2] });
}
const chapters = [];
const usedTop = new Set();
for (const e of tocEntries) {
  if (TOP_LEVEL.includes(e.title) && !usedTop.has(e.title)) {
    usedTop.add(e.title);
    chapters.push({ ...e, sections: [] });
  } else if (chapters.length) chapters.at(-1).sections.push(e);
}
// strony przed pierwszym rozdziałem (przedmowa) nie mogą wypaść z opracowania
if (chapters.length && chapters[0].page > 4) {
  chapters.unshift({ title: FRONT_MATTER_TITLE, page: 4, sections: [] });
}
chapters.forEach((c, i) => {
  c.endPage = i + 1 < chapters.length ? chapters[i + 1].page - 1 : 456;
});
stats.rozdzialy = chapters.length;

const headVariants = [];
for (const c of chapters) {
  for (const h of RUNNING_HEAD[c.title] || [c.title.toUpperCase()]) {
    headVariants.push(h);
    headVariants.push(h.slice(0, -1)); // wariant z uciętym ostatnim znakiem (artefakt składu)
  }
}
headVariants.sort((a, b) => b.length - a.length);

// ─────────────────────────── 8. czyszczenie strony ───────────────────────────
let furnitureStripped = 0,
  creditsStripped = 0;
const sectionTitlesByPage = new Map();
for (const c of chapters)
  for (const sx of c.sections) {
    if (!sectionTitlesByPage.has(sx.page)) sectionTitlesByPage.set(sx.page, []);
    sectionTitlesByPage.get(sx.page).push(sx.title);
  }

function cleanPage(p) {
  let s = normalizeChars(p.text);
  s = dropLetterSpaced(s);
  s = s.replace(/\s+/g, ' ').trim();
  s = fixSmallCaps(s);
  s = collapseDuplicates(s);
  s = fixSmallCaps(s);
  s = fixHyphenation(s);

  // kredyty ilustratorskie w dowolnym miejscu strony
  s = s.replace(/\bILUSTRACJ[AE]\s*:?\s*(?:[\p{Lu}][\p{Lu}'’.-]*\s*){1,4}/gu, () => {
    creditsStripped++;
    return ' ';
  });

  // elementy stałe strony: numer + żywa pagina (verso/recto) + tytuł rozdziału
  const num = String(p.page);
  const numRe = new RegExp('^' + num + '(?![\\d])\\s*');
  for (let round = 0; round < 4; round++) {
    const before = s;
    s = s
      .replace(numRe, () => {
        furnitureStripped++;
        return '';
      })
      .trim();
    for (const h of headVariants) {
      if (s.toUpperCase().startsWith(h)) {
        s = s.slice(h.length).trim();
        furnitureStripped++;
        break;
      }
    }
    s = s
      .replace(numRe, () => {
        furnitureStripped++;
        return '';
      })
      .trim();
    if (s === before) break;
  }
  // numer strony wtrącony za tytułem otwierającym rozdział ("PODSTAWY MECHANIKI GRY 125 „Pożyj…")
  const head80 = s.slice(0, 80);
  const inlineNum = new RegExp('(?<!str\\. )(?<!s\\. )(?<![\\d,.])\\b' + num + '\\b(?![\\d,.])');
  if (inlineNum.test(head80)) {
    s = (
      head80.replace(inlineNum, () => {
        furnitureStripped++;
        return '';
      }) + s.slice(80)
    )
      .replace(/\s+/g, ' ')
      .trim();
  }
  s = fixSpacing(s);
  // powtórzony tytuł podrozdziału na początku strony (mamy go już jako nagłówek ##)
  for (const title of sectionTitlesByPage.get(p.page) || []) {
    if (s.toLowerCase().startsWith(title.toLowerCase())) {
      s = s.slice(title.length).trim();
      furnitureStripped++;
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

// ─────────────────────────── 9. nagłówki śródtekstowe ───────────────────────────
const STAT_WORDS = new Set([
  'INT',
  'REF',
  'ZW',
  'TECH',
  'CHA',
  'SW',
  'SZ',
  'RUCH',
  'BC',
  'EMP',
  'PW',
  'SP',
  'OBR',
  'PT',
  'ROF',
  'UCI',
  'LA',
  'OB',
  'MG',
  'BD',
  'PZ',
  'TT',
  'ED',
  'K6',
  'K10',
]);
const HEADING_RE =
  /(?:^|(?<=[.!?…»”"'\s]))((?:[\p{Lu}][\p{Lu}'’-]*(?:\s+|$)){2,8})(?=[\p{Lu}][\p{Ll}])/gu;
let headingsFound = 0;
function markHeadings(s) {
  return s.replace(HEADING_RE, (full, run) => {
    const words = run.trim().split(/\s+/);
    if (words.length < 2 || words.length > 8) return full;
    if (words.some((w) => /\d/.test(w))) return full;
    if (words.every((w) => STAT_WORDS.has(w) || w.length < 3)) return full;
    const letters = run.replace(/[^\p{L}]/gu, '').length;
    if (letters < 8 || letters > 60) return full;
    headingsFound++;
    return '\n\n@@H@@' + words.join(' ') + '@@\n\n';
  });
}

// ─────────────────────────── 10. akapity i zdania ───────────────────────────
const ABBR = new Set([
  'np',
  'itd',
  'itp',
  'tzn',
  'tj',
  'ok',
  'm',
  'in',
  'str',
  's',
  'r',
  'ul',
  'godz',
  'min',
  'sek',
  'nr',
  'im',
  'dr',
  'mgr',
  'św',
  'ang',
  'tzw',
  'pkt',
  'ww',
  'jw',
  'cd',
  'ds',
  'os',
  'proc',
  'wg',
  'zob',
  'por',
  'ss',
  'lp',
  'ed',
]);
function splitSentences(s) {
  const out = [];
  let buf = '';
  for (const part of s.split(/(?<=[.!?…])\s+/)) {
    buf += (buf ? ' ' : '') + part;
    const mt = buf.match(/([\p{L}]+)[.!?…]$/u);
    const lw = mt ? mt[1].toLowerCase() : null;
    if (!(lw && (ABBR.has(lw) || lw.length === 1))) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

const PARA_TARGET = 420;
function layout(s) {
  const blocks = [];
  for (const chunk of s.split(/\n{2,}/)) {
    const c = chunk.trim();
    if (!c) continue;
    if (c.startsWith('@@H@@')) {
      blocks.push(c);
      continue;
    }
    const bullets = c.split(/\s*•\s*/).filter(Boolean);
    if (bullets.length > 1) {
      if (bullets[0].trim()) blocks.push(bullets[0].trim());
      blocks.push(
        bullets
          .slice(1)
          .map((b) => '- ' + b.trim())
          .join('\n'),
      );
      continue;
    }
    let para = [],
      len = 0;
    for (const sn of splitSentences(c)) {
      para.push(sn);
      len += sn.length;
      if (len >= PARA_TARGET) {
        blocks.push(para.join('\n'));
        para = [];
        len = 0;
      }
    }
    if (para.length) blocks.push(para.join('\n'));
  }
  return blocks;
}

// ─────────────────────────── 11. zapis ───────────────────────────
function slug(s) {
  return s
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/[źż]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

const cleaned = pagesRaw.map((p) => ({ page: p.page, text: cleanPage(p) }));

// przeniesienia wyrazów przez granicę stron
let crossPage = 0;
for (let i = 0; i < cleaned.length - 1; i++) {
  const a = cleaned[i],
    b = cleaned[i + 1];
  const mm = a.text.match(/(\p{Ll}{2,})-$/u);
  if (mm && /^\p{Ll}{2,}/u.test(b.text)) {
    const tail = b.text.match(/^(\p{Ll}+)/u)[1];
    if (VOCAB.has((mm[1] + tail).toLowerCase())) {
      a.text = a.text.slice(0, -1) + tail;
      b.text = b.text.slice(tail.length).trim();
      crossPage++;
    }
  }
}
stats.przeniesieniaMiedzyStronami = crossPage;

fs.mkdirSync(OUT_DIR, { recursive: true });
const subDir = path.join(OUT_DIR, 'CPRED-podrecznik');
fs.mkdirSync(subDir, { recursive: true });

const fileIndex = [];
chapters.forEach((c, ci) => {
  const nn = String(ci + 1).padStart(2, '0');
  const fname = `${nn}-${slug(c.title)}.md`;
  const lines = [
    `# ${c.title}`,
    '',
    `> Cyberpunk RED — podręcznik główny (wyd. polskie), s. ${c.page}–${c.endPage}.`,
  ];
  if (c.sections.length) {
    lines.push(
      '>',
      '> **W tym rozdziale:** ' + c.sections.map((sx) => `${sx.title} (s. ${sx.page})`).join(' · '),
    );
  }
  lines.push('');

  const startsAt = new Map();
  for (const sx of c.sections) {
    if (!startsAt.has(sx.page)) startsAt.set(sx.page, []);
    startsAt.get(sx.page).push(sx);
  }

  for (const pg of cleaned) {
    if (pg.page < c.page || pg.page > c.endPage) continue;
    for (const sx of startsAt.get(pg.page) || []) lines.push(`## ${sx.title}`, '');
    lines.push(`<!-- s. ${pg.page} -->`, '');
    if (!pg.text.trim()) {
      lines.push('*(strona bez tekstu — ilustracja całostronicowa)*', '');
      continue;
    }
    for (const b of layout(markHeadings(pg.text))) {
      if (b.startsWith('@@H@@'))
        lines.push(
          '### ' +
            b
              .replace(/^@@H@@/, '')
              .replace(/@@$/, '')
              .trim(),
          '',
        );
      else lines.push(b, '');
    }
  }
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  fs.writeFileSync(path.join(subDir, fname), body);
  fileIndex.push({ nn, fname, c, bytes: Buffer.byteLength(body) });
});

const idx = [
  '# Cyberpunk RED — podręcznik główny',
  '',
  '> ⚠️ **Materiał objęty prawem autorskim — wyłącznie do użytku prywatnego.**',
  '> Katalog `data/private/` jest w `.gitignore` i pilnowany przez `packages/server/src/licensing.test.ts`.',
  '> Nic z tych plików nie może trafić do publicznego repozytorium.',
  '',
  'Wersja robocza wygenerowana z tekstowego zrzutu podręcznika (`tools/rulebook/build-manual.mjs`).',
  'Tekst rozdziałów jest **pełny i dosłowny**; zmieniono wyłącznie formatowanie.',
  '',
  '## Jak korzystać',
  '',
  '- Każdy rozdział to osobny plik w `CPRED-podrecznik/`.',
  '- Numery stron oryginału są wstawione jako kotwice `<!-- s. 128 -->` — pozwalają odwołać się do druku.',
  '- Nagłówki `##` pochodzą ze spisu treści, `###` z nagłówków w tekście.',
  '',
  '## Spis rozdziałów',
  '',
  '| # | Rozdział | Strony | Plik |',
  '| --- | --- | --- | --- |',
];
for (const f of fileIndex)
  idx.push(
    `| ${f.nn} | ${f.c.title} | ${f.c.page}–${f.c.endPage} | [\`${f.fname}\`](CPRED-podrecznik/${f.fname}) |`,
  );
idx.push('', '## Szczegółowy spis treści', '');
for (const f of fileIndex) {
  idx.push(
    `### ${f.nn}. ${f.c.title}`,
    '',
    `[\`${f.fname}\`](CPRED-podrecznik/${f.fname}) · s. ${f.c.page}–${f.c.endPage}`,
    '',
  );
  if (f.c.sections.length) {
    for (const sx of f.c.sections) idx.push(`- ${sx.title} — s. ${sx.page}`);
    idx.push('');
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'CPRED-podrecznik.md'), idx.join('\n') + '\n');

Object.assign(stats, {
  ligatury: ligCount,
  rozstrzeloneUsuniete: spacedRemoved,
  duplikatyZwiniete: dupCollapsed,
  kapitalikiSklejone: scJoined,
  kapitalikiZachowane: scKept,
  dzieleniaSklejone: hyphJoined,
  dzieleniaZachowane: hyphKept,
  elementyStaleUsuniete: furnitureStripped,
  kredytyUsuniete: creditsStripped,
  naglowkiSrodtekstowe: headingsFound,
});
console.log(JSON.stringify(stats, null, 2));
const keptTop = [...keptSamples].sort((a, b) => b[1] - a[1]);
console.log('\nzachowane laczniki (' + keptTop.length + ' unikalnych):');
console.log(
  keptTop
    .slice(0, 60)
    .map(([w, n]) => `${w}(${n})`)
    .join(', '),
);
