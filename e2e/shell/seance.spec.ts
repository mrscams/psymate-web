import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { createPatient, daysAgo, entry, intakeOf } from '../flux-5-timeline/timeline-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { tabTo } from '../support/clavier';

// Mode séance et panneau de clôture (UX-S3, propositions 04 et 04b : états 2 à 6) : contre l'API
// locale (seed small, Mailpit), jamais de mock du backend. Chaque test crée son compte et son
// dossier ; les séances démarrées ou clôturées ici ne touchent aucun patient du seed.

const API = 'http://localhost:8080';

/** Instant ISO il y a `minutes` minutes. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * Nour K. : suivi en cabinet de 50 min, une séance clôturée il y a 7 jours avec un compte rendu
 * qui finit par deux lignes « Prochaine fois », une situation en cours et un médicament en cours.
 */
async function folder(api: APIRequestContext): Promise<{ patientId: string; previous: string }> {
  const patientId = await createPatient(api, 'Nour K.', '1991-05-04', {
    modality: 'in_person',
    durationMin: '50',
  });
  await intakeOf(api, patientId);
  const previous = await entry(api, patientId, {
    type: 'session',
    session: { modality: 'in_person' },
    occurred: { from: daysAgo(7, 9) },
  });
  const close = await api.post(`${API}/api/sessions/${previous}/close`, {
    data: {
      durationMin: 50,
      summary:
        'Reprise du thème du sommeil ; refus du passage de jour vécu comme une injustice.\n\nProchaine fois :\n– Relire l’agenda du sommeil\n– Demander si le certificat a été fait',
    },
  });
  expect(close.status(), await close.text()).toBe(200);
  await entry(api, patientId, {
    type: 'situation',
    title: 'Réorganisation du service de nuit',
    occurred: { from: daysAgo(30), precision: 'day' },
    sessionId: previous,
  });
  await entry(api, patientId, {
    type: 'medication',
    title: 'Mélatonine 2 mg',
    medication: { molecule: 'Mélatonine', dosage: '2 mg le soir' },
    occurred: { from: daysAgo(28), precision: 'day' },
    sessionId: previous,
  });
  return { patientId, previous };
}

function ui(page: Page) {
  return {
    bar: page.locator('pm-session-bar .session-bar'),
    close: page.getByRole('button', { name: 'Clôturer la séance' }),
    capture: page.getByRole('textbox', { name: 'Noter quelque chose' }),
    tab: page.locator('pm-session-tab-page'),
    noted: page.locator('pm-noted-entries .entry'),
    aside: page.getByRole('complementary', { name: 'Contexte de la séance' }),
    panel: page.getByRole('dialog', { name: 'Clôturer la séance' }),
  };
}

test.describe('mode séance (UX-S3)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('démarrer : onglet Séance, barre teintée, carnet vide ; noter : la ligne et sa phrase de lien ; « Noter » prépare le bloc ; clôturer au clavier : panneau, Prochaine fois, toast, trace', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s3.seance', 'psychologist');
    const { patientId } = await folder(request);
    await signIn(page, account);
    const u = ui(page);

    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nour K.');
    await expect(u.bar).toHaveCount(0);

    // État 2 : « Démarrer la séance » ouvre l'onglet Séance ; la barre dit la séance, sans toast.
    const started = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/sessions/start'),
    );
    await page.getByRole('button', { name: 'Démarrer la séance' }).click();
    expect((await started).status()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${patientId}/session$`));
    await expect(u.bar).toContainText('Séance en cours · cabinet · démarrée à');
    await expect(u.bar.locator('.timer')).toHaveText(/^00:0\d:\d\d$/);
    await expect(u.bar).toContainText('sur 50 min prévues');
    await expect(u.bar).toContainText('rien de noté encore');
    await expect(u.close).toHaveCount(1);
    await expect(u.capture).toBeFocused();
    await expect(page.locator('pm-toast-outlet')).not.toContainText('Séance démarrée');

    // Le carnet vide : « Prévu la dernière fois » (lignes du dernier compte rendu), « Depuis la
    // séance du … » ; la colonne : séance précédente sans ces lignes, « À garder en tête ».
    const pad = u.tab.locator('.empty-pad');
    await expect(pad.getByRole('heading', { name: 'Prévu la dernière fois' })).toBeVisible();
    await expect(pad.locator('.checklist li')).toHaveText([
      /Relire l’agenda du sommeil/,
      /Demander si le certificat a été fait/,
    ]);
    await expect(pad).toContainText(/Depuis la séance du \d+ \w+\.?/);
    await expect(u.aside).toContainText(/Séance précédente · \d+/);
    await expect(u.aside).toContainText('Reprise du thème du sommeil');
    await expect(u.aside).not.toContainText('Relire l’agenda');
    await expect(u.aside).toContainText('À garder en tête');
    await expect(u.aside).toContainText('Mélatonine 2 mg le soir');
    await expect(u.aside).toContainText('Réorganisation du service de nuit · en cours');
    await expect(u.aside).toContainText('Raccourcis dans le texte');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // État 3 : « anx 7 … > Réorg » + Entrée : la ligne apparaît en haut, surlignée, avec l'émotion,
    // l'échelle, la phrase de lien du serveur et l'heure.
    await u.capture.fill('anx 7 réveil vers 3 h, ruminations > Réorg');
    await expect(page.locator('pm-capture-links .tchip.pressed')).toContainText(
      'Réorganisation du service de nuit',
    );
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/patients/${patientId}/entries`,
    );
    await page.keyboard.press('Enter');
    expect((await created).status()).toBe(201);
    await expect(u.noted).toHaveCount(1);
    const row = u.noted.first();
    await expect(row).toHaveClass(/fresh/);
    await expect(row.locator('.name')).toHaveText('Anxiété');
    await expect(row.locator('.scale i.on')).toHaveCount(7);
    await expect(row.locator('.text')).toContainText('Réorganisation du service de nuit');
    await expect(row.locator('.time')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(row.getByRole('button', { name: /^modifier/ })).toBeVisible();
    await expect(u.bar).toContainText('1 entrée notée');
    await expect(u.tab).toContainText('Noté pendant cette séance');
    await expect(pad).toHaveCount(0);
    await expect(row).not.toHaveClass(/fresh/, { timeout: 6_000 });
    await expect(u.capture).toBeFocused();

    // La colonne garde « Prévu la dernière fois » ; cocher n'enregistre rien ; « Noter » prépare
    // une note dans le bloc, caret à la fin.
    const checklist = u.aside.locator('.checklist');
    await checklist.getByRole('checkbox').first().check();
    await expect(checklist.locator('li').first()).toHaveClass(/done/);
    await checklist.getByRole('button', { name: /^Noter : Demander/ }).click();
    await expect(u.capture).toHaveValue('Demander si le certificat a été fait : ');
    await expect(u.capture).toBeFocused();
    await expect(
      page.locator('pm-capture-block').getByRole('button', { name: 'Note', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expectNoAxeViolations(page);

    // État 5 : clôturer au clavier. Maj+Tab jusqu'à « Clôturer la séance » (la barre), Entrée.
    await tabTo(page, u.close, { backwards: true, max: 40 });
    await page.keyboard.press('Enter');
    await expect(u.panel).toBeVisible();
    const duration = u.panel.getByLabel('Durée (min)');
    await expect(duration).toBeFocused();
    // Séance d'une minute : l'écoulé arrondi (au moins 1) ; « 50 habituels » à un clic.
    await expect(duration).toHaveValue('1');
    await expect(u.panel).toContainText('écoulé, arrondi à 5 min');
    await expect(u.panel.getByRole('group', { name: /Noté en séance/ })).toContainText('Anxiété');
    await expect(u.panel).toContainText('Échap garde le brouillon');
    await expectNoAxeViolations(page);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('45');
    await tabTo(page, u.panel.getByLabel('Compte rendu'), { max: 10 });
    await page.keyboard.type('Thème : le sommeil et la reprise de jour.');
    const add = u.panel.getByLabel('Ajouter une ligne à reprendre la prochaine fois');
    await tabTo(page, add, { max: 10 });
    await page.keyboard.type('Relire la demande écrite avec elle');
    await page.keyboard.press('Enter');
    await expect(u.panel.getByLabel('Point à reprendre')).toHaveValue(
      'Relire la demande écrite avec elle',
    );
    await expect(add).toHaveValue('');
    const closed = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/sessions\/[^/]+\/close$/.test(r.url()),
    );
    await tabTo(page, u.panel.getByRole('button', { name: 'Clôturer la séance' }), { max: 10 });
    await page.keyboard.press('Enter');
    const response = await closed;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({
      durationMin: 45,
      summary:
        'Thème : le sommeil et la reprise de jour.\n\nProchaine fois :\n– Relire la demande écrite avec elle',
    });

    // État 6 : retour à la vue d'ensemble, toast de 6 s avec « Modifier », trace « Prochaine fois ».
    await expect(u.panel).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${patientId}$`));
    await expect(u.bar).toHaveCount(0);
    await expect(page.locator('pm-patient-header .session-text')).toContainText('Dernière séance');
    const toast = page.locator('pm-toast-outlet').getByRole('status').first();
    await expect(page.locator('pm-toast-outlet')).toContainText(
      'Séance clôturée · 45 min · compte rendu enregistré',
    );
    await expect(
      page.locator('pm-toast-outlet').getByRole('button', { name: 'Modifier' }),
    ).toBeVisible();
    const last = page
      .locator('pm-overview-block section')
      .filter({ has: page.getByRole('heading', { level: 3, name: 'Dernière séance' }) });
    await expect(last.locator('.summary')).toHaveText('Thème : le sommeil et la reprise de jour.');
    await expect(last.locator('.goal')).toHaveText(
      'Prochaine fois : Relire la demande écrite avec elle',
    );
    await expect(last.getByRole('button', { name: 'modifier le compte rendu' })).toBeVisible();
    await expectNoAxeViolations(page);
    void toast;

    // « Modifier » du toast : l'éditeur d'entrée sur la séance clôturée (type Séance, durée ;
    // le compte rendu lui-même n'est pas un champ de l'éditeur, fiche 05 : écart noté dans la PR).
    await page.locator('pm-toast-outlet').getByRole('button', { name: 'Modifier' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Séance', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(editor.getByLabel('Durée (min)')).toHaveValue('45');
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
  });

  test('dépassement : barre ambre « 8 min au-delà des 50 prévues », bouton plein ; Échap garde le brouillon ; « 50 habituels » ; « Clôturer et revenir à la liste »', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s3.depassement', 'psychologist');
    const { patientId } = await folder(request);
    // Séance ouverte il y a 58 minutes (démarrée par l'API avec son début dans le passé).
    await entry(request, patientId, {
      type: 'session',
      session: { modality: 'in_person' },
      occurred: { from: minutesAgo(58) },
    });
    await signIn(page, account);
    const u = ui(page);

    // Dossier ouvert sur l'onglet 1 avec une séance en cours : l'onglet Séance, une fois.
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${patientId}/session$`));
    await expect(u.bar).toHaveClass(/overtime/);
    await expect(u.bar).toContainText('8 min au-delà des 50 prévues');
    await expect(u.bar.locator('.timer')).toHaveText(/^00:58:\d\d$/);
    await expect(u.close).toHaveClass(/filled/);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // « Vue d'ensemble » reste à un clic : l'onglet 1 n'y renvoie pas une seconde fois.
    await page
      .getByRole('navigation', { name: 'Dossier' })
      .getByRole('link', { name: /Vue d'ensemble/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${patientId}$`));
    await expect(u.bar).toBeVisible();
    await page.getByRole('button', { name: 'Reprendre' }).or(u.close).first().waitFor();

    // Le panneau : 58 min → 60 proposées ; Échap garde le brouillon ; le panneau rouvert le retrouve.
    await u.close.click();
    await expect(u.panel).toBeVisible();
    await expect(u.panel.getByLabel('Durée (min)')).toHaveValue('60');
    await u.panel.getByLabel('Compte rendu').fill('Brouillon du compte rendu.');
    await page.keyboard.press('Escape');
    await expect(u.panel).toBeHidden();
    await expect(u.bar).toHaveClass(/overtime/);
    await u.close.click();
    await expect(u.panel.getByLabel('Compte rendu')).toHaveValue('Brouillon du compte rendu.');
    await u.panel.getByRole('button', { name: '50 habituels' }).click();
    await expect(u.panel.getByLabel('Durée (min)')).toHaveValue('50');

    const closed = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/sessions\/[^/]+\/close$/.test(r.url()),
    );
    await u.panel.getByRole('button', { name: 'Clôturer et revenir à la liste' }).click();
    expect((await closed).request().postDataJSON()).toEqual({
      durationMin: 50,
      summary: 'Brouillon du compte rendu.',
    });
    await expect(page).toHaveURL(/\/fr\/patients$/);
    await expect(page.locator('pm-toast-outlet')).toContainText(
      'Séance clôturée · 50 min · compte rendu enregistré',
    );
    await expectNoAxeViolations(page);
  });
});
