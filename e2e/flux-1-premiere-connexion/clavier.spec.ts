import { APIRequestContext, expect, test } from '@playwright/test';

import { registerByKeyboard } from '../flux-9-inscription-dossier/keyboard';
import { createAccount, signIn } from '../preferences/accounts';
import { confirmationToken, uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';

// B3 flux 1 au clavier seul (M7-04, B7, C5 « navigation clavier complète ») : inscription,
// confirmation, état vide, aide des raccourcis, premier patient, première entrée, retour à la liste ;
// puis le patient de démonstration supprimé et restauré. Aucun geste de souris (keyboardOnly) :
// Tab, Maj+Tab, Entrée, Espace, flèches, raccourcis. Contre l'API locale (seed small, Mailpit),
// jamais de mock du backend ; chaque test crée son compte.

const API = 'http://localhost:8080';
const PASSWORD = 'Vendôme-Lyon-2026!x';

async function archive(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`${API}/api/patients/${id}`).catch(() => undefined);
}

test('flux 1 au clavier : inscription, confirmation, accueil, aide, premier patient, première entrée', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const keys = await keyboardOnly(page);
  const email = uniqueEmail('m7-04.flux1');

  // Inscription (fiche 12) : chaque champ atteint par Tab, profession aux flèches, Entrée.
  await registerByKeyboard(page, email, PASSWORD, 'psychologist');
  await expect(page).toHaveURL(/\/fr\/confirmer-email$/);

  // Le lien de l'e-mail est suivi depuis la messagerie (Mailpit) : une navigation, pas un geste.
  const token = await confirmationToken(request, email);
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/fr\/patients$/);
  const welcome = page.getByRole('region', { name: 'Bienvenue dans PsyMate' });
  await expect(welcome.locator('li[aria-current="step"]')).toContainText('Créez un patient');
  await expectNoAxeViolations(page);

  // « Voir les raccourcis » : Tab, Entrée ; Échap ferme l'aide et rend le focus au bouton.
  const shortcuts = welcome.getByRole('button', { name: 'Voir les raccourcis' });
  await tabTo(page, shortcuts);
  await page.keyboard.press('Enter');
  const help = page.getByRole('dialog', { name: 'Raccourcis clavier' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('row', { name: /Nouveau patient/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(shortcuts).toBeFocused();

  // « Nouveau patient » de l'état vide : Maj+Tab ou Tab selon l'ordre, Entrée.
  const create = page
    .getByRole('status')
    .filter({ hasText: 'Créez votre premier patient' })
    .getByRole('button', { name: /Nouveau patient/ });
  await tabTo(page, create, { backwards: true });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/patients\/nouveau$/);
  const name = page.getByRole('textbox', { name: /Nom affiché/ });
  await tabTo(page, name);
  await page.keyboard.type('Lou B.');
  const createdPatient = page.waitForResponse(
    (r) => r.url().endsWith('/api/patients') && r.request().method() === 'POST',
  );
  await page.keyboard.press('Control+Enter');
  const patient = (await (await createdPatient).json()) as { id: string };
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lou B.');

  // Dernière étape : « Nouvelle entrée » de l'indice, Texte, Ctrl+Entrée enregistre.
  const hint = page
    .getByRole('status')
    .filter({ hasText: 'Dernière étape : notez la première entrée.' });
  const newEntry = hint.getByRole('button', { name: 'Nouvelle entrée' });
  await tabTo(page, newEntry, { backwards: true });
  await page.keyboard.press('Enter');
  const editor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  await expect(editor).toBeVisible();
  await expect(editor.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
  await expect(editor.getByLabel('Séance', { exact: true })).not.toHaveValue('');
  await tabTo(page, editor.getByLabel('Texte', { exact: true }));
  await page.keyboard.type('Premier entretien : motif de la consultation.');
  await expectNoAxeViolations(page);
  const createdEntry = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/patients/${patient.id}/entries`,
  );
  await page.keyboard.press('Control+Enter');
  expect((await createdEntry).status()).toBe(201);
  await expect(editor).toBeHidden();
  await expect(page.getByText('Entrée enregistrée.')).toBeVisible();
  await expect(hint).toBeHidden();

  // Retour à la liste par le logo (Maj+Tab jusqu'au lien « PsyMate », Entrée) : forme normale.
  await tabTo(page, page.getByRole('link', { name: 'PsyMate' }), { backwards: true, max: 80 });
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('table').getByRole('link', { name: 'Lou B.', exact: true }),
  ).toBeVisible();
  await expect(welcome).toHaveCount(0);
  await expectNoAxeViolations(page);
  keys.expectNoPointer();
});

test('flux 1 au clavier : patient de démonstration ouvert, supprimé sans retaper le nom, restauré', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'm7-04.flux1-demo', 'psychologist');
  const created = await request.post(`${API}/api/patients`, {
    data: { displayName: `DEMO · Clavier ${Date.now()}` },
  });
  expect(created.status(), await created.text()).toBe(201);
  const demo = (await created.json()) as { id: string; displayName: string };
  try {
    await signIn(page, account);
    const keys = await keyboardOnly(page);
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: demo.displayName });
    await expect(row.locator('.demo-chip')).toHaveText('Démo');

    // Explorer la démo : Tab jusqu'au nom, Entrée ouvre le dossier ; retour par le logo.
    await tabTo(page, row.getByRole('link', { name: demo.displayName, exact: true }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(demo.displayName);
    await tabTo(page, page.getByRole('link', { name: 'PsyMate' }), { backwards: true, max: 80 });
    await page.keyboard.press('Enter');
    await expect(row).toBeVisible();

    // Supprimer la démo : Tab, Entrée, confirmation simple (aucun champ), Entrée.
    await tabTo(page, row.getByRole('button', { name: `Supprimer la démo : ${demo.displayName}` }));
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('dialog', { name: 'Supprimer le patient de démonstration ?' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('textbox')).toHaveCount(0);
    await expectNoAxeViolations(page);
    const remove = confirm.getByRole('button', { name: 'Supprimer la démo' });
    await tabTo(page, remove, { max: 6 });
    await page.keyboard.press('Enter');
    await expect(row).toHaveCount(0);

    // Restaurer depuis les archivés : Tab jusqu'à la case, Espace, Tab jusqu'à « Restaurer », Entrée.
    const archived = page.getByRole('checkbox', { name: 'Afficher les archivés' });
    await tabTo(page, archived, { max: 80 });
    await page.keyboard.press('Space');
    await expect(archived).toBeChecked();
    const restore = page
      .getByRole('row')
      .filter({ hasText: demo.displayName })
      .getByRole('button', { name: `Restaurer le patient de démonstration ${demo.displayName}` });
    await tabTo(page, restore);
    await page.keyboard.press('Enter');
    await expect(restore).toHaveCount(0);
    await tabTo(page, archived, { backwards: true });
    await page.keyboard.press('Space');
    await expect(page.getByRole('row').filter({ hasText: demo.displayName })).toBeVisible();
    await expectNoAxeViolations(page);
    keys.expectNoPointer();
  } finally {
    await archive(request, demo.id);
  }
});
