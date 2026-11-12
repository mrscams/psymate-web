import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
    >
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
}

const marie: PatientHeaderInfo = {
  id: 'p1',
  displayName: 'Marie D.',
  birthDate: '1992-05-10',
  followedSince: '2025-03-04T00:00:00Z',
  flags: [{ code: 'watch', label: 'à surveiller' }],
};

const plainText = (node: Element | null | undefined) =>
  node?.textContent?.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

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

function tabLabels(el: HTMLElement): (string | undefined)[][] {
  return [...el.querySelectorAll<HTMLAnchorElement>('nav.tabs a')].map((a) => [
    a.getAttribute('href') ?? undefined,
    a.querySelector('kbd')?.textContent ?? undefined,
    a.querySelector('span')?.textContent ?? undefined,
  ]);
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

  it('hors séance : nom, âge, suivi (mois abrégé), drapeau ambre, dernière séance avec modalité et durée, Démarrer, onglets 1 2 3', async () => {
    vi.setSystemTime(new Date('2026-10-24T14:18:00Z'));
    const { el } = await render({
      patient: marie,
      session: { kind: 'last', date: '2026-10-17', modality: 'video', durationMin: 50 },
    });
    expect(el.querySelector('h1.name')?.textContent).toContain('Marie D.');
    expect(el.querySelector('h1 .reported-slot')).not.toBeNull();
    // Ligne d'identité unique (04b .phead-row) : qui, puis la séance à droite.
    const row = el.querySelector('.phead-row');
    expect(row?.querySelector('.who h1.name')).not.toBeNull();
    expect(plainText(row?.querySelector('.meta'))).toBe('34 ans·suivi·e depuis mars 2025');
    expect(el.querySelector('.flags')?.getAttribute('aria-label')).toBe('Drapeaux');
    expect(el.querySelector('.flag')?.textContent).toBe('à surveiller');
    expect(plainText(row?.querySelector('.right .session-text'))).toBe(
      'Dernière séance : 17 oct. 2026 · visio · 50 min',
    );
    expect(row?.querySelector('button.start-session')).not.toBeNull();
    expect(el.querySelector('button.close-session')).toBeNull();
    expect(el.querySelector('.patient-header')?.classList.contains('in-session')).toBe(false);

    expect(tabLabels(el)).toEqual([
      ['/patients/p1', '1', "Vue d'ensemble"],
      ['/patients/p1/timeline', '2', 'Timeline'],
      ['/patients/p1/graph', '3', 'Graphe'],
    ]);
    expect(el.querySelector('.toggle-slot')).toBeNull();
  });

  it('« suivi·e depuis » abrège le mois (sept. 2026) ; sans modalité ni durée, la dernière séance se limite à la date', async () => {
    vi.setSystemTime(new Date('2026-10-24T14:18:00Z'));
    const { el } = await render({
      patient: { ...marie, followedSince: '2026-09-02', birthDate: null, flags: [] },
      session: { kind: 'last', date: '2026-10-17' },
    });
    expect(plainText(el.querySelector('.meta'))).toBe('suivi·e depuis sept. 2026');
    expect(el.querySelector('.flags')).toBeNull();
    expect(plainText(el.querySelector('.session-text'))).toBe('Dernière séance : 17 oct. 2026');
  });

  it('sans aucune séance : Démarrer seul à droite, pas de texte de séance', async () => {
    const { el } = await render({ patient: marie, session: { kind: 'none' } });
    expect(el.querySelector('.session-text')).toBeNull();
    expect(el.querySelector('button.start-session')).not.toBeNull();
  });

  it('séance en cours : onglet 1 « Séance » vers l’onglet Séance, « Vue d’ensemble » à droite des onglets, rien à droite de l’identité (ni Démarrer ni Clôturer : ils sont dans la barre), bascule Vue au bout', async () => {
    vi.setSystemTime(new Date('2026-10-24T14:18:00Z'));
    const { el, fixture } = await render({
      patient: marie,
      session: { kind: 'current', startedAt: '2026-10-24T14:00:00Z', modality: 'in_person' },
      showViewToggle: true,
    });
    expect(el.querySelector('.patient-header')?.classList.contains('in-session')).toBe(true);
    expect(el.querySelector('.right')).toBeNull();
    expect(el.querySelector('.session-text')).toBeNull();
    expect(el.querySelector('button.start-session')).toBeNull();
    expect(el.querySelector('button.close-session')).toBeNull();
    // UX-S3 (04b, question 1) : l'onglet 1 mène à /patients/:id/session ; la vue d'ensemble reste
    // à un clic, à droite des onglets, sans touche.
    expect(tabLabels(el)).toEqual([
      ['/patients/p1/session', '1', 'Séance'],
      ['/patients/p1/timeline', '2', 'Timeline'],
      ['/patients/p1/graph', '3', 'Graphe'],
      ['/patients/p1', undefined, "Vue d'ensemble"],
    ]);
    expect(el.querySelector('nav.tabs a.overview-link')).not.toBeNull();
    expect(el.querySelector('.tabs-row .view-toggle .toggle-slot')).not.toBeNull();

    // Touche 1 en séance : l'onglet Séance.
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }),
    );
    expect(navigate).toHaveBeenCalledWith(['/patients', 'p1', 'session']);

    // Séance clôturée : l'onglet 1 redevient « Vue d'ensemble », le lien disparaît, Démarrer revient.
    fixture.componentRef.setInput('session', { kind: 'last', date: '2026-10-24' });
    await fixture.whenStable();
    expect(tabLabels(el)).toHaveLength(3);
    expect(tabLabels(el)[0]).toEqual(['/patients/p1', '1', "Vue d'ensemble"]);
    expect(el.querySelector('button.start-session')).not.toBeNull();
  });

  it('Démarrer : émet startSession, inactif pendant une action', async () => {
    const { el, fixture } = await render({ patient: marie, session: { kind: 'none' } });
    const started = vi.fn();
    const header = fixture.debugElement.query(By.directive(PatientHeaderComponent))
      .componentInstance as PatientHeaderComponent;
    header.startSession.subscribe(started);
    const start = el.querySelector<HTMLButtonElement>('button.start-session')!;
    start.click();
    expect(started).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(start.disabled).toBe(true);
  });

  it('UNCLOSED_SESSION_AFTER_MIN vaut 180 (seuil passé à pm-session-bar)', () => {
    expect(UNCLOSED_SESSION_AFTER_MIN).toBe(180);
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
