import { request as playwrightRequest } from '@playwright/test';

import { uniqueEmail } from './accounts';

const API = 'http://localhost:8080';
const MAILPIT = 'http://localhost:8025';

/**
 * Barrière « l'API a rattrapé son travail en différé » (M7-04, stabilisation des e2e).
 *
 * L'API fait tout son travail asynchrone sur une seule file : les abonnés de projection
 * (`@ApplicationModuleListener` : vue d'ensemble recalculée, index de recherche) et l'envoi des
 * e-mails (`AuthService.sendAsync`) partagent l'exécuteur unique de Spring (8 fils, file FIFO non
 * bornée). Un test qui écrit des centaines d'entrées d'affilée y empile des centaines de recalculs
 * de la vue d'ensemble ; pendant ce temps, l'e-mail de confirmation d'un autre test attend son tour
 * et n'arrive pas dans Mailpit dans le délai de `confirmEmail`.
 *
 * La barrière inscrit une adresse jetable et attend son e-mail : il est mis en file après tout ce
 * qui précède, donc quand il arrive, la file en attente a été prise en charge. Renvoie la durée
 * d'attente (ms). `timeoutMs` borne l'attente de la barrière elle-même, pas celle d'un autre test.
 */
export async function apiDrained(timeoutMs = 120_000): Promise<number> {
  const api = await playwrightRequest.newContext();
  const started = Date.now();
  try {
    const email = uniqueEmail('m7-04.barriere');
    const response = await api.post(`${API}/api/auth/register`, {
      data: {
        email,
        password: 'Fil-Rouge-Clinique-2026',
        firstName: 'Barriere',
        lastName: 'Essai',
        profession: 'psychologist',
        phone: '+33600000097',
        remoteOnly: true,
        consents: { terms: true, privacy: true },
      },
    });
    if (response.status() !== 201) {
      throw new Error(`barrière : inscription refusée (${response.status()})`);
    }
    while (Date.now() - started < timeoutMs) {
      const search = await api.get(`${MAILPIT}/api/v1/search`, {
        params: { query: `to:${email}` },
      });
      const found = ((await search.json()) as { messages?: unknown[] }).messages ?? [];
      if (found.length) return Date.now() - started;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`barrière : l'API n'a pas vidé sa file en ${timeoutMs} ms`);
  } finally {
    await api.dispose();
  }
}
