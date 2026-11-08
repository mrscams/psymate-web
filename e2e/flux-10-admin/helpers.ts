import {
  APIRequestContext,
  BrowserContext,
  expect,
  request as playwrightRequest,
} from '@playwright/test';

import { confirmEmail, register, TestAccount } from '../support/accounts';
import { adminContext } from '../support/admin';

export const API = 'http://localhost:8080';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Administrateur e2e connecté par l'API (login + TOTP). Un pas TOTP ne sert qu'une fois : si un
 * autre fichier vient de connecter le même administrateur, on attend le pas suivant (une fois).
 */
export async function adminApi(): Promise<APIRequestContext> {
  try {
    return await adminContext();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 31_000 - (Date.now() % 30_000)));
    return adminContext();
  }
}

/** Ouvre la session de l'administrateur dans le navigateur (cookies de son contexte API). */
export async function shareSession(
  admin: APIRequestContext,
  context: BrowserContext,
): Promise<void> {
  const { cookies } = await admin.storageState();
  await context.addCookies(cookies);
}

/** Lettres seules (noms affichés et codes sans chiffres parasites), uniques pour ce lancement. */
export function letters(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export interface SubmittedAccount extends TestAccount {
  id: string;
  /** Session du praticien (API), ouverte par la confirmation de l'e-mail. */
  api: APIRequestContext;
}

/**
 * Compte jetable dont le dossier est soumis (comme e2e/flux-9-inscription-dossier, mais par l'API) :
 * inscription, confirmation par Mailpit, diplôme et pièce d'identité déposés, soumission.
 */
export async function submittedAccount(prefix: string): Promise<SubmittedAccount> {
  const api = await playwrightRequest.newContext();
  const account = await register(api, prefix);
  await confirmEmail(api, account.email);
  for (const [type, title, file] of [
    [
      'diploma',
      'Master 2 Psychologie clinique',
      { name: 'master.pdf', mimeType: 'application/pdf', buffer: PDF },
    ],
    [
      'identity',
      "Carte nationale d'identité",
      { name: 'cni.png', mimeType: 'image/png', buffer: PNG },
    ],
  ] as const) {
    const upload = await api.post(`${API}/api/me/verification/documents`, {
      params: { type, title },
      multipart: { file },
    });
    expect(upload.status(), await upload.text()).toBe(201);
  }
  const submit = await api.post(`${API}/api/me/verification/submit`);
  expect(submit.status(), await submit.text()).toBe(200);
  const me = await api.get(`${API}/api/auth/me`);
  const { id } = (await me.json()) as { id: string };
  return { ...account, id, api };
}

/** Profil complet (adresse et contact affichés), prêt à publier. */
export function completeProfile(displayName: string, contactEmail: string, specialties: string[]) {
  return {
    displayName,
    titleLabel: 'Psychologue clinicienne',
    bio: 'Psychologue clinicienne, je reçois des adultes traversant une période d’anxiété.',
    specialties,
    audiences: ['adults'],
    modalities: ['in_person', 'video'],
    languages: ['fr'],
    city: 'Lyon',
    postalCode: '69001',
    address: '12 rue des Lilas',
    showAddress: true,
    contactEmail,
    showEmail: true,
    contactPhone: '04 72 00 00 00',
    showPhone: false,
    availability: 'accepting',
    responseDelay: 'sous 48 h',
    fees: 'Séance de 50 min : 70 €',
  };
}

/**
 * Praticien approuvé par l'administrateur (approbation forcée par l'API) et publié dans
 * l'annuaire avec les spécialités données. Renvoie sa session pour retirer la fiche ensuite.
 */
export async function publishedPractitioner(
  admin: APIRequestContext,
  specialties: string[],
): Promise<SubmittedAccount> {
  const practitioner = await submittedAccount('m7-07.publie');
  const decision = await admin.post(`${API}/api/admin/verifications/${practitioner.id}/decision`, {
    data: { kind: 'approved', force: true, internalNote: 'e2e M7-07 : justificatifs de test.' },
  });
  expect(decision.status(), await decision.text()).toBe(201);
  // La session du praticien garde le statut mémorisé : on la rafraîchit avant d'écrire le profil.
  await practitioner.api.get(`${API}/api/auth/session`);
  const profile = await practitioner.api.put(`${API}/api/me/profile`, {
    data: completeProfile(`Inès Valette ${letters()}`, practitioner.email, specialties),
  });
  expect(profile.status(), await profile.text()).toBe(200);
  const publish = await practitioner.api.post(`${API}/api/me/profile/publish`);
  expect(publish.status(), await publish.text()).toBe(204);
  return practitioner;
}
