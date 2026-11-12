import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { SidePanelService } from '../../../shared/ui';
import { PatientShellApi } from '../data/patient-shell.api';
import {
  closedSession,
  notedEntry,
  openSession,
  shellPatient,
} from '../data/patient-shell.fixtures';
import { NotedEntry } from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import {
  CloseSessionPanel,
  CloseSessionPanelData,
  CloseSessionResult,
} from './close-session.panel';

// Panneau de clôture (UX-S3, propositions 04 « part 2 » et 04b état 5) : durée écoulée arrondie,
// entrées notées sous les yeux, invites, « Prochaine fois », deux fins, Échap garde le brouillon,
// 409 et 422.

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const START = '2026-10-24T14:00:00Z';

interface Options {
  minutes?: number;
  entries?: NotedEntry[] | Error;
  close?: ReturnType<typeof vi.fn>;
  planned?: number;
  prefs?: number;
}

async function setup(options: Options = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.parse(START) + (options.minutes ?? 48) * 60_000));
  const api = {
    patient: vi
      .fn()
      .mockResolvedValue(shellPatient({ plannedDurationMin: options.planned ?? null })),
    current: vi.fn().mockResolvedValue(openSession({ startedAt: START })),
    firstSessionMonth: vi.fn().mockResolvedValue(null),
    hasEntries: vi.fn().mockResolvedValue(true),
    sessionEntries:
      options.entries instanceof Error
        ? vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' })
        : vi.fn().mockResolvedValue(options.entries ?? [notedEntry()]),
    linkSentence: vi.fn().mockResolvedValue(null),
    previousSession: vi.fn().mockResolvedValue(null),
    reminders: vi.fn(),
    emotionLabels: vi.fn().mockResolvedValue({}),
    close:
      options.close ?? vi.fn().mockResolvedValue(closedSession({ id: 's-open', durationMin: 50 })),
  };
  TestBed.configureTestingModule({
    providers: [
      PatientShellStore,
      { provide: PatientShellApi, useValue: api },
      { provide: PreferencesStore, useValue: { defaultDurationMin: signal(options.prefs ?? 60) } },
    ],
  });
  const store = TestBed.inject(PatientShellStore);
  await store.load('p-marie');
  await tick();
  const panels = TestBed.inject(SidePanelService);
  const open = () => {
    const ref = panels.open<CloseSessionPanel, CloseSessionPanelData, CloseSessionResult>(
      CloseSessionPanel,
      { data: { store, unclosedAfterMin: 180 }, width: 520 },
    );
    return ref!;
  };
  return { store, api, panels, open };
}

function panel(): HTMLElement {
  const el = document.querySelector<HTMLElement>('pm-close-session-panel');
  if (!el) throw new Error('aucun panneau de clôture');
  return el;
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function button(name: string): HTMLButtonElement {
  const found = [...panel().querySelectorAll('button')].find((b) => text(b) === name);
  if (!found) throw new Error(`bouton introuvable : ${name}`);
  return found;
}

function input(id: string): HTMLInputElement | HTMLTextAreaElement {
  const found = panel().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (!found) throw new Error(`champ introuvable : ${id}`);
  return found;
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const escape = () =>
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
  );

describe('CloseSessionPanel', () => {
  afterEach(async () => {
    TestBed.inject(SidePanelService).closeAll();
    await tick();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    vi.useRealTimers();
  });

  it('titre, sous-titre, durée écoulée arrondie à 5 min, « N habituels », entrées notées, pied à deux boutons et Échap', async () => {
    const { open } = await setup({ minutes: 48, prefs: 60 });
    open();
    await tick();
    await tick();
    const box = panel();
    expect(text(box.querySelector('h2'))).toBe('Clôturer la séance');
    expect(text(box.querySelector('.subtitle'))).toMatch(
      /^Marie D\. · samedi 24 octobre · cabinet · \d{2}:\d{2} → \d{2}:\d{2}$/,
    );
    expect((input('field-durationMin') as HTMLInputElement).value).toBe('50');
    expect(text(box)).toContain('écoulé, arrondi à 5 min');
    expect(text(button('60 habituels'))).toBe('60 habituels');
    expect(text(box.querySelector('.noted'))).toMatch(/^Note · 24 oct\./);
    expect(text(box)).toContain('Noté en séance 1 entrée');
    const footer = box.querySelector('.footer')!;
    expect([...footer.querySelectorAll('button')].map((b) => text(b))).toEqual([
      'Clôturer la séance',
      'Clôturer et revenir à la liste',
      'Annuler',
    ]);
    expect(text(footer.querySelector('.hints'))).toBe('Échap garde le brouillon');
    // Le focus initial sur la durée (premier champ) est vérifié en e2e : jsdom n'a pas de géométrie.
  });

  it('« N habituels » met la durée prévue du dossier ; absent quand elle est déjà proposée', async () => {
    const { open } = await setup({ minutes: 48, planned: 45 });
    open();
    await tick();
    button('45 habituels').click();
    expect((input('field-durationMin') as HTMLInputElement).value).toBe('45');
  });

  it('passé 3 h : la durée prévue plutôt que l’écoulé, l’aide le dit', async () => {
    const { open } = await setup({ minutes: 200, planned: 50 });
    open();
    await tick();
    expect((input('field-durationMin') as HTMLInputElement).value).toBe('50');
    expect(text(panel())).toContain('durée prévue (séance ouverte depuis plus de 3 h)');
    expect(panel().querySelectorAll('.duration-row .ghost')).toHaveLength(0);
  });

  it('entrées notées : trois états (chargement, erreur avec Réessayer, vide)', async () => {
    const failing = await setup({ entries: new Error('500') });
    failing.open();
    await tick();
    expect(text(panel().querySelector('.noted'))).toContain('Impossible de lire ce qui a été noté');
    failing.api.sessionEntries.mockResolvedValue([]);
    button('Réessayer').click();
    await tick();
    await tick();
    expect(text(panel().querySelector('.noted'))).toBe("Rien n'a été noté pendant cette séance.");
  });

  it('invites : « + Thème » et « + Objectif » insèrent un titre sur un nouveau paragraphe, rien de plus', async () => {
    const { open } = await setup();
    open();
    await tick();
    const summary = input('field-summary') as HTMLTextAreaElement;
    button('+ Thème').click();
    expect(summary.value).toBe('Thème : ');
    type(summary, 'Thème : le sommeil.');
    button('+ Objectif').click();
    expect(summary.value).toBe('Thème : le sommeil.\n\nObjectif : ');
    expect(document.activeElement).toBe(summary);
  });

  it('Clôturer la séance : POST avec la durée saisie et le compte rendu suivi des lignes « Prochaine fois »', async () => {
    const { open, api } = await setup();
    const ref = open();
    await tick();
    type(input('field-durationMin'), '55');
    type(input('field-summary'), 'Thème : le sommeil.');
    const add = input('next-time-new') as HTMLInputElement;
    type(add, 'Relire la demande');
    await tick();
    add.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await tick();
    expect(add.value).toBe('');
    type(input('next-time-0'), 'Relire la demande écrite');
    type(input('next-time-new'), 'Agenda (s. 3 et 4)');
    button('Clôturer la séance').click();
    await tick();
    await tick();
    expect(api.close).toHaveBeenCalledWith('s-open', {
      durationMin: 55,
      summary:
        'Thème : le sommeil.\n\nProchaine fois :\n– Relire la demande écrite\n– Agenda (s. 3 et 4)',
    });
    await expect(ref.closed).resolves.toBe('closed');
  });

  it('Clôturer et revenir à la liste : même POST, résultat closed-list ; une ligne retirée ne part pas', async () => {
    const { open, api } = await setup();
    const ref = open();
    await tick();
    type(input('next-time-new'), 'a');
    await tick();
    input('next-time-new').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await tick();
    panel().querySelector<HTMLButtonElement>('.lines .remove')!.click();
    await tick();
    button('Clôturer et revenir à la liste').click();
    await tick();
    await tick();
    expect(api.close).toHaveBeenCalledWith('s-open', { durationMin: 50, summary: undefined });
    await expect(ref.closed).resolves.toBe('closed-list');
  });

  it('Échap garde le brouillon (durée, texte, lignes) ; le panneau rouvert le retrouve ; la clôture l’efface', async () => {
    const { open, store } = await setup();
    const first = open();
    await tick();
    type(input('field-durationMin'), '40');
    type(input('field-summary'), 'Brouillon');
    type(input('next-time-new'), 'Point en cours');
    escape();
    await expect(first.closed).resolves.toBeUndefined();
    await tick();
    expect(store.closeDraft()).toEqual({
      sessionId: 's-open',
      durationMin: '40',
      summary: 'Brouillon',
      nextTime: ['Point en cours'],
    });

    open();
    await tick();
    expect((input('field-durationMin') as HTMLInputElement).value).toBe('40');
    expect((input('field-summary') as HTMLTextAreaElement).value).toBe('Brouillon');
    expect((input('next-time-0') as HTMLInputElement).value).toBe('Point en cours');
    button('Clôturer la séance').click();
    await tick();
    await tick();
    expect(store.closeDraft()).toBeNull();
  });

  it('fermé sans rien toucher : aucun brouillon', async () => {
    const { open, store } = await setup();
    const ref = open();
    await tick();
    button('Annuler').click();
    await expect(ref.closed).resolves.toBeUndefined();
    await tick();
    expect(store.closeDraft()).toBeNull();
  });

  it('409 SESSION_ALREADY_CLOSED : le panneau se ferme avec conflict (l’en-tête est relu par le store)', async () => {
    const { open } = await setup({
      close: vi.fn().mockRejectedValue({ status: 409, code: 'SESSION_ALREADY_CLOSED' }),
    });
    const ref = open();
    await tick();
    button('Clôturer la séance').click();
    await tick();
    await tick();
    await expect(ref.closed).resolves.toBe('conflict');
  });

  it('422 : message du serveur sous la durée, focus dessus, le panneau reste ; durée hors bornes refusée sans appel', async () => {
    const close = vi.fn().mockRejectedValue({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'durationMin', code: 'OUT_OF_RANGE', message: 'Durée refusée.' }],
    });
    const { open } = await setup({ close });
    open();
    await tick();
    button('Clôturer la séance').click();
    await tick();
    await tick();
    expect(text(panel().querySelector('#field-durationMin-error'))).toBe('Durée refusée.');
    expect(document.activeElement?.id).toBe('field-durationMin');
    expect(document.querySelector('pm-close-session-panel')).not.toBeNull();

    type(input('field-durationMin'), '0');
    button('Clôturer la séance').click();
    await tick();
    expect(text(panel().querySelector('#field-durationMin-error'))).toBe(
      'Une durée entière entre 1 et 600 minutes.',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('5xx : message général en tête du panneau', async () => {
    const { open } = await setup({
      close: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR', detail: 'Panne.' }),
    });
    open();
    await tick();
    button('Clôturer la séance').click();
    await tick();
    await tick();
    expect(text(panel().querySelector('.general-error'))).toBe('Panne.');
  });
});
