import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { EntryPrefill } from '../../entries';
import { CaptureApi } from '../data/capture.api';
import { candidate, CANDIDATES, EMOTIONS, LINK_TYPES } from '../data/capture.fixtures';
import { CapturedEntry } from '../data/capture.model';
import { CaptureBlockComponent } from './capture-block.component';

type Api = Partial<Record<keyof CaptureApi, ReturnType<typeof vi.fn>>>;

const STRESS = {
  code: 'c_00aa11bb',
  labelFr: 'Stress',
  labelEn: null,
  label: 'Stress',
  family: 'fear' as const,
  custom: true,
};

async function render(api: Api = {}) {
  const mock: Api = {
    emotions: vi.fn().mockResolvedValue(EMOTIONS),
    linkTypes: vi.fn().mockResolvedValue(LINK_TYPES),
    railCandidates: vi.fn().mockResolvedValue(CANDIDATES),
    searchEntries: vi.fn().mockResolvedValue([]),
    create: vi
      .fn()
      .mockImplementation(async (_p: string, body: { type: string; status: string }) => ({
        id: 'e-new',
        type: body.type,
        status: body.status,
        sessionId: 's-open',
      })),
    createEmotion: vi.fn().mockResolvedValue(STRESS),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CaptureApi, useValue: mock },
      { provide: PreferencesStore, useValue: { defaultVisibility: signal('clinical') } },
    ],
  });
  const fixture = TestBed.createComponent(CaptureBlockComponent);
  fixture.componentRef.setInput('patientId', 'p-marie');
  const saved: CapturedEntry[] = [];
  const opened: (EntryPrefill | null)[] = [];
  fixture.componentInstance.saved.subscribe((entry) => saved.push(entry));
  fixture.componentInstance.openEditor.subscribe((prefill) => opened.push(prefill));
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLTextAreaElement>('#pm-capture-input')!;
  return { fixture, el, input, api: mock, saved, opened };
}

const text = (element: Element | null): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function type(fixture: ComponentFixture<CaptureBlockComponent>, value: string) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
    '#pm-capture-input',
  )!;
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function press(
  fixture: ComponentFixture<CaptureBlockComponent>,
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  await settle(fixture);
  return event;
}

async function click(fixture: ComponentFixture<CaptureBlockComponent>, element: Element | null) {
  (element as HTMLElement | null)?.click();
  await settle(fixture);
}

async function settle(fixture: ComponentFixture<CaptureBlockComponent>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }
}

function chip(el: HTMLElement, type: string): HTMLButtonElement {
  return el.querySelector<HTMLButtonElement>(`.types .tchip[data-type="${type}"]`)!;
}

function pressedType(el: HTMLElement): string | null {
  return el.querySelector('.types .tchip[aria-pressed="true"]')?.getAttribute('data-type') ?? null;
}

function linkChip(el: HTMLElement, name: RegExp): HTMLButtonElement | null {
  return (
    [...el.querySelectorAll<HTMLButtonElement>('pm-capture-links button')].find((button) =>
      name.test(button.getAttribute('aria-label') ?? ''),
    ) ?? null
  );
}

function placedLink(el: HTMLElement) {
  const pressed = el.querySelector('pm-capture-links .tchip.pressed');
  if (!pressed) return null;
  return {
    name: text(pressed.querySelector('button.name')),
    verb: pressed.querySelector<HTMLSelectElement>('select.verb')!.selectedOptions[0].text.trim(),
  };
}

describe('CaptureBlockComponent', () => {
  it('déplié d’emblée (le bloc n’existe qu’en séance), cinq puces (jamais Séance), Note pressée, champs de la note, vocabulaire et rail lus', async () => {
    const { el, input, api } = await render();
    expect(input.placeholder).toBe("Qu'est-ce qui s'est passé ?");
    expect(el.querySelector('label[for="pm-capture-input"]')?.textContent?.trim()).toBe(
      'Noter quelque chose',
    );
    expect(el.querySelector('.block.expanded')).not.toBeNull();
    expect(
      [...el.querySelectorAll('.types .tchip')].map((button) => button.getAttribute('data-type')),
    ).toEqual(['note', 'feeling', 'event', 'situation', 'medication']);
    expect(pressedType(el)).toBe('note');
    expect(el.querySelector('#pm-capture-when')).not.toBeNull();
    expect(el.querySelector('#pm-capture-visibility')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(true);
    expect(api.emotions).toHaveBeenCalledOnce();
    expect(api.railCandidates).toHaveBeenCalledWith('p-marie');
  });

  it('la puce suit la grammaire : « anx 8 … > entretien » presse Ressenti, remplit émotion, intensité, lien et « détecté depuis »', async () => {
    const { el, fixture } = await render();
    await type(fixture, "anx 8 n'a pas dormi > entretien");
    expect(pressedType(el)).toBe('feeling');
    expect(text(el.querySelector('.types .note-r'))).toBe('détecté depuis « anx 8 »');
    expect(el.querySelector<HTMLInputElement>('#pm-capture-emotion')?.value).toBe('Anxiété');
    expect(el.querySelector('#pm-capture-intensity')?.getAttribute('aria-valuenow')).toBe('8');
    expect(placedLink(el)).toEqual({ name: 'Entretien annuel', verb: 'déclenché par' });
    expect(text(el.querySelector('pm-capture-links .note-r'))).toBe(
      'trouvé depuis « > entretien »',
    );
    expect(el.querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(false);
  });

  it('Entrée enregistre le ressenti lié (même corps que l’éditeur) puis vide le bloc', async () => {
    const { el, input, fixture, api, saved } = await render();
    await type(fixture, "anx 8 n'a pas dormi > entretien");
    const event = await press(fixture, input, 'Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(api.create).toHaveBeenCalledOnce();
    const [patientId, body] = api.create!.mock.calls[0];
    expect(patientId).toBe('p-marie');
    expect(body).toEqual({
      type: 'feeling',
      visibility: 'clinical',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      status: 'final',
      links: [{ targetId: 'e-event', linkType: 'triggers', direction: 'incoming' }],
    });
    expect(saved).toEqual([{ id: 'e-new', type: 'feeling', status: 'final', sessionId: 's-open' }]);
    expect(input.value).toBe('');
    expect(pressedType(el)).toBe('note');
    expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe('Entrée enregistrée.');
  });

  it('la grammaire suit la puce : Ressenti cliqué sans texte montre émotion et intensité ; émotion choisie dans la liste, intensité cliquée, Enregistrer', async () => {
    const { el, fixture, api } = await render();
    await click(fixture, chip(el, 'feeling'));
    expect(pressedType(el)).toBe('feeling');
    expect(el.querySelector('.types .note-r')).toBeNull();
    const combo = el.querySelector<HTMLInputElement>('#pm-capture-emotion')!;
    expect(el.querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(true);

    combo.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    combo.value = 'col';
    combo.dispatchEvent(new Event('input'));
    await settle(fixture);
    const options = [...el.querySelectorAll<HTMLElement>('pm-capture-emotion li[role="option"]')];
    expect(options.map((option) => text(option))).toEqual(['Colère', "Créer l'émotion « Col »"]);
    await click(fixture, options[0]);
    expect(combo.value).toBe('Colère');

    // Échelle : la septième case.
    const cell = el.querySelector<HTMLElement>('pm-capture-scale .cell[data-value="7"]')!;
    cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    await settle(fixture);
    expect(el.querySelector('#pm-capture-intensity')?.getAttribute('aria-valuenow')).toBe('7');

    await type(fixture, 'ruminations');
    expect(pressedType(el)).toBe('feeling');
    await click(fixture, el.querySelector('button.save'));
    expect(api.create!.mock.calls[0][1]).toEqual({
      type: 'feeling',
      visibility: 'clinical',
      feeling: { emotionCode: 'anger', intensity: 7 },
      body: 'ruminations',
      status: 'final',
    });
  });

  it('chaque type : Événement (titre, précision), Situation (depuis, en cours), Médicament (molécule, posologie, depuis), Note (visibilité)', async () => {
    const { el, fixture, api, input } = await render();
    await type(fixture, 'réunion houleuse\navec la cadre');
    await click(fixture, chip(el, 'event'));
    expect(el.querySelector<HTMLInputElement>('#pm-capture-title')?.value).toBe('réunion houleuse');
    // « autre date… » : la date et, pour un événement, sa précision (jour, mois, année).
    const when = el.querySelector<HTMLSelectElement>('#pm-capture-when')!;
    when.value = 'other';
    when.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(el.querySelector('pm-capture-when select.precision')).not.toBeNull();
    expect(el.querySelector('#pm-capture-when-day')).not.toBeNull();

    await click(fixture, chip(el, 'situation'));
    expect(text(el.querySelector('label[for="pm-capture-when"]'))).toBe('Depuis');
    const ongoing = el.querySelector<HTMLInputElement>('.check input[type="checkbox"]')!;
    expect(ongoing.checked).toBe(true);
    ongoing.click();
    await settle(fixture);
    expect(el.querySelector('#pm-capture-until')).not.toBeNull();

    await click(fixture, chip(el, 'medication'));
    expect(el.querySelector<HTMLInputElement>('#pm-capture-molecule')?.value).toBe('réunion');
    expect(el.querySelector<HTMLInputElement>('#pm-capture-dosage')?.value).toBe('houleuse');
    const dosage = el.querySelector<HTMLInputElement>('#pm-capture-dosage')!;
    dosage.value = '2 mg le soir';
    dosage.dispatchEvent(new Event('input'));
    await settle(fixture);

    await click(fixture, chip(el, 'note'));
    const visibility = el.querySelector<HTMLSelectElement>('#pm-capture-visibility')!;
    visibility.value = 'private';
    visibility.dispatchEvent(new Event('change'));
    await settle(fixture);
    await press(fixture, input, 'Enter');
    // Le moment choisi (« autre date… ») a suivi les changements de type.
    expect(api.create!.mock.calls[0][1]).toMatchObject({
      type: 'note',
      visibility: 'private',
      body: 'réunion houleuse\navec la cadre',
      status: 'final',
      occurred: { precision: 'day' },
    });
  });

  it('lien : un clic pose avec le verbe de la matrice, le verbe se change, un second clic retire ; « Autre entrée… » remplace', async () => {
    const { el, fixture, api, input } = await render({
      searchEntries: vi
        .fn()
        .mockResolvedValue([candidate({ id: 'e-old', title: "Entretien d'évaluation" })]),
    });
    await type(fixture, "anx 8 n'a pas dormi");
    expect(placedLink(el)).toBeNull();
    // Les cibles compatibles, situations en cours d'abord.
    expect(
      [...el.querySelectorAll('pm-capture-links .tchip')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Surcharge au travail (situation)',
      'Entretien annuel (événement)',
      'Dort mal depuis deux semaines (note)',
    ]);
    await click(fixture, linkChip(el, /Surcharge au travail/));
    expect(placedLink(el)).toEqual({ name: 'Surcharge au travail', verb: 'déclenché par' });

    const verb = el.querySelector<HTMLSelectElement>('pm-capture-links select.verb')!;
    expect([...verb.options].map((option) => option.text.trim())).toEqual([
      'déclenché par',
      'survient avec',
      'est causé par',
    ]);
    verb.value = '1';
    verb.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(placedLink(el)?.verb).toBe('survient avec');

    // Une autre puce remplace (un seul lien) ; un second clic retire.
    await click(fixture, linkChip(el, /Entretien annuel/));
    expect(placedLink(el)?.name).toBe('Entretien annuel');
    await click(fixture, linkChip(el, /Entretien annuel/));
    expect(placedLink(el)).toBeNull();

    // « Autre entrée… » : recherche dans le dossier, la cible trouvée prend la place d'une puce.
    await click(fixture, el.querySelector('pm-capture-links button.other'));
    const search = el.querySelector<HTMLInputElement>('pm-capture-links input[type="search"]')!;
    search.value = 'éval';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settle(fixture);
    expect(api.searchEntries).toHaveBeenCalledWith('p-marie', 'éval');
    await press(fixture, search, 'Enter');
    expect(placedLink(el)).toEqual({ name: "Entretien d'évaluation", verb: 'déclenché par' });
    expect(el.querySelector('pm-capture-links input[type="search"]')).toBeNull();

    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].links).toEqual([
      { targetId: 'e-old', linkType: 'triggers', direction: 'incoming' },
    ]);
  });

  it('`>` sélectionne la même puce ; un clic sur elle retire le lien ; un clic ailleurs le remplace', async () => {
    const { el, fixture, api, input } = await render();
    await type(fixture, "anx 8 n'a pas dormi > entretien");
    expect(linkChip(el, /Entretien annuel/)?.getAttribute('aria-pressed')).toBe('true');
    await click(fixture, linkChip(el, /Entretien annuel/));
    expect(placedLink(el)).toBeNull();
    await click(fixture, linkChip(el, /Surcharge au travail/));
    expect(placedLink(el)?.name).toBe('Surcharge au travail');
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].links).toEqual([
      { targetId: 'e-situation', linkType: 'triggers', direction: 'incoming' },
    ]);
  });

  it('Ctrl+S : brouillon ; Ctrl+Entrée et « Détailler » : l’éditeur prérempli, lien compris, rien n’est créé', async () => {
    const { el, input, fixture, api, opened } = await render();
    await type(fixture, '/evt entretien avec le manager');
    const draft = await press(fixture, input, 's', { ctrlKey: true });
    expect(draft.defaultPrevented).toBe(true);
    expect(api.create!.mock.calls[0][1]).toMatchObject({
      type: 'event',
      title: 'entretien avec le manager',
      status: 'draft',
    });
    expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe('Brouillon enregistré.');

    await type(fixture, "anx 8 n'a pas dormi > entretien");
    await press(fixture, input, 'Enter', { ctrlKey: true });
    expect(api.create).toHaveBeenCalledOnce();
    const expected: EntryPrefill = {
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      occurred: null,
      links: [{ targetId: 'e-event', linkType: 'triggers', direction: 'incoming' }],
    };
    expect(opened).toEqual([expected]);
    // Le bloc garde la saisie : c'est le dossier qui le vide quand l'éditeur s'est ouvert.
    expect(input.value).toBe("anx 8 n'a pas dormi > entretien");
    await click(fixture, el.querySelector('button.detail'));
    expect(opened).toEqual([expected, expected]);
  });

  it('« autre date… » : après l’enregistrement, le champ suivant repart à « maintenant » (rien d’affiché qui ne partirait pas)', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, 'dort mal');
    const when = el.querySelector<HTMLSelectElement>('#pm-capture-when')!;
    when.value = 'other';
    when.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(el.querySelector('#pm-capture-when-day')).not.toBeNull();
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].occurred).toMatchObject({ precision: 'day' });
    expect(input.value).toBe('');
    await type(fixture, 'dort mieux');
    const again = el.querySelector<HTMLSelectElement>('#pm-capture-when')!;
    expect(again.selectedOptions[0].value).toBe('now');
    expect(el.querySelector('#pm-capture-when-day')).toBeNull();
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[1][1].occurred).toBeUndefined();
  });

  it('Détailler avec une cible hors rail ou une visibilité privée : l’éditeur s’ouvre et un toast dit ce qu’il ne reprend pas', async () => {
    const { el, fixture, opened } = await render({
      searchEntries: vi
        .fn()
        .mockResolvedValue([candidate({ id: 'e-old', title: "Entretien d'évaluation" })]),
    });
    await type(fixture, 'dort mal');
    const visibility = el.querySelector<HTMLSelectElement>('#pm-capture-visibility')!;
    visibility.value = 'private';
    visibility.dispatchEvent(new Event('change'));
    await settle(fixture);
    await click(fixture, el.querySelector('pm-capture-links button.other'));
    const search = el.querySelector<HTMLInputElement>('pm-capture-links input[type="search"]')!;
    search.value = 'éval';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settle(fixture);
    await press(fixture, search, 'Enter');
    expect(placedLink(el)?.name).toBe("Entretien d'évaluation");
    await click(fixture, el.querySelector('button.detail'));
    expect(opened).toHaveLength(1);
    expect(opened[0]?.links).toEqual([
      { targetId: 'e-old', linkType: 'co_occurs', direction: 'outgoing' },
    ]);
    expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe(
      "L'éditeur ne reprend pas la visibilité « privée » (à régler dans « Plus ») et le lien vers « Entretien d'évaluation » (à rechercher dans « Lié à… »).",
    );
  });

  it('Entrée sur un bloc vide : l’éditeur vide ; Échap replie les champs en gardant le texte', async () => {
    const { el, input, fixture, api, opened } = await render();
    await press(fixture, input, 'Enter');
    expect(opened).toEqual([null]);
    expect(api.create).not.toHaveBeenCalled();
    await type(fixture, 'anx 8');
    const escape = await press(fixture, input, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(el.querySelector('.fields')).toBeNull();
    expect(input.value).toBe('anx 8');
    await type(fixture, 'anx 9');
    expect(el.querySelector('.fields')).not.toBeNull();
  });

  it('avertissement bloquant sous le champ (intensité hors échelle) : Enregistrer désactivé, Entrée ne crée rien et le dit', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, 'anx 12 crise');
    expect(text(el.querySelector('#pm-capture-intensity-note li.blocking'))).toBe(
      "Intensité 12 hors de l'échelle : tapez un nombre de 0 à 10.",
    );
    expect(el.querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(true);
    await press(fixture, input, 'Enter');
    expect(api.create).not.toHaveBeenCalled();
    expect(text(el.querySelector('p.alert[role="alert"]'))).toBe(
      "Rien n'est enregistré. Intensité 12 hors de l'échelle : tapez un nombre de 0 à 10.",
    );
    // Une case de l'échelle cliquée règle l'avertissement.
    el.querySelector<HTMLElement>('pm-capture-scale .cell[data-value="9"]')!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
    await settle(fixture);
    expect(el.querySelector('#pm-capture-intensity-note')).toBeNull();
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].feeling).toEqual({ emotionCode: 'anxiety', intensity: 9 });
  });

  it('cible introuvable : bloquant sous « Lié à » (un lien demandé ne disparaît pas en silence)', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, 'anx 8 > dispute');
    expect(text(el.querySelector('#pm-capture-link-note li.blocking'))).toContain(
      'Aucune entrée récente ne commence par « dispute »',
    );
    await press(fixture, input, 'Enter');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('émotion inconnue : proposition sous le champ Émotion, famille obligatoire, puis ressenti reconnu ; 409 affiché', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, "stress 7 avant l'examen");
    api.emotions?.mockResolvedValue([...EMOTIONS, STRESS]);
    expect(el.querySelector<HTMLInputElement>('#pm-capture-emotion')?.value).toBe('stress');
    const proposal = el.querySelector('pm-capture-emotion pm-emotion-proposal [role="group"]')!;
    expect(text(proposal.querySelector('.title'))).toBe("Créer l'émotion personnalisée « Stress »");
    await click(fixture, proposal.querySelector('button.create'));
    expect(api.createEmotion).not.toHaveBeenCalled();
    expect(text(proposal.querySelector('[role="alert"]'))).toBe(
      "Choisissez la famille de l'émotion.",
    );
    const family = proposal.querySelector<HTMLSelectElement>('select')!;
    family.value = 'fear';
    family.dispatchEvent(new Event('change'));
    await click(fixture, proposal.querySelector('button.create'));
    expect(api.createEmotion).toHaveBeenCalledWith('Stress', 'fear');
    expect(el.querySelector('pm-emotion-proposal')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#pm-capture-emotion')?.value).toBe('Stress');
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].feeling).toEqual({
      emotionCode: 'c_00aa11bb',
      intensity: 7,
    });

    // Créée depuis la liste, pas depuis la grammaire : le libellé refusé (409) sous la proposition.
    api.createEmotion?.mockRejectedValue({ status: 409, code: 'EMOTION_LABEL_EXISTS' });
    await click(fixture, chip(el, 'feeling'));
    const combo = el.querySelector<HTMLInputElement>('#pm-capture-emotion')!;
    combo.value = 'Tracas';
    combo.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click(fixture, el.querySelector('pm-capture-emotion li.create'));
    const created = el.querySelector('pm-capture-emotion pm-emotion-proposal')!;
    const select = created.querySelector<HTMLSelectElement>('select')!;
    select.value = 'anger';
    select.dispatchEvent(new Event('change'));
    await click(fixture, created.querySelector('button.create'));
    expect(text(created.querySelector('[role="alert"]'))).toBe(
      'Une émotion porte déjà ce libellé : tapez son nom ou son début.',
    );
  });

  it('422 par champ : le message sous le champ fautif, le texte reste ; SESSION_REQUIRED sous le bloc', async () => {
    const { el, input, fixture, saved } = await render({
      create: vi
        .fn()
        .mockRejectedValueOnce({
          status: 422,
          code: 'VALIDATION_FAILED',
          errors: [
            { field: 'feeling.intensity', code: 'REQUIRED', message: 'Intensité obligatoire.' },
            { field: 'links[0].targetId', code: 'ENTRY_ARCHIVED', message: 'Archivée.' },
          ],
        })
        .mockRejectedValueOnce({
          status: 422,
          code: 'SESSION_REQUIRED',
          errors: [{ field: 'sessionId', code: 'SESSION_REQUIRED', message: 'Aucune séance.' }],
        }),
    });
    await type(fixture, 'anx 8 dort mal > entretien');
    await press(fixture, input, 'Enter');
    expect(text(el.querySelector('#pm-capture-intensity-note'))).toBe(
      'Un champ obligatoire manque.',
    );
    expect(text(el.querySelector('#pm-capture-link-note'))).toBe("L'entrée liée est archivée.");
    expect(text(el.querySelector('p.alert'))).toBe(
      "L'entrée n'a pas été créée : corrigez les champs signalés.",
    );
    expect(input.value).toBe('anx 8 dort mal > entretien');
    expect(saved).toEqual([]);
    // Une correction efface les erreurs du serveur.
    el.querySelector<HTMLElement>('pm-capture-scale .cell[data-value="6"]')!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
    await settle(fixture);
    expect(el.querySelector('#pm-capture-intensity-note')).toBeNull();

    await press(fixture, input, 'Enter');
    expect(text(el.querySelector('p.alert'))).toContain('Toute entrée appartient à une séance');
    expect(input.value).toBe('anx 8 dort mal > entretien');
  });

  it('trois états : vocabulaire en erreur → Réessayer ; rail vide ; rail illisible bloque la cible du `>`', async () => {
    const { el, fixture, api, input } = await render({
      emotions: vi
        .fn()
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockResolvedValue(EMOTIONS),
      railCandidates: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockResolvedValue(CANDIDATES),
    });
    // Lus dès le rendu (le bloc est déplié d'emblée) : rail vide, vocabulaire en erreur sous le texte.
    expect(text(el.querySelector('pm-capture-links [role="status"] .title'))).toBe(
      'Aucune entrée récente à lier',
    );
    const error = el.querySelector('pm-state.vocabulary [role="alert"]')!;
    expect(text(error.querySelector('.title'))).toBe('Impossible de charger les émotions');
    await click(fixture, error.querySelector('button.retry'));
    expect(api.emotions).toHaveBeenCalledTimes(2);
    await type(fixture, 'anx 8');
    expect(el.querySelector('pm-state.vocabulary')).toBeNull();
    expect(pressedType(el)).toBe('feeling');
    expect(el.querySelector<HTMLInputElement>('#pm-capture-emotion')?.value).toBe('Anxiété');
    expect(input.value).toBe('anx 8');
  });

  it('rail illisible : la cible du `>` est indisponible, Entrée ne crée rien ; Réessayer relit et pose le lien', async () => {
    const { el, fixture, api, input } = await render({
      railCandidates: vi
        .fn()
        // Au rendu, à la frappe, puis à l'enregistrement : illisible ; Réessayer le relit.
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockResolvedValue(CANDIDATES),
    });
    await type(fixture, 'anx 8 > entretien');
    expect(text(el.querySelector('pm-capture-links [role="alert"] .title'))).toBe(
      'Impossible de charger les entrées à lier',
    );
    await press(fixture, input, 'Enter');
    expect(api.create).not.toHaveBeenCalled();
    expect(text(el.querySelector('p.alert'))).toContain(
      "Les entrées à lier n'ont pas pu être chargées",
    );
    await click(fixture, el.querySelector('pm-capture-links [role="alert"] button.retry'));
    expect(placedLink(el)?.name).toBe('Entretien annuel');
    // Sans `>`, un rail illisible ne bloque pas.
    api.railCandidates?.mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' });
    fixture.componentInstance['store'].markStale();
    await type(fixture, 'anx 8');
    await press(fixture, input, 'Enter');
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('focus discret (arrivée sur un dossier créé) : champ focalisé, champs repliés jusqu’à la frappe ; focus ordinaire', async () => {
    const { el, input, fixture } = await render();
    fixture.componentInstance.focus({ quiet: true });
    await settle(fixture);
    expect(document.activeElement).toBe(input);
    expect(el.querySelector('.fields')).toBeNull();
    await type(fixture, 'anx 8');
    expect(el.querySelector('.fields')).not.toBeNull();
    fixture.componentInstance.clear();
    await settle(fixture);
    fixture.componentInstance.focus();
    await settle(fixture);
    expect(document.activeElement).toBe(input);
    expect(el.querySelector('.fields')).not.toBeNull();
  });

  it('écriture ailleurs dans le dossier (revision) : rail relu au focus suivant ; sa propre création non', async () => {
    const { input, fixture, api } = await render();
    await type(fixture, 'anx 8');
    expect(api.railCandidates).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('revision', 1);
    await settle(fixture);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);
    expect(api.railCandidates).toHaveBeenCalledTimes(2);

    await press(fixture, input, 'Enter');
    await vi.waitFor(() => expect(api.railCandidates).toHaveBeenCalledTimes(3));
    fixture.componentRef.setInput('revision', 2);
    await settle(fixture);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);
    expect(api.railCandidates).toHaveBeenCalledTimes(3);
  });

  it('composition en cours (IME) : Entrée et Ctrl+S appartiennent à la saisie ; rien pendant un enregistrement', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const { input, fixture, api, opened } = await render({
      create: vi.fn().mockImplementation(() => new Promise((done) => (resolve = done))),
    });
    await type(fixture, 'semble plus détendu');
    await press(fixture, input, 'Enter', { isComposing: true });
    await press(fixture, input, 's', { ctrlKey: true, isComposing: true });
    expect(api.create).not.toHaveBeenCalled();
    await press(fixture, input, 'ß', { ctrlKey: true, code: 'KeyS' });
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.create!.mock.calls[0][1].status).toBe('draft');
    await press(fixture, input, 'Enter', { ctrlKey: true });
    await press(fixture, input, 'Enter');
    expect(opened).toEqual([]);
    expect(api.create).toHaveBeenCalledOnce();
    resolve({ id: 'e-new', type: 'note', status: 'draft', sessionId: 's-open' });
    await settle(fixture);
  });

  it('lecteurs d’écran : résumé (role="status") après une pause, tout de suite si la saisie devient bloquée', async () => {
    const { el, fixture } = await render();
    await type(fixture, "anx 8 n'a pas dormi > entretien");
    const status = el.querySelector('p.sr-only[role="status"]')!;
    await new Promise((done) => setTimeout(done, 600));
    await fixture.whenStable();
    expect(text(status)).toBe('Ressenti, Anxiété 8 sur 10, déclenché par « Entretien annuel »');
    await type(fixture, 'anx 12');
    expect(text(status)).toBe("Ressenti, Anxiété, 1 point(s) à corriger avant d'enregistrer");
  });
});
