import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { PatientShellApi } from '../data/patient-shell.api';
import {
  openSession,
  previousSession,
  reminders,
  shellPatient,
} from '../data/patient-shell.fixtures';
import { PreviousSession, SessionReminders } from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import { SessionContextComponent } from './session-context.component';

// Colonne de contexte en séance (UX-S3, 04b états 2 et 3), posée par la page du shell : trois états,
// « Prévu la dernière fois » (ou la séance précédente quand le carnet vide la montre déjà), « À
// garder en tête », « Raccourcis dans le texte » ; cocher est local, « Noter » prépare le bloc.

@Component({
  selector: 'pm-context-host',
  imports: [SessionContextComponent],
  template: `<pm-session-context [padEmpty]="padEmpty()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly padEmpty = input(false);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Options {
  padEmpty?: boolean;
  previous?: PreviousSession | null;
  reminders?: SessionReminders | Error;
}

async function render(options: Options = {}) {
  const api = {
    patient: vi.fn().mockResolvedValue(shellPatient()),
    current: vi.fn().mockResolvedValue(openSession()),
    firstSessionMonth: vi.fn().mockResolvedValue('2025-03'),
    hasEntries: vi.fn().mockResolvedValue(true),
    sessionEntries: vi.fn().mockResolvedValue([]),
    linkSentence: vi.fn().mockResolvedValue(null),
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
    imports: [Host],
    providers: [
      PatientShellStore,
      provideRouter([]),
      { provide: PatientShellApi, useValue: api },
      { provide: PreferencesStore, useValue: { defaultDurationMin: signal(50) } },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const store = TestBed.inject(PatientShellStore);
  await store.load('p-marie');
  await tick();
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput('padEmpty', options.padEmpty ?? false);
  const settle = async () => {
    await tick();
    await fixture.whenStable();
  };
  await settle();
  await settle();
  return { fixture, el: fixture.nativeElement as HTMLElement, store, api, settle };
}

/** Texte lu, un espace entre deux éléments, espaces normalisés. */
function text(el: Element | null | undefined): string {
  if (!el) return '';
  const copy = el.cloneNode(true) as Element;
  for (const node of copy.querySelectorAll('p, li, div, h3, label, span, button, strong, b')) {
    node.before(' ');
    node.after(' ');
  }
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function headings(el: HTMLElement): string[] {
  return [...el.querySelectorAll('h3')].map((h) => text(h));
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => text(b).startsWith(name));
  if (!found) throw new Error(`bouton introuvable : ${name}`);
  return found;
}

describe('SessionContextComponent', () => {
  it('état 3 (quelque chose de noté) : « Prévu la dernière fois » à cocher, « À garder en tête », raccourcis en dernier', async () => {
    const { el, store, settle } = await render();
    expect(headings(el)).toEqual([
      'Prévu la dernière fois',
      'À garder en tête',
      'Raccourcis dans le texte',
    ]);
    const lines = [...el.querySelectorAll('.checklist li')].map((li) =>
      text(li.querySelector('label')),
    );
    expect(lines).toEqual(['Relire l’agenda du sommeil', 'Demander si le certificat a été fait']);
    expect(el.querySelector('.summary')).toBeNull();
    expect(text(el)).toContain('À surveiller sommeil très dégradé');
    expect(text(el)).toContain('Mélatonine 2 mg le soir');
    expect(text(el)).toContain('Réorganisation du service de nuit · en cours');
    const plain = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect([...el.querySelectorAll('.shortcut')].map(plain)).toEqual([
      'anx 7 ressenti',
      '/evt événement',
      '/sit situation',
      '/med médicament',
      '/note',
      'hier, 12 mars, il y a 3 j dates',
      '> cible lien',
    ]);

    // Cocher n'enregistre rien : rangé dans la mémoire de l'onglet.
    el.querySelector<HTMLInputElement>('.checklist input')!.click();
    await settle();
    expect(el.querySelector('.checklist li')?.classList.contains('done')).toBe(true);
    expect(store.recallTab('session')).toEqual({
      sessionId: 's-open',
      ticked: ['Relire l’agenda du sommeil'],
    });

    // « Noter » : demande au bloc de saisie « <point> : » (pas d'écriture).
    button(el.querySelector('.checklist')!, 'Noter').click();
    expect(store.prefillRequest()).toEqual({ text: 'Relire l’agenda du sommeil : ', seq: 1 });
  });

  it('état 2 (carnet vide, la liste est dans le carnet) : la séance précédente et son compte rendu sans les lignes « Prochaine fois »', async () => {
    const { el, fixture, settle } = await render({ padEmpty: true });
    expect(headings(el)).toEqual([
      'Séance précédente · 17 oct.',
      'À garder en tête',
      'Raccourcis dans le texte',
    ]);
    expect(text(el.querySelector('.summary'))).toBe(
      'Reprise du thème du sommeil ; refus du passage de jour.',
    );
    expect(text(el)).not.toContain('Relire l’agenda');
    expect(el.querySelector('.checklist')).toBeNull();

    // Première note : le carnet disparaît, la colonne reprend la liste.
    fixture.componentRef.setInput('padEmpty', false);
    await settle();
    expect(headings(el)[0]).toBe('Prévu la dernière fois');
    expect(el.querySelector('.summary')).toBeNull();
  });

  it('contexte en échec : état erreur avec « Réessayer », qui relit', async () => {
    const { el, api, settle } = await render({ reminders: new Error('500') });
    expect(text(el)).toContain('Impossible de lire le contexte de la séance');
    expect(el.querySelector('.checklist')).toBeNull();
    api.reminders.mockResolvedValue(reminders());
    button(el, 'Réessayer').click();
    await settle();
    await settle();
    expect(text(el)).toContain('À garder en tête');
  });

  it('sans séance précédente ni rappels : seuls les raccourcis', async () => {
    const { el } = await render({
      padEmpty: true,
      previous: null,
      reminders: reminders({
        flags: [],
        medications: [],
        situations: [],
        since: { lastSessionAt: null, entries: [] },
      }),
    });
    expect(headings(el)).toEqual(['Raccourcis dans le texte']);
  });
});
