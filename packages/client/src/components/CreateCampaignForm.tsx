import { useState, type FormEvent } from 'react';
import type { CampaignSummary } from '@vtt/shared';
import { apiPost } from '../api.js';
import { openCampaign } from '../socket.js';

/**
 * „Nowa kampania” — w Panelu MG i na pustym stole MG, który jeszcze żadnej
 * nie ma (etap 44a: świeżo zarejestrowane konto MG zaczyna właśnie tu).
 */
export function CreateCampaignForm({
  onCreated,
  hint,
}: {
  onCreated?: () => void | Promise<void>;
  hint?: string;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await apiPost<CampaignSummary>('/api/campaigns', { name: trimmed });
      // Trasa REST otworzyła już kampanię u MG (etap 44c), ale o przeniesieniu
      // jego ekranów wie wyłącznie warstwa gniazd — jedna droga dla „utwórz"
      // i „Otwórz". Z trwającą sesją kampania czeka na liście.
      if (created?.id) {
        const ack = await openCampaign(created.id);
        if (!ack.ok && ack.error === 'SESSION_RUNNING') {
          setNotice(
            `Kampania „${created.name}” czeka na liście — otworzysz ją po zakończeniu sesji.`,
          );
        }
      }
      setName('');
      await onCreated?.();
    } catch {
      setError('Nie udało się utworzyć kampanii. Spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel-card new-campaign-form" onSubmit={createCampaign}>
      <label className="auth-label" htmlFor="campaign-name">
        Nowa kampania
      </label>
      <div className="form-row">
        <input
          id="campaign-name"
          type="text"
          maxLength={64}
          placeholder="np. Ulice Night City"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="primary-button"
          type="submit"
          disabled={busy || name.trim().length === 0}
        >
          Utwórz
        </button>
      </div>
      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="auth-hint">{notice}</p>}
      {hint && <p className="auth-hint">{hint}</p>}
    </form>
  );
}
