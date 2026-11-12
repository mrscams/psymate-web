import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { enableProbe, graphReady } from '../flux-6-graphe/graph-support';
import { publishPsychologistInParis } from '../flux-7-visiteur/published-practitioner';
import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { createAccount, signIn } from '../preferences/accounts';
import { enableTwoFactorWithCodes } from '../securite/helpers';
import { confirmEmail, register } from '../support/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { themeFolder } from '../theme/theme-support';
import { axeScreen, expectTheme, settled, shoot, Theme, THEMES } from './a11y-support';

// axe-core sur chaque écran V1, dans les deux thèmes (M7-04, C5 « aucune violation sérieuse sur
// les 13 écrans », B7 ; liste des écrans : docs/couverture-ecrans.md). Contre l'API locale (seed
// small, Mailpit), jamais de mock du backend : chaque test crée son compte et son dossier. Aucune
// règle désactivée, aucun élément exclu (pas même le canevas du graphe). Le thème est forcé deux
// fois : préférence `theme` du compte (praticien) et prefers-color-scheme (pages sans session).
// Correspondance écran → test : docs/e2e-couverture.md.

/** Un écran : son nom (fiche), comment l'ouvrir, quand il est prêt. */
type Screen = [name: string, open: () => Promise<void>];

async function run(page: Page, theme: Theme, screens: Screen[]): Promise<void> {
  for (const [name, open] of screens) {
    await test.step(name, async () => {
      await open();
      await settled(page);
      await expectTheme(page, theme);
      await axeScreen(page, theme, name);
      await shoot(page, `axe-${theme}-${name}`);
    });
  }
}

for (const theme of THEMES) {
  test.describe(`axe-core, thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
    });

    test(`praticien : dossier, panneaux et Mon compte (${theme})`, async ({ page, request }) => {
      const account = await createAccount(request, `m7-04.axe-${theme}`, 'psychologist');
      const folder = await themeFolder(request);
      await setPreferences(request, { theme, 'overview.view': 'complete' });
      await enableProbe(page);
      await signIn(page, account);
      const patient = `/fr/patients/${folder.patientId}`;
      const h1 = page.getByRole('heading', { level: 1 }).first();
      const dialog = (panel: string) => page.locator(`[role="dialog"]:has(${panel})`);

      await run(page, theme, [
        [
          '01-liste-patients',
          async () => {
            await page.goto('/fr/patients');
            await expect(page.getByRole('link', { name: 'Nina S.', exact: true })).toBeVisible();
          },
        ],
        [
          '01-aide-raccourcis',
          async () => {
            await page.keyboard.press('?');
            await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeVisible();
          },
        ],
        [
          '16-nouveau-patient',
          async () => {
            await page.goto('/fr/patients/nouveau');
            await expect(h1).toHaveText('Nouveau patient');
          },
        ],
        [
          '16-fiche-patient',
          async () => {
            await page.goto(`${patient}/fiche`);
            await expect(h1).toContainText('Nina S.');
          },
        ],
        [
          '02-vue-ensemble-complete',
          async () => {
            await page.goto(patient);
            await expect(h1).toHaveText('Nina S.');
            await expect(page.locator('pm-overview-trend-chart svg path').first()).toBeAttached({
              timeout: 15_000,
            });
          },
        ],
        [
          '02b-vue-ensemble-simple',
          async () => {
            const simple = page
              .getByRole('group', { name: "Niveau de détail de la vue d'ensemble" })
              .getByRole('button', { name: 'Simple' });
            await simple.focus();
            await page.keyboard.press('Enter');
            await expect(page.getByRole('heading', { level: 3, name: 'En bref' })).toBeVisible();
          },
        ],
        [
          '05-bloc-de-saisie',
          async () => {
            const input = page.getByRole('textbox', { name: 'Noter quelque chose' });
            await input.focus();
            // Vocabulaire des émotions lu au déploiement du bloc : on l'attend avant de taper.
            const block = page.locator('pm-capture-block');
            await expect(block.locator('.block')).toHaveClass(/expanded/);
            await expect(block.locator('[aria-busy="true"]')).toHaveCount(0);
            await page.keyboard.type("anx 8 n'a pas dormi > réunion");
            await expect(block.getByRole('combobox', { name: 'Émotion' })).toHaveValue('Anxiété');
            await expect(block.getByRole('slider', { name: 'Intensité' })).toHaveAttribute(
              'aria-valuenow',
              '8',
            );
          },
        ],
        [
          '03-timeline',
          async () => {
            await page.goto(`${patient}/timeline`);
            const session = page.getByRole('button', { name: /^Séance du .* 8 entrées$/ });
            await session.focus();
            await page.keyboard.press('Enter');
            await expect(page.getByText('Joie après la randonnée').first()).toBeVisible();
          },
        ],
        [
          '04-graphe',
          async () => {
            await page.goto(`${patient}/graph?root=${folder.situation}`);
            await graphReady(page, { count: 3 });
          },
        ],
        [
          '04-graphe-liste-equivalente',
          async () => {
            const toggle = page.getByRole('button', { name: 'Liste des liens', exact: true });
            await toggle.focus();
            await page.keyboard.press('Enter');
            const table = page.getByRole('table', {
              name: 'Liens du graphe (même contenu que le canevas)',
            });
            await table.getByRole('button', { name: 'Réunion avec le manager' }).focus();
            await page.keyboard.press('Enter');
            await expect(
              page.getByRole('complementary', { name: 'Réunion avec le manager' }),
            ).toBeVisible();
          },
        ],
        [
          '07-recherche',
          async () => {
            await page.goto(`${patient}/search?q=anxi%C3%A9t%C3%A9`);
            await expect(page.locator('mark').first()).toBeVisible();
          },
        ],
        [
          '05-editeur-entree',
          async () => {
            await page.goto(`${patient}?entry=${folder.feeling}`);
            await expect(dialog('pm-entry-editor-panel')).toBeVisible();
          },
        ],
        [
          '06-editeur-de-lien',
          async () => {
            await page.goto(`${patient}?link=${folder.event}`);
            await expect(
              dialog('pm-link-editor-panel').getByRole('heading', { name: 'Lier deux entrées' }),
            ).toBeVisible();
          },
        ],
        [
          '05-nouvelle-entree',
          async () => {
            await page.goto(patient);
            await expect(h1).toHaveText('Nina S.');
            await page.keyboard.press('n');
            const editor = dialog('pm-entry-editor-panel');
            await expect(editor).toBeVisible();
            await editor.getByRole('button', { name: 'Ressenti', exact: true }).focus();
            await page.keyboard.press('Enter');
            const emotion = editor.getByRole('combobox', { name: 'Émotion' });
            await emotion.focus();
            await page.keyboard.type('tri');
            await expect(editor.getByRole('option').first()).toBeVisible();
          },
        ],
        [
          '14-preferences',
          async () => {
            await page.goto('/fr/mon-compte/preferences');
            await expect(
              page.getByRole('radio', { name: theme === 'light' ? 'Clair' : 'Sombre' }),
            ).toBeChecked();
          },
        ],
        [
          '14-tags',
          async () => {
            await page.goto('/fr/mon-compte/tags');
            await expect(h1).toBeVisible();
          },
        ],
        [
          '17-emotions-personnalisees',
          async () => {
            await page.goto('/fr/mon-compte/emotions');
            await expect(h1).toBeVisible();
          },
        ],
        [
          '13-dossier-professionnel',
          async () => {
            await page.goto('/fr/mon-compte/dossier-professionnel');
            await expect(h1).toBeVisible();
          },
        ],
        [
          '10-mon-profil-public',
          async () => {
            await page.goto('/fr/mon-compte/profil-public');
            await expect(page.getByLabel('Nom affiché')).toBeVisible();
          },
        ],
        [
          '18-compte-securite',
          async () => {
            await page.goto('/fr/mon-compte/securite');
            await expect(h1).toHaveText('Compte et sécurité');
          },
        ],
        [
          '18-panneau-2fa',
          async () => {
            const enable = page.getByRole('button', { name: 'Activer', exact: true });
            await expect(enable).toBeVisible();
            await enable.focus();
            await page.keyboard.press('Enter');
            const panel = page.getByRole('dialog', { name: 'Activer la double authentification' });
            await expect(panel.getByRole('img', { name: /QR code/ })).toBeVisible();
          },
        ],
        [
          '19-donnees-export',
          async () => {
            await page.goto('/fr/mon-compte/donnees');
            await expect(h1).toBeVisible();
          },
        ],
      ]);
    });

    test(`pages publiques et d’authentification (${theme})`, async ({ page }) => {
      const h1 = page.getByRole('heading', { level: 1 }).first();
      const api = await playwrightRequest.newContext();
      try {
        // Compte avec 2FA : le bloc code (fiche 11) s'affiche après le 202 de l'API.
        const otpAccount = await register(api, `m7-04.otp-${theme}`);
        await confirmEmail(api, otpAccount.email);
        await enableTwoFactorWithCodes(api);

        await run(page, theme, [
          [
            '08-annuaire',
            async () => {
              await page.goto('/fr/annuaire');
              await expect(h1).toBeVisible();
            },
          ],
          [
            '09-fiche-introuvable',
            async () => {
              await page.goto('/fr/praticiens/personne-inconnue-m7-04');
              await expect(page.getByText('Fiche introuvable')).toBeVisible();
            },
          ],
          [
            '24-comment-ca-marche',
            async () => {
              await page.goto('/fr/comment-ca-marche');
              await expect(h1).toBeVisible();
            },
          ],
          [
            '11-connexion',
            async () => {
              await page.goto('/fr/connexion');
              await expect(h1).toBeVisible();
            },
          ],
          [
            '11-connexion-code',
            async () => {
              await page.getByLabel('E-mail professionnel').focus();
              await page.keyboard.type(otpAccount.email);
              // UX-D1 : « Mot de passe oublié ? » (à droite du libellé) précède le champ.
              await page.keyboard.press('Tab');
              await page.keyboard.press('Tab');
              await expect(page.getByLabel('Mot de passe', { exact: true })).toBeFocused();
              await page.keyboard.type(otpAccount.password);
              await page.keyboard.press('Enter');
              await expect(page.getByLabel('Code de vérification')).toBeVisible();
            },
          ],
          [
            '12-inscription',
            async () => {
              await page.goto('/fr/inscription');
              await expect(h1).toBeVisible();
            },
          ],
          [
            '12-inscription-erreurs',
            async () => {
              await page.getByRole('button', { name: 'Créer mon compte' }).focus();
              await page.keyboard.press('Enter');
              await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
            },
          ],
          [
            '25-confirmation-email',
            async () => {
              await page.goto('/fr/confirmer-email');
              await expect(h1).toBeVisible();
            },
          ],
          [
            '25-confirmation-expiree',
            async () => {
              await page.goto('/fr/confirmer-email/expire');
              await expect(h1).toBeVisible();
            },
          ],
          [
            '26-mot-de-passe-oublie',
            async () => {
              await page.goto('/fr/mot-de-passe-oublie');
              await expect(h1).toBeVisible();
            },
          ],
          [
            '27-compte-suspendu',
            async () => {
              await page.goto('/fr/compte-suspendu');
              await expect(
                page.getByRole('status').filter({ hasText: 'Compte suspendu ou refusé' }),
              ).toBeVisible();
            },
          ],
          [
            '18c-premiere-connexion',
            async () => {
              await page.goto('/fr/premiere-connexion');
              await expect(
                page.getByRole('heading', { level: 2, name: 'Choisissez votre mot de passe' }),
              ).toBeVisible();
            },
          ],
        ]);
      } finally {
        await api.dispose();
      }
    });

    test(`fiche publique d’un praticien publié (${theme})`, async ({ page }) => {
      // Publier une fiche exige un dossier approuvé par un administrateur (G Q14).
      test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);
      const practitioner = await publishPsychologistInParis();
      await run(page, theme, [
        [
          '08-annuaire-resultats',
          async () => {
            await page.goto(`/fr/annuaire?q=${encodeURIComponent(practitioner.displayName)}`);
            await expect(
              page.locator('pm-practitioner-card').filter({ hasText: practitioner.displayName }),
            ).toBeVisible();
          },
        ],
        [
          '09-fiche-publique',
          async () => {
            await page.goto(`/fr/praticiens/${practitioner.slug}`);
            await expect(
              page.getByRole('heading', { level: 1, name: practitioner.displayName }),
            ).toBeVisible();
          },
        ],
      ]);
    });

    test(`administration (${theme})`, async ({ page, context }) => {
      test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);
      const admin: APIRequestContext = await adminApi();
      try {
        await shareSession(admin, context);
        const h1 = page.getByRole('heading', { level: 1 }).first();
        const screens: Screen[] = [
          ['20-admin-validation', '/fr/admin/validation'],
          ['21-admin-praticiens', '/fr/admin/praticiens'],
          ['22-admin-journal', '/fr/admin/journal'],
          ['28-admin-vocabulaire', '/fr/admin/vocabulaire'],
        ].map(([name, url]) => [
          name,
          async () => {
            await page.goto(url);
            await expect(h1).toBeVisible();
          },
        ]);
        await run(page, theme, screens);
      } finally {
        await admin.dispose();
      }
    });
  });
}
