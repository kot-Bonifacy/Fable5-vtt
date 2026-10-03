import { useState, type FormEvent } from 'react';
import type { CampaignSummary } from '@vtt/shared';
import { apiPost } from '../api.js';
import { activateCampaign } from '../socket.js';

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

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiPost<CampaignSummary>('/api/campaigns', { name: trimmed });
      // Trasa REST zapisała już `active`, ale o przeniesieniu ekranów wie
      // wyłącznie warstwa gniazd — jedna droga dla „utwórz" i „aktywuj".
      if (created?.id) await activateCampaign(created.id);
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
      {hint && <p className="auth-hint">{hint}</p>}
    </form>
  );
}
