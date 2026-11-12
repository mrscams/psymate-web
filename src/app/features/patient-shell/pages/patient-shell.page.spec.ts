import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  reflectComponentType,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Route, Router, Routes, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { CaptureBlockComponent } from '../../capture';
import { PatientShellApi } from '../data/patient-shell.api';
import {
  closedSession,
  intakeSession,
  notedEntry,
  openSession,
  reminders,
  shellPatient,
} from '../data/patient-shell.fixtures';
import { PatientShellStore } from '../data/patient-shell.store';
import { CAPTURE_FOCUS_STATE } from '../patient-shell.params';
import { PATIENT_SHELL_ROUTES } from '../patient-shell.routes';
import { PatientShellPage } from './patient-shell.page';

/**
 * Onglet 1 factice : la spec du shell ne dépend pas du DOM ni des requêtes de la vue d'ensemble
 * (features/overview, testée dans sa feature). Son compteur montre la mémoire des onglets
 * (rememberTab / recallTab, B2).
 */
@Component({
  selector: 'pm-fake-overview-tab',
  template: `<h2>Vue d'ensemble</h2>
    <button type="button" class="counter" (click)="increment()">Compteur : {{ count() }}</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FakeOverviewTab implements OnInit {
  private readonly store = inject(PatientShellStore);
  protected readonly count = signal(0);

  ngOnInit(): void {
    this.count.set(this.store.recallTab<{ count: number }>('overview')?.count ?? 0);
  }

  protected increment(): void {
    this.count.update((n) => n + 1);
    this.store.rememberTab('overview', { count: this.count() });
  }
}

/** Les routes du shell, l'onglet 1 (route '') remplacé par l'onglet factice, data.tab gardé. */
function routesWithFakeOverview(): Routes {
  const [shell] = PATIENT_SHELL_ROUTES;
  const children = (shell.children ?? []).map((child): Route => {
    if (child.path !== '' || child.redirectTo) return child;
    return { ...child, loadComponent: undefined, component: FakeOverviewTab };
  });
  return [{ ...shell, children }];
}

type Api = Pick<
  PatientShellApi,
  | 'patient'
  | 'current'
  | 'start'
  | 'close'
  | 'contact'
  | 'hasEntries'
  | 'firstSessionMonth'
  | 'sessionEntries'
  | 'linkSentence'
  | 'previousSession'
  | 'reminders'
  | 'emotionLabels'
>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

async function render(api: Partial<Api> = {}, url = '/patients/p-marie', durationMin = 60) {
  const mock: Api = {
    patient: api.patient ?? vi.fn().mockResolvedValue(shellPatient()),
    current: api.current ?? vi.fn().mockResolvedValue(closedSession()),
    start: api.start ?? vi.fn().mockResolvedValue(openSession()),
    close: api.close ?? vi.fn().mockResolvedValue(closedSession({ id: 's-open' })),
    contact: api.contact ?? vi.fn(),
    hasEntries: api.hasEntries ?? vi.fn().mockResolvedValue(true),
    firstSessionMonth: api.firstSessionMonth ?? vi.fn().mockResolvedValue('2025-03'),
    // Onglet Séance (UX-S3).
    sessionEntries: api.sessionEntries ?? vi.fn().mockResolvedValue([notedEntry()]),
    linkSentence: api.linkSentence ?? vi.fn().mockResolvedValue(null),
    previousSession: api.previousSession ?? vi.fn().mockResolvedValue(null),
    reminders: api.reminders ?? vi.fn().mockResolvedValue(reminders()),
    emotionLabels: api.emotionLabels ?? vi.fn().mockResolvedValue({}),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'patients', children: [] },
          { path: 'patients/:id', children: routesWithFakeOverview() },
        ],
        withComponentInputBinding(),
      ),
      { provide: PatientShellApi, useValue: mock },
      {
        provide: PreferencesStore,
        useValue: {
          defaultDurationMin: signal(durationMin),
          defaultVisibility: signal('clinical'),
          medicationVisible: signal(true),
          // Bascule « Vue » de la vue d'ensemble (M4-05), posée dans l'en-tête.
          overviewView: signal('complete'),
          set: vi.fn().mockResolvedValue(null),
        },
      },
      // L'éditeur d'entrée (features/entries) lit l'API par HttpClient : requêtes en attente ici.
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  await settle(harness);
  return { harness, el: harness.fixture.nativeElement as HTMLElement, api: mock };
}

function counter(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>('pm-fake-overview-tab .counter');
}

/** Le PatientShellStore fourni par la page du shell. */
function shellStore(harness: RouterTestingHarness): PatientShellStore {
  return harness.fixture.debugElement
    .query(By.directive(PatientShellPage))
    .injector.get(PatientShellStore);
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  await tick();
  await harness.fixture.whenStable();
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function dialog(): HTMLElement {
  const box = document.querySelector<HTMLElement>('pm-close-session-panel');
  if (!box) throw new Error('aucun panneau de clôture');
  return box;
}

/** Le bouton Clôturer de la barre de séance (UX-S3 : celui de l'en-tête est masqué en séance). */
function closeButton(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>('pm-session-bar button');
  if (!button) throw new Error('aucun bouton Clôturer dans la barre de séance');
  return button;
}

describe('PatientShellPage', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('chargement : squelette de l’en-tête, pas encore d’onglet', async () => {
    const { el } = await render({ patient: vi.fn(() => never<ReturnType<typeof shellPatient>>()) });
    expect(el.querySelector('pm-patient-header [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('pm-fake-overview-tab')).toBeNull();
  });

  it('chargé : nom, drapeau, dernière séance, barre de capture, onglet 1 avec la bascule Vue', async () => {
    const { el, api } = await render();
    expect(api.patient).toHaveBeenCalledWith('p-marie');
    expect(text(el.querySelector('h1.name'))).toBe('Marie D.');
    expect(text(el.querySelector('.flag'))).toBe('À surveiller');
    expect(text(el.querySelector('.session-text'))).toBe('Dernière séance : 17 oct. 2026');
    expect(el.querySelector('button.start-session')).not.toBeNull();
    expect(el.querySelector('pm-capture-block textarea')?.getAttribute('placeholder')).toBe(
      "Qu'est-ce qui s'est passé ?",
    );
    expect(text(el.querySelector('pm-fake-overview-tab h2'))).toBe("Vue d'ensemble");
    expect(el.querySelector('.view-toggle pm-overview-view-toggle [role="group"]')).not.toBeNull();
  });

  it('« suivi·e depuis » : la fiche quand aucune séance ne la précède (UX-G2c)', async () => {
    const { el, api } = await render();
    expect(api.firstSessionMonth).toHaveBeenCalledWith('p-marie');
    expect(text(el.querySelector('.meta'))).toBe('34 ans·suivi·e depuis mars 2025');
  });

  it('« suivi·e depuis » retiré quand des séances le précèdent (dossier créé après coup)', async () => {
    const { el } = await render({
      patient: vi.fn().mockResolvedValue(shellPatient({ followedSince: '2026-11-07' })),
      firstSessionMonth: vi.fn().mockResolvedValue('2023-11'),
    });
    expect(text(el.querySelector('.meta'))).toBe('34 ans');
    expect(text(el.querySelector('pm-patient-header'))).not.toContain('suivi·e depuis');
  });

  it('séance d’accueil seule : ni « en cours » ni « dernière séance »', async () => {
    const { el } = await render({ current: vi.fn().mockResolvedValue(intakeSession()) });
    expect(el.querySelector('.session-text')).toBeNull();
    expect(el.querySelector('button.start-session')).not.toBeNull();
  });

  it('erreur 5xx : erreur de l’en-tête avec Réessayer, qui relit le dossier', async () => {
    const patient = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(shellPatient());
    const { el, harness } = await render({ patient });
    expect(text(el.querySelector('[role="alert"]'))).toContain('Impossible de charger ce dossier');
    el.querySelector<HTMLButtonElement>('pm-patient-header button.retry')?.click();
    await settle(harness);
    expect(patient).toHaveBeenCalledTimes(2);
    expect(text(el.querySelector('h1.name'))).toBe('Marie D.');
  });

  it.each([
    [
      '403 PATIENT_FORBIDDEN',
      { status: 403, code: 'PATIENT_FORBIDDEN' },
      "Ce dossier n'est pas le vôtre",
    ],
    [
      '404 PATIENT_NOT_FOUND',
      { status: 404, code: 'PATIENT_NOT_FOUND' },
      "Ce dossier n'existe pas",
    ],
  ])(
    '%s : état erreur du shell, sans en-tête, sans Réessayer ni redirection',
    async (_l, problem, title) => {
      const { el } = await render({
        patient: vi.fn().mockRejectedValue(problem),
        current: vi.fn().mockRejectedValue(problem),
      });
      expect(text(el.querySelector('.shell-error [role="alert"] .title'))).toBe(title);
      expect(el.querySelector('pm-patient-header')).toBeNull();
      expect(el.querySelector('button.retry')).toBeNull();
      expect(el.querySelector('a.back')?.getAttribute('href')).toBe('/patients');
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
    },
  );

  it('Démarrer : l’en-tête passe « en cours » sans recharger le dossier', async () => {
    // Horloge figée 12 min après le début de la séance renvoyée (24 oct. 2026, 14:00 Z) : au-delà
    // de 3 h, l'en-tête dirait « non clôturée ». Seule la date est simulée, pas les minuteries.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T14:12:00Z'));
    try {
      const { el, harness, api } = await render();
      el.querySelector<HTMLButtonElement>('button.start-session')?.click();
      await settle(harness);
      expect(api.start).toHaveBeenCalledWith('p-marie', 'in_person');
      expect(api.patient).toHaveBeenCalledTimes(1);
      expect(el.querySelector('.session-text')?.classList.contains('current')).toBe(true);
      expect(text(el.querySelector('.session-text'))).toMatch(/en cours depuis 12 min$/);
      // UX-S3 : la barre de séance porte Clôturer ; l'onglet Séance remplace la vue d'ensemble.
      expect(text(closeButton(el))).toBe('Clôturer la séance');
      expect(el.querySelector('pm-patient-header')?.classList.contains('in-session')).toBe(true);
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie/session');
      await settle(harness);
      expect(el.querySelector('pm-session-tab-page')).not.toBeNull();
      expect(counter(el)).toBeNull();
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(el.querySelector('pm-capture-block textarea')),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('séance ouverte depuis plus de 3 h : « non clôturée », Clôturer reste proposé', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T17:01:00Z'));
    try {
      const { el } = await render({ current: vi.fn().mockResolvedValue(openSession()) });
      const line = text(el.querySelector('.session-text'));
      expect(line).toMatch(/non clôturée$/);
      expect(line).not.toContain('en cours depuis');
      // La barre grise (UX-S3) : Clôturer maintenant et Reprendre.
      expect(el.querySelector('pm-session-bar .unclosed')).not.toBeNull();
      expect(text(closeButton(el))).toBe('Clôturer maintenant');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Clôturer : panneau de 520 px, durée écoulée arrondie à 5 min, POST close, toast « Modifier », retour à la vue d’ensemble', async () => {
    // 48 min après le début de la séance renvoyée (24 oct. 2026, 14:00 Z) : la durée proposée est
    // 50 (écoulé arrondi à 5 min), la préférence (45) à un clic.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T14:48:00Z'));
    try {
      const { el, harness, api } = await render(
        {
          current: vi.fn().mockResolvedValue(openSession()),
          close: vi.fn().mockResolvedValue(closedSession({ id: 's-open', durationMin: 50 })),
        },
        '/patients/p-marie',
        45,
      );
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie/session');
      closeButton(el).click();
      await settle(harness);
      const box = dialog();
      expect(box.closest<HTMLElement>('.pm-side-panel-pane')?.style.width).toBe('520px');
      const duration = box.querySelector<HTMLInputElement>('#field-durationMin');
      expect(duration?.value).toBe('50');
      expect(text(box)).toContain('45 habituels');
      const summary = box.querySelector<HTMLTextAreaElement>('#field-summary');
      summary!.value = 'Point sur le sommeil';
      summary!.dispatchEvent(new Event('input'));
      const confirm = [...box.querySelectorAll('button')].find(
        (b) => text(b) === 'Clôturer la séance',
      );
      confirm!.click();
      await settle(harness);
      await vi.waitFor(() => expect(document.querySelector('pm-close-session-panel')).toBeNull());
      expect(api.close).toHaveBeenCalledWith('s-open', {
        durationMin: 50,
        summary: 'Point sur le sommeil',
      });
      await settle(harness);
      expect(text(el.querySelector('.session-text'))).toBe('Dernière séance : 17 oct. 2026');
      expect(el.querySelector('button.start-session')).not.toBeNull();
      expect(el.querySelector('pm-session-bar')).toBeNull();
      // Retour de l'onglet Séance à la vue d'ensemble (04b, état 6).
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
      const toasts = TestBed.inject(ToastService).toasts();
      expect(toasts.at(-1)?.message).toBe('Séance clôturée · 50 min · compte rendu enregistré');
      expect(toasts.at(-1)?.action?.label).toBe('Modifier');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Clôturer et revenir à la liste : POST close puis /patients', async () => {
    const { el, harness, api } = await render({
      current: vi.fn().mockResolvedValue(openSession()),
    });
    closeButton(el).click();
    await settle(harness);
    const box = dialog();
    [...box.querySelectorAll('button')]
      .find((b) => text(b) === 'Clôturer et revenir à la liste')!
      .click();
    await settle(harness);
    await vi.waitFor(() => expect(document.querySelector('pm-close-session-panel')).toBeNull());
    expect(api.close).toHaveBeenCalledTimes(1);
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/patients');
  });

  it('Clôturer, 409 : le panneau se ferme, avis, l’en-tête relu, retour à la vue d’ensemble', async () => {
    const current = vi
      .fn()
      .mockResolvedValueOnce(openSession())
      .mockResolvedValue(closedSession({ id: 's-open' }));
    const { el, harness } = await render({
      current,
      close: vi.fn().mockRejectedValue({ status: 409, code: 'SESSION_ALREADY_CLOSED' }),
    });
    closeButton(el).click();
    await settle(harness);
    [...dialog().querySelectorAll('button')].find((b) => text(b) === 'Clôturer la séance')!.click();
    await settle(harness);
    await vi.waitFor(() => expect(document.querySelector('pm-close-session-panel')).toBeNull());
    await settle(harness);
    expect(current).toHaveBeenCalledTimes(2);
    expect(text(el.querySelector('.session-text'))).toContain('Dernière séance');
    expect(TestBed.inject(ToastService).toasts().at(-1)?.level).toBe('warning');
    expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
  });

  it('Clôturer, 422 : message du serveur sous la durée, le dialogue reste ouvert', async () => {
    const close = vi.fn().mockRejectedValue({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'durationMin', code: 'OUT_OF_RANGE', message: 'Durée refusée.' }],
    });
    const { el, harness } = await render({
      current: vi.fn().mockResolvedValue(openSession()),
      close,
    });
    closeButton(el).click();
    await settle(harness);
    [...dialog().querySelectorAll('button')].find((b) => text(b) === 'Clôturer la séance')!.click();
    await settle(harness);
    await vi.waitFor(() =>
      expect(text(dialog().querySelector('#field-durationMin-error'))).toBe('Durée refusée.'),
    );
    expect(document.activeElement?.id).toBe('field-durationMin');
  });

  it('Clôturer : une durée hors 1..600 est refusée sans appel', async () => {
    const { el, harness, api } = await render({
      current: vi.fn().mockResolvedValue(openSession()),
    });
    closeButton(el).click();
    await settle(harness);
    const duration = dialog().querySelector<HTMLInputElement>('#field-durationMin')!;
    duration.value = '0';
    duration.dispatchEvent(new Event('input'));
    [...dialog().querySelectorAll('button')].find((b) => text(b) === 'Clôturer la séance')!.click();
    await settle(harness);
    expect(text(dialog().querySelector('#field-durationMin-error'))).toBe(
      'Une durée entière entre 1 et 600 minutes.',
    );
    expect(api.close).not.toHaveBeenCalled();
  });

  it('changer d’onglet et revenir conserve l’état (compteur rangé par rememberTab)', async () => {
    // Onglet 1 factice (la vue d'ensemble réelle est testée dans features/overview) ; le Graphe
    // est la page de M2-06 (sa propre mémoire est testée dans sa feature).
    const { el, harness, api } = await render();
    counter(el)?.click();
    counter(el)?.click();
    await settle(harness);
    expect(text(counter(el))).toBe('Compteur : 2');

    await harness.navigateByUrl('/patients/p-marie/graph');
    await settle(harness);
    expect(el.querySelector('pm-graph-page')).not.toBeNull();
    expect(counter(el)).toBeNull();
    expect(el.querySelector('.view-toggle')).toBeNull();

    await harness.navigateByUrl('/patients/p-marie');
    await settle(harness);
    expect(text(counter(el))).toBe('Compteur : 2');
    expect(api.patient).toHaveBeenCalledTimes(1);
  });

  it('onglet 1 : la route vide charge la vue d’ensemble (features/overview) à la demande, data.tab gardé', async () => {
    const route = PATIENT_SHELL_ROUTES[0].children!.find((r) => r.path === '' && !r.redirectTo)!;
    expect(route.data).toEqual({ tab: 'overview' });
    expect(route.component).toBeUndefined();
    const component = await (
      route.loadComponent as () => Promise<Parameters<typeof reflectComponentType>[0]>
    )();
    expect(reflectComponentType(component)?.selector).toBe('pm-overview-page');
  });

  it('éditeur de lien fermé (?link= retiré de l’URL) : écriture notée, les projections se relisent', async () => {
    const { harness } = await render();
    const store = shellStore(harness);
    const before = store.revision();
    // ?link= puis son retrait : ce que fait features/graph à l'ouverture et à la fermeture.
    await harness.navigateByUrl('/patients/p-marie?link=e-1');
    await settle(harness);
    expect(store.revision()).toBe(before);
    await harness.navigateByUrl('/patients/p-marie');
    await settle(harness);
    expect(store.revision()).toBe(before + 1);
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('touches 1 2 3 : changent d’onglet, pas quand la barre de capture a le focus', async () => {
    const { el, harness } = await render();
    const router = TestBed.inject(Router);
    const press = (target: EventTarget, key: string) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    press(document.body, '3');
    await settle(harness);
    expect(router.url).toBe('/patients/p-marie/graph');

    const capture = el.querySelector<HTMLTextAreaElement>('pm-capture-block textarea')!;
    capture.focus();
    press(capture, '2');
    await settle(harness);
    expect(router.url).toBe('/patients/p-marie/graph');

    capture.blur();
    press(document.body, '1');
    await settle(harness);
    expect(router.url).toBe('/patients/p-marie');
  });

  it('arrivée depuis la création (état CAPTURE_FOCUS_STATE) : la barre de capture prend le focus', async () => {
    const { el, harness } = await render({}, '/patients');
    await TestBed.inject(Router).navigate(['/patients', 'p-marie', 'overview'], {
      state: { [CAPTURE_FOCUS_STATE]: true },
    });
    await settle(harness);
    await settle(harness);
    const capture = el.querySelector<HTMLTextAreaElement>('pm-capture-block textarea');
    expect(capture).not.toBeNull();
    expect(document.activeElement).toBe(capture);
  });

  it('arrivée ordinaire (lien, historique) : le focus n’est pas déplacé', async () => {
    const { el } = await render();
    expect(document.activeElement).not.toBe(el.querySelector('pm-capture-block textarea'));
  });

  it('/patients/:id/overview renvoie sur l’onglet 1, /patients/:id', async () => {
    await render({}, '/patients/p-marie/overview');
    expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
  });

  it('un autre dossier : relu, mémoire des onglets vidée', async () => {
    const patient = vi
      .fn()
      .mockResolvedValueOnce(shellPatient())
      .mockResolvedValueOnce(shellPatient({ id: 'p-omar', displayName: 'Omar B.', flags: [] }));
    const { el, harness } = await render({ patient });
    counter(el)?.click();
    await harness.navigateByUrl('/patients/p-omar');
    await settle(harness);
    expect(text(el.querySelector('h1.name'))).toBe('Omar B.');
    expect(text(counter(el))).toBe('Compteur : 0');
  });

  describe('éditeur d’entrée (M1-08)', () => {
    const editor = () => document.querySelector<HTMLElement>('pm-entry-editor-panel');

    afterEach(() => TestBed.inject(HttpTestingController).match(() => true));

    it('bouton + et touche N : ouvrent l’éditeur, une seule fois', async () => {
      const { harness, el } = await render();
      el.querySelector<HTMLButtonElement>('button.new-entry')!.click();
      await settle(harness);
      expect(editor()?.querySelector('h2')?.textContent).toContain('Nouvelle entrée');
      document.querySelector<HTMLButtonElement>('pm-side-panel button.close')!.click();
      await settle(harness);
      expect(editor()).toBeNull();

      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }),
      );
      await settle(harness);
      expect(editor()).not.toBeNull();
      // Panneau ouvert : N ne rouvre rien.
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }),
      );
      await settle(harness);
      expect(document.querySelectorAll('pm-entry-editor-panel')).toHaveLength(1);
    });

    it('dossier neuf sans entrée (M7-03) : indice « Dernière étape », Nouvelle entrée N ouvre l’éditeur', async () => {
      const { harness, el, api } = await render({
        current: vi.fn().mockResolvedValue(intakeSession()),
        hasEntries: vi.fn().mockResolvedValue(false),
      });
      await settle(harness);
      const hint = el.querySelector<HTMLElement>('.first-entry[role="status"]');
      expect(text(hint)).toContain('Dernière étape : notez la première entrée.');
      // Rien n'affirme que l'accueil existe déjà (il est créé en différé par l'API).
      expect(text(hint)).not.toContain('a été créée');
      const action = hint?.querySelector('button');
      expect(text(action?.querySelector('span'))).toBe('Nouvelle entrée');
      expect(action?.getAttribute('aria-keyshortcuts')).toBe('N');
      // L'accueil arrive en différé : la séance courante est relue avant d'ouvrir l'éditeur.
      const reads = vi.mocked(api.current).mock.calls.length;
      hint!.querySelector<HTMLButtonElement>('button')!.click();
      await settle(harness);
      await settle(harness);
      expect(vi.mocked(api.current).mock.calls.length).toBeGreaterThan(reads);
      expect(editor()).not.toBeNull();
      expect(api.hasEntries).toHaveBeenCalledWith('p-marie');
    });

    it('dossier avec une entrée, ou déjà suivi : pas d’indice', async () => {
      const { harness, el } = await render({
        current: vi.fn().mockResolvedValue(intakeSession()),
        hasEntries: vi.fn().mockResolvedValue(true),
      });
      await settle(harness);
      expect(el.querySelector('.first-entry')).toBeNull();
    });

    it('Ctrl+Entrée dans la barre de commande : l’éditeur reprend la saisie interprétée', async () => {
      const { harness, el } = await render();
      const input = el.querySelector<HTMLTextAreaElement>('#pm-capture-input')!;
      input.value = "n'a pas dormi";
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
      );
      await settle(harness);
      expect(editor()?.querySelector<HTMLTextAreaElement>('#field-body')?.value).toBe(
        "n'a pas dormi",
      );
      await settle(harness);
      expect(input.value).toBe('');
    });

    it('Entrée sur une barre vide : l’éditeur vide', async () => {
      const { harness, el } = await render();
      const input = el.querySelector<HTMLTextAreaElement>('#pm-capture-input')!;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(harness);
      expect(editor()?.querySelector('h2')?.textContent).toContain('Nouvelle entrée');
    });

    it('entrée créée par la barre de commande : les projections se relisent', async () => {
      const { harness } = await render();
      const store = shellStore(harness);
      const before = store.revision();
      const bar = harness.fixture.debugElement.query(By.directive(CaptureBlockComponent))
        .componentInstance as CaptureBlockComponent;
      bar.saved.emit({ id: 'e-new', type: 'feeling', status: 'final', sessionId: 's-1' });
      expect(store.revision()).toBe(before + 1);
    });

    it('?entry=<id> : ouvre la correction de l’entrée', async () => {
      const { harness } = await render({}, '/patients/p-marie?entry=e-1');
      await settle(harness);
      expect(editor()?.querySelector('h2')?.textContent).toContain('Modifier l');
      TestBed.inject(HttpTestingController).expectOne((r) => r.url.endsWith('/api/entries/e-1'));
    });
  });
});
