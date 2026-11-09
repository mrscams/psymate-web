import { expect, Page, request as playwrightRequest, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { API, createDossier, post, waitIntake } from './dossier-data';

// B3 flux 5, recherche dans le dossier (M4-08, fiche 07) : contre l'API locale (seed small,
// Mailpit), jamais de mock du backend. Le seed small n'a pas le dossier « Marie D. » de la fiche
// (aucune entrée « entretien … manager ») : chaque test crée par l'API, sur un compte jetable, un
// petit dossier qui le reproduit (événement du 18 oct., ressentis, note de juin, tag travail).

const results = (page: Page) => page.getByRole('list', { name: 'Résultats', exact: true });
const approximate = (page: Page) => page.getByRole('list', { name: 'Résultats approchés' });
const bar = (page: Page) => page.getByRole('searchbox', { name: 'Rechercher' });

function chip(page: Page, label: string) {
  return page
    .getByRole('group', { name: 'Types' })
    .getByRole('button', { name: new RegExp(`^${label} \\d+$`) });
}

/** La recherche a répondu et la liste n'est plus grisée : axe peut mesurer. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('pm-search-preview pm-state [aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('.results[aria-busy="true"]')).toHaveCount(0);
}

test.describe('recherche dans le dossier', () => {
  test.describe.configure({ timeout: 90_000 });

  test('/ → « entretien manger » (faute) → ↓ → Entrée : URL de la timeline avec ?focus= (positionnement : M3-02)', async ({
    page,
    request,
  }) => {
    const dossier = await createDossier(request, 'm4-08.clavier');
    await signIn(page, dossier.account);
    await page.goto(`/fr/patients/${dossier.patientId}/timeline`);
    await expect(page.getByRole('heading', { level: 1, name: 'Marie D.' })).toBeVisible();

    await page.locator('body').press('/');
    await expect(bar(page)).toBeFocused();
    const searched = page.waitForResponse(
      (r) => r.url().includes(`/api/patients/${dossier.patientId}/search`) && r.ok(),
    );
    await page.keyboard.type('entretien manger');
    const body = (await (await searched).json()) as {
      items: { entryId: string; approximate: boolean }[];
    };
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${dossier.patientId}/search\\?q=entretien(%20|\\+)manger$`),
    );
    await expect(
      page.getByRole('heading', { level: 2, name: 'Recherche dans le dossier' }),
    ).toBeVisible();

    // Aucun texte ne contient « manger » (mots tous requis) : la page 1 est complétée par les
    // résultats approchés (trigrammes), qui retrouvent les entrées citant entretien et manager.
    expect(body.items.every((item) => item.approximate)).toBe(true);
    const fuzzy = [dossier.ids.event, dossier.ids.feeling, dossier.ids.feeling3];
    for (const id of fuzzy) {
      expect(body.items.map((item) => item.entryId)).toContain(id);
      await expect(approximate(page).locator(`li[data-entry-id="${id}"]`)).toBeVisible();
    }
    await expect(page.locator(`li[data-entry-id="${dossier.ids.event}"]`)).toContainText(
      "Entretien d'évaluation avec le manager",
    );
    await expect(page.locator('.summary')).toContainText('Aucun résultat exact');
    await expect(bar(page)).toBeFocused();
    await settled(page);
    await expectNoAxeViolations(page);

    // ↓ déplace la sélection (le focus reste dans le champ), Entrée ouvre la timeline sur l'entrée.
    const first = page.locator('li[aria-current="true"]');
    const firstId = await first.getAttribute('data-entry-id');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('li[aria-current="true"]')).not.toHaveAttribute(
      'data-entry-id',
      firstId ?? '',
    );
    const selectedId = await page.locator('li[aria-current="true"]').getAttribute('data-entry-id');
    expect(selectedId).toBe(body.items[1].entryId);
    await expect(
      page.getByRole('complementary', { name: "Aperçu de l'entrée sélectionnée" }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    // La timeline (M3-02) lit ?focus=<id>, amène l'entrée à l'écran, la sélectionne puis retire le
    // paramètre : l'URL finale est celle de l'onglet, et c'est la carte qui prouve le positionnement.
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${dossier.patientId}/timeline(\\?focus=${selectedId})?$`),
    );
    const focused = page.locator(`pm-timeline-card article[data-entry-id="${selectedId}"]`);
    await expect(focused).toBeInViewport();
    await expect(focused).toHaveAttribute('aria-current', 'true');
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${dossier.patientId}/timeline$`));
    // Hors de la recherche, la barre se vide.
    await expect(bar(page)).toHaveValue('');
  });

  test('« entretien manager » : les entrées qui citent les deux mots, surlignés ; Échap revient à l’onglet', async ({
    page,
    request,
  }) => {
    const dossier = await createDossier(request, 'm4-08.exact');
    await signIn(page, dossier.account);
    await page.goto(`/fr/patients/${dossier.patientId}/graph`);
    await expect(page.getByRole('heading', { level: 1, name: 'Marie D.' })).toBeVisible();
    await page.locator('body').press('/');
    await expect(bar(page)).toBeFocused();
    await page.keyboard.type('entretien manager');
    await expect(results(page)).toBeVisible();
    const both = [
      dossier.ids.event,
      dossier.ids.feeling,
      dossier.ids.feeling3,
      dossier.ids.untagged,
    ];
    for (const id of both) {
      await expect(page.locator(`li[data-entry-id="${id}"]`)).toBeVisible();
    }
    await expect(results(page).getByRole('listitem')).toHaveCount(both.length);
    // Écart fiche 07 ↔ contrat : les mots sont tous requis, la note de juin (sans « entretien »)
    // ne sort pas.
    await expect(page.locator(`li[data-entry-id="${dossier.ids.noteJune}"]`)).toHaveCount(0);
    const marks = page.locator(`li[data-entry-id="${dossier.ids.event}"] mark`);
    await expect(marks.first()).toBeVisible();
    // Surlignage : fond --search-highlight, texte en text-primary (fiche 07).
    const style = await marks.first().evaluate((mark) => {
      const css = getComputedStyle(mark);
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      probe.style.color = root.getPropertyValue('--text-primary');
      probe.style.backgroundColor = root.getPropertyValue('--search-highlight');
      document.body.appendChild(probe);
      const expected = getComputedStyle(probe);
      const result = {
        color: css.color === expected.color,
        background: css.backgroundColor === expected.backgroundColor,
      };
      probe.remove();
      return result;
    });
    expect(style).toEqual({ color: true, background: true });
    await expect(page.locator('.summary')).toContainText('pour « entretien manager »');
    await settled(page);
    await expectNoAxeViolations(page);

    // Échap : retour à l'onglet d'où l'on vient.
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${dossier.patientId}/graph$`));
    await expect(bar(page)).toHaveValue('');
  });

  test('tag:travail ne renvoie que les entrées taguées ; filtre Ressentis : compteurs inchangés', async ({
    page,
    request,
  }) => {
    const dossier = await createDossier(request, 'm4-08.filtres');
    await signIn(page, dossier.account);
    await page.goto(`/fr/patients/${dossier.patientId}/search?q=tag%3Atravail`);
    await expect(results(page)).toBeVisible();
    await expect(bar(page)).toHaveValue('tag:travail');
    const tagged = [dossier.ids.event, dossier.ids.feeling, dossier.ids.noteJune];
    await expect(results(page).getByRole('listitem')).toHaveCount(tagged.length);
    for (const id of tagged) {
      await expect(page.locator(`li[data-entry-id="${id}"]`)).toContainText('#travail');
    }
    await expect(page.locator(`li[data-entry-id="${dossier.ids.untagged}"]`)).toHaveCount(0);

    // Filtre « Ressentis » sur « entretien » : 3 ressentis, puces aux mêmes compteurs.
    await bar(page).fill('entretien');
    await expect(page).toHaveURL(/q=entretien$/);
    await expect(chip(page, 'Ressentis')).toHaveText(/Ressentis\s*3/);
    const before = await page
      .getByRole('group', { name: 'Types' })
      .getByRole('button')
      .allTextContents();
    await chip(page, 'Ressentis').click();
    await expect(page).toHaveURL(/types=feeling/);
    await expect(chip(page, 'Ressentis')).toHaveAttribute('aria-pressed', 'true');
    await expect(results(page).getByRole('listitem')).toHaveCount(3);
    await expect(results(page).getByRole('listitem')).toContainText([
      'Ressenti',
      'Ressenti',
      'Ressenti',
    ]);
    const after = await page
      .getByRole('group', { name: 'Types' })
      .getByRole('button')
      .allTextContents();
    expect(after).toEqual(before);
    await settled(page);
    await expectNoAxeViolations(page);

    await page.getByRole('group', { name: 'Types' }).getByRole('button', { name: /^Tous/ }).click();
    await expect(page).not.toHaveURL(/types=/);
  });

  test('« Modifier » ouvre l’éditeur sur l’entrée ; « Voir dans le graphe » → ?root=', async ({
    page,
    request,
  }) => {
    const dossier = await createDossier(request, 'm4-08.actions');
    await signIn(page, dossier.account);
    await page.goto(`/fr/patients/${dossier.patientId}/search?q=manager%20juin`);
    const preview = page.getByRole('complementary', { name: "Aperçu de l'entrée sélectionnée" });
    await expect(
      preview.getByRole('heading', { name: 'Le manager a changé en juin' }),
    ).toBeVisible();
    await settled(page);
    await expectNoAxeViolations(page);
    await preview.getByRole('button', { name: 'Modifier' }).click();
    await expect(page).toHaveURL(new RegExp(`entry=${dossier.ids.noteJune}`));
    const editor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
    await expect(editor).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(page).toHaveURL(/\/search\?q=manager/);

    await preview.getByRole('button', { name: 'Voir dans le graphe' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${dossier.patientId}/graph\\?root=${dossier.ids.noteJune}$`),
    );
  });

  test("portée du patient : l'entrée privée de karim ne sort ni de la recherche de claire, ni de son dossier (403)", async ({
    page,
    request,
  }) => {
    // karim : son propre compte, un patient, une entrée privée au mot rare.
    const owner = await playwrightRequest.newContext();
    await createAccount(owner, 'm4-08.karim', 'psychologist');
    const { id: karimPatient } = await post<{ id: string }>(owner, '/api/patients', {
      displayName: 'Patient de Karim',
    });
    await waitIntake(owner, karimPatient);
    await post(owner, `/api/patients/${karimPatient}/entries`, {
      type: 'note',
      visibility: 'private',
      status: 'final',
      body: 'Zéphyrine confidentielle de karim',
    });
    await owner.dispose();

    const claire = await createDossier(request, 'm4-08.claire');
    await signIn(page, claire.account);

    // Dans le dossier de claire, le mot de karim ne trouve rien (filtre serveur).
    const searched = page.waitForResponse(
      (r) => r.url().includes(`/api/patients/${claire.patientId}/search`) && r.ok(),
    );
    await page.goto(`/fr/patients/${claire.patientId}/search?q=zephyrine`);
    const body = (await (await searched).json()) as { items: unknown[]; total: number };
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
    await expect(
      page.getByRole('status').filter({ hasText: 'Aucun résultat pour « zephyrine »' }),
    ).toBeVisible();
    await expect(page.getByText('Zéphyrine')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // Le dossier de karim : 403 PATIENT_FORBIDDEN à la recherche aussi, rien n'est affiché.
    const direct = await request.get(`${API}/api/patients/${karimPatient}/search`, {
      params: { q: 'zephyrine' },
    });
    expect(direct.status()).toBe(403);
    expect(((await direct.json()) as { code: string }).code).toBe('PATIENT_FORBIDDEN');
    await page.goto(`/fr/patients/${karimPatient}/search?q=zephyrine`);
    await expect(page.getByRole('alert')).toContainText("Ce dossier n'est pas le vôtre");
    await expect(page.getByText('Zéphyrine')).toHaveCount(0);
  });
});
