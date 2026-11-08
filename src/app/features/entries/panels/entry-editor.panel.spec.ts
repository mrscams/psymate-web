import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { PreferencesStore } from '../../../core/preferences';
import { SidePanelService, ToastService } from '../../../shared/ui';
import { EntriesApi } from '../data/entries.api';
import { EntryEditorStore } from '../data/entry-editor.store';
import { CURRENT_SESSION, EMOTIONS, entry, SESSIONS, TAGS, VERSIONS } from '../data/entry.fixtures';
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
    ...api,
  };
  const toast = { success: vi.fn(), warning: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
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
});
