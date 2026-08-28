import { beforeEach, describe, expect, it } from 'vitest';
import { useJournalStore } from './stores/journalStore.js';

/**
 * Drobiazg z oględzin 27.08: po kliknięciu „Zakończ sesję i streść" przy leżącym
 * gatewayu zdanie „Brak połączenia z AI Gateway — streszczanie wymaga modelu."
 * zostawało w panelu także wtedy, gdy gateway już wrócił — zdejmowała je dopiero
 * kolejna akcja MG. Powód: błąd dziennika żyje u klienta, a nie w statusie
 * z serwera, więc nic go nie odświeżało.
 *
 * Odbiór `ai:status` z `available: true` woła teraz `clearAiError` (socket.ts).
 * Test pilnuje, żeby zdejmowało to **tylko** zdanie o gatewayu: „nie ma czego
 * streścić" ma wisieć, dopóki nie ma.
 */
describe('sticky journal error', () => {
  beforeEach(() => {
    useJournalStore.getState().fail('', null);
    useJournalStore.setState({ error: null, errorCode: null });
  });

  it('clears the gateway sentence when the gateway comes back', () => {
    useJournalStore
      .getState()
      .fail('Brak połączenia z AI Gateway — streszczanie wymaga modelu.', 'AI_UNAVAILABLE');
    expect(useJournalStore.getState().error).not.toBeNull();

    useJournalStore.getState().clearAiError();

    expect(useJournalStore.getState().error).toBeNull();
    expect(useJournalStore.getState().errorCode).toBeNull();
  });

  it('leaves every other refusal alone', () => {
    useJournalStore
      .getState()
      .fail(
        'Nie ma czego streścić — od ostatniego wpisu dziennika nikt nic nie powiedział na czacie.',
        'JOURNAL_EMPTY_LOG',
      );

    useJournalStore.getState().clearAiError();

    expect(useJournalStore.getState().error).toMatch(/Nie ma czego streścić/);
    expect(useJournalStore.getState().errorCode).toBe('JOURNAL_EMPTY_LOG');
  });

  it('drops the error when a new run starts', () => {
    useJournalStore.getState().fail('cokolwiek', 'AI_ERROR');
    useJournalStore.getState().startRun('req-1');
    expect(useJournalStore.getState().error).toBeNull();
    expect(useJournalStore.getState().errorCode).toBeNull();
    useJournalStore.getState().clearDraft();
  });
});
