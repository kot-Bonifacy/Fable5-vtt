import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chatCategoryOf, isCheckRequestOpen, type CheckRequestEntry } from '@vtt/shared';
import { openCheckCallFor, type ChatItem } from './stores/chatStore.js';
import type { ChatMessageView } from '@vtt/shared';

/**
 * Strażnik rozstrzygnięcia, na którym stoi etap 40: **kubek nie woła na
 * prośbę.**
 *
 * `openCheckCallFor` przegląda feed czatu w poszukiwaniu otwartego wezwania
 * i zapala kubek. Prośba o Test wygląda z lotu ptaka tak samo — jest wierszem
 * czatu, należy do tego samego gracza, czeka na coś — ale **nie ma progu**:
 * przy prośbie PT dopiero powstanie w głowie MG. Kubek zapalony nad prośbą
 * dałby graczowi rzut przed zgodą, czyli dokładnie to, czego ten etap miał się
 * pozbyć.
 *
 * Dwie asercje na dwóch poziomach, bo regułę da się złamać na dwa sposoby:
 * zachowaniem (drabinka rodzajów) i przez dopisanie wywołania, którego dziś nie
 * ma (test źródłowy, wzorem `tables-cup.test.ts` z etapu 34).
 */

const SRC = join(import.meta.dirname);

/** Sam kod, bez komentarzy — te wolno (i trzeba) o kubku pisać. */
function code(file: string): string {
  return readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function message(patch: Partial<ChatMessageView>): ChatItem {
  return {
    type: 'message',
    message: {
      id: 1,
      kind: 'say',
      authorId: 'user-vex',
      authorName: 'Vex',
      text: '',
      createdAt: '2026-09-06T10:00:00.000Z',
      ...patch,
    },
  };
}

const REQUEST: CheckRequestEntry = {
  characterId: 'char-1',
  characterName: 'Forty',
  askedById: 'user-vex',
  askedByName: 'Vex',
  rollLabel: 'Odczytywanie emocji (EMP)',
  system: { kind: 'skill', skillId: 'human-perception' },
};

describe('prośba o Test a kubek (etap 40)', () => {
  it('otwarta prośba nie zapala kubka proszącemu', () => {
    const items = [message({ id: 7, kind: 'request', request: REQUEST })];
    expect(isCheckRequestOpen(REQUEST)).toBe(true);
    expect(openCheckCallFor(items, 'user-vex')).toBeNull();
  });

  it('wezwanie, które z niej powstało, zapala go normalnie', () => {
    const items = [
      message({ id: 7, kind: 'request', request: REQUEST }),
      message({
        id: 8,
        kind: 'check',
        check: {
          characterId: 'char-1',
          characterName: 'Forty',
          ownerId: 'user-vex',
          rollLabel: 'Odczytywanie emocji (EMP)',
          dv: 15,
          visibility: 'public',
          system: { kind: 'skill', skillId: 'human-perception' },
          calledByName: 'MG',
        },
      }),
    ];
    expect(openCheckCallFor(items, 'user-vex')?.messageId).toBe(8);
  });

  it('kubek rozstrzyga po RODZAJU wiersza, a nie po tym, które pole akurat jest puste', () => {
    // Gdyby warunek stał wyłącznie na `message.check`, wystarczyłby jeden etap,
    // w którym prośba zaczyna wozić podgląd wezwania, żeby kubek zawołał za
    // wcześnie. Rodzaj jest tu jedyną granicą, której nie da się rozmyć.
    expect(code('stores/chatStore.ts')).toMatch(/kind !== 'check'/);
  });

  it('karta prośby nie ma żadnej drogi do kubka', () => {
    for (const file of ['components/CheckRequest.tsx', 'components/CheckRequestDialog.tsx']) {
      expect(code(file), `${file} nie ma prawa dotykać kubka`).not.toMatch(
        /rollStore|loadCup|load[A-Z]\w*Cup|clearCup/,
      );
    }
  });

  it('prośba i wezwanie chowają się razem — jedna grupa filtra', () => {
    expect(chatCategoryOf('request')).toBe(chatCategoryOf('check'));
  });
});
