import { expect, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// UX-A7 (planche 29, fiche 16) : un 422 de l'API sur la fiche patient s'affiche dans le résumé
// pm-form-errors en tête du formulaire, qui prend le focus ; son lien mène au premier champ
// fautif. Contre l'API locale (seed small), jamais de mock du backend.

const API = 'http://localhost:8080';

test('422 sur la fiche patient : résumé en tête avec focus, lien vers le champ fautif', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'ux-a7.422', 'psychologist');
  const created = await request.post(`${API}/api/patients`, { data: { displayName: 'Lina V.' } });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await signIn(page, account);

  await page.goto(`/fr/patients/${id}/fiche`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Modifier la fiche · Lina V.');
  const form = page.locator('form');
  const summary = form.locator('pm-form-errors [role="alert"]');
  await expect(summary).toHaveCount(0);

  // Plus de 120 ans : la forme est valide côté client, le serveur répond 422 sur birthDate.
  // Champ date localisé (UX-B8) : saisie jj/mm/aaaa en français.
  const birthDate = page.getByLabel('Date de naissance');
  await birthDate.fill('01/01/1890');
  const rejected = page.waitForResponse(
    (r) => r.url().endsWith(`/api/patients/${id}`) && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  expect((await rejected).status()).toBe(422);

  // Le résumé apparaît en tête du formulaire, avant le premier champ, et reçoit le focus.
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText('1 champ à corriger.');
  await expect(summary).toContainText('moins de 120 ans');
  const summaryBox = await summary.boundingBox();
  const firstFieldBox = await page.getByRole('textbox', { name: /Nom affiché/ }).boundingBox();
  expect(summaryBox!.y).toBeLessThan(firstFieldBox!.y);
  // Le message reste aussi sous le champ, relié par aria-describedby.
  await expect(page.locator('#field-birthDate-error')).toContainText('moins de 120 ans');
  await expect(birthDate).toHaveAttribute('aria-invalid', 'true');
  await expectNoAxeViolations(page);

  // Le lien du résumé, au clavier, mène au premier champ fautif.
  const link = summary.getByRole('link', { name: 'Date de naissance' });
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(birthDate).toBeFocused();
  await expectNoAxeViolations(page);

  // Correction et enregistrement : le résumé disparaît ; la date part en AAAA-MM-JJ, sans
  // décalage de fuseau, et revient affichée jj/mm/aaaa.
  await birthDate.fill('12/05/1990');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/api/patients/${id}`) && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ birthDate: '1990-05-12' });
  await expect(summary).toHaveCount(0);
  await page.reload();
  await expect(birthDate).toHaveValue('12/05/1990');
});
