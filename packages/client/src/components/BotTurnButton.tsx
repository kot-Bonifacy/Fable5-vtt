import { useMemo, useState } from 'react';
import { ROLE_GM, BOT_AUTONOMY_LABELS } from '@vtt/shared';
import { playBotTurn } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useBotStore } from '../stores/botStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * „Graj turę" (etap 20b) — oddaje turę figury botowi, który ją prowadzi.
 *
 * Trzy rzeczy o tym przycisku.
 *
 * **Zawsze na klik**, także w trybie automat (decyzja MG przed kodem): tempo
 * walki należy do stołu, a nie do wskaźnika tury. Automat różni się od
 * propozycji tym, co dzieje się PO kliknięciu — bot działa od razu zamiast
 * czekać na „Zatwierdź".
 *
 * **Tylko u MG i tylko przy figurze prowadzonej przez bota.** Prowadzenie idzie
 * przez kartę postaci: bot ma w profilu `characterId`, token ma ten sam. Statysta
 * bez karty nie ma jak zostać przypisany, więc przy nim przycisku po prostu nie
 * ma — i to jest cała informacja, której MG w tym miejscu potrzebuje.
 *
 * **Odmowa wraca notatką na czacie**, tam gdzie ślady decyzji bota z 19b i 20a.
 * Przycisk, który po kliknięciu nic nie robi i nic nie mówi, jest gorszy niż
 * jego brak — a odmów jest tu sporo („to nie jest tura tej figury", „bot jest
 * w trybie kontrolowanym", „gateway nie odpowiada").
 */
export function BotTurnButton({
  tokenId,
  className,
}: {
  tokenId: string | null;
  /** Klasa przycisku — pasek tury i zakładka „Walka" wyglądają inaczej. */
  className?: string;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const token = useTokenStore((s) => (tokenId ? (s.tokens[tokenId] ?? null) : null));
  const bots = useBotStore((s) => s.bots);
  const [busy, setBusy] = useState(false);

  const characterId = token?.characterId ?? null;
  const bot = useMemo(
    () =>
      characterId
        ? (Object.values(bots).find(
            (candidate) => !candidate.archived && candidate.characterId === characterId,
          ) ?? null)
        : null,
    [bots, characterId],
  );

  if (!isGm || !bot || !tokenId) return null;
  const autonomy = bot.data.autonomy;
  const controlled = autonomy === 'controlled';

  async function play() {
    if (!tokenId || !bot) return;
    setBusy(true);
    try {
      const ack = await playBotTurn(tokenId);
      const note = !ack.ok
        ? `tura się nie odbyła (${ack.error}).`
        : ack.data?.outcome === 'refused'
          ? (ack.data.refusal ?? 'tura się nie odbyła.')
          : null;
      if (note) useChatStore.getState().addNote(`🤖 ${bot.name}: ${note}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={className ?? 'small-button'}
      disabled={busy || controlled}
      title={
        controlled
          ? `${bot.name} jest w trybie „${BOT_AUTONOMY_LABELS.controlled}" — mechanikę wykonuje człowiek.`
          : `${bot.name} rozegra turę tej figury (tryb: ${BOT_AUTONOMY_LABELS[autonomy]}).`
      }
      onClick={() => void play()}
    >
      {busy ? 'Bot myśli…' : '🤖 Graj turę'}
    </button>
  );
}
