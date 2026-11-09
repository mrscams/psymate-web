import { APIRequestContext, expect, test } from '@playwright/test';

import { expectState, fail, getOf, hold, practitioner, shareSession } from './etats-support';

// Planche 29 (M6-03) : vide, chargement, erreur des écrans Mon compte (fiches 10, 13, 14 + tags,
// 17, 18, 19), contre l'API réelle, sur un compte jetable sans patient (docs_pending).
// « Vide » n'a pas de sens pour 10, 14, 18 : le serveur renvoie toujours un profil, des
// préférences et au moins la session courante.

let api: APIRequestContext;

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  api = await practitioner('m6-03.compte');
});

test.afterAll(async () => {
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await shareSession(api, context);
});

interface Screen {
  fiche: string;
  url: string;
  read: string;
  empty?: string;
  /** Contenu de l'écran une fois lu (après « Réessayer »). */
  content: RegExp | string;
}

const SCREENS: Screen[] = [
  {
    fiche: '10-profil-public',
    url: '/fr/mon-compte/profil-public',
    read: '/api/me/profile',
    content: 'Identité',
  },
  {
    fiche: '13-dossier-professionnel',
    url: '/fr/mon-compte/dossier-professionnel',
    read: '/api/me/verification',
    empty: 'Aucun justificatif déposé',
    content: 'Aucun justificatif déposé',
  },
  {
    fiche: '14-preferences',
    url: '/fr/mon-compte/preferences',
    read: '/api/me/preferences',
    content: 'Affichage',
  },
  {
    fiche: '14-tags',
    url: '/fr/mon-compte/tags',
    read: '/api/tags',
    empty: 'Aucun tag',
    content: 'Aucun tag',
  },
  {
    fiche: '17-emotions',
    url: '/fr/mon-compte/emotions',
    read: '/api/vocabulary/emotions',
    empty: 'Aucune émotion personnalisée',
    content: 'Aucune émotion personnalisée',
  },
  {
    fiche: '18-securite',
    url: '/fr/mon-compte/securite',
    read: '/api/me/security',
    content: 'Cet appareil · session courante',
  },
  {
    fiche: '19-donnees',
    url: '/fr/mon-compte/donnees',
    read: '/api/patients',
    empty: 'Aucun dossier à exporter',
    content: 'Aucun dossier à exporter',
  },
];

for (const screen of SCREENS) {
  test.describe(screen.fiche, () => {
    test('chargement', async ({ page }) => {
      const held = await hold(page, getOf(screen.read));
      await page.goto(screen.url);
      await expectState(page, 'loading', screen.fiche);
      await held.release();
      await expect(page.locator('pm-state .state.loading')).toHaveCount(0);
    });

    if (screen.empty) {
      const text = screen.empty;
      test(`vide : « ${text} »`, async ({ page }) => {
        await page.goto(screen.url);
        await expectState(page, 'empty', screen.fiche, { text });
      });
    }

    test('erreur avec Réessayer', async ({ page }) => {
      await fail(page, getOf(screen.read));
      await page.goto(screen.url);
      const error = await expectState(page, 'error', screen.fiche);
      await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible();
      // Réessayer relit la vraie API (la coupure ne vaut qu'une fois) : l'écran s'affiche.
      await error.getByRole('button', { name: 'Réessayer' }).click();
      await expect(page.locator('pm-state .state.error')).toHaveCount(0);
      await expect(page.locator('pm-state .state.loading')).toHaveCount(0);
      await expect(page.locator('main').getByText(screen.content).first()).toBeVisible();
    });
  });
}
