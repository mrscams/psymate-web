import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

import { totp, totpStep } from './totp';

const API = 'http://localhost:8080';

/**
 * Administrateur local pour les e2e qui suspendent un compte (fiche 27, M1-18). Il n'existe pas
 * dans le seed : il se crée une fois, hors des tests, dans ../psymate-api (docs/ops/admin.md) :
 *   make admin EMAIL=admin.e2e@example.test   → mot de passe à usage unique affiché une fois
 *   POST /api/auth/password/change, puis POST /api/me/2fa/enable + /verify (2FA obligatoire pour /api/admin/**)
 * puis se passe aux tests par trois variables d'environnement. Sans elles, les tests qui en
 * dépendent sont ignorés avec un message explicite (jamais de mock du backend).
 */
export const ADMIN = {
  email: process.env['PSYMATE_E2E_ADMIN_EMAIL'] ?? '',
  password: process.env['PSYMATE_E2E_ADMIN_PASSWORD'] ?? '',
  totpSecret: process.env['PSYMATE_E2E_ADMIN_TOTP_SECRET'] ?? '',
};

export const ADMIN_AVAILABLE = Boolean(ADMIN.email && ADMIN.password && ADMIN.totpSecret);

export const ADMIN_MISSING =
  'Administrateur e2e absent : définir PSYMATE_E2E_ADMIN_EMAIL, PSYMATE_E2E_ADMIN_PASSWORD et ' +
  'PSYMATE_E2E_ADMIN_TOTP_SECRET (voir e2e/support/admin.ts et ../psymate-api/docs/ops/admin.md).';

/**
 * Contexte API connecté en administrateur : login en deux temps (202 otpRequired, puis code TOTP).
 * Un pas TOTP ne sert qu'une fois : si le pas courant vient d'être consommé (401), le suivant est
 * tenté (tolérance de dérive de l'API). À appeler une fois par fichier de test.
 */
export async function adminContext(): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: API });
  const credentials = { email: ADMIN.email, password: ADMIN.password };
  const first = await api.post('/api/auth/login', { data: credentials });
  expect(first.status(), await first.text()).toBe(202);
  const step = totpStep();
  let login = await api.post('/api/auth/login', {
    data: { ...credentials, otp: totp(ADMIN.totpSecret, step) },
  });
  if (login.status() === 401) {
    login = await api.post('/api/auth/login', {
      data: { ...credentials, otp: totp(ADMIN.totpSecret, step + 1) },
    });
  }
  expect(login.status(), await login.text()).toBe(200);
  return api;
}

/** POST /api/admin/practitioners/{id}/suspend : statut suspended, sessions révoquées, e-mail au praticien. */
export async function suspendPractitioner(
  admin: APIRequestContext,
  practitionerId: string,
  reason: string,
): Promise<void> {
  const response = await admin.post(`/api/admin/practitioners/${practitionerId}/suspend`, {
    data: { reason },
  });
  expect(response.status(), await response.text()).toBe(200);
}
