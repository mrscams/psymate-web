import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { StateKind } from '../../util';
import {
  PatientHeaderComponent,
  PatientHeaderInfo,
  PatientSessionInfo,
  UNCLOSED_SESSION_AFTER_MIN,
} from './patient-header.component';

@Component({
  selector: 'pm-patient-host',
  imports: [PatientHeaderComponent],
  template: `
    <pm-patient-header
      [patient]="patient()"
      [session]="session()"
      [state]="state()"
      [busy]="busy()"
      [showViewToggle]="showViewToggle()"
      [unclosedAfterMin]="unclosedAfterMin()"
    >
      <div pmCapture class="capture-slot">Noter quelque chose…</div>
      <div pmViewToggle class="toggle-slot">Vue</div>
    </pm-patient-header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly patient = input<PatientHeaderInfo | null>(null);
  readonly session = input<PatientSessionInfo | null>(null);
  readonly state = input<StateKind | null>(null);
  readonly busy = input(false);
  readonly showViewToggle = input(false);
  readonly unclosedAfterMin = input<number | null>(null);
}

const marie: PatientHeaderInfo = {
  id: 'p1',
  displayName: 'Marie D.',
  birthDate: '1992-05-10',
  followedSince: '2025-03-04T00:00:00Z',
  flags: [{ code: 'watch', label: 'à surveiller' }],
};

const plainText = (node: Element | null | undefined) =>
  node?.textContent?.replace(/[  ]/g, ' ').trim();

async function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  const fixture = TestBed.createComponent(Host);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PatientHeaderComponent', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('loading : squelette ; error : bloc erreur avec Réessayer', async () => {
    const { el, fixture } = await render({ state: 'loading' });
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('h1')).toBeNull();

    fixture.componentRef.setInput('state', 'error');
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Impossible de charger ce dossier',
    );
    expect(el.querySelector('button.retry')).not.toBeNull();
  });

  it('nom, âge, suivi depuis, drapeaux ambre, dernière séance, Démarrer, onglets 1 2 3', async () => {
    vi.setSystemTime(new Date('2026-10-24T14:18:00Z'));
    const { el } = await render({ patient: marie, session: { kind: 'last', date: '2026-10-17' } });
    expect(el.querySelector('h1.name')?.textContent).toContain('Marie D.');
    expect(el.querySelector('h1 .reported-slot')).not.toBeNull();
    expect(el.querySelector('.meta')?.textContent).toContain('34 ans');
    expect(el.querySelector('.meta')?.textContent).toContain('suivi·e depuis mars 2025');
    expect(el.querySelector('.flags')?.getAttribute('aria-label')).toBe('Drapeaux');
    expect(el.querySelector('.flag')?.textContent).toBe('à surveiller');
    expect(el.querySelector('.session-text')?.textContent).toBe('Dernière séance : 17 oct. 2026');
    expect(el.querySelector('button.start-session')).not.toBeNull();
    expect(el.querySelector('button.close-session')).toBeNull();

    const tabs = [...el.querySelectorAll<HTMLAnchorElement>('nav.tabs a')].map((a) => [
      a.getAttribute('href'),
      a.querySelector('kbd')?.textContent,
      a.querySelector('span')?.textContent,
    ]);
    expect(tabs).toEqual([
      ['/patients/p1', '1', "Vue d'ensemble"],
      ['/patients/p1/timeline', '2', 'Timeline'],
      ['/patients/p1/graph', '3', 'Graphe'],
    ]);
    expect(el.querySelector('.capture-slot')).not.toBeNull();
    expect(el.querySelector('.toggle-slot')).toBeNull();
  });

  it('séance en cours : « en cours depuis », Clôturer, boutons inactifs pendant une action', async () => {
    vi.setSystemTime(new Date('2026-10-24T14:18:00Z'));
    const { el, fixture } = await render({
      patient: marie,
      session: { kind: 'current', startedAt: '2026-10-24T14:00:00Z' },
      showViewToggle: true,
    });
    const text = el.querySelector('.session-text');
    expect(text?.classList.contains('current')).toBe(true);
    expect(text?.textContent?.replace(/[  ]/g, ' ')).toBe(
      'Séance du 24 oct. 2026 · en cours depuis 18 min',
    );
    const close = el.querySelector<HTMLButtonElement>('button.close-session');
    expect(close).not.toBeNull();
    expect(el.querySelector('.toggle-slot')).not.toBeNull();

    const closed = vi.fn();
    el.querySelector('pm-patient-header')?.addEventListener('closeSession', closed);
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(close?.disabled).toBe(true);
  });

  it('UX-A8 : seuil de 3 h posé : « en cours depuis » jusqu’à 3 h, « non clôturée » au-delà', async () => {
    const session = { kind: 'current', startedAt: '2026-10-24T14:00:00Z' };
    const unclosedAfterMin = UNCLOSED_SESSION_AFTER_MIN;
    expect(unclosedAfterMin).toBe(180);

    vi.setSystemTime(new Date('2026-10-24T17:00:00Z'));
    const atThree = await render({ patient: marie, session, unclosedAfterMin });
    expect(plainText(atThree.el.querySelector('.session-text'))).toContain(
      'Séance du 24 oct. 2026 · en cours depuis 3',
    );
    TestBed.resetTestingModule();

    // 12 h 37 après le début : la séance reste ouverte (aucune règle recalculée), seul le libellé change.
    vi.setSystemTime(new Date('2026-10-25T02:37:00Z'));
    const { el } = await render({ patient: marie, session, unclosedAfterMin });
    expect(plainText(el.querySelector('.session-text'))).toBe(
      'Séance du 24 oct. 2026 · non clôturée',
    );
    expect(el.querySelector('.session-text')?.classList.contains('current')).toBe(true);
    expect(el.querySelector('button.close-session')).not.toBeNull();
  });

  it('UX-A8 : sans seuil (défaut), « en cours depuis 12 h 37 » comme avant', async () => {
    vi.setSystemTime(new Date('2026-10-25T02:37:00Z'));
    const { el } = await render({
      patient: marie,
      session: { kind: 'current', startedAt: '2026-10-24T14:00:00Z' },
    });
    const shown = plainText(el.querySelector('.session-text'));
    expect(shown).toContain('en cours depuis 12');
    expect(shown).not.toContain('non clôturée');
  });

  it('les touches 1 2 3 naviguent entre les onglets ; aria-current suit la route', async () => {
    const { el, fixture } = await render({ patient: marie });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }),
    );
    expect(navigate).toHaveBeenCalledWith(['/patients', 'p1', 'timeline']);
    await fixture.whenStable();
    expect(el.querySelector('nav.tabs a[aria-current="page"]')?.getAttribute('href')).toBe(
      '/patients/p1/timeline',
    );

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }),
    );
    expect(navigate).toHaveBeenCalledWith(['/patients', 'p1']);

    fixture.componentRef.setInput('patient', null);
    fixture.componentRef.setInput('state', 'loading');
    await fixture.whenStable();
    navigate.mockClear();
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
