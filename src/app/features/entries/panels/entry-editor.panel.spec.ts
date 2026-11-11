import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { PreferencesStore } from '../../../core/preferences';
import { SidePanelService, ToastService } from '../../../shared/ui';
import { EntriesApi } from '../data/entries.api';
import { EntryEditorStore } from '../data/entry-editor.store';
import {
  CANDIDATES,
  CURRENT_SESSION,
  EMOTIONS,
  entry,
  feelingEntry,
  LINK_TYPES,
  PLACED_LINKS,
  SESSIONS,
  TAGS,
  VERSIONS,
} from '../data/entry.fixtures';
import { openEntryEditor } from '../entry-editor.launcher';

type Api = Partial<Record<keyof EntriesApi, ReturnType<typeof vi.fn>>>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const never = <T>() => new Promise<T>(() => undefined);

function setup(api: Api = {}) {
  const mock: Api = {
    emotions: vi.fn().mockResolvedValue(EMOTIONS),
    tagLabels: vi.fn().mockResolvedValue(TAGS),
    currentSession: vi.fn().mockResolvedValue(CURRENT_SESSION),
    sessionsOf: vi.fn().mockResolvedValue(SESSIONS),
    get: vi.fn().mockResolvedValue(entry()),
    versions: vi.fn().mockResolvedValue(VERSIONS),
    create: vi.fn().mockResolvedValue(entry({ id: 'e-new', type: 'note' })),
    patch: vi.fn().mockResolvedValue(entry({ version: 3 })),
    createEmotion: vi.fn(),
    linkTypes: vi.fn().mockResolvedValue(LINK_TYPES),
    railSource: vi.fn().mockResolvedValue({ situations: [], recent: CANDIDATES }),
    linksOf: vi.fn().mockResolvedValue(PLACED_LINKS),
    ...api,
  };
  const toast = { success: vi.fn(), warning: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      // L'éditeur de lien (features/graph) s'ouvre pour de vrai : ses requêtes restent en attente.
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: EntriesApi, useValue: mock },
      { provide: ToastService, useValue: toast },
      { provide: SessionStore, useValue: { me: signal({ id: 'u-claire' }) } },
      {
        provide: PreferencesStore,
        useValue: { defaultVisibility: signal('clinical'), medicationVisible: signal(true) },
      },
    ],
  });
  return { api: mock, toast };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await tick();
    TestBed.tick();
  }
}

function panel(): HTMLElement {
  const element = document.querySelector<HTMLElement>('pm-entry-editor-panel');
  if (!element) throw new Error('panneau absent');
  return element;
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function key(target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function fill(selector: string, value: string): void {
  const input = panel().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('EntryEditorPanel', () => {
  afterEach(async () => {
    TestBed.inject(SidePanelService).closeAll();
    await tick();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('création : titre, six types, séance courante présélectionnée, ⏎ enregistre et ferme', async () => {
    const { api, toast } = setup();
    const ref = TestBed.runInInjectionContext(() =>
      openEntryEditor('p-marie', { text: 'Dort mal' }),
    );
    await settle();
    expect(text(panel().querySelector('h2'))).toBe('Nouvelle entrée');
    expect(panel().querySelectorAll('pm-type-chips button')).toHaveLength(6);
    expect(panel().querySelector<HTMLTextAreaElement>('#field-body')!.value).toBe('Dort mal');
    const session = panel().querySelector<HTMLSelectElement>('#field-sessionId')!;
    expect(session.value).toBe('s-open');
    expect(text(session.options[0])).toContain('(en cours)');
    expect(panel().querySelector('.grace')).toBeNull();

    // Dans le texte multi-ligne, ⏎ écrit ; Ctrl+⏎ enregistre.
    const body = panel().querySelector('#field-body')!;
    expect(key(body, 'Enter').defaultPrevented).toBe(false);
    key(body, 'Enter', { ctrlKey: true });
    await settle();
    expect(api.create).toHaveBeenCalledWith('p-marie', {
      type: 'note',
      visibility: 'clinical',
      body: 'Dort mal',
      status: 'final',
      sessionId: 's-open',
    });
    expect(toast.success).toHaveBeenCalledWith('Entrée enregistrée.');
    await expect(ref!.closed).resolves.toMatchObject({ id: 'e-new' });
  });

  it('ressenti au clavier : → jusqu’à Ressenti, émotion, 8, texte, ⏎', async () => {
    const { api } = setup({
      create: vi.fn().mockResolvedValue(entry({ id: 'e-f', type: 'feeling' })),
    });
    TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
    await settle();
    const note = panel().querySelector<HTMLButtonElement>('pm-type-chips [data-type="note"]')!;
    key(note, 'ArrowRight');
    key(panel().querySelector('[data-type="event"]')!, 'ArrowRight');
    key(panel().querySelector('[data-type="situation"]')!, 'ArrowRight');
    await settle();
    const combo = panel().querySelector<HTMLInputElement>('#field-feeling-emotionCode')!;
    combo.value = 'anx';
    combo.dispatchEvent(new Event('input'));
    await settle();
    key(combo, 'Enter');
    await settle();
    key(panel().querySelector('[role="slider"]')!, '8');
    fill('#field-body', "n'a pas dormi");
    await settle();
    key(panel().querySelector('#field-body')!, 'Enter');
    await settle();
    const body = api.create!.mock.calls[0][1];
    expect(body).toMatchObject({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
    });
    expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId/);
  });

  it('maquette 05 état A : sous-titre, sections, curseur à 5, pied Enregistrer · Brouillon · Annuler', async () => {
    const { api } = setup({
      patientName: vi.fn().mockResolvedValue('Marie D.'),
      create: vi.fn().mockResolvedValue(entry({ id: 'e-f', type: 'feeling' })),
    });
    TestBed.runInInjectionContext(() =>
      openEntryEditor('p-marie', { type: 'feeling', text: "n'a pas dormi" }),
    );
    await settle();
    expect(api.patientName).toHaveBeenCalledWith('p-marie');
    expect(text(panel().querySelector('.subtitle'))).toBe(
      'Marie D. · préremplie depuis la barre de capture',
    );
    // Titres de section dans l'ordre de la maquette ; le champ principal porte le nom du type.
    expect([...panel().querySelectorAll('.section-title')].map((item) => text(item))).toEqual([
      'Type',
      'Ressenti',
      'Quand',
      'Séance',
      'Lié à…',
    ]);
    // Intensité réglée sur 5 à l'ouverture d'un ressenti ; la valeur à droite du libellé.
    const slider = panel().querySelector('[role="slider"]')!;
    expect(slider.getAttribute('aria-valuenow')).toBe('5');
    expect(slider.getAttribute('aria-valuemin')).toBe('1');
    expect(text(panel().querySelector('pm-intensity-slider .head #pm-entry-intensity-label'))).toBe(
      'Intensité',
    );
    expect(text(panel().querySelector('pm-intensity-slider .head .value'))).toBe('5/10');
    // « (facultatif) » hors du libellé : le nom accessible du champ reste « Texte ».
    expect(text(panel().querySelector('label[for="field-body"]'))).toBe('Texte');
    expect(text(panel().querySelector('.label-row .optional'))).toBe('(facultatif)');
    // Pied : Enregistrer, Brouillon, puis Annuler à droite ; rappel des touches dessous.
    const buttons = [...panel().querySelectorAll('.footer .actions button')].map((b) => text(b));
    expect(buttons).toEqual(['Enregistrer ⏎', 'BrouillonCtrl+S', 'AnnulerÉchap']);
    expect(text(panel().querySelector('.footer .keys'))).toContain('ferme en gardant le brouillon');

    const combo = panel().querySelector<HTMLInputElement>('#field-feeling-emotionCode')!;
    combo.value = 'anx';
    combo.dispatchEvent(new Event('input'));
    await settle();
    key(combo, 'Enter');
    await settle();
    panel().querySelector<HTMLButtonElement>('.footer .primary')!.click();
    await settle();
    expect(api.create!.mock.calls[0][1]).toMatchObject({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 5 },
    });
  });

  it('sous-titre : absent si le patient est illisible et la saisie ne vient pas de la barre', async () => {
    setup({ patientName: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }) });
    TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
    await settle();
    expect(panel().querySelector('.subtitle')).toBeNull();
    // Le reste du panneau n'en dépend pas.
    expect(panel().querySelectorAll('pm-type-chips button')).toHaveLength(6);
  });

  it('SESSION_REQUIRED : message sous le bloc Séance, saisie conservée, panneau ouvert', async () => {
    setup({
      currentSession: vi.fn().mockResolvedValue(null),
      sessionsOf: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockRejectedValue({
        status: 422,
        code: 'SESSION_REQUIRED',
        errors: [
          {
            field: 'sessionId',
            code: 'SESSION_REQUIRED',
            message: 'Toute entrée appartient à une séance',
          },
        ],
      }),
    });
    TestBed.runInInjectionContext(() => openEntryEditor('p-new', { text: 'Premier contact' }));
    await settle();
    expect(text(panel().querySelector('#field-sessionId option'))).toBe('Aucune séance');
    panel().querySelector<HTMLButtonElement>('.footer .primary')!.click();
    await settle();
    expect(text(panel().querySelector('#field-sessionId-error'))).toBe(
      'Toute entrée appartient à une séance',
    );
    expect(panel().querySelector('#field-sessionId')!.getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector<HTMLTextAreaElement>('#field-body')!.value).toBe(
      'Premier contact',
    );
    expect(document.activeElement?.id).toBe('field-sessionId');
  });

  it('erreur réseau : alerte du panneau, brouillon gardé', async () => {
    setup({ create: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }) });
    TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { text: 'x' }));
    await settle();
    key(panel(), 'Enter', { ctrlKey: true });
    await settle();
    expect(text(panel().querySelector('.alert[role="alert"]'))).toContain(
      'Votre saisie est conservée',
    );
  });

  it('Échap conserve le brouillon ; la réouverture le retrouve', async () => {
    setup();
    TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
    await settle();
    panel().querySelector<HTMLButtonElement>('[data-type="event"]')!.click();
    await settle();
    fill('#field-title', 'Entretien annuel');
    TestBed.inject(SidePanelService).closeTop();
    await settle();
    expect(document.querySelector('pm-entry-editor-panel')).toBeNull();
    expect(TestBed.inject(EntryEditorStore).active()).toBe(false);

    TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
    await settle();
    expect(panel().querySelector('[data-type="event"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(panel().querySelector<HTMLInputElement>('#field-title')!.value).toBe('Entretien annuel');
  });

  it('Ctrl+S : POST en brouillon', async () => {
    const { api } = setup();
    TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { text: 'à compléter' }));
    await settle();
    const event = key(panel().querySelector('#field-body')!, 's', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(api.create!.mock.calls[0][1]).toMatchObject({ status: 'draft' });
  });

  describe('correction', () => {
    it('chargement : squelette, puis erreur avec Réessayer', async () => {
      setup({ get: vi.fn(() => never()) });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-1' }));
      await settle();
      expect(panel().querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
      TestBed.inject(SidePanelService).closeAll();
      await settle();

      TestBed.resetTestingModule();
      const get = vi.fn().mockRejectedValue({ status: 404, code: 'ENTRY_NOT_FOUND' });
      setup({ get });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-x' }));
      await settle();
      expect(text(panel().querySelector('pm-state [role="alert"]'))).toContain(
        'Impossible de charger cette entrée',
      );
    });

    it('ressenti brouillon sans intensité : curseur « Non renseignée », aucune intensité inventée dans le PATCH', async () => {
      const draftFeeling = feelingEntry({
        status: 'draft',
        feeling: { emotionCode: 'anxiety', intensity: null },
      });
      const { api } = setup({
        get: vi.fn().mockResolvedValue(draftFeeling),
        versions: vi.fn().mockResolvedValue([VERSIONS[1]]),
        patch: vi.fn().mockResolvedValue({ ...draftFeeling, status: 'final' }),
      });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-feel' }));
      await settle();
      const slider = panel().querySelector('[role="slider"]')!;
      expect(slider.getAttribute('aria-valuetext')).toBe('Non renseignée');
      expect(text(panel().querySelector('pm-intensity-slider .value'))).toBe('Non renseignée');
      expect(panel().querySelector('pm-intensity-slider .thumb')).toBeNull();

      panel().querySelector<HTMLButtonElement>('.footer .primary')!.click();
      await settle();
      // Le brouillon devient définitif : un PATCH part, avec le statut seul.
      expect(api.patch).toHaveBeenCalledWith('e-feel', { status: 'final' });
      for (const [, body] of api.patch!.mock.calls) {
        expect(body).not.toHaveProperty('feeling');
        expect(JSON.stringify(body)).not.toContain('intensity');
      }
    });

    it('hors grâce : bandeau, type verrouillé, motif, « Enregistrer la version 3 », historique', async () => {
      const { api, toast } = setup({ get: vi.fn().mockResolvedValue(entry({ version: 2 })) });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-1' }));
      await settle();
      expect(text(panel().querySelector('h2'))).toBe("Modifier l'entrée · v2");
      expect(TestBed.inject(Router).url).toBe('/?entry=e-1');
      const grace = panel().querySelector('.grace[role="status"]')!;
      expect(text(grace)).toMatch(
        /^Modifiée il y a .+ · hors fenêtre de grâce \(1 h 15\) : cette correction créera la version 3\.$/,
      );
      expect(panel().closest('[role="dialog"]')?.getAttribute('aria-describedby')).toBe(grace.id);
      expect(panel().querySelector('[data-type="event"]')!.getAttribute('aria-disabled')).toBe(
        'true',
      );
      expect(panel().querySelector('#field-sessionId')).toBeNull();
      expect(text(panel().querySelector('.footer .primary'))).toBe('Enregistrer la version 3 ⏎');
      expect(text(panel().querySelector('.footer .link'))).toBe(
        'Version 2 · Historique (2 versions)',
      );

      fill('#field-body', 'Évaluation tendue, objectifs revus.');
      fill('#field-reason', 'Précision après la séance');
      key(panel().querySelector('#field-title')!, 'Enter');
      await settle();
      expect(api.patch).toHaveBeenCalledWith('e-1', {
        body: 'Évaluation tendue, objectifs revus.',
        reason: 'Précision après la séance',
      });
      expect(toast.success).toHaveBeenCalledWith('Correction enregistrée (version 3).');
      await settle();
      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('dans la grâce : bandeau « version 1 modifiée en place », pas de motif', async () => {
      const recent = new Date(Date.now() - 10 * 60_000).toISOString();
      setup({
        get: vi.fn().mockResolvedValue(entry({ recordedAt: recent })),
        versions: vi.fn().mockResolvedValue([{ ...VERSIONS[1], createdAt: recent }]),
      });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-1' }));
      await settle();
      expect(text(panel().querySelector('.grace'))).toContain(
        'dans la fenêtre de grâce (1 h 15) : la version 1 sera modifiée en place',
      );
      expect(panel().querySelector('#field-reason')).toBeNull();
      expect(panel().querySelector('.footer .link')).toBeNull();
      expect(text(panel().querySelector('.footer .primary'))).toBe('Enregistrer ⏎');
    });
  });
  describe('rail « Lié à… » (M2-05)', () => {
    const refused = {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        {
          field: 'links[0].linkType',
          code: 'LINK_TYPE_NOT_ALLOWED',
          message: 'Type de lien non permis pour ce couple.',
        },
      ],
    };

    async function feeling(): Promise<void> {
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { type: 'feeling' }));
      await settle();
      const combo = panel().querySelector<HTMLInputElement>('#field-feeling-emotionCode')!;
      combo.value = 'anx';
      combo.dispatchEvent(new Event('input'));
      await settle();
      key(combo, 'Enter');
      await settle();
      key(panel().querySelector('[role="slider"]')!, '8');
      await settle();
    }

    function railRow(name: string): HTMLElement {
      const row = Array.from(panel().querySelectorAll<HTMLElement>('pm-link-rail .row')).find(
        (item) => item.textContent?.includes(name),
      );
      if (!row) throw new Error(`cible absente : ${name}`);
      return row;
    }

    it('chargement : squelette dans le bloc Lié à…', async () => {
      setup({ railSource: vi.fn(() => never()) });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
      await settle();
      const rail = panel().querySelector('fieldset.rail')!;
      expect(text(rail.querySelector('legend'))).toBe('Lié à…');
      expect(rail.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
      expect(rail.querySelector('pm-link-rail')).toBeNull();
    });

    it('vide : aucune entrée récente à lier', async () => {
      setup({ railSource: vi.fn().mockResolvedValue({ situations: [], recent: [] }) });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
      await settle();
      expect(text(panel().querySelector('fieldset.rail pm-state'))).toContain(
        'Aucune entrée récente à lier',
      );
    });

    it('erreur : message et Réessayer, qui relit les cibles', async () => {
      const railSource = vi
        .fn()
        .mockRejectedValueOnce({ status: 503, code: 'SERVICE_UNAVAILABLE' })
        .mockResolvedValue({ situations: [], recent: CANDIDATES });
      setup({ railSource });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
      await settle();
      const state = panel().querySelector('fieldset.rail pm-state [role="alert"]')!;
      expect(text(state)).toContain('Impossible de proposer des entrées à lier');
      state.querySelector<HTMLButtonElement>('button')!.click();
      await settle();
      expect(panel().querySelectorAll('pm-link-rail .row')).toHaveLength(CANDIDATES.length);
    });

    it('cocher une cible : links[] dans le POST, type proposé par la matrice', async () => {
      const { api } = setup({
        create: vi.fn().mockResolvedValue(entry({ id: 'e-f', type: 'feeling' })),
      });
      await feeling();
      railRow('Entretien annuel').querySelector<HTMLInputElement>('input')!.click();
      await settle();
      panel().querySelector<HTMLButtonElement>('.footer .primary')!.click();
      await settle();
      const body = api.create!.mock.calls[0][1];
      expect(body).toMatchObject({
        type: 'feeling',
        links: [{ targetId: 'c-event', linkType: 'triggers', direction: 'incoming' }],
      });
      expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId/);
    });

    it('type de l’entrée changé : le lien coché suit la matrice', async () => {
      const { api } = setup();
      await feeling();
      railRow('Entretien annuel').querySelector<HTMLInputElement>('input')!.click();
      await settle();
      panel().querySelector<HTMLButtonElement>('[data-type="note"]')!.click();
      await settle();
      fill('#field-body', 'Note liée');
      await settle();
      panel().querySelector<HTMLButtonElement>('.footer .primary')!.click();
      await settle();
      expect(api.create!.mock.calls[0][1]).toMatchObject({
        type: 'note',
        links: [{ targetId: 'c-event', linkType: 'co_occurs', direction: 'outgoing' }],
      });
    });

    it('422 sur un lien : message sous le rail, saisie et case conservées, panneau ouvert', async () => {
      setup({ create: vi.fn().mockRejectedValue(refused) });
      await feeling();
      railRow('Entretien annuel').querySelector<HTMLInputElement>('input')!.click();
      await settle();
      panel().querySelector<HTMLButtonElement>('.footer .primary')!.click();
      await settle();
      const error = panel().querySelector('fieldset.rail .rail-error[role="alert"]')!;
      expect(text(error)).toBe(
        "Lien vers « Entretien annuel » refusé : ce type de lien n'est pas permis entre ces deux types d'entrée. L'entrée n'a pas été créée ; votre saisie est conservée.",
      );
      expect(document.activeElement).toBe(error);
      expect(panel().querySelector('.alert')).toBeNull();
      const box = railRow('Entretien annuel').querySelector<HTMLInputElement>('input')!;
      expect(box.checked).toBe(true);
      expect(box.getAttribute('aria-describedby')).toBe(error.id);
      expect(
        railRow('Entretien annuel').querySelector('select')!.getAttribute('aria-describedby'),
      ).toBe(error.id);
      expect(panel().querySelector<HTMLInputElement>('#field-feeling-emotionCode')!.value).toBe(
        'Anxiété',
      );
      expect(document.querySelector('pm-entry-editor-panel')).not.toBeNull();

      // Toucher au rail efface le message.
      box.click();
      await settle();
      expect(panel().querySelector('.rail-error')).toBeNull();
    });

    it('Échap puis réouverture : lien coché et type choisi intacts, cibles relues', async () => {
      const { api } = setup();
      await feeling();
      const select = railRow('Entretien annuel').querySelector<HTMLSelectElement>('select')!;
      const index = Array.from(select.options).findIndex((o) => text(o) === 'est causé par');
      select.value = String(index);
      select.dispatchEvent(new Event('change'));
      await settle();
      TestBed.inject(SidePanelService).closeTop();
      await settle();
      expect(document.querySelector('pm-entry-editor-panel')).toBeNull();

      TestBed.runInInjectionContext(() => openEntryEditor('p-marie'));
      await settle();
      expect(api.railSource).toHaveBeenCalledTimes(2);
      const row = railRow('Entretien annuel');
      expect(row.querySelector<HTMLInputElement>('input')!.checked).toBe(true);
      expect(text(row.querySelector<HTMLSelectElement>('select')!.selectedOptions[0])).toBe(
        'est causé par',
      );
      panel().querySelector<HTMLButtonElement>('.footer .primary')!.click();
      await settle();
      expect(api.create!.mock.calls[0][1]).toMatchObject({
        links: [{ targetId: 'c-event', linkType: 'caused_by', direction: 'outgoing' }],
      });
    });

    it('vide aussi quand aucune cible n’admet de type pour l’entrée en cours', async () => {
      setup({
        railSource: vi.fn().mockResolvedValue({
          situations: [],
          recent: [{ ...CANDIDATES[1], id: 'c-session', type: 'session', title: null }],
        }),
      });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { type: 'medication' }));
      await settle();
      expect(text(panel().querySelector('fieldset.rail pm-state'))).toContain(
        'Aucune entrée récente à lier',
      );
    });

    it('séance : pas de rail (aucun lien à la création d’une séance)', async () => {
      setup();
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { type: 'session' }));
      await settle();
      expect(panel().querySelector('fieldset.rail')).toBeNull();
    });

    it('correction : liens posés en lecture, « Lier ou modifier » ouvre l’éditeur de lien, pas de rail', async () => {
      const { api } = setup();
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-1' }));
      await settle();
      expect(panel().querySelector('fieldset.rail')).toBeNull();
      const links = panel().querySelector('section.links')!;
      expect(text(links.querySelector('h3'))).toBe('Lié à… · 1');
      expect(text(links.querySelector('li'))).toBe('Entretien annuel déclenche Anxiété 8/10');
      links.querySelector<HTMLButtonElement>('button.link-editor')!.click();
      await settle();
      expect(document.querySelector('pm-link-editor-panel')).not.toBeNull();
      expect(TestBed.inject(Router).url).toContain('link=e-1');
      expect(api.create).not.toHaveBeenCalled();
    });

    it('correction : liens illisibles → erreur avec Réessayer ; aucun lien → état vide', async () => {
      setup({ linksOf: vi.fn().mockRejectedValue({ status: 503, code: 'SERVICE_UNAVAILABLE' }) });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-1' }));
      await settle();
      expect(text(panel().querySelector('section.links pm-state [role="alert"]'))).toContain(
        'Impossible de charger les liens de cette entrée',
      );
      TestBed.inject(SidePanelService).closeAll();
      await settle();

      TestBed.resetTestingModule();
      setup({ linksOf: vi.fn().mockResolvedValue([]) });
      TestBed.runInInjectionContext(() => openEntryEditor('p-marie', { entryId: 'e-2' }));
      await settle();
      expect(text(panel().querySelector('section.links pm-state'))).toContain(
        'Aucun lien pour le moment',
      );
    });
  });
});
