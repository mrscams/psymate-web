import { APIRequestContext, expect } from '@playwright/test';

/**
 * Comptes pour les e2e, contre l'API réelle (jamais de mock). Les comptes du seed
 * (psymate-api/tools/seed, make seed SIZE=small) servent aux connexions réussies ; les tests qui
 * échouent volontairement ou activent la 2FA créent un compte jetable, pour ne jamais verrouiller
 * un compte du seed (5 échecs en 15 min → 423) ni lui imposer un code.
 */
export const SEED = {
  claire: { email: 'claire.seed@example.test', password: 'Donnees-Fictives-2026' },
} as const;

const API = 'http://localhost:8080';
const MAILPIT = 'http://localhost:8025';
const TOKEN = /confirmer-email\/([A-Za-z0-9_.~%-]+)/;

export interface TestAccount {
  email: string;
  password: string;
}

/** Adresse unique par test (example.test : jamais routable). */
export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** POST /api/auth/register : compte email_pending, e-mail de confirmation dans Mailpit. */
export async function register(api: APIRequestContext, prefix: string): Promise<TestAccount> {
  const account = { email: uniqueEmail(prefix), password: 'Fil-Rouge-Clinique-2026' };
  const response = await api.post(`${API}/api/auth/register`, {
    data: {
      email: account.email,
      password: account.password,
      firstName: 'Alix',
      lastName: 'Essai',
      profession: 'psychologist',
      phone: '+33600000099',
      remoteOnly: true,
      consents: { terms: true, privacy: true },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return account;
}

/** Lit le lien de confirmation dans Mailpit et le consomme : compte docs_pending, session ouverte. */
export async function confirmEmail(api: APIRequestContext, email: string): Promise<void> {
  let token: string | null = null;
  for (let attempt = 0; attempt < 30 && !token; attempt++) {
    const search = await api.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
    const messages = ((await search.json()) as { messages?: { ID: string }[] }).messages ?? [];
    for (const message of messages) {
      const full = await api.get(`${MAILPIT}/api/v1/message/${message.ID}`);
      const match = TOKEN.exec(((await full.json()) as { Text?: string }).Text ?? '');
      if (match) token = decodeURIComponent(match[1]);
    }
    if (!token) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(token, `aucun e-mail de confirmation pour ${email} dans Mailpit`).not.toBeNull();
  const confirm = await api.post(`${API}/api/auth/email/confirm`, { data: { token } });
  expect(confirm.status(), await confirm.text()).toBe(204);
}

/**
 * Active la 2FA du compte connecté dans `api` (session ouverte par confirmEmail) : renvoie le
 * secret et le pas TOTP consommé par la vérification (il ne peut plus servir au login).
 */
export async function enableTwoFactor(
  api: APIRequestContext,
  code: (secret: string) => { value: string; step: number },
): Promise<{ secret: string; usedStep: number }> {
  const enable = await api.post(`${API}/api/me/2fa/enable`);
  expect(enable.status(), await enable.text()).toBe(200);
  const { secret } = (await enable.json()) as { secret: string };
  const { value, step } = code(secret);
  const verify = await api.post(`${API}/api/me/2fa/verify`, { data: { code: value } });
  expect(verify.status(), await verify.text()).toBe(200);
  return { secret, usedStep: step };
}
