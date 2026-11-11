import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AdminApi } from '../data/admin.api';
import { entry } from '../data/admin.fixtures';
import { VocabularyPage } from './vocabulary.page';

const never = () => new Promise<never>(() => undefined);
const FIXED = {
  modalities: [
    { code: 'in_person', labelFr: 'Au cabinet', labelEn: 'In person' },
    { code: 'video', labelFr: 'En visio', labelEn: 'Video' },
  ],
  languages: [{ code: 'fr', labelFr: 'Français', labelEn: 'French' }],
};

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(api: Partial<AdminApi>, inputs: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [VocabularyPage],
    providers: [
      provideRouter([]),
      {
        provide: AdminApi,
        useValue: { fixedVocabulary: vi.fn().mockResolvedValue(FIXED), ...api },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(VocabularyPage);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, navigate };
}

const ENTRIES = [
  entry({ usedByPublishedProfiles: 2 }),
  entry({ code: 'grief', labelFr: 'Deuil', labelEn: null, sortOrder: 2, active: false }),
  entry({ kind: 'audience', code: 'adults', labelFr: 'Adultes', labelEn: 'Adults' }),
];

describe('VocabularyPage', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('trois états : chargement, erreur, vide', async () => {
    const loading = await render({ vocabulary: vi.fn(never) });
    expect(loading.el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const failing = await render({
      vocabulary: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
    });
    expect(failing.el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger le vocabulaire',
    );
    TestBed.resetTestingModule();

    const empty = await render({ vocabulary: vi.fn().mockResolvedValue([]) });
    expect(empty.el.querySelector('pm-state [role="status"]')?.textContent).toContain(
      'Aucune entrée',
    );
  });

  it('UX-A9a : une page remplacée avant son premier rendu ne lit rien ; la page affichée lit une fois, et son échec donne l’état erreur', async () => {
    const vocabulary = vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    const fixedVocabulary = vi.fn().mockResolvedValue(FIXED);
    TestBed.configureTestingModule({
      imports: [VocabularyPage],
      providers: [
        provideRouter([]),
        { provide: AdminApi, useValue: { vocabulary, fixedVocabulary } },
      ],
    });
    // Ouverture directe de l'URL : instance créée dans la sortie de l'habillage par défaut, puis
    // détruite avant tout rendu quand l'habillage admin la remplace (app.component).
    TestBed.createComponent(VocabularyPage).destroy();
    expect(vocabulary).not.toHaveBeenCalled();
    expect(fixedVocabulary).not.toHaveBeenCalled();

    const fixture = TestBed.createComponent(VocabularyPage);
    await settle(fixture);
    expect(vocabulary).toHaveBeenCalledTimes(1);
    expect(fixedVocabulary).toHaveBeenCalledTimes(1);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger le vocabulaire',
    );
    expect(el.querySelector('table')).toBeNull();
  });

  it('onglets : comptes, listes fixes marquées ; désactivées masquées par défaut', async () => {
    const { el } = await render({ vocabulary: vi.fn().mockResolvedValue(ENTRIES) });
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) =>
      t.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(tabs).toEqual(['Spécialités 2', 'Publics 1', 'Modalités 2 fixe', 'Langues 1 fixe']);
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
      'Spécialités',
    );
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Utilisée par 2 profils publiés');
    // Désactiver… n'est pas destructif : texte secondaire, jamais la classe danger (UX-E4).
    expect(rows[0].querySelector('button.quiet')?.textContent).toContain('Désactiver…');
    expect(rows[0].querySelector('button.danger')).toBeNull();
    expect(rows[0].textContent).toContain('Active');
    expect(el.querySelector('pm-add-entry-form h2')?.textContent).toContain(
      'Ajouter une spécialité',
    );
  });

  it('?inactive=1 : désactivée grisée avec « Réactiver » ; langues en lecture seule', async () => {
    const first = await render(
      { vocabulary: vi.fn().mockResolvedValue(ENTRIES) },
      { inactive: '1' },
    );
    const disabled = first.el.querySelector('tbody tr.disabled');
    expect(disabled?.textContent).toContain('Désactivée');
    expect(disabled?.textContent).toContain('Réactiver');
    TestBed.resetTestingModule();

    const languages = await render(
      { vocabulary: vi.fn().mockResolvedValue(ENTRIES) },
      { kind: 'language' },
    );
    expect(languages.el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(languages.el.querySelector('tbody')?.textContent).toContain('Français');
    expect(languages.el.querySelector('tbody button')).toBeNull();
    expect(languages.el.querySelector('pm-add-entry-form')).toBeNull();
  });

  it('flèche droite sur un onglet : onglet suivant dans l’URL', async () => {
    const { el, navigate } = await render({ vocabulary: vi.fn().mockResolvedValue(ENTRIES) });
    el.querySelector('[role="tab"]')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { kind: 'audience' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('Désactiver… une entrée utilisée : 409 avec le compteur, la ligne reste active', async () => {
    const patchEntry = vi.fn().mockRejectedValue({
      status: 409,
      code: 'VOCABULARY_IN_USE',
      extra: { usedByPublishedProfiles: 2 },
    });
    const { fixture, el } = await render({
      vocabulary: vi.fn().mockResolvedValue(ENTRIES),
      patchEntry,
    });
    [...el.querySelectorAll<HTMLButtonElement>('tbody button')]
      .find((b) => b.textContent?.includes('Désactiver…'))
      ?.click();
    await settle(fixture);
    const dialog = document.querySelector<HTMLElement>('pm-deactivate-dialog')!;
    expect(dialog.querySelector('h2')?.textContent).toContain('Désactiver « Anxiété » ?');
    [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Désactiver')
      ?.click();
    await settle(fixture);
    expect(patchEntry).toHaveBeenCalledWith('specialty', 'anxiety', { active: false });
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(
      'Utilisée par 2 profils publiés',
    );
    expect(dialog.textContent).toContain('Fermer');
    expect(el.querySelector('tbody tr')?.textContent).toContain('Active');
  });

  it('Renommer : panneau en ligne annoncé par aria-expanded, PATCH sur le même code', async () => {
    const patchEntry = vi.fn().mockResolvedValue(entry({ labelFr: 'Anxiété et stress' }));
    const vocabulary = vi.fn().mockResolvedValue(ENTRIES);
    const { fixture, el } = await render({ vocabulary, patchEntry });
    const rename = [...el.querySelectorAll<HTMLButtonElement>('tbody button')].find((b) =>
      b.textContent?.includes('Renommer'),
    )!;
    rename.click();
    await settle(fixture);
    expect(rename.getAttribute('aria-expanded')).toBe('true');
    const panel = el.querySelector(`#${rename.getAttribute('aria-controls')}`);
    expect(panel?.textContent).toContain('Le code ne change jamais');
    const label = panel!.querySelector<HTMLInputElement>('input[type="text"]')!;
    label.value = 'Anxiété et stress';
    label.dispatchEvent(new Event('input'));
    const english = panel!.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    english.value = '';
    english.dispatchEvent(new Event('input'));
    panel!.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(patchEntry).toHaveBeenCalledWith('specialty', 'anxiety', {
      labelFr: 'Anxiété et stress',
      labelEn: '',
      sortOrder: 1,
    });
    expect(vocabulary).toHaveBeenCalledTimes(2);
  });

  it('Ajouter : 409 VOCABULARY_EXISTS sous le champ code, saisie conservée', async () => {
    const { fixture, el } = await render({
      vocabulary: vi.fn().mockResolvedValue(ENTRIES),
      createEntry: vi.fn().mockRejectedValue({ status: 409, code: 'VOCABULARY_EXISTS' }),
    });
    const form = el.querySelector('pm-add-entry-form')!;
    const [code, labelFr] = [...form.querySelectorAll<HTMLInputElement>('input')];
    code.value = 'anxiety';
    code.dispatchEvent(new Event('input'));
    labelFr.value = 'Anxiété';
    labelFr.dispatchEvent(new Event('input'));
    form.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(form.querySelector('#add-field-code-error')?.textContent).toContain(
      'Ce code existe déjà pour ce type.',
    );
    expect(code.value).toBe('anxiety');
  });
});
