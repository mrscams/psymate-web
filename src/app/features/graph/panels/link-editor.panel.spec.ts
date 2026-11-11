import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SessionStore } from '../../../core/auth';
import {
  ConfirmDialogService,
  SidePanelRef,
  SidePanelService,
  ToastService,
} from '../../../shared/ui';
import { LinkApi } from '../data/link.api';
import { CATALOG, EVENT, link, MEDICATION, SITUATION, source } from '../data/link.fixtures';
import { EntryLink } from '../data/link.model';
import { LinkEditorData, LinkEditorPanel } from './link-editor.panel';

type Api = Partial<Record<keyof LinkApi, ReturnType<typeof vi.fn>>>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const never = () => new Promise(() => undefined);

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await tick();
    TestBed.tick();
  }
}

async function render(
  api: Api = {},
  confirm = vi.fn().mockResolvedValue(true),
  targetId: string | null = null,
) {
  const mock: Api = {
    linkTypes: vi.fn().mockResolvedValue(CATALOG),
    entry: vi.fn().mockResolvedValue(source()),
    linksOf: vi.fn().mockResolvedValue([link()]),
    targets: vi.fn().mockResolvedValue([EVENT, SITUATION]),
    create: vi.fn(),
    changeType: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: LinkApi, useValue: mock },
      { provide: SessionStore, useValue: { me: signal({ id: 'u-claire' }) } },
      { provide: ConfirmDialogService, useValue: { confirm } },
    ],
  });
  const ref = TestBed.inject(SidePanelService).open<LinkEditorPanel, LinkEditorData, EntryLink>(
    LinkEditorPanel,
    { data: { entryId: 'e-feeling', patientName: 'Marie D.', targetId }, width: 520 },
  ) as SidePanelRef<EntryLink>;
  await settle();
  const el = document.querySelector<HTMLElement>('pm-link-editor-panel')!;
  return { el, api: mock, ref, confirm };
}

function chip(el: HTMLElement, code: string): HTMLButtonElement {
  return el.querySelector<HTMLButtonElement>(`.editor pm-link-type-chips [data-code="${code}"]`)!;
}

async function chooseTarget(el: HTMLElement, id: string): Promise<void> {
  const radio = el.querySelector<HTMLInputElement>(`input[type="radio"][value="${id}"]`)!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

async function click(element: HTMLElement | null): Promise<void> {
  element!.click();
  await settle();
}

const sentence = (el: HTMLElement) => text(el.querySelector('.reading .sentence'));

describe('LinkEditorPanel', () => {
  afterEach(async () => {
    TestBed.inject(SidePanelService).closeAll();
    await tick();
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('chargement : squelettes de la source, des types, des cibles et des liens', async () => {
    const { el } = await render({
      entry: vi.fn(never),
      linkTypes: vi.fn(never),
      linksOf: vi.fn(never),
    });
    expect(el.querySelectorAll('pm-state [aria-busy="true"]').length).toBeGreaterThanOrEqual(4);
  });

  it('erreur : source, types et liens en erreur avec Réessayer ; pas de recherche', async () => {
    const network = { status: 0, code: 'NETWORK_ERROR' };
    const entry = vi.fn().mockRejectedValueOnce(network).mockResolvedValue(source());
    const { el, api } = await render({
      entry,
      linkTypes: vi.fn().mockRejectedValue(network),
      linksOf: vi.fn().mockRejectedValue(network),
    });
    const alerts = [...el.querySelectorAll('pm-state [role="alert"]')].map(text).join(' | ');
    expect(alerts).toContain('Impossible de charger cette entrée');
    expect(alerts).toContain('Impossible de charger les types de liens');
    expect(alerts).toContain('Impossible de charger les liens de cette entrée');
    expect(api.targets).not.toHaveBeenCalled();
    await click(el.querySelector<HTMLButtonElement>('section pm-state button'));
    expect(entry).toHaveBeenCalledTimes(2);
    expect(api.targets).toHaveBeenCalledTimes(1);
  });

  it('vide : aucune cible trouvée, aucun lien posé', async () => {
    const { el } = await render({
      targets: vi.fn().mockResolvedValue([]),
      linksOf: vi.fn().mockResolvedValue([]),
    });
    const empty = [...el.querySelectorAll('pm-state')].map(text).join(' | ');
    expect(empty).toContain('Aucune autre entrée trouvée');
    expect(empty).toContain('Aucun lien sur cette entrée pour le moment');
    // Vide n'est pas une erreur : pas de « Réessayer ».
    expect(el.querySelectorAll('pm-state button')).toHaveLength(0);
    expect(text(el.querySelector('#pm-link-placed'))).toBe('Liens déjà posés sur cette entrée · 0');
  });

  it('contenu : titre, rappel patient, source, cibles ; entrée déjà liée grisée avec le verbe', async () => {
    const { el } = await render();
    expect(text(el.querySelector('h2'))).toBe('Lier deux entrées');
    expect(text(el.querySelector('.subtitle'))).toBe(
      'Marie D. · le lien est visible dans le graphe et la timeline',
    );
    // Le sous-titre décrit le dialogue (pm-side-panel).
    const dialog = el.closest('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-describedby')).toBe(el.querySelector('.subtitle')!.id);
    expect(text(el.querySelector('.card-name'))).toBe('Anxiété 8/10');
    const targets = [...el.querySelectorAll('label.target')];
    expect(targets.map((item) => text(item.querySelector('.row-name')))).toEqual([
      "Entretien d'évaluation",
      'Recherche d’emploi depuis septembre, avec beaucoup de refus.',
    ]);
    expect(targets[0].classList.contains('linked')).toBe(false);
    expect(targets[1].classList.contains('linked')).toBe(true);
    expect(text(targets[1].querySelector('.linked-text'))).toBe('déjà lié (aggravé par)');
    expect(text(el.querySelector('#pm-link-placed'))).toBe('Liens déjà posés sur cette entrée · 1');
  });

  it('cible préremplie (glisser dans le graphe, M2-06) : lue puis choisie, le type reste à choisir', async () => {
    const entry = vi.fn((id: string) =>
      Promise.resolve(
        id === 'e-medication' ? { ...MEDICATION, patientId: 'p-marie', archived: false } : source(),
      ),
    );
    const { el, api } = await render({ entry }, undefined, 'e-medication');
    expect(api.entry).toHaveBeenCalledWith('e-medication');
    const checked = el.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    expect(checked?.value).toBe('e-medication');
    expect(sentence(el)).toBe('Anxiété 8/10 … Sertraline 50 mg');
    // Ressenti → médicament : « traite » n'est permis que dans l'autre sens.
    expect(chip(el, 'treats').getAttribute('aria-disabled')).toBe('true');
  });

  it('seuls les types permis pour le couple sont actifs ; aide reliée aux puces refusées', async () => {
    const { el } = await render();
    await chooseTarget(el, 'e-event');
    const enabled = [...el.querySelectorAll<HTMLButtonElement>('.editor pm-link-type-chips .chip')]
      .filter((button) => button.getAttribute('aria-disabled') !== 'true')
      .map((button) => button.dataset['code']);
    expect(enabled).toEqual(['caused_by', 'co_occurs', 'follows']);
    const triggers = chip(el, 'triggers');
    const help = el.querySelector(`#${triggers.getAttribute('aria-describedby')}`);
    expect(text(help)).toBe(
      '« déclenche » : seulement depuis événement, situation, séance. Possible en inversant le sens.',
    );
    await click(triggers);
    expect(triggers.getAttribute('aria-pressed')).toBe('false');
    expect(sentence(el)).toBe("Anxiété 8/10 … Entretien d'évaluation");
  });

  it('inverser le sens recompose la phrase et rouvre les types de l’autre sens', async () => {
    const { el } = await render();
    await chooseTarget(el, 'e-situation');
    await click(chip(el, 'follows'));
    expect(sentence(el)).toBe(
      'Anxiété 8/10 fait suite à Recherche d’emploi depuis septembre, avec beaucoup de refus.',
    );
    expect(
      el.querySelector('.reading .sentence')?.closest('[aria-live]')?.getAttribute('aria-live'),
    ).toBe('polite');
    const invert = el.querySelector<HTMLButtonElement>('button.invert')!;
    await click(invert);
    expect(invert.getAttribute('aria-pressed')).toBe('true');
    expect(sentence(el)).toBe(
      'Recherche d’emploi depuis septembre, avec beaucoup de refus. fait suite à Anxiété 8/10',
    );
    expect(chip(el, 'follows').getAttribute('aria-pressed')).toBe('true');
    // Situation → ressenti : « aggrave » devient possible.
    expect(chip(el, 'worsens').getAttribute('aria-disabled')).toBeNull();
  });

  it('un type devenu interdit par l’inversion est retiré', async () => {
    const { el } = await render();
    await chooseTarget(el, 'e-event');
    await click(el.querySelector<HTMLButtonElement>('button.invert'));
    await click(chip(el, 'triggers'));
    expect(sentence(el)).toBe("Entretien d'évaluation déclenche Anxiété 8/10");
    await click(el.querySelector<HTMLButtonElement>('button.invert'));
    expect(chip(el, 'triggers').getAttribute('aria-pressed')).toBe('false');
    expect(sentence(el)).toBe("Anxiété 8/10 … Entretien d'évaluation");
  });

  it('⏎ enregistre : sens inversé, type actif, toast « Annuler », panneau fermé avec le lien', async () => {
    const created = link({ id: 'l-new', linkType: 'triggers', sourceId: 'e-event' });
    const { el, api, ref } = await render({ create: vi.fn().mockResolvedValue(created) });
    const closed = ref.closed;
    await chooseTarget(el, 'e-event');
    await click(el.querySelector<HTMLButtonElement>('button.invert'));
    await click(chip(el, 'triggers'));
    const textarea = el.querySelector('textarea')!;
    textarea.value = 'Juste après l’entretien';
    textarea.dispatchEvent(new Event('input'));
    el.querySelector<HTMLInputElement>('#pm-link-search')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await settle();
    expect(api.create).toHaveBeenCalledWith('e-feeling', {
      targetId: 'e-event',
      linkType: 'triggers',
      reversed: true,
      rationale: 'Juste après l’entretien',
    });
    expect(await closed).toEqual(created);
    const toast = TestBed.inject(ToastService).toasts().at(-1);
    expect(toast?.message).toBe('Lien enregistré.');
    expect(toast?.action?.label).toBe('Annuler');
  });

  it('409 LINK_EXISTS : « Ce lien existe déjà · Modifier le type ? » ouvre la modification du lien', async () => {
    const conflict = { status: 409, code: 'LINK_EXISTS', extra: { existingLinkId: 'l-1' } };
    const { el } = await render({ create: vi.fn().mockRejectedValue(conflict) });
    await chooseTarget(el, 'e-situation');
    await click(el.querySelector<HTMLButtonElement>('button.invert'));
    await click(chip(el, 'worsens'));
    await click(el.querySelector<HTMLButtonElement>('.footer .primary'));
    const alert = el.querySelector('.alert[role="alert"]');
    expect(text(alert?.querySelector('p'))).toBe('Ce lien existe déjà · Modifier le type ?');
    await click(alert!.querySelector<HTMLButtonElement>('.alert-action'));
    await settle();
    const item = el.querySelector('[data-link-id="l-1"]')!;
    expect(item.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
    const pressed = item.querySelector('pm-link-type-chips [aria-pressed="true"]');
    expect(pressed?.getAttribute('data-code')).toBe('worsens');
  });

  it('modifier le type d’un lien posé : PATCH avec le nouveau type, liste relue', async () => {
    const linksOf = vi
      .fn()
      .mockResolvedValueOnce([link()])
      .mockResolvedValue([link({ id: 'l-2', linkType: 'triggers', sentence: 'nouvelle phrase' })]);
    const changeType = vi.fn().mockResolvedValue(link({ id: 'l-2' }));
    const { el } = await render({ linksOf, changeType });
    const item = el.querySelector<HTMLElement>('[data-link-id="l-1"]')!;
    await click(item.querySelector<HTMLButtonElement>('.actions button'));
    await settle();
    // Situation → ressenti : « traite » refusé, « déclenche » permis.
    expect(
      item.querySelector('pm-link-type-chips [data-code="treats"]')?.getAttribute('aria-disabled'),
    ).toBe('true');
    await click(item.querySelector<HTMLButtonElement>('pm-link-type-chips [data-code="triggers"]'));
    expect(changeType).toHaveBeenCalledWith('l-1', 'triggers');
    expect(text(el.querySelector('[data-link-id="l-2"] .sentence'))).toBe('nouvelle phrase');
  });

  it('retirer un lien : il reste dans la liste, barré et marqué « retiré »', async () => {
    const { el, api } = await render();
    const item = el.querySelector<HTMLElement>('[data-link-id="l-1"]')!;
    await click(item.querySelector<HTMLButtonElement>('.actions .danger'));
    expect(api.remove).toHaveBeenCalledWith('l-1');
    const after = el.querySelector<HTMLElement>('[data-link-id="l-1"]')!;
    expect(after.classList.contains('removed')).toBe(true);
    expect(after.querySelector('s')).not.toBeNull();
    expect(text(after.querySelector('.badge'))).toBe('retiré');
    expect(after.querySelector('.actions')).toBeNull();
    expect(text(el.querySelector('#pm-link-placed'))).toBe('Liens déjà posés sur cette entrée · 0');
  });

  it('Échap sans choix : fermeture immédiate, sans confirmation', async () => {
    const { el, ref, confirm } = await render();
    const closed = ref.closed;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(await closed).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Échap avec une cible choisie : confirmation ; « Continuer » garde le panneau ouvert', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const { el } = await render({}, confirm);
    await chooseTarget(el, 'e-event');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    el.querySelector('textarea')!.dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector('pm-link-editor-panel')).not.toBeNull();
  });

  it('422 LINK_TYPE_NOT_ALLOWED : message du serveur sous les puces, rien n’est fermé', async () => {
    const problem = {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        {
          field: 'linkType',
          code: 'LINK_TYPE_NOT_ALLOWED',
          message: 'Type interdit pour ce couple.',
        },
      ],
    };
    const { el } = await render({ create: vi.fn().mockRejectedValue(problem) });
    await chooseTarget(el, 'e-event');
    await click(chip(el, 'follows'));
    await click(el.querySelector<HTMLButtonElement>('.footer .primary'));
    expect(text(el.querySelector('#field-linkType-error'))).toBe('Type interdit pour ce couple.');
    expect(
      el
        .querySelector('.editor pm-link-type-chips [role="group"]')
        ?.getAttribute('aria-describedby'),
    ).toBe('field-linkType-error');
    expect(el.querySelector('.alert')).toBeNull();
    expect(document.querySelector('pm-link-editor-panel')).not.toBeNull();
  });

  it('422 sans contrôle relié (direction, SELF_LINK sur targetId) : alerte et message sous les cibles', async () => {
    const problem = {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        { field: 'direction', code: 'INVALID_VALUE', message: 'Sens inconnu.' },
        { field: 'targetId', code: 'SELF_LINK', message: 'Une entrée ne se lie pas à elle-même.' },
      ],
    };
    const { el } = await render({ create: vi.fn().mockRejectedValue(problem) });
    await chooseTarget(el, 'e-event');
    await click(chip(el, 'follows'));
    await click(el.querySelector<HTMLButtonElement>('.footer .primary'));
    expect(text(el.querySelector('.alert p'))).toBe('Sens inconnu.');
    expect(text(el.querySelector('#field-targetId-error'))).toBe(
      'Une entrée ne se lie pas à elle-même.',
    );
  });

  it('Échap avec un type choisi seulement : confirmation, puis fermeture si « Abandonner »', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const { el, ref } = await render({}, confirm);
    const closed = ref.closed;
    await click(chip(el, 'follows'));
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await closed).toBeUndefined();
  });

  it('modifier un lien dont l’autre extrémité est illisible : erreur et Réessayer', async () => {
    const entry = vi
      .fn()
      .mockResolvedValueOnce(source())
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValue(source({ id: 'e-loin', type: 'situation' }));
    const { el } = await render({
      entry,
      linksOf: vi.fn().mockResolvedValue([link({ sourceId: 'e-loin' })]),
    });
    const item = el.querySelector<HTMLElement>('[data-link-id="l-1"]')!;
    await click(item.querySelector<HTMLButtonElement>('.actions button'));
    await settle();
    expect(text(item.querySelector('.error[role="alert"]'))).toContain(
      'Impossible de lire les types possibles.',
    );
    await click(item.querySelector<HTMLButtonElement>('.error button'));
    await settle();
    expect(item.querySelector('pm-link-type-chips')).not.toBeNull();
  });

  it('source introuvable (404) : erreur sans « Réessayer »', async () => {
    const { el } = await render({
      entry: vi.fn().mockRejectedValue({ status: 404, code: 'ENTRY_NOT_FOUND' }),
    });
    const state = el.querySelector('section pm-state');
    expect(text(state)).toContain('Impossible de charger cette entrée');
    expect(state?.querySelector('button.retry, button.action')).toBeNull();
  });

  it('ordre de la maquette 06 : Depuis, Relation, Vers ; phrase épinglée dans le pied', async () => {
    const { el } = await render();
    expect([...el.querySelectorAll('form.editor h3.block-label')].map(text)).toEqual([
      'Depuis',
      'Relation',
      'Vers',
    ]);
    const reading = el.querySelector('.footer .reading');
    expect(text(reading?.querySelector('h3'))).toBe('Le lien se lira');
    expect(reading?.querySelector('[aria-live="polite"]')).not.toBeNull();
    // Cibles : nom accessible = titre seul, type et date en description.
    const radio = el.querySelector<HTMLInputElement>('input[type="radio"][value="e-event"]')!;
    const name = el.querySelector(`#${radio.getAttribute('aria-labelledby')}`);
    expect(text(name)).toBe("Entretien d'évaluation");
    expect(text(el.querySelector(`#${radio.getAttribute('aria-describedby')}`))).toMatch(
      /^Événement · /,
    );
  });

  it('puces refusées : raison en infobulle, une seule ligne d’aide visible (dernière touchée)', async () => {
    const { el } = await render();
    await chooseTarget(el, 'e-event');
    const triggers = chip(el, 'triggers');
    expect(triggers.getAttribute('title')).toBe(
      '« déclenche » : seulement depuis événement, situation, séance. Possible en inversant le sens.',
    );
    expect(el.querySelector('.editor pm-link-type-chips .hint')).toBeNull();
    await click(triggers);
    expect(text(el.querySelector('.editor pm-link-type-chips .hint'))).toBe(
      triggers.getAttribute('title'),
    );
  });

  it('« Changer » : une autre entrée du dossier devient la source, le choix en cours est effacé', async () => {
    const entry = vi.fn((id: string) =>
      Promise.resolve(
        id === 'e-event' ? { ...EVENT, patientId: 'p-marie', archived: false } : source(),
      ),
    );
    const { el, api } = await render({ entry });
    await chooseTarget(el, 'e-situation');
    const change = [...el.querySelectorAll<HTMLButtonElement>('.card button')].find(
      (button) => text(button) === 'Changer',
    )!;
    await click(change);
    expect(change.getAttribute('aria-expanded')).toBe('true');
    expect(api.targets).toHaveBeenLastCalledWith('p-marie', { q: '', type: null });
    const option = [...el.querySelectorAll<HTMLButtonElement>('.source-option')].find((button) =>
      text(button).startsWith("Entretien d'évaluation"),
    )!;
    await click(option);
    expect(entry).toHaveBeenLastCalledWith('e-event');
    expect(api.linksOf).toHaveBeenLastCalledWith('e-event');
    expect(text(el.querySelector('.card-name'))).toBe("Entretien d'évaluation");
    expect(el.querySelector('input[type="radio"]:checked')).toBeNull();
    expect(el.querySelector('.source-picker')).toBeNull();
  });

  it('filtre de type : relance la recherche dans le dossier', async () => {
    const { el, api } = await render();
    const select = el.querySelector<HTMLSelectElement>('#pm-link-type-filter')!;
    select.value = 'medication';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(api.targets).toHaveBeenLastCalledWith('p-marie', { q: '', type: 'medication' });
  });
});
