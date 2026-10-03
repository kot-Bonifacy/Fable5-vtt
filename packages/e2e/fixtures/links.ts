import type { APIRequestContext } from '@playwright/test';

/**
 * Imienny link gracza (etap 44b) — kontem MG, przez trasy MG.
 *
 * Link działa raz i ma wypisane imię, więc każde wejście aktora potrzebuje
 * własnego. Gracz, który już siedzi w kampanii (punkt kontrolny `po-T3` i
 * dalej), dostaje **link odnowienia** — wraca na to samo konto, z kartą
 * i czatem, tak jak przy stole wraca gracz z nowego komputera. Nowe imię
 * dostaje link nowego gracza.
 */
export async function playerLink(
  gm: APIRequestContext,
  campaignId: string,
  name: string,
): Promise<string> {
  const list = await gm.get('/api/campaigns');
  if (list.status() !== 200) throw new Error(`E2E: campaigns ${list.status()}`);
  const campaigns = (await list.json()) as {
    id: string;
    players: { id: string; name: string }[];
  }[];
  const player = campaigns
    .find((campaign) => campaign.id === campaignId)
    ?.players.find((row) => row.name === name);
  const response = player
    ? await gm.post(`/api/campaigns/${campaignId}/players/${player.id}/renewal`)
    : await gm.post(`/api/campaigns/${campaignId}/invitations`, { data: { name } });
  if (response.status() !== 201) {
    throw new Error(`E2E: link for ${name} ${response.status()} ${await response.text()}`);
  }
  return ((await response.json()) as { token: string }).token;
}
