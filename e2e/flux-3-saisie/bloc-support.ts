import { expect, Page } from '@playwright/test';

/**
 * Repères du bloc de saisie (UX-S1) pour les e2e des flux 3 et 4 : les puces de type, le champ texte
 * (nom accessible « Noter quelque chose », inchangé), les champs du type, la rangée « Lié à » et ses
 * puces, le verbe, la recherche « Autre entrée… », les actions et les messages sous les champs.
 */
export function block(page: Page) {
  const root = page.locator('pm-capture-block');
  const types = root.getByRole('group', { name: "Type d'entrée" });
  const links = root.locator('pm-capture-links');
  return {
    root,
    block: root.locator('.block'),
    input: page.getByRole('textbox', { name: 'Noter quelque chose' }),
    type: (name: string) => types.getByRole('button', { name, exact: true }),
    detected: root.locator('.types .note-r'),
    emotion: root.getByRole('combobox', { name: 'Émotion' }),
    intensity: root.getByRole('slider', { name: 'Intensité' }),
    when: root.getByLabel('Quand', { exact: true }),
    links,
    chip: (name: RegExp) => links.getByRole('button', { name }),
    placed: links.locator('.tchip.pressed'),
    verb: links.getByRole('combobox', { name: /^Verbe du lien avec/ }),
    other: links.getByRole('button', { name: 'Autre entrée…' }),
    search: links.getByRole('searchbox', { name: 'Rechercher une entrée du dossier' }),
    save: root.getByRole('button', { name: 'Enregistrer' }),
    detail: root.getByRole('button', { name: 'Détailler' }),
    note: (slot: string) => root.locator(`#pm-capture-${slot}-note`),
    alert: root.locator('p.alert[role="alert"]'),
  };
}

/** Bloc déplié et données lues (vocabulaire, rail) : axe peut mesurer. */
export async function settled(page: Page): Promise<void> {
  const b = block(page);
  await expect(b.block).toHaveClass(/expanded/);
  await expect(b.root.locator('[aria-busy="true"]')).toHaveCount(0);
}
