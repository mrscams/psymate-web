import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { PatientShellApi } from '../data/patient-shell.api';
import {
  closedSession,
  notedEntry,
  openSession,
  previousSession,
  reminders,
  shellPatient,
} from '../data/patient-shell.fixtures';
import { NotedEntry, PreviousSession, SessionReminders } from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import { HIGHLIGHT_MS, SessionTabPage } from './session-tab.page';

// Onglet Séance (UX-S3, propositions 04 et 04b états 2 et 3) : carnet vide, liste notée ; trois
// états par bloc ; ligne surlignée 2 s ; « Noter » prépare le bloc de saisie. La colonne latérale
// (contexte) est posée par la page du shell : pm-session-context, testé à part.

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Options {
  session?: ReturnType<typeof openSession> | null;
  entries?: NotedEntry[] | Error;
  previous?: PreviousSession | null;
  reminders?: SessionReminders | Error;
  links?: Record<string, string>;
}

async function render(options: Options = {}) {
  const session = options.session === undefined ? openSession() : options.session;
  const api = {
    patient: vi.fn().mockResolvedValue(shellPatient()),
    current: vi.fn().mockResolvedValue(session),
    firstSessionMonth: vi.fn().mockResolvedValue('2025-03'),
    hasEntries: vi.fn().mockResolvedValue(true),
    sessionEntries:
      options.entries instanceof Error
        ? vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' })
        : vi.fn().mockResolvedValue(options.entries ?? []),
    linkSentence: vi.fn((id: string) =>
      Promise.resolve(options.links?.[id] ? { sentence: options.links[id], count: 1 } : null),
    ),
    previousSession: vi
      .fn()
      .mockResolvedValue(options.previous === undefined ? previousSession() : options.previous),
    reminders:
      options.reminders instanceof Error
        ? vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' })
        : vi.fn().mockResolvedValue(options.reminders ?? reminders()),
    emotionLabels: vi.fn().mockResolvedValue({ anxiety: 'Anxiété' }),
  };
  TestBed.configureTestingModule({
    providers: [
      PatientShellStore,
      provideRouter([{ path: 'patients/:id', children: [] }]),
      { provide: PatientShellApi, useValue: api },
      { provide: PreferencesStore, useValue: { defaultDurationMin: signal(50) } },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const store = TestBed.inject(PatientShellStore);
  await store.load('p-marie');
  await tick();
  const fixture = TestBed.createComponent(SessionTabPage);
  await fixture.whenStable();
  await tick();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    store,
    api,
    settle: async () => {
      await tick();
      await fixture.whenStable();
    },
  };
}

/** Éléments qui séparent visuellement leur texte de celui d'à côté. */
const SEPARATED = 'p, li, div, h2, h3, label, span, button, strong, pm-state';

/** Texte lu d'un élément, un espace entre deux éléments séparés, espaces normalisés. */
function text(el: Element | null | undefined): string {
  if (!el) return '';
  const copy = el.cloneNode(true) as Element;
  for (const node of copy.querySelectorAll(SEPARATED)) {
    node.before(' ');
    node.after(' ');
  }
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => text(b).startsWith(name));
  if (!found) throw new Error(`bouton introuvable : ${name}`);
  return found;
}

describe('SessionTabPage', () => {
  it('carnet vide (état 2) : « Prévu la dernière fois » coché localement, « Depuis la séance du … »', async () => {
    const { el, store, settle } = await render();
    expect(el.querySelector('.empty-pad')).not.toBeNull();
    const planned = [...el.querySelectorAll('.empty-pad .checklist li')].map((li) =>
      text(li.querySelector('label')),
    );
    expect(planned).toEqual(['Relire l’agenda du sommeil', 'Demander si le certificat a été fait']);
    expect(text(el.querySelector('.empty-pad'))).toContain('Depuis la séance du 17 oct.');
    expect(text(el.querySelector('.empty-pad .items'))).toBe('Ressenti · 20 oct.');
    // Pas de colonne ici : elle est à la page du shell (pm-session-context).
    expect(el.querySelector('aside')).toBeNull();

    // Cocher n'enregistre rien : rangé dans la mémoire de l'onglet.
    const box = el.querySelector<HTMLInputElement>('.checklist input')!;
    box.click();
    await settle();
    expect(el.querySelector('.checklist li')?.classList.contains('done')).toBe(true);
    expect(store.recallTab('session')).toEqual({
      sessionId: 's-open',
      ticked: ['Relire l’agenda du sommeil'],
    });
  });

  it('« Noter » : demande au bloc de saisie « <point> : » (pas d’écriture)', async () => {
    const { el, store } = await render();
    button(el.querySelector('.checklist')!, 'Noter').click();
    expect(store.prefillRequest()).toEqual({ text: 'Relire l’agenda du sommeil : ', seq: 1 });
  });

  it('liste notée (état 3) : icône, titre de repli, échelle du ressenti, phrase de lien, heure en mono, « modifier » pendant la grâce', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T14:30:00Z'));
    try {
      const entries = [
        notedEntry({
          id: 'f-1',
          type: 'feeling',
          emotionCode: 'anxiety',
          intensity: 7,
          recordedAt: '2026-10-24T14:20:00Z',
          linkCount: 1,
        }),
        notedEntry({ id: 'n-1', recordedAt: '2026-10-24T14:12:00Z' }),
        notedEntry({
          id: 'old',
          type: 'situation',
          title: 'Réorganisation du service',
          ongoing: true,
          recordedAt: '2026-10-24T13:00:00Z',
        }),
      ];
      const { el, settle } = await render({
        entries,
        links: { 'f-1': 'Anxiété déclenchée par Réorganisation du service' },
      });
      await settle();
      expect(el.querySelector('.empty-pad')).toBeNull();
      expect(text(el.querySelector('.sect-head'))).toBe(
        'Noté pendant cette séance 3 entrées · la plus récente en haut',
      );
      const rows = [...el.querySelectorAll('pm-noted-entries .entry')];
      expect(rows).toHaveLength(3);
      expect(text(rows[0].querySelector('.name'))).toBe('Anxiété');
      expect(rows[0].querySelectorAll('.scale i.on')).toHaveLength(7);
      expect(text(rows[0].querySelector('.text'))).toBe(
        'Anxiété déclenchée par Réorganisation du service',
      );
      expect(rows[0].querySelector('pm-entry-icon')).not.toBeNull();
      expect(text(rows[0].querySelector('.time'))).toMatch(/^\d{2}:\d{2}$/);
      expect(text(rows[0].querySelector('.edit'))).toContain('modifier');
      expect(text(rows[1].querySelector('.name'))).toMatch(/^Note · 24 oct\./);
      expect(text(rows[2].querySelector('.name'))).toBe('Réorganisation du service');
      expect(text(rows[2].querySelector('.chip'))).toBe('en cours');
      // 90 min après l'enregistrement : « corriger ».
      expect(text(rows[2].querySelector('.edit'))).toContain('corriger');
    } finally {
      vi.useRealTimers();
    }
  });

  it('« modifier » ouvre l’éditeur sur l’entrée (?entry=<id>)', async () => {
    const { el, settle } = await render({ entries: [notedEntry({ id: 'n-1' })] });
    await settle();
    el.querySelector<HTMLButtonElement>('pm-noted-entries .edit')!.click();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/?entry=n-1');
  });

  it('entrée créée depuis le bloc : sa ligne est surlignée 2 s, puis oubliée', async () => {
    const { el, store, fixture, api } = await render({ entries: [notedEntry({ id: 'n-1' })] });
    await tick();
    await fixture.whenStable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      api.sessionEntries.mockResolvedValue([notedEntry({ id: 'n-2' }), notedEntry({ id: 'n-1' })]);
      store.noteWrite('n-2');
      await vi.advanceTimersByTimeAsync(0);
      await fixture.whenStable();
      const fresh = el.querySelector('pm-noted-entries .entry.fresh');
      expect(text(fresh?.querySelector('.name'))).toMatch(/^Note/);
      expect(el.querySelectorAll('pm-noted-entries .entry')).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(HIGHLIGHT_MS);
      await fixture.whenStable();
      expect(el.querySelector('pm-noted-entries .entry.fresh')).toBeNull();
      expect(store.lastWrittenId()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lecture en échec : état erreur du bloc, « Réessayer » relit', async () => {
    const { el, api, settle } = await render({ entries: new Error('500') });
    await settle();
    const error = el.querySelector('.noted pm-state[kind="error"], .noted [role="alert"]');
    expect(text(error)).toContain('Impossible de lire ce qui a été noté');
    api.sessionEntries.mockResolvedValue([notedEntry()]);
    button(el.querySelector('.noted')!, 'Réessayer').click();
    await settle();
    await settle();
    expect(el.querySelectorAll('pm-noted-entries .entry')).toHaveLength(1);
  });

  it('contexte en échec : le carnet vide sans ses listes (ni case ni point), pas en erreur lui-même', async () => {
    const { el, settle } = await render({ reminders: new Error('500') });
    await settle();
    expect(el.querySelector('.empty-pad')).not.toBeNull();
    expect(el.querySelector('.empty-pad .checklist')).toBeNull();
    expect(text(el.querySelector('.empty-pad'))).toContain(
      'Rien de prévu dans le dernier compte rendu.',
    );
    expect(text(el.querySelector('.empty-pad'))).toContain('Rien de noté entre les séances.');
  });

  it('sans séance précédente ni rappels : le carnet vide le dit', async () => {
    const { el } = await render({
      previous: null,
      reminders: reminders({
        flags: [],
        medications: [],
        situations: [],
        since: { lastSessionAt: null, entries: [] },
      }),
    });
    expect(text(el.querySelector('.empty-pad'))).toContain(
      'Rien de prévu dans le dernier compte rendu.',
    );
    expect(text(el.querySelector('.empty-pad'))).toContain('Rien de noté entre les séances.');
  });

  it('sans séance ouverte : retour à la vue d’ensemble', async () => {
    await render({ session: closedSession() });
    await tick();
    expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
  });
});
