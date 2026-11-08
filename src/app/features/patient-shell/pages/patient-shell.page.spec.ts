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
import { PatientShellApi } from '../data/patient-shell.api';
import {
  closedSession,
  intakeSession,
  openSession,
  shellPatient,
} from '../data/patient-shell.fixtures';
import { PatientShellStore } from '../data/patient-shell.store';
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

type Api = Pick<PatientShellApi, 'patient' | 'current' | 'start' | 'close' | 'contact'>;

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
  const box = document.querySelector<HTMLElement>('pm-close-session-dialog');
  if (!box) throw new Error('aucun dialogue de clôture');
  return box;
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
    expect(el.querySelector('pm-capture-bar input')?.getAttribute('placeholder')).toBe(
      'Noter quelque chose…',
    );
    expect(text(el.querySelector('pm-fake-overview-tab h2'))).toBe("Vue d'ensemble");
    expect(el.querySelector('.view-toggle pm-overview-view-toggle [role="group"]')).not.toBeNull();
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
    const { el, harness, api } = await render();
    el.querySelector<HTMLButtonElement>('button.start-session')?.click();
    await settle(harness);
    expect(api.start).toHaveBeenCalledWith('p-marie', 'in_person');
    expect(api.patient).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.session-text')?.classList.contains('current')).toBe(true);
    expect(text(el.querySelector('.session-text'))).toContain('en cours depuis');
    expect(el.querySelector('button.close-session')).not.toBeNull();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(el.querySelector('pm-capture-bar input')),
    );
  });

  it('Clôturer : dialogue avec la durée des préférences, POST close, « Dernière séance »', async () => {
    const { el, harness, api } = await render(
      { current: vi.fn().mockResolvedValue(openSession()) },
      '/patients/p-marie',
      45,
    );
    el.querySelector<HTMLButtonElement>('button.close-session')?.click();
    await settle(harness);
    const box = dialog();
    const duration = box.querySelector<HTMLInputElement>('#field-durationMin');
    expect(duration?.value).toBe('45');
    const summary = box.querySelector<HTMLTextAreaElement>('#field-summary');
    summary!.value = 'Point sur le sommeil';
    summary!.dispatchEvent(new Event('input'));
    box.querySelector<HTMLButtonElement>('button.confirm')?.click();
    await settle(harness);
    await vi.waitFor(() => expect(document.querySelector('pm-close-session-dialog')).toBeNull());
    expect(api.close).toHaveBeenCalledWith('s-open', {
      durationMin: 45,
      summary: 'Point sur le sommeil',
    });
    await settle(harness);
    expect(text(el.querySelector('.session-text'))).toBe('Dernière séance : 17 oct. 2026');
    expect(el.querySelector('button.start-session')).not.toBeNull();
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
    el.querySelector<HTMLButtonElement>('button.close-session')?.click();
    await settle(harness);
    dialog().querySelector<HTMLButtonElement>('button.confirm')?.click();
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
    el.querySelector<HTMLButtonElement>('button.close-session')?.click();
    await settle(harness);
    const duration = dialog().querySelector<HTMLInputElement>('#field-durationMin')!;
    duration.value = '0';
    duration.dispatchEvent(new Event('input'));
    dialog().querySelector<HTMLButtonElement>('button.confirm')?.click();
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

    const capture = el.querySelector<HTMLInputElement>('pm-capture-bar input')!;
    capture.focus();
    press(capture, '2');
    await settle(harness);
    expect(router.url).toBe('/patients/p-marie/graph');

    capture.blur();
    press(document.body, '1');
    await settle(harness);
    expect(router.url).toBe('/patients/p-marie');
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

    it('Entrée dans la barre de capture : l’éditeur reprend le texte', async () => {
      const { harness, el } = await render();
      const input = el.querySelector<HTMLInputElement>('#pm-capture-input')!;
      input.value = "n'a pas dormi";
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(harness);
      expect(editor()?.querySelector<HTMLTextAreaElement>('#field-body')?.value).toBe(
        "n'a pas dormi",
      );
      await settle(harness);
      expect(input.value).toBe('');
    });

    it('?entry=<id> : ouvre la correction de l’entrée', async () => {
      const { harness } = await render({}, '/patients/p-marie?entry=e-1');
      await settle(harness);
      expect(editor()?.querySelector('h2')?.textContent).toContain('Modifier l');
      TestBed.inject(HttpTestingController).expectOne((r) => r.url.endsWith('/api/entries/e-1'));
    });
  });
});
