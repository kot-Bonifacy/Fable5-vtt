import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultCharacterData } from '@vtt/shared';
import type { CharacterView, StateSyncPayload } from '@vtt/shared';
import { useCharacterStore } from './stores/characterStore.js';

/**
 * Strażnik #49 (T7b, 02.10): spóźnione echo zapisu karty nie cofa karty.
 *
 * Rozgłoszenia czekają za animacją rzutu (`rollPresentation`), acki nie. Echo
 * zapisu A przychodziło więc po acku zapisu B, kiedy nic już nie było w locie,
 * i karta wracała do A — a następny autozapis pisał A na B w bazie. Od 02.10
 * widok niesie `revision`, a starszy od posiadanego to historia.
 */

const base = createDefaultCharacterData();

function view(revision: number, notes: string): CharacterView {
  return {
    id: 'c1',
    name: 'Kowal',
    ownerId: 'u1',
    portraitUrl: null,
    playReady: true,
    template: false,
    templateId: null,
    data: { ...base, notes },
    revision,
    updatedAt: new Date(revision * 1000).toISOString(),
  };
}

function notes(): string {
  return (useCharacterStore.getState().characters['c1']!.data as { notes: string }).notes;
}

function sync(...characters: CharacterView[]): StateSyncPayload {
  return { characters } as unknown as StateSyncPayload;
}

beforeEach(() => {
  useCharacterStore.setState({
    characters: {},
    order: [],
    pendingSaves: {},
    saveStates: {},
    saveErrors: {},
    serverViews: {},
  });
  useCharacterStore.getState().applyUpsert(view(1, ''));
});

describe('#49 — numer zapisu karty', () => {
  it('echo zapisu A po acku zapisu B nie cofa karty', () => {
    const store = useCharacterStore.getState();
    store.beginSave('c1');
    store.endSave('c1', view(2, '·A'), true);
    store.beginSave('c1');
    store.endSave('c1', view(3, '·A ·B'), true);
    // Echo zapisu A wychodzi zza animacji rzutu.
    store.applyUpsert(view(2, '·A'));
    expect(notes()).toBe('·A ·B');
    expect(useCharacterStore.getState().serverViews['c1']!.revision).toBe(3);
  });

  it('ack starszy od rozgłoszenia, które przyszło w trakcie zapisu, nie wygrywa', () => {
    const store = useCharacterStore.getState();
    store.beginSave('c1');
    // MG zmienił kartę po naszym zapisie — jego widok ma już naszą łatkę.
    store.applyUpsert(view(3, '·A (MG)'));
    store.endSave('c1', view(2, '·A'), true);
    expect(notes()).toBe('·A (MG)');
  });

  it('nowszy widok przechodzi, równy też (echo tego samego zapisu)', () => {
    const store = useCharacterStore.getState();
    store.applyUpsert(view(2, '·A'));
    expect(notes()).toBe('·A');
    store.applyUpsert(view(2, '·A'));
    expect(notes()).toBe('·A');
  });

  it('ponowna synchronizacja na żywym połączeniu zostawia nowszą kartę', () => {
    const store = useCharacterStore.getState();
    store.applyUpsert(view(5, '·A ·B'));
    store.applySync(sync(view(4, '·A')), false);
    expect(notes()).toBe('·A ·B');
    expect(useCharacterStore.getState().order).toEqual(['c1']);
  });

  it('pierwsza synchronizacja po połączeniu bierze bazę w całości (przywrócona kopia)', () => {
    const store = useCharacterStore.getState();
    store.applyUpsert(view(5, '·A ·B'));
    store.applySync(sync(view(2, 'z kopii')), true);
    expect(notes()).toBe('z kopii');
    // …i od tej chwili przyjmuje zapisy z przywróconej bazy.
    useCharacterStore.getState().applyUpsert(view(3, 'z kopii ·C'));
    expect(notes()).toBe('z kopii ·C');
  });
});
