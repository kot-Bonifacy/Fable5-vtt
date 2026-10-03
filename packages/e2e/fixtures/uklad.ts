import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test } from './actors.ts';
import { E2E_DIR } from '../instance/paths.ts';

/**
 * T8a (`testy.md` 6.4): czy ekran się mieści. Jeden przegląd DOM-u w karcie —
 * bez wiedzy o komponentach, więc przeżyje refaktoryzację, którą ma osłaniać.
 *
 * Wagi (decyzja MG z 03.10): kontrolka nieosiągalna nawet po przewinięciu = B2
 * (`unreachable`, `clipped`); ucięty napis, nachodzące obszary i zły kontrast
 * motywu = B3 (`truncated`, `overlaps`, `lowContrast`) — te idą do adnotacji.
 */

export interface LayoutReport {
  viewport: { width: number; height: number };
  /** Strona przewija się sama (o ile pikseli) — aplikacja ma stać w oknie. */
  pageOverflow: { x: number; y: number };
  /** Kontrolka poza oknem bez przewijanego przodka, który by ją pokazał. */
  unreachable: string[];
  /** Kontrolka przycięta przez przodka z `overflow: hidden`, który się nie przewija. */
  clipped: string[];
  /** Napis ucięty w poziomie (wielokropek albo `overflow: hidden`) — obserwacja. */
  truncated: string[];
  /** Główne obszary ekranu nachodzą na siebie. */
  overlaps: string[];
  /** Napisy o kontraście poniżej 3:1 z tłem (bez tła z obrazu) — obserwacja. */
  lowContrast: string[];
}

/**
 * Przegląd w karcie. `scope` zawęża kontrolki i napisy do jednego okna (karta,
 * kreator), a obszary główne sprawdza się zawsze.
 */
export async function inspectLayout(page: Page, scope?: string): Promise<LayoutReport> {
  return page.evaluate((scopeSelector) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const EPS = 1.5;
    const root: ParentNode = (scopeSelector && document.querySelector(scopeSelector)) || document;

    const describe = (el: Element, byText = false): string => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const label =
        (byText && text) ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el as HTMLInputElement).placeholder ||
        (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const region = el.closest(
        '[role="region"][aria-label], [role="dialog"][aria-label], .side-panel, .top-bar, .combat-bar, .map-column, .app-main > *',
      );
      const where = region
        ? region.getAttribute('aria-label') || region.className.toString().split(' ')[0]
        : '';
      const cls =
        el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
      return `${where ? `[${where}] ` : ''}${el.tagName.toLowerCase()}${cls} „${label.slice(0, 40)}”`;
    };

    const visible = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      const checkVisibility = (el as HTMLElement).checkVisibility;
      if (
        checkVisibility &&
        !checkVisibility.call(el, { opacityProperty: true, visibilityProperty: true })
      )
        return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    };

    const scrolls = (el: Element, axis: 'x' | 'y'): boolean => {
      const style = getComputedStyle(el);
      const overflow = axis === 'x' ? style.overflowX : style.overflowY;
      if (overflow !== 'auto' && overflow !== 'scroll') return false;
      return axis === 'x'
        ? el.scrollWidth > el.clientWidth + 1
        : el.scrollHeight > el.clientHeight + 1;
    };

    const clips = (el: Element): boolean => {
      const style = getComputedStyle(el);
      return [style.overflowX, style.overflowY].some((v) => v !== 'visible');
    };

    type Box = { left: number; top: number; right: number; bottom: number };
    const inside = (a: Box, b: Box) =>
      a.left >= b.left - EPS &&
      a.top >= b.top - EPS &&
      a.right <= b.right + EPS &&
      a.bottom <= b.bottom + EPS;

    const unreachable: string[] = [];
    const clipped: string[] = [];
    const controls = root.querySelectorAll(
      'button, input:not([type="hidden"]), select, textarea, a[href], [role="button"], [role="tab"], summary',
    );
    for (const el of Array.from(controls)) {
      if (!visible(el)) continue;
      // Pole wyboru pliku i przełączniki bywają celowo schowane pod etykietą.
      if (el instanceof HTMLInputElement && ['file', 'checkbox', 'radio'].includes(el.type)) {
        const box = el.getBoundingClientRect();
        if (box.width <= 2 || box.height <= 2) continue;
      }
      let box: Box = el.getBoundingClientRect();
      let clippedBy = '';
      for (
        let parent = el.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        if (!clips(parent)) continue;
        const frame = parent.getBoundingClientRect();
        if (inside(box, frame)) continue;
        const outX = box.left < frame.left - EPS || box.right > frame.right + EPS;
        const outY = box.top < frame.top - EPS || box.bottom > frame.bottom + EPS;
        if ((outX && !scrolls(parent, 'x')) || (outY && !scrolls(parent, 'y'))) {
          // Całkiem poza ramką bywa celowo schowana kontrolka — opis to mówi,
          // a werdykt zostawia człowiekowi przy zrzucie.
          const fullyOut =
            box.right <= frame.left ||
            box.left >= frame.right ||
            box.bottom <= frame.top ||
            box.top >= frame.bottom;
          const name = parent.className.toString().split(' ')[0] || parent.tagName.toLowerCase();
          clippedBy = `${fullyOut ? 'schowane w' : 'ucięte przez'} .${name}`;
          break;
        }
        // Przewijany przodek pokaże kontrolkę — dalej liczy się już on sam.
        box = frame;
      }
      if (clippedBy) {
        clipped.push(`${describe(el)} (${clippedBy})`);
        continue;
      }
      if (!inside(box, { left: 0, top: 0, right: vw, bottom: vh })) unreachable.push(describe(el));
    }

    // Napisy ucięte w poziomie: element liścia z tekstem szerszym od siebie.
    const truncated: string[] = [];
    const textHosts = root.querySelectorAll(
      'button, label, span, p, h1, h2, h3, h4, td, th, li, a, div',
    );
    for (const el of Array.from(textHosts)) {
      if (el.children.length > 0 && el.tagName !== 'BUTTON') continue;
      if (!(el.textContent ?? '').trim() || !visible(el)) continue;
      // Napis dla czytnika ekranu jest schowany celowo (`.visually-hidden`).
      if (el.closest('.visually-hidden, .sr-only')) continue;
      const style = getComputedStyle(el);
      if (style.overflowX === 'visible' && style.textOverflow !== 'ellipsis') continue;
      if (el.scrollWidth > el.clientWidth + 1) truncated.push(describe(el, true));
    }

    // Główne obszary ekranu nie nachodzą na siebie (pasek, szyna akcji, mapa, panel).
    const overlaps: string[] = [];
    const regions = [
      ...Array.from(
        document.querySelectorAll('.top-bar, .app-main > *, .map-column > .combat-bar'),
      ),
    ].filter(visible);
    for (let i = 0; i < regions.length; i += 1) {
      for (let j = i + 1; j < regions.length; j += 1) {
        const a = regions[i]!;
        const b = regions[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 2 && h > 2) {
          overlaps.push(
            `${a.className.toString().split(' ')[0]} × ${b.className.toString().split(' ')[0]} (${Math.round(w)}×${Math.round(h)})`,
          );
        }
      }
    }

    // Kontrast napisu z najbliższym nieprzezroczystym tłem (WCAG); tło z obrazu
    // (papier) zaburza rachunek, więc takie napisy liczy się z koloru pod obrazem.
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const backgroundOf = (el: Element): number[] | null => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg[3]! > 0.5) return bg;
      }
      return null;
    };
    const lowContrast: string[] = [];
    const scopeRoot = scopeSelector ? document.querySelector(scopeSelector) : null;
    if (scopeRoot) {
      for (const el of Array.from(scopeRoot.querySelectorAll('*'))) {
        const own = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && (n.textContent ?? '').trim(),
        );
        if (!own || !visible(el)) continue;
        const fg = parse(getComputedStyle(el).color);
        const bg = backgroundOf(el);
        if (!fg || !bg) continue;
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (l1! + 0.05) / (l2! + 0.05);
        if (ratio < 3 && fg[3]! > 0.5) lowContrast.push(`${describe(el)} ${ratio.toFixed(1)}:1`);
      }
    }

    const doc = document.documentElement;
    return {
      viewport: { width: vw, height: vh },
      pageOverflow: {
        x: Math.max(0, doc.scrollWidth - vw),
        y: Math.max(0, doc.scrollHeight - vh),
      },
      unreachable,
      clipped,
      truncated: [...new Set(truncated)],
      overlaps,
      lowContrast: [...new Set(lowContrast)],
    };
  }, scope ?? null);
}

/** Katalog zrzutów T8a do obejrzenia po przebiegu (`.e2e/pomiary/t8a`). */
export const SHOTS_DIR = join(E2E_DIR, 'pomiary', 't8a');

/**
 * Przegląd, zrzut do `.e2e/pomiary/t8a/<nazwa>.png` i adnotacje z obserwacjami.
 * Zwraca raport — asercje B2 robi spec (`expectReachable`).
 */
export async function survey(page: Page, name: string, scope?: string): Promise<LayoutReport> {
  const report = await inspectLayout(page, scope);
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
  writeFileSync(join(SHOTS_DIR, `${name}.json`), JSON.stringify(report, null, 1));
  const info = test.info();
  for (const key of ['truncated', 'overlaps', 'lowContrast'] as const) {
    if (report[key].length) {
      info.annotations.push({ type: `${name}: ${key}`, description: report[key].join(' · ') });
    }
  }
  return report;
}

/** Nic nieosiągalnego (B2) i strona bez własnego przewijania. */
export function reachabilityProblems(report: LayoutReport): string[] {
  return [
    ...(report.pageOverflow.x || report.pageOverflow.y
      ? [`strona przewija się o ${report.pageOverflow.x}×${report.pageOverflow.y} px`]
      : []),
    ...report.unreachable.map((d) => `poza oknem: ${d}`),
    ...report.clipped.map((d) => `przycięte: ${d}`),
  ];
}
