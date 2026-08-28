import { useAuthStore } from './stores/authStore.js';

/**
 * Pytanie przed czynnością, której nie cofa nic (postulat MG z 22.08).
 *
 * Powstało z jednego zdania w zaległościach: „każda sesja oględzin zaczyna się
 * od pytania «co wolno tu zepsuć»". Sam chip „poligon" w pasku odpowiada na nie
 * *zanim* ktoś kliknie; to jest druga połowa — odpowiedź w chwili kliknięcia,
 * przy czynnościach, po których nie ma czego przywracać.
 *
 * **To nie jest cofnięcie decyzji z 23.08 („kasowanie nie pyta — cofa się
 * `Ctrl+Z`").** Tamta dotyczy obiektów sceny, które **wracają**: bufor cofania
 * trzyma dwadzieścia ostatnich usunięć na kampanię, więc pytanie byłoby tam
 * pytaniem o rzecz odwracalną jednym klawiszem. Tu jest odwrotnie — karta,
 * scena i bot nie wchodzą do żadnego bufora i nie ma po nich śladu. Te ścieżki
 * pytały zresztą od zawsze; zmienia się wyłącznie **treść** pytania.
 *
 * Na poligonie zdanie zostaje krótkie. Przy stole, przy którym ktoś naprawdę
 * gra, dochodzi nazwa kampanii — bo pomyłka, którą to ma łapać, nie polega na
 * nieuważnym kliknięciu, tylko na kliknięciu w dobrą rzecz w **złej kampanii**.
 */
export function confirmDestructive(question: string): boolean {
  const campaign = useAuthStore.getState().activeCampaign;
  if (!campaign || campaign.sandbox) {
    return window.confirm(`${question} Tej operacji nie można cofnąć.`);
  }
  return window.confirm(
    `${question}\n\nKampania „${campaign.name}” nie jest oznaczona jako poligon, ` +
      'a tej operacji nie można cofnąć.',
  );
}
