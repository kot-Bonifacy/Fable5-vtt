import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cup-notification.js', () => ({ playNaturalNotification: vi.fn(async () => {}) }));

import { playNaturalNotification } from './cup-notification.js';
import { clearNotices, notifyChoice, notifyInfo, notifyRefusal, noteAck } from './notices.js';
import {
  infoLifetime,
  NOTICE_LIMIT,
  pushNotice,
  useNoticeStore,
  type NoticeInput,
} from './stores/noticeStore.js';

const notices = () => useNoticeStore.getState().notices;

describe('kanał komunikatów (etap 55)', () => {
  beforeEach(() => {
    useNoticeStore.getState().reset();
    vi.mocked(playNaturalNotification).mockClear();
    vi.useFakeTimers();
    vi.advanceTimersByTime(10_000);
  });

  it('odmowa w temacie zastępuje poprzednią z tego tematu, inne tematy zostają', () => {
    notifyRefusal('move', 'Za daleko.');
    notifyRefusal('attack', 'Brak amunicji.');
    notifyRefusal('move', 'Ściana na drodze.');
    expect(notices().map((n) => n.text)).toEqual(['Brak amunicji.', 'Ściana na drodze.']);
  });

  it('to samo zdanie odświeża wiersz zamiast dokładać drugi', () => {
    notifyRefusal('move', 'Za daleko.');
    const id = notices()[0]!.id;
    notifyRefusal('move', 'Za daleko.');
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.id).toBe(id);
    expect(notices()[0]!.raised).toBe(1);
  });

  it('udana próba (noteAck ok) zamyka odmowę tematu, nieudana ją stawia', () => {
    expect(noteAck('net', { ok: false, error: 'X' }, (code) => `Kod ${code}`)).toBe(false);
    expect(notices()[0]).toMatchObject({ topic: 'net', text: 'Kod X', tone: 'danger' });
    expect(noteAck('net', { ok: true }, () => 'nic')).toBe(true);
    expect(notices()).toEqual([]);
  });

  it('informacja ma czas życia, odmowa i pytanie czekają', () => {
    notifyInfo('MG rozpoczął sesję.');
    notifyRefusal('move', 'Za daleko.');
    notifyChoice('attack', 'Cel za osłoną.', [{ label: 'Ostrzelaj osłonę', run: () => {} }]);
    expect(notices().map((n) => n.lifetime)).toEqual([
      infoLifetime('MG rozpoczął sesję.'),
      null,
      null,
    ]);
  });

  it('czas informacji rośnie z długością zdania, z sufitem', () => {
    expect(infoLifetime('krótko')).toBe(4_000);
    expect(infoLifetime('x'.repeat(100))).toBe(6_000);
    expect(infoLifetime('x'.repeat(1_000))).toBe(10_000);
  });

  it('clearNotices zdejmuje także pytanie z tematu', () => {
    notifyChoice('attack', 'Cel za osłoną.', [{ label: 'A', run: () => {} }]);
    clearNotices('attack');
    expect(notices()).toEqual([]);
  });

  it('ponad limit wypada najstarszy bez przycisków, pytanie zostaje', () => {
    const base = { tone: 'info', title: 'I', topic: null, lifetime: 1 } as const;
    let list = pushNotice(
      [],
      { ...base, text: 'pytanie', actions: [{ label: 'A', run: () => {} }] } satisfies NoticeInput,
      'q',
    );
    for (let i = 0; i < NOTICE_LIMIT; i++)
      list = pushNotice(list, { ...base, text: `info ${i}` }, `i${i}`);
    expect(list).toHaveLength(NOTICE_LIMIT);
    expect(list.map((n) => n.text)).toEqual(['pytanie', 'info 1', 'info 2', 'info 3']);
  });

  it('dzwoni odmowa i pytanie, informacja i uwaga milczą, seria dzwoni raz', () => {
    notifyInfo('Sesja.');
    notifyRefusal('move', 'Złap oddech.', { tone: 'warn' });
    expect(playNaturalNotification).not.toHaveBeenCalled();
    notifyRefusal('move', 'Za daleko.');
    notifyRefusal('move', 'Za daleko.');
    expect(playNaturalNotification).toHaveBeenCalledTimes(1);
    expect(playNaturalNotification).toHaveBeenLastCalledWith('refusal');
    vi.advanceTimersByTime(1_000);
    notifyChoice('attack', 'Cel za osłoną.', [{ label: 'A', run: () => {} }]);
    expect(playNaturalNotification).toHaveBeenLastCalledWith('request');
  });
});
