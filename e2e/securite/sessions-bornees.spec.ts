import { expect, request as playwrightRequest, test } from '@playwright/test';

import { expectNoAxeViolations } from '../support/axe';
import { API, createAccount, openSecurity, SECURITY, signIn } from './helpers';

// UX-C5 (audit UX du 9 nov. 2026, fiche 18) : la liste des sessions est bornée, « Cet appareil »
// puis les 4 plus récentes, le reste derrière « Afficher les n autres sessions », regroupé par
// appareil. Contre l'API locale : les sessions sont de vraies connexions (POST /api/auth/login) avec
// des navigateurs différents ; aucune réponse n'est fabriquée. Le filtrage des sessions expirées
// reste côté API (contrat : « sessions non expirées »).

const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const SAFARI_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';

test('sessions bornées : cet appareil + 4, « Afficher les 2 autres sessions », regroupées par appareil ; hauteur ≤ 1 400 px', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'ux-c5.sessions');
  // Cinq connexions d'autres appareils (trois Firefox · Linux, deux Safari · iOS), une par une
  // pour que leur dernière activité soit ordonnée.
  for (const userAgent of [FIREFOX_LINUX, SAFARI_IPAD, FIREFOX_LINUX, SAFARI_IPAD, FIREFOX_LINUX]) {
    const other = await playwrightRequest.newContext({ userAgent });
    const login = await other.post(`${API}/api/auth/login`, {
      data: { email: account.email, password: account.password, rememberMe: false },
    });
    expect(login.status(), await login.text()).toBe(200);
    await other.dispose();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  await openSecurity(page);

  // 7 sessions : celle de la confirmation d'e-mail, les 5 connexions, ce navigateur.
  await expect(page.locator('#h-sessions')).toContainText('7');
  const visible = page.getByRole('list', { name: 'Sessions actives' }).getByRole('listitem');
  await expect(visible).toHaveCount(5);
  await expect(visible.first()).toContainText('Cet appareil');
  await expect(visible.first()).toContainText('session courante');

  const more = page.getByRole('button', { name: 'Afficher les 2 autres sessions' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  // Critère de l'audit : la page tient en 1 400 px de haut à 1 440 px de large.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(1400);
  await expectNoAxeViolations(page);

  // Dépliées : un groupe par appareil, le détail à la demande avec ses « Déconnecter ».
  await more.click();
  await expect(page.getByRole('button', { name: 'Masquer les 2 autres sessions' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const groups = page.getByRole('list', { name: 'Autres sessions, par appareil' });
  await expect(groups).toBeVisible();
  const firstGroup = groups.locator(':scope > li').first();
  await expect(firstGroup).toContainText(/\d session/);
  await firstGroup.getByRole('button', { name: /^Voir le détail/ }).click();
  await expect(firstGroup.getByRole('button', { name: /^Déconnecter · / }).first()).toBeVisible();
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // « Déconnecter les autres appareils » : il ne reste que cet appareil, plus rien à déplier.
  await page.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
  await page
    .getByRole('dialog', { name: 'Déconnecter les autres appareils ?' })
    .getByRole('button', { name: 'Déconnecter' })
    .click();
  await expect(page.getByText('6 appareils déconnectés.')).toBeVisible();
  await expect(visible).toHaveCount(1);
  await expect(page.getByRole('button', { name: /autres? sessions?$/ })).toHaveCount(0);
});

test('panneau 2FA ouvert par l’adresse directe /mon-compte/securite/2fa ; fermer avec un secret en attente demande confirmation', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'ux-c5.2fa-url');
  await signIn(page, account);
  // Avant UX-C5, l'ouverture directe levait une TypeError (route enfant pas encore activée) et la
  // navigation retombait sur /fr/.
  await page.goto(`${SECURITY}/2fa`);

  const panel = page.getByRole('dialog', { name: 'Activer la double authentification' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('img', { name: /QR code/ })).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/mon-compte\/securite\/2fa$/);

  // Secret en attente : Échap demande « Abandonner l'activation ? », refuser garde le panneau.
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('dialog', { name: "Abandonner l'activation ?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Annuler' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(panel).toBeVisible();

  // Confirmer : le panneau se ferme, l'adresse revient sur /mon-compte/securite.
  await page.keyboard.press('Escape');
  await confirm.getByRole('button', { name: 'Abandonner' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/mon-compte\/securite$/);
  await expect(page.getByText('Non activée')).toBeVisible();
});
