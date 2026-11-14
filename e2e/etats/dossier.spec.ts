import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { createPatient, intakeOf } from '../flux-5-timeline/timeline-data';
import { emptyPatient } from '../flux-6-vue-ensemble/overview-data';
import { expectState, fail, getOf, hold, practitioner, shareSession } from './etats-support';

// Planche 29 (M6-03) : vide, chargement, erreur des écrans du dossier patient (fiches 01, 02, 02b,
// 03, 04, 05, 06, 07, 16), contre l'API réelle. Un compte jetable par fichier de test (par worker),
// un dossier sans entrée (séance d'accueil archivée) et un dossier avec sa seule séance d'accueil.

let api: APIRequestContext;
let empty: string;
let withIntake: { patientId: string; entryId: string };

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  api = await practitioner('m6-03.dossier');
  empty = await emptyPatient(api);
  const patientId = await createPatient(api, 'Lou R.');
  withIntake = { patientId, entryId: await intakeOf(api, patientId) };
});

test.afterAll(async () => {
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await shareSession(api, context);
});

/** L'en-tête patient est là avant les blocs (planche 29 : « l'en-tête s'affiche avant »). */
async function headerShown(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

test.describe('01 liste des patients', () => {
  test('chargement puis vide : « Créez votre premier patient » (compte sans patient)', async ({
    page,
    context,
  }) => {
    const fresh = await practitioner('m6-03.liste');
    try {
      await context.clearCookies();
      await shareSession(fresh, context);
      const held = await hold(page, getOf('/api/patients'));
      await page.goto('/fr/patients');
      await expectState(page, 'loading', '01-liste-patients');
      await held.release();
      await expectState(page, 'empty', '01-liste-patients', {
        text: 'Créez votre premier patient',
      });
    } finally {
      await fresh.dispose();
    }
  });

  test('erreur : bloc erreur avec Réessayer, qui relit la liste', async ({ page }) => {
    await fail(page, getOf('/api/patients'));
    await page.goto('/fr/patients');
    const error = await expectState(page, 'error', '01-liste-patients');
    await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await error.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('link', { name: /Lou R\./ }).first()).toBeVisible();
  });
});

test.describe('02 vue d’ensemble (vue unifiée, UX-S6)', () => {
  test('chargement : en-tête d’abord, squelette des sections', async ({ page }) => {
    const held = await hold(page, getOf(`/api/patients/${empty}/overview`));
    await page.goto(`/fr/patients/${empty}`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'loading', '02-vue-ensemble');
    await held.release();
  });

  test('vide : chaque section garde son titre et son état vide', async ({ page }) => {
    await page.goto(`/fr/patients/${empty}`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'empty', '02-vue-ensemble', {
      text: 'Pas encore de ressentis sur cette période',
    });
  });

  test('erreur : les sections disent l’erreur, l’en-tête reste lisible', async ({ page }) => {
    await fail(page, getOf(`/api/patients/${empty}/overview`));
    await page.goto(`/fr/patients/${empty}`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'error', '02-vue-ensemble', { text: 'Ressentis indisponibles' });
  });
});

test.describe('03 timeline', () => {
  test('chargement', async ({ page }) => {
    const held = await hold(page, getOf(`/api/patients/${empty}/timeline`));
    await page.goto(`/fr/patients/${empty}/timeline`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'loading', '03-timeline');
    await held.release();
  });

  test('vide : « Aucune entrée pour l’instant »', async ({ page }) => {
    await page.goto(`/fr/patients/${empty}/timeline`);
    await expectState(page, 'empty', '03-timeline', { text: "Aucune entrée pour l'instant" });
  });

  test('erreur : « Impossible de charger la timeline »', async ({ page }) => {
    await fail(page, getOf(`/api/patients/${empty}/timeline`));
    await page.goto(`/fr/patients/${empty}/timeline`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'error', '03-timeline', { text: 'Impossible de charger la timeline' });
  });
});

test.describe('04 graphe', () => {
  test('chargement', async ({ page }) => {
    const held = await hold(page, getOf(`/api/patients/${empty}/graph`));
    await page.goto(`/fr/patients/${empty}/graph`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'loading', '04-graphe');
    await held.release();
  });

  test('vide : « Les liens que vous créez apparaîtront ici »', async ({ page }) => {
    await page.goto(`/fr/patients/${empty}/graph`);
    await expectState(page, 'empty', '04-graphe', {
      text: 'Les liens que vous créez apparaîtront ici',
    });
  });

  test('erreur', async ({ page }) => {
    await fail(page, getOf(`/api/patients/${empty}/graph`));
    await page.goto(`/fr/patients/${empty}/graph`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'error', '04-graphe');
  });
});

test.describe('05 éditeur d’entrée (correction, ?entry=)', () => {
  const editor = (page: Page) => page.locator('pm-entry-editor-panel');

  test('chargement de l’entrée', async ({ page }) => {
    const { patientId, entryId } = withIntake;
    const held = await hold(page, getOf(`/api/entries/${entryId}`));
    await page.goto(`/fr/patients/${patientId}?entry=${entryId}`);
    await expectState(page, 'loading', '05-editeur-entree', { scope: editor(page) });
    await held.release();
  });

  test('erreur de lecture de l’entrée', async ({ page }) => {
    const { patientId, entryId } = withIntake;
    await fail(page, getOf(`/api/entries/${entryId}`));
    await page.goto(`/fr/patients/${patientId}?entry=${entryId}`);
    await expectState(page, 'error', '05-editeur-entree', { scope: editor(page) });
  });
});

test.describe('06 éditeur de lien (?link=)', () => {
  const panel = (page: Page) => page.locator('pm-link-editor-panel');
  const url = () =>
    `/fr/patients/${withIntake.patientId}?entry=${withIntake.entryId}&link=${withIntake.entryId}`;
  const links = () => getOf(`/api/entries/${withIntake.entryId}/links`);

  test('chargement des liens posés', async ({ page }) => {
    const held = await hold(page, links());
    await page.goto(url());
    await expectState(page, 'loading', '06-editeur-lien', { scope: panel(page) });
    await held.release();
  });

  test('vide : aucun lien sur l’entrée, aucune autre entrée à lier', async ({ page }) => {
    await page.goto(url());
    await expectState(page, 'empty', '06-editeur-lien', {
      scope: panel(page),
      text: 'Aucun lien sur cette entrée pour le moment',
    });
    await expect(
      panel(page)
        .locator('pm-state .state.empty')
        .filter({ hasText: 'Aucune autre entrée trouvée' }),
    ).toBeVisible();
  });

  test('erreur des liens posés', async ({ page }) => {
    // L'éditeur d'entrée lit d'abord les mêmes liens : on attend sa lecture, puis la coupure (une
    // seule fois) vise celle de l'éditeur de lien, ouvert par L.
    const { patientId, entryId } = withIntake;
    const read = links();
    const editorRead = page.waitForResponse((r) => read(new URL(r.url()), r.request().method()));
    await page.goto(`/fr/patients/${patientId}?entry=${entryId}`);
    await editorRead;
    const editor = page.locator('pm-entry-editor-panel');
    await expect(editor).toBeVisible();
    await fail(page, read);
    await editor.getByRole('heading').first().click();
    await page.keyboard.press('l');
    await expectState(page, 'error', '06-editeur-lien', { scope: panel(page) });
  });
});

test.describe('07 recherche dans le dossier', () => {
  const search = () => getOf(`/api/patients/${empty}/search`);

  test('chargement', async ({ page }) => {
    const held = await hold(page, search());
    await page.goto(`/fr/patients/${empty}/search?q=zephyrine`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'loading', '07-recherche');
    await held.release();
  });

  test('vide : « Aucun résultat pour « zephyrine » »', async ({ page }) => {
    await page.goto(`/fr/patients/${empty}/search?q=zephyrine`);
    await expectState(page, 'empty', '07-recherche', {
      text: 'Aucun résultat pour « zephyrine »',
    });
  });

  test('erreur', async ({ page }) => {
    await fail(page, search());
    await page.goto(`/fr/patients/${empty}/search?q=zephyrine`);
    await headerShown(page, 'Iris P.');
    await expectState(page, 'error', '07-recherche');
  });
});

test.describe('16 fiche patient (modification)', () => {
  const read = () => getOf(`/api/patients/${empty}`);

  test('chargement', async ({ page }) => {
    const held = await hold(page, read());
    await page.goto(`/fr/patients/${empty}/fiche`);
    await expectState(page, 'loading', '16-fiche-patient');
    await held.release();
  });

  test('erreur avec Réessayer', async ({ page }) => {
    await fail(page, read());
    await page.goto(`/fr/patients/${empty}/fiche`);
    const error = await expectState(page, 'error', '16-fiche-patient');
    await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
});

test.describe('en-tête patient : dossier introuvable (403/404, sans Réessayer)', () => {
  test('404 : « Ce dossier n’existe pas », retour à la liste', async ({ page }) => {
    await page.goto('/fr/patients/00000000-0000-4000-8000-000000000000');
    const error = await expectState(page, 'error', '02-dossier-introuvable', {
      text: "Ce dossier n'existe pas",
    });
    await expect(error.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Retour à la liste' })).toBeVisible();
  });
});
