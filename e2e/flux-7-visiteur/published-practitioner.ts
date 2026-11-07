import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

import { confirmEmail, register } from '../support/accounts';
import { adminContext } from '../support/admin';

const API = 'http://localhost:8080';

/** Praticien publié pour le flux 7 : nom, adresse publique et e-mail de réception. */
export interface PublishedPractitioner {
  id: string;
  slug: string;
  displayName: string;
  email: string;
  contactEmail: string;
}

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Suffixe en lettres (un nom affiché sans chiffres), unique pour ce lancement. */
function letters(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out.charAt(0).toUpperCase() + out.slice(1);
}

async function upload(api: APIRequestContext, type: string, title: string, file: object) {
  const response = await api.post(`${API}/api/me/verification/documents`, {
    params: { type, title },
    multipart: { file: file as never },
  });
  expect(response.status(), await response.text()).toBe(201);
}

/**
 * Le seed small n'a aucune fiche publiée : chaque lancement crée une psychologue à Paris, publiée
 * dans l'annuaire, par l'API réelle (jamais de mock) : inscription, confirmation par Mailpit,
 * diplôme et pièce d'identité, soumission, approbation par l'administrateur e2e (2FA), profil
 * complet, publication. Le nom affiché est unique : le test la retrouve parmi les autres.
 */
export async function publishPsychologistInParis(): Promise<PublishedPractitioner> {
  const api = await playwrightRequest.newContext();
  const account = await register(api, 'flux7');
  await confirmEmail(api, account.email);

  const me = await api.get(`${API}/api/auth/me`);
  expect(me.status(), await me.text()).toBe(200);
  const { id } = (await me.json()) as { id: string };

  await upload(api, 'diploma', 'Master 2 Psychologie clinique', {
    name: 'master.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await upload(api, 'identity', 'Carte nationale d’identité', {
    name: 'cni.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  const submit = await api.post(`${API}/api/me/verification/submit`);
  expect(submit.status(), await submit.text()).toBe(200);

  const admin = await adminContext();
  const decision = await admin.post(`/api/admin/verifications/${id}/decision`, {
    data: { kind: 'approved', force: true, internalNote: 'e2e flux 7 : justificatifs de test' },
  });
  expect(decision.status(), await decision.text()).toBe(201);
  await admin.dispose();

  const displayName = `Inès Valette ${letters()}`;
  const contactEmail = account.email;
  const profile = await api.put(`${API}/api/me/profile`, {
    data: {
      displayName,
      titleLabel: 'Psychologue clinicienne',
      bio:
        "Psychologue clinicienne, je reçois des adultes et des jeunes adultes traversant une période d'anxiété ou d'épuisement professionnel.\n\n" +
        '- Premier échange téléphonique de quinze minutes\n- Séances au cabinet ou en visio',
      specialties: ['anxiety', 'burnout', 'self_esteem'],
      audiences: ['adults', 'young_adults'],
      modalities: ['in_person', 'video'],
      languages: ['fr', 'en'],
      city: 'Paris',
      postalCode: '75011',
      address: '12 rue de la Roquette',
      showAddress: true,
      contactEmail,
      showEmail: true,
      contactPhone: '01 23 45 67 89',
      showPhone: true,
      availability: 'accepting',
      responseDelay: 'sous 48 h',
      fees: 'Séance de 50 min : 70 €',
    },
  });
  expect(profile.status(), await profile.text()).toBe(200);
  const publish = await api.post(`${API}/api/me/profile/publish`);
  expect(publish.status(), await publish.text()).toBe(204);
  const published = await api.get(`${API}/api/me/profile`);
  const { slug } = (await published.json()) as { slug: string };
  await api.dispose();
  return { id, slug, displayName, email: account.email, contactEmail };
}
