import { APIRequestContext, expect, Locator, Page } from '@playwright/test';

import { confirmEmail, register, TestAccount } from '../support/accounts';
import { adminContext } from '../support/admin';

const API = 'http://localhost:8080';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);

/** Compte jetable confirmé (docs_pending) : session ouverte dans `api`. */
export async function pendingAccount(api: APIRequestContext, prefix: string): Promise<TestAccount> {
  const account = await register(api, prefix);
  await confirmEmail(api, account.email);
  return account;
}

/**
 * Compte jetable **approuvé** : diplôme et pièce d'identité déposés, dossier soumis, puis décision
 * `approved` d'un administrateur local (e2e/support/admin.ts, variables PSYMATE_E2E_ADMIN_*).
 * Le seed small n'a aucun praticien approuvé, et publier modifierait le profil d'un compte partagé.
 */
export async function approvedAccount(
  api: APIRequestContext,
  prefix: string,
): Promise<TestAccount> {
  const account = await pendingAccount(api, prefix);
  for (const [type, title] of [
    ['diploma', 'Master 2 Psychologie clinique'],
    ['identity', "Carte d'identité"],
  ]) {
    const upload = await api.post(`${API}/api/me/verification/documents`, {
      params: { type, title },
      multipart: { file: { name: `${type}.pdf`, mimeType: 'application/pdf', buffer: PDF } },
    });
    expect(upload.status(), await upload.text()).toBe(201);
  }
  const submit = await api.post(`${API}/api/me/verification/submit`);
  expect(submit.status(), await submit.text()).toBe(200);
  const me = await api.get(`${API}/api/auth/me`);
  const { id } = (await me.json()) as { id: string };

  const admin = await adminWithRetry();
  const decision = await admin.post(`${API}/api/admin/verifications/${id}/decision`, {
    data: {
      kind: 'approved',
      force: true,
      internalNote:
        'e2e M5-04 : justificatifs factices, approbation forcée pour publier le profil.',
    },
  });
  expect(decision.status(), await decision.text()).toBe(201);
  await admin.dispose();
  return account;
}

/**
 * Un pas TOTP ne sert qu'une fois : si un autre fichier de test vient de connecter
 * l'administrateur, on attend le pas suivant et on recommence (une fois).
 */
async function adminWithRetry(): Promise<APIRequestContext> {
  try {
    return await adminContext();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 31_000 - (Date.now() % 30_000)));
    return adminContext();
  }
}

/** Connexion par l'écran (fiche 11), puis attente de /patients. */
export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail professionnel').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
}

/** Ouvre l'écran et attend le formulaire chargé. */
export async function openProfile(page: Page): Promise<void> {
  await page.goto('/fr/mon-compte/profil-public');
  await expect(page.getByRole('heading', { name: 'Profil public', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Nom affiché')).toBeVisible();
}

/**
 * Tabule (sans souris) jusqu'à ce que `locator` ait le focus ; échoue après 80 tabulations.
 */
export async function tabTo(page: Page, locator: Locator): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`le focus n'a jamais atteint ${locator.toString()}`);
}

/** Attend la fin de l'enregistrement automatique (« Enregistré · … »). */
export async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toContainText(/Enregistré ·/, { timeout: 10_000 });
}

/**
 * JPEG d'environ 8 Mo avec un bloc EXIF (position GPS factice) : une image 1600 × 1200 produite par
 * le navigateur, à laquelle on ajoute un segment APP1 « Exif » et des segments de commentaire de
 * remplissage. Le navigateur la décode normalement ; le serveur, lui, refuserait plus de 5 Mo.
 */
export async function heavyJpegWithExif(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext('2d')!;
    // Dégradé calculé pixel par pixel (aucune couleur écrite en dur).
    const image = context.createImageData(1600, 1200);
    for (let i = 0; i < image.data.length; i += 4) {
      const x = (i / 4) % 1600;
      const y = Math.floor(i / 4 / 1600);
      image.data[i] = (x * 255) / 1600;
      image.data[i + 1] = (y * 255) / 1200;
      image.data[i + 2] = 160;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  const jpeg = Buffer.from(base64, 'base64');
  const exifPayload = Buffer.concat([
    Buffer.from('Exif\0\0', 'binary'),
    Buffer.from('MM\0*\0\0\0\x08', 'binary'),
    Buffer.from('GPS 45.7640N 4.8357E · appareil photo de test', 'utf8'),
  ]);
  const segments: Buffer[] = [segment(0xe1, exifPayload)];
  const filler = Buffer.alloc(65_000, 0x20);
  while (segments.reduce((total, s) => total + s.length, jpeg.length) < 8 * 1024 * 1024) {
    segments.push(segment(0xfe, filler));
  }
  // SOI, puis nos segments, puis le reste du JPEG d'origine (sans son SOI).
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** Dimensions d'un JPEG lues dans son segment SOF ; null si introuvable. */
export function jpegSize(jpeg: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) return null;
    const marker = jpeg[offset + 1];
    const length = jpeg.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Observe (sans le modifier) le fichier `file` que la page envoie en multipart : Playwright ne
 * rend pas le corps binaire d'un FormData. Le script enveloppe XHR et fetch avant le chargement de
 * l'application ; à appeler avant la première navigation.
 */
export async function watchPhotoUpload(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __m504Photo?: number[] };
    const capture = (body: unknown): void => {
      if (!(body instanceof FormData)) return;
      const file = body.get('file');
      if (file instanceof Blob) {
        void file.arrayBuffer().then((buffer) => {
          store.__m504Photo = Array.from(new Uint8Array(buffer));
        });
      }
    };
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      capture(body);
      return send.call(this, body);
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      capture(init?.body);
      return nativeFetch(input, init);
    };
  });
}

/** Octets du dernier fichier `file` envoyé par la page (voir watchPhotoUpload). */
export async function uploadedPhoto(page: Page): Promise<Buffer> {
  const handle = await page.waitForFunction(
    () => (window as unknown as { __m504Photo?: number[] }).__m504Photo ?? null,
  );
  return Buffer.from((await handle.jsonValue()) as number[]);
}
