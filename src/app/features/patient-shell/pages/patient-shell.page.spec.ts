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
import { LOCALE_ID } from '@angular/core';
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
  previousSession,
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
    // Onglet Séance et colonne de contexte (UX-S3).
    sessionEntries: api.sessionEntries ?? vi.fn().mockResolvedValue([notedEntry()]),
    linkSentence: api.linkSentence ?? vi.fn().mockResolvedValue(null),
    previousSession: api.previousSession ?? vi.fn().mockResolvedValue(previousSession()),
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

/** Le bouton Clôturer de la barre de séance. */
function closeButton(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>('pm-session-bar button.close-session');
  if (!button) throw new Error('aucun bouton Clôturer dans la barre de séance');
  return button;
}

/** Le bouton du panneau de clôture portant ce texte. */
function panelButton(name: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll('button')].find((b) => text(b) === name);
  if (!found) throw new Error(`bouton du panneau introuvable : ${name}`);
  return found;
}

describe('PatientShellPage', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('chargement : squelette de l’en-tête, pas encore d’onglet', async () => {
    const { el } = await render({ patient: vi.fn(() => never<ReturnType<typeof shellPatient>>()) });
    expect(el.querySelector('pm-patient-header [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('pm-fake-overview-tab')).toBeNull();
  });

  it('chargé : nom, drapeau, dernière séance (modalité, durée), pas de bloc de saisie sans séance ouverte, onglet 1 avec la bascule Vue', async () => {
    const { el, api } = await render();
    expect(api.patient).toHaveBeenCalledWith('p-marie');
    expect(text(el.querySelector('h1.name'))).toBe('Marie D.');
    expect(text(el.querySelector('.flag'))).toBe('À surveiller');
    expect(text(el.querySelector('.session-text'))).toBe(
      'Dernière séance : 17 oct. 2026 · visio · 60 min',
    );
    expect(el.querySelector('button.start-session')).not.toBeNull();
    // Hors séance : ni barre de séance, ni bloc de saisie (aucune saisie sans séance, UX-S1), ni
    // colonne latérale ; l'onglet occupe la colonne principale seule.
    expect(el.querySelector('pm-session-bar .session-bar')).toBeNull();
    const layout = el.querySelector('.pad-layout')!;
    expect(layout.classList.contains('in-session')).toBe(false);
    expect(layout.querySelector('pm-capture-block')).toBeNull();
    expect(layout.querySelector('aside.ctx')).toBeNull();
    expect(layout.querySelector('.pad-main .tab-content pm-fake-overview-tab')).not.toBeNull();
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

  it('Démarrer : barre de séance (chronomètre, durée prévue, compte), onglet Séance ouvert, colonne de contexte, sans recharger le dossier', async () => {
    // Horloge figée 12 min après le début de la séance renvoyée (24 oct. 2026, 14:00 Z) : au-delà
    // de 3 h, la barre dirait « non clôturée ». Seule la date est simulée, pas les minuteries.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T14:12:00Z'));
    try {
      const { el, harness, api } = await render({}, '/patients/p-marie', 45);
      el.querySelector<HTMLButtonElement>('button.start-session')?.click();
      await settle(harness);
      expect(api.start).toHaveBeenCalledWith('p-marie', 'in_person');
      expect(api.patient).toHaveBeenCalledTimes(1);
      // La barre de séance précède l'en-tête ; l'en-tête n'a plus ni Démarrer ni texte de séance.
      const bar = el.querySelector('pm-session-bar .session-bar')!;
      expect(bar).not.toBeNull();
      expect(bar.compareDocumentPosition(el.querySelector('pm-patient-header')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      // L'heure est celle du fuseau de la machine : l'attendu suit le même Intl que le composant.
      const startedAt = new Intl.DateTimeFormat(TestBed.inject(LOCALE_ID), {
        timeStyle: 'short',
      }).format(new Date('2026-10-24T14:00:00Z'));
      expect(text(bar.querySelector('.session-text'))).toBe(
        `Séance en cours · cabinet · démarrée à ${startedAt}`,
      );
      expect(text(bar.querySelector('.timer'))).toBe('00:12:00');
      expect(text(bar.querySelector('.planned'))).toBe('sur 45 min prévues');
      expect(text(bar.querySelector('.count'))).toBe('1 entrée notée');
      expect(text(closeButton(el))).toContain('Clôturer la séance');
      expect(el.querySelector('pm-patient-header button.start-session')).toBeNull();
      expect(el.querySelector('pm-patient-header .session-text')).toBeNull();
      // UX-S3 : l'onglet Séance remplace la vue d'ensemble ; « Vue d'ensemble » reste à un clic.
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie/session');
      expect(text(el.querySelector('nav.tabs a[aria-current="page"] span'))).toBe('Séance');
      expect(text(el.querySelector('nav.tabs a.overview-link'))).toBe("Vue d'ensemble");
      // Colonne de contenu en mode séance (04b) : la colonne principale porte le bloc déplié puis
      // l'onglet Séance ; la colonne latérale de contexte la longe, les raccourcis en dernier.
      const layout = el.querySelector('.pad-layout')!;
      expect(layout.classList.contains('in-session')).toBe(true);
      // UX-S5 : sur l'onglet Séance la page est en pleine largeur (classe hôte lue par ses styles ;
      // le <main> suit data.contentWidth full de la route).
      expect(el.querySelector('pm-patient-shell-page')!.classList.contains('full-bleed')).toBe(
        true,
      );
      const main = [...layout.querySelectorAll('.pad-main > *')].map(
        (node) => node.className || node.tagName.toLowerCase(),
      );
      expect(main).toEqual(['pm-capture-block', 'tab-content']);
      expect(layout.querySelector('.pad-main pm-capture-block .block.expanded')).not.toBeNull();
      expect(layout.querySelector('.pad-main .tab-content pm-session-tab-page')).not.toBeNull();
      expect(counter(el)).toBeNull();
      const aside = layout.querySelector('aside.ctx')!;
      expect(aside.getAttribute('aria-label')).toBe('Contexte de la séance');
      expect(aside.querySelector('pm-session-context')).not.toBeNull();
      expect([...aside.querySelectorAll('h3')].map(text)).toEqual([
        'Prévu la dernière fois',
        'À garder en tête',
        'Raccourcis dans le texte',
      ]);
      expect([...aside.querySelectorAll('.shortcut')].map(text)).toEqual([
        'anx 7 ressenti',
        '/evt événement',
        '/sit situation',
        '/med médicament',
        '/note',
        'hier, 12 mars, il y a 3 j dates',
        '> cible lien',
      ]);
      expect(el.querySelector('button.new-entry')).toBeNull();
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(el.querySelector('pm-capture-block textarea')),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('séance ouverte depuis plus de 3 h : barre grise « non clôturée », « Clôturer maintenant », « Reprendre » rouvre l’onglet Séance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T17:01:00Z'));
    try {
      const { el, harness } = await render({ current: vi.fn().mockResolvedValue(openSession()) });
      const bar = el.querySelector('pm-session-bar .session-bar')!;
      expect(bar.classList.contains('unclosed')).toBe(true);
      const line = text(bar.querySelector('.session-text'));
      expect(line).toMatch(/non clôturée$/);
      expect(line).not.toContain('Séance en cours');
      expect(bar.querySelector('.timer')).toBeNull();
      expect(text(closeButton(el))).toContain('Clôturer maintenant');
      // Dossier ouvert avec une séance en cours : l'onglet Séance, une fois ; retour sur la vue
      // d'ensemble par son lien, puis « Reprendre ».
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie/session');
      await harness.navigateByUrl('/patients/p-marie');
      await settle(harness);
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
      el.querySelector<HTMLButtonElement>('pm-session-bar button.resume')!.click();
      await settle(harness);
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie/session');
    } finally {
      vi.useRealTimers();
    }
  });

  it('séance ouverte et lien profond ?entry= : l’onglet Séance garde la requête', async () => {
    await render(
      { current: vi.fn().mockResolvedValue(openSession()) },
      '/patients/p-marie?entry=e-1',
    );
    expect(TestBed.inject(Router).url).toBe('/patients/p-marie/session?entry=e-1');
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
      panelButton('Clôturer la séance').click();
      await settle(harness);
      await vi.waitFor(() => expect(document.querySelector('pm-close-session-panel')).toBeNull());
      expect(api.close).toHaveBeenCalledWith('s-open', {
        durationMin: 50,
        summary: 'Point sur le sommeil',
      });
      await settle(harness);
      // La séance clôturée (réponse du serveur) devient la dernière séance ; la barre et la colonne
      // de contexte disparaissent, l'onglet 1 redit « Vue d'ensemble » (retour de l'onglet Séance,
      // 04b état 6), toast de 6 s avec « Modifier », Démarrer prend le focus.
      expect(el.querySelector('pm-session-bar .session-bar')).toBeNull();
      expect(text(el.querySelector('pm-patient-header .session-text'))).toBe(
        'Dernière séance : 17 oct. 2026 · visio · 50 min',
      );
      expect(el.querySelector('button.start-session')).not.toBeNull();
      expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
      expect(text(el.querySelector('nav.tabs a[aria-current="page"] span'))).toBe("Vue d'ensemble");
      expect(el.querySelector('nav.tabs a.overview-link')).toBeNull();
      expect(el.querySelector('.pad-layout.in-session')).toBeNull();
      expect(el.querySelector('pm-capture-block')).toBeNull();
      expect(el.querySelector('aside.ctx')).toBeNull();
      const toasts = TestBed.inject(ToastService).toasts();
      expect(toasts.at(-1)?.message).toBe('Séance clôturée · 50 min · compte rendu enregistré');
      expect(toasts.at(-1)?.action?.label).toBe('Modifier');
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(el.querySelector('button.start-session')),
      );
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
    panelButton('Clôturer et revenir à la liste').click();
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
    panelButton('Clôturer la séance').click();
    await settle(harness);
    await vi.waitFor(() => expect(document.querySelector('pm-close-session-panel')).toBeNull());
    await settle(harness);
    expect(current).toHaveBeenCalledTimes(2);
    expect(text(el.querySelector('.session-text'))).toContain('Dernière séance');
    expect(TestBed.inject(ToastService).toasts().at(-1)?.level).toBe('warning');
    expect(TestBed.inject(Router).url).toBe('/patients/p-marie');
  });

  it('Clôturer, 422 : message du serveur sous la durée, le panneau reste ouvert', async () => {
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
    panelButton('Clôturer la séance').click();
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
    panelButton('Clôturer la séance').click();
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

  it('touches 1 2 3 : changent d’onglet, pas quand le bloc de saisie a le focus', async () => {
    const { el, harness } = await render({ current: vi.fn().mockResolvedValue(openSession()) });
    expect(el.querySelector('pm-capture-block textarea')?.getAttribute('placeholder')).toBe(
      "Qu'est-ce qui s'est passé ?",
    );
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
    // Séance ouverte : l'onglet 1 est l'onglet Séance (UX-S3).
    press(document.body, '1');
    await settle(harness);
    expect(router.url).toBe('/patients/p-marie/session');
  });

  it('arrivée depuis la création (état CAPTURE_FOCUS_STATE) : séance ouverte, le bloc prend le focus', async () => {
    const { el, harness } = await render(
      { current: vi.fn().mockResolvedValue(openSession()) },
      '/patients',
    );
    await TestBed.inject(Router).navigate(['/patients', 'p-marie', 'overview'], {
      state: { [CAPTURE_FOCUS_STATE]: true },
    });
    await settle(harness);
    await settle(harness);
    const capture = el.querySelector<HTMLTextAreaElement>('pm-capture-block textarea');
    expect(capture).not.toBeNull();
    expect(document.activeElement).toBe(capture);
  });

  it('arrivée depuis la création sans séance ouverte : « Démarrer la séance » prend le focus', async () => {
    const { el, harness } = await render({}, '/patients');
    await TestBed.inject(Router).navigate(['/patients', 'p-marie', 'overview'], {
      state: { [CAPTURE_FOCUS_STATE]: true },
    });
    await settle(harness);
    await settle(harness);
    expect(el.querySelector('pm-capture-block')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('button.start-session'));
  });

  it('arrivée ordinaire (lien, historique) : le focus n’est pas déplacé', async () => {
    const { el } = await render({ current: vi.fn().mockResolvedValue(openSession()) });
    expect(document.activeElement).not.toBe(el.querySelector('pm-capture-block textarea'));
    expect(document.activeElement).not.toBe(el.querySelector('button.start-session'));
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

    it('touche N : ouvre l’éditeur, une seule fois ; plus de bouton + (UX-S2, 04b)', async () => {
      const { harness, el } = await render();
      expect(el.querySelector('button.new-entry')).toBeNull();
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

    it('Ctrl+Entrée dans le bloc de saisie : l’éditeur reprend la saisie interprétée', async () => {
      const { harness, el } = await render({ current: vi.fn().mockResolvedValue(openSession()) });
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

    it('Entrée sur un bloc vide : l’éditeur vide', async () => {
      const { harness, el } = await render({ current: vi.fn().mockResolvedValue(openSession()) });
      const input = el.querySelector<HTMLTextAreaElement>('#pm-capture-input')!;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(harness);
      expect(editor()?.querySelector('h2')?.textContent).toContain('Nouvelle entrée');
    });

    it('entrée créée par le bloc de saisie : les projections se relisent', async () => {
      const { harness } = await render({ current: vi.fn().mockResolvedValue(openSession()) });
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
