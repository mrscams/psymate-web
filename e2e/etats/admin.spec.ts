import { APIRequestContext, expect, test } from '@playwright/test';

import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectState, fail, getOf, hold } from './etats-support';

// Planche 29 (M6-03) : chargement et erreur des écrans d'administration (fiches 20, 21, 22, 28),
// contre l'API réelle. Les états vides dépendent des données de la base partagée (file de
// validation, journal) : ils sont couverts par les tests Vitest des pages. Sans l'administrateur
// e2e local (PSYMATE_E2E_ADMIN_*), ces tests sont ignorés et le disent.

const SCREENS = [
  { fiche: '20-admin-validation', url: '/fr/admin/validation', read: '/api/admin/verifications' },
  { fiche: '21-admin-praticiens', url: '/fr/admin/praticiens', read: '/api/admin/practitioners' },
  { fiche: '22-admin-journal', url: '/fr/admin/journal', read: '/api/admin/journal' },
  {
    fiche: '28-admin-vocabulaire',
    url: '/fr/admin/vocabulaire',
    read: '/api/admin/vocabulary/directory',
  },
];

test.describe('administration : chargement et erreur', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  let admin: APIRequestContext;

  test.beforeAll(async () => {
    admin = await adminApi();
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test.beforeEach(async ({ context }) => {
    await shareSession(admin, context);
  });

  for (const screen of SCREENS) {
    test(`${screen.fiche} : chargement`, async ({ page }) => {
      const held = await hold(page, getOf(screen.read));
      await page.goto(screen.url);
      await expectState(page, 'loading', screen.fiche);
      await held.release();
    });

    test(`${screen.fiche} : erreur avec Réessayer`, async ({ page }) => {
      await fail(page, getOf(screen.read));
      await page.goto(screen.url);
      const error = await expectState(page, 'error', screen.fiche);
      await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    });
  }
});
