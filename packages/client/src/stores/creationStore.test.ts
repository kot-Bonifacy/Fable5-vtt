import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultCreationDraft,
  EMPTY_CPRED_CREATION_DATA,
  type CpredCreationDraft,
  type CreationDraftView,
} from '@vtt/shared';

const socket = vi.hoisted(() => ({
  startCreation: vi.fn(),
  patchCreation: vi.fn(),
  discardCreation: vi.fn(),
  rollCreationStats: vi.fn(),
  rollCreationLifepath: vi.fn(),
  rollCreationLifepathCount: vi.fn(),
  buyCreationItem: vi.fn(),
}));
vi.mock('../socket.js', () => ({ ...socket, creationErrorText: (code: string) => code }));
import { useCreationStore, buyCreationEntry } from './creationStore.js';

let saved: CreationDraftView<CpredCreationDraft>;
beforeEach(async () => {
  vi.resetAllMocks();
  saved = {
    id: 'draft',
    revision: 0,
    rankApproved: true,
    updatedAt: 'test',
    draft: { ...createDefaultCreationDraft(EMPTY_CPRED_CREATION_DATA), method: 'complete' },
  };
  socket.startCreation.mockImplementation(async () => ({ ok: true, data: structuredClone(saved) }));
  socket.patchCreation.mockImplementation(async (patch: Partial<CpredCreationDraft>) => {
    saved = { ...saved, revision: saved.revision + 1, draft: { ...saved.draft, ...patch } };
    return { ok: true, data: structuredClone(saved) };
  });
  socket.discardCreation.mockResolvedValue({ ok: true });
  await useCreationStore.getState().reload();
});

describe('creator draft queue', () => {
  it('retains two rapid skill changes and consecutive increments of the same skill', async () => {
    const patch = useCreationStore.getState().patch;
    await Promise.all([
      patch((current) => ({ skills: { ...current.skills, first: 2 } })),
      patch((current) => ({ skills: { ...current.skills, second: 3 } })),
      patch((current) => ({
        skills: { ...current.skills, first: (current.skills.first ?? 0) + 1 },
      })),
      patch((current) => ({
        skills: { ...current.skills, first: (current.skills.first ?? 0) + 1 },
      })),
    ]);
    expect(saved.draft.skills).toEqual({ first: 4, second: 3 });
    expect(socket.patchCreation.mock.calls.map((call) => call[1].revision)).toEqual([0, 1, 2, 3]);
  });

  it('retains independent stat, specialty and nested biography changes', async () => {
    const patch = useCreationStore.getState().patch;
    await Promise.all([
      patch((current) => ({ stats: { ...current.stats, body: 4 } })),
      patch((current) => ({ stats: { ...current.stats, ref: 6 } })),
      patch((current) => ({
        skillSpecialties: { ...current.skillSpecialties, science: 'Test A' },
      })),
      patch((current) => ({
        skillSpecialties: { ...current.skillSpecialties, martialArts: 'Test B' },
      })),
      patch((current) => ({ lifepath: { ...current.lifepath, language: 'Testowy' } })),
      patch((current) => ({ lifepath: { ...current.lifepath, lifeGoal: 'Cel' } })),
    ]);
    expect(saved.draft.stats).toEqual({ body: 4, ref: 6 });
    expect(saved.draft.skillSpecialties).toEqual({ science: 'Test A', martialArts: 'Test B' });
    expect(saved.draft.lifepath).toMatchObject({ language: 'Testowy', lifeGoal: 'Cel' });
  });

  it('keeps a failed write and later intents for retry instead of dropping either', async () => {
    socket.patchCreation.mockResolvedValueOnce({ ok: false, error: 'NOT_CONNECTED' });
    const patch = useCreationStore.getState().patch;
    await Promise.all([
      patch((current) => ({ skills: { ...current.skills, first: 2 } })),
      patch((current) => ({ skills: { ...current.skills, second: 3 } })),
    ]);
    expect(socket.patchCreation).toHaveBeenCalledTimes(1);
    expect(useCreationStore.getState().error).toBe('NOT_CONNECTED');
    expect(await useCreationStore.getState().retry()).toBe(true);
    expect(saved.draft.skills).toEqual({ first: 2, second: 3 });
    expect(socket.patchCreation.mock.calls[1]?.[1]).toEqual(
      socket.patchCreation.mock.calls[0]?.[1],
    );
    expect(useCreationStore.getState().pendingPatch).toBeNull();
  });

  it('replays deferred intents before a change made while the retry is on its way', async () => {
    socket.patchCreation.mockResolvedValueOnce({ ok: false, error: 'NOT_CONNECTED' });
    const patch = useCreationStore.getState().patch;
    await Promise.all([patch({ name: 'A' }), patch({ name: 'B' })]);
    await Promise.all([useCreationStore.getState().retry(), patch({ name: 'C' })]);
    expect(socket.patchCreation.mock.calls.map((call) => call[0].name)).toEqual([
      'A',
      'A',
      'B',
      'C',
    ]);
    expect(saved.draft.name).toBe('C');
    expect(useCreationStore.getState()).toMatchObject({ pendingPatch: null, busy: false });
  });

  it('keeps later intents deferred when the retried write is refused again', async () => {
    socket.patchCreation.mockResolvedValueOnce({ ok: false, error: 'NOT_CONNECTED' });
    socket.patchCreation.mockResolvedValueOnce({ ok: false, error: 'NOT_CONNECTED' });
    const patch = useCreationStore.getState().patch;
    await Promise.all([patch({ name: 'A' }), patch({ name: 'B' })]);
    expect(await useCreationStore.getState().retry()).toBe(false);
    expect(useCreationStore.getState()).toMatchObject({ pendingPatch: { name: 'A' }, busy: false });
    expect(await useCreationStore.getState().retry()).toBe(true);
    expect(saved.draft.name).toBe('B');
  });

  it('preserves the draft and window on a refused discard', async () => {
    await useCreationStore.getState().patch({ name: 'Zachowana' });
    socket.discardCreation.mockResolvedValueOnce({ ok: false, error: 'INTERNAL' });
    await useCreationStore.getState().discard();
    expect(useCreationStore.getState()).toMatchObject({
      open: true,
      draftId: 'draft',
      error: 'INTERNAL',
      busy: false,
    });
    expect(useCreationStore.getState().draft?.name).toBe('Zachowana');
  });

  it('waits for a basket acknowledgement before constructing the next patch', async () => {
    socket.buyCreationItem.mockImplementation(async () => {
      saved = { ...saved, revision: 1, draft: { ...saved.draft, purchases: { sample: 1 } } };
      return { ok: true, data: structuredClone(saved) };
    });
    await Promise.all([
      buyCreationEntry('sample', 1),
      useCreationStore.getState().patch({ name: 'Po zakupie' }),
    ]);
    expect(socket.patchCreation.mock.calls[0]?.[1].revision).toBe(1);
    expect(useCreationStore.getState().draft?.purchases).toEqual({ sample: 1 });
  });

  it('does not execute a queued purchase after the preceding patch failed', async () => {
    socket.patchCreation.mockResolvedValueOnce({ ok: false, error: 'NOT_CONNECTED' });
    await Promise.all([
      useCreationStore.getState().patch({ name: 'Oczekuje' }),
      buyCreationEntry('sample', 1),
    ]);
    expect(socket.buyCreationItem).not.toHaveBeenCalled();
    expect(useCreationStore.getState().pendingPatch).toEqual({ name: 'Oczekuje' });
  });

  it('keeps the saving indicator on while the second queued write awaits its acknowledgement', async () => {
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    socket.patchCreation.mockImplementationOnce(async () => ({ ok: true, data: saved }));
    socket.patchCreation.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { ok: true, data: saved };
    });
    const first = useCreationStore.getState().patch({ name: 'Pierwsza' });
    const second = useCreationStore.getState().patch({ name: 'Druga' });
    await started;
    expect(useCreationStore.getState().busy).toBe(true);
    finish();
    await Promise.all([first, second]);
    expect(useCreationStore.getState().busy).toBe(false);
  });
});

describe('naprawa 2a — kroki i przejście do pola', () => {
  it('remembers the furthest step per draft and forgets it for another draft', () => {
    const store = useCreationStore.getState();
    store.markVisited('skills');
    store.markVisited('role');
    expect(useCreationStore.getState().visited).toEqual({ draftId: 'draft', index: 2 });
    useCreationStore.setState({ draftId: 'other' });
    useCreationStore.getState().markVisited('stats');
    expect(useCreationStore.getState().visited).toEqual({ draftId: 'other', index: 1 });
  });

  it('opens the step that fixes a field and keeps the field for the window to focus', async () => {
    useCreationStore.getState().goToField('skills.persuasion');
    expect(useCreationStore.getState().focusField).toBe('skills.persuasion');
    await vi.waitFor(() => expect(saved.draft.step).toBe('skills'));
    expect(socket.patchCreation).toHaveBeenLastCalledWith(
      { step: 'skills' },
      expect.objectContaining({ draftId: 'draft' }),
    );
    // Already there: no second write, only the focus request.
    socket.patchCreation.mockClear();
    useCreationStore.getState().goToField('skillSpecialties.science');
    expect(socket.patchCreation).not.toHaveBeenCalled();
    useCreationStore.getState().clearFocusField();
    expect(useCreationStore.getState().focusField).toBeNull();
  });
});
