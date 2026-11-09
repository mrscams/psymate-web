import { expect, test } from '@playwright/test';

import { enableProbe, graphReady, smallFolder } from '../flux-6-graphe/graph-support';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';

// Liste équivalente du graphe lue comme par un lecteur d'écran (M7-04, B7 « le graphe propose une
// liste équivalente pour les lecteurs d'écran », fiche 04) : rien n'est lu dans le canevas, tout
// passe par l'arbre d'accessibilité (rôles, noms accessibles, régions annoncées), vérifié par
// getByRole et par des instantanés ARIA (toMatchAriaSnapshot). Parcours au clavier seul. Contre
// l'API locale, jamais de mock du backend.

test('graphe : canevas nommé, liste des liens en tableau, détail et liens en phrases, annonces', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'm7-04.lecteur', 'psychologist');
  const folder = await smallFolder(request);
  await enableProbe(page);
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.goto(`/fr/patients/${folder.patientId}/graph?root=${folder.situation}`);
  await graphReady(page, { count: 4 });

  // Le canevas est une image nommée qui renvoie à sa version texte ; le compteur est annoncé.
  await expect(
    page.getByRole('img', {
      name: 'Graphe des liens : 4 nœuds, 3 liens. Le bouton « Liste des liens » en donne la version texte.',
    }),
  ).toBeVisible();
  await expect(page.locator('.count[aria-live="polite"]')).toHaveText('4 nœuds · 3 liens');

  // Le bouton « Liste des liens » : état replié annoncé, puis déplié (aria-expanded, aria-controls).
  const toggle = page.getByRole('button', { name: 'Liste des liens', exact: true });
  await expect(toggle).toHaveAttribute('aria-controls', 'graph-links-list');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await tabTo(page, toggle, { max: 40 });
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // Le tableau : légende, en-têtes de colonnes, une ligne par lien ; les icônes de type sont
  // muettes (le nom d'un bouton est le titre de l'entrée, rien d'autre).
  const table = page.getByRole('table', { name: 'Liens du graphe (même contenu que le canevas)' });
  await expect(table).toMatchAriaSnapshot(`
    - table "Liens du graphe (même contenu que le canevas)":
      - caption: Liens du graphe (même contenu que le canevas)
      - rowgroup:
        - row "Source Lien Cible Provenance Statut":
          - columnheader "Source"
          - columnheader "Lien"
          - columnheader "Cible"
          - columnheader "Provenance"
          - columnheader "Statut"
      - rowgroup
  `);
  const rows = table.locator('tbody').getByRole('row');
  await expect(rows).toHaveCount(3);
  for (const [source, link, target] of [
    ["Entretien d'évaluation", 'déclenche', 'Surcharge au travail'],
    ['Surcharge au travail', 'aggrave', 'Anxiété 8/10'],
    ['Sertraline 50 mg', 'traite', 'Anxiété 8/10'],
  ]) {
    await expect(rows.filter({ hasText: source }).filter({ hasText: target })).toMatchAriaSnapshot(`
      - row:
        - cell "${source}":
          - button "${source}"
        - cell "${link}"
        - cell "${target}":
          - button "${target}"
        - cell "manuel"
        - cell "accepté"
    `);
  }

  // Entrée sur une source : le détail (région nommée par son titre) reçoit le focus, la sélection
  // est annoncée (aria-live), les liens de l'entrée sont des phrases-boutons.
  await tabTo(page, table.getByRole('button', { name: 'Sertraline 50 mg' }), { max: 40 });
  await page.keyboard.press('Enter');
  const detail = page.getByRole('complementary', { name: 'Sertraline 50 mg' });
  await expect(detail.getByRole('heading', { level: 2, name: 'Sertraline 50 mg' })).toBeFocused();
  await expect(page.locator('pm-graph-page p.sr-only[aria-live="polite"]')).toHaveText(
    'Entrée sélectionnée : Sertraline 50 mg, Médicament',
  );
  await expect(detail).toMatchAriaSnapshot(`
    - complementary "Sertraline 50 mg":
      - heading "Sertraline 50 mg" [level=2]
      - button "Fermer le détail"
      - heading "Liens de cette entrée · 1" [level=3]
      - list:
        - listitem:
          - button /Sertraline 50 mg traite Anxiété 8\\/10/
      - button "Lier (L)"
      - button "Voir dans la timeline"
      - button "Recentrer le graphe ici"
      - button "Corriger l'entrée"
  `);
  await expectNoAxeViolations(page);

  // Suivre un lien en phrase : le détail passe à l'autre entrée, nouvelle annonce.
  await tabTo(page, detail.getByRole('button', { name: /traite Anxiété 8\/10/ }), { max: 10 });
  await page.keyboard.press('Enter');
  const feeling = page.getByRole('complementary', { name: 'Anxiété 8/10' });
  await expect(feeling.getByRole('heading', { level: 3 })).toHaveText('Liens de cette entrée · 2');
  await expect(page.locator('pm-graph-page p.sr-only[aria-live="polite"]')).toHaveText(
    /^Entrée sélectionnée : Anxiété 8\/10, Ressenti/,
  );
  await expect(feeling.getByRole('listitem')).toHaveCount(2);
  // Le focus suit : il est sur le titre du nouveau détail, le bouton de fermeture vient juste après.
  await expect(feeling.getByRole('heading', { level: 2 })).toBeFocused();

  // « Fermer le détail » au clavier ; le tableau reste, la liste se replie au clavier.
  await tabTo(page, feeling.getByRole('button', { name: 'Fermer le détail' }), { max: 3 });
  await page.keyboard.press('Enter');
  await expect(feeling).toHaveCount(0);
  await tabTo(page, toggle, { max: 60, backwards: true });
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(table).toHaveCount(0);
  keys.expectNoPointer();
});
