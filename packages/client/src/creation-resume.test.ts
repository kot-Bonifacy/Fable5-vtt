import { describe, expect, it } from 'vitest';
import { creationResumeLabel } from './components/CharacterPanel.js';

/**
 * „Wznów szkic: …" w zakładce „Postacie" (naprawa 3d).
 *
 * Po F5 przycisk kreatora mówił „Kreator postaci…", jakby na serwerze nic nie
 * czekało. Etykieta składa się z tego, co o szkicu wiadomo z zewnątrz — bez
 * wyborów gracza — i ma coś powiedzieć także o szkicu bez Roli i bez ksywy.
 */
describe('etykieta wznowienia szkicu', () => {
  it('składa Rolę, ksywę i krok po polsku', () => {
    expect(creationResumeLabel('Igła z Watson', 'Medyk', 'gear')).toBe(
      'Medyk „Igła z Watson” · Wyposażenie',
    );
  });

  it('szkic bez ksywy i bez Roli nadal mówi, na którym kroku stanął', () => {
    expect(creationResumeLabel('  ', null, 'role')).toBe('bez Roli · Rola');
    expect(creationResumeLabel('', 'Solo', 'skills')).toBe('Solo · Umiejętności');
  });

  it('nieznany krok nie wywraca etykiety', () => {
    expect(creationResumeLabel('Kurz', 'Nomada', 'nowy-krok')).toBe('Nomada „Kurz” · nowy-krok');
  });
});
