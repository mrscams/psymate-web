import { expect, Page, test } from '@playwright/test';

import { confirmationToken, uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { registerByKeyboard } from './keyboard';

// B8 flux 9 au clavier seul (M7-04, B7, fiches 12, 25, 13) : inscription, lien de confirmation,
// bandeau « dossier incomplet » et son lien, dépôt de deux justificatifs, soumission, bandeau
// « en cours de vérification », outil clinique toujours utilisable. Aucun geste de pointeur
// (keyboardOnly). La boîte de sélection de fichier du système n'est pas pilotable : le fichier est
// posé par setInputFiles sur le champ qui a le focus (aucun clic). Contre l'API locale et Mailpit,
// jamais de mock du backend.

const PASSWORD = 'Vendôme-Lyon-2026!x';
const PDF = {
  name: 'master.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  ),
};
const PNG = {
  name: 'cni.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

/** Un justificatif au clavier : type (flèches), intitulé, fichier, « Ajouter au dossier ». */
async function addDocument(
  page: Page,
  type: string,
  title: string,
  file: typeof PDF,
): Promise<void> {
  const select = page.locator('#field-document-type');
  await tabTo(page, select, { max: 60 });
  for (let i = 0; i < 8 && (await select.inputValue()) !== type; i++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(select).toHaveValue(type);
  await tabTo(page, page.locator('#field-document-title'), { max: 3 });
  await page.keyboard.type(title);
  const input = page.locator('#field-document-file');
  await tabTo(page, input, { max: 6 });
  await input.setInputFiles(file);
  await tabTo(page, page.getByRole('button', { name: 'Ajouter au dossier' }), { max: 4 });
  await page.keyboard.press('Enter');
}

test('flux 9 au clavier : inscription, confirmation, bandeau, deux justificatifs, soumission', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const keys = await keyboardOnly(page);
  const email = uniqueEmail('m7-04.flux9');

  // Inscription (fiche 12), puis le lien de l'e-mail (fiche 25) : la session s'ouvre.
  await registerByKeyboard(page, email, PASSWORD, 'psychiatrist');
  await expect(page).toHaveURL(/\/fr\/confirmer-email$/);
  const token = await confirmationToken(request, email);
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/fr\/patients$/);

  // Bandeau « dossier incomplet » sur toutes les pages, avec son lien (Tab, Entrée).
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'dossier professionnel est incomplet' });
  await expect(banner).toBeVisible();
  await tabTo(page, banner.getByRole('link', { name: 'Voir le dossier' }), { max: 40 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/mon-compte\/dossier-professionnel$/);
  await expect(page.getByText('Aucun justificatif déposé')).toBeVisible();
  await expectNoAxeViolations(page);

  // Diplôme puis pièce d'identité (règle de complétude, G Q14), au clavier.
  const documents = page.getByRole('list', { name: 'Justificatifs déposés' }).getByRole('listitem');
  await addDocument(page, 'diploma', 'DES de psychiatrie', PDF);
  await expect(documents).toHaveCount(1);
  await addDocument(page, 'identity', 'Carte nationale d’identité', PNG);
  await expect(documents).toHaveCount(2);
  await expectNoAxeViolations(page);

  // Soumettre : le dossier passe « en cours de vérification ».
  await tabTo(page, page.getByRole('button', { name: 'Soumettre le dossier pour vérification' }), {
    max: 60,
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('.notice.info')).toContainText('en cours de vérification');
  await expectNoAxeViolations(page);

  // L'outil clinique reste utilisable : retour à la liste par le logo, N ouvre la création.
  await tabTo(page, page.getByRole('link', { name: 'PsyMate' }), { max: 80, backwards: true });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'en cours de vérification' }),
  ).toBeVisible();
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/\/fr\/patients\/nouveau$/);
  keys.expectNoPointer();
});
