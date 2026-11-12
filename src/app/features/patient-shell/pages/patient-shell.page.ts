import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';
import {
  PatientHeaderComponent,
  PatientSessionInfo,
  SidePanelService,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
// Seuil de « non clôturée » (UX-A8) : la constante n'est pas réexportée par l'index de shared/ui.
import { UNCLOSED_SESSION_AFTER_MIN } from '../../../shared/ui/patient-header/patient-header.component';
import { CaptureBlockComponent, CapturedEntry } from '../../capture';
import { ENTRY_QUERY_PARAM, EntryPrefill, openEntryEditor } from '../../entries';
import { connectLinkEditor, LINK_QUERY_PARAM } from '../../graph';
import { OverviewViewToggleComponent } from '../../overview';
import { StateKind } from '../../../shared/util';
import { ShellTab } from '../data/patient-shell.model';
import { CAPTURE_FOCUS_STATE } from '../patient-shell.params';
import { PatientShellStore } from '../data/patient-shell.store';
import {
  CloseSessionPanel,
  CloseSessionPanelData,
  CloseSessionResult,
} from '../panels/close-session.panel';
import { SessionBarComponent } from '../ui/session-bar.component';
import {
  closedToastText,
  finalLoadError,
  sessionProblemText,
  toHeaderInfo,
} from '../ui/shell-labels';

/**
 * Page patient /patients/:id (B2, fiche 00 §2) : l'en-tête permanent (pm-patient-header, nourri
 * par le PatientShellStore), le bloc de saisie, et l'onglet courant dans le router-outlet
 * (overview, session, timeline, graph, search). Le store est fourni ici : les onglets l'injectent
 * et y rangent leur état, qui survit aux changements d'onglet tant que le dossier reste ouvert.
 * 403 PATIENT_FORBIDDEN et 404 : état erreur du shell, sans redirection.
 * UX-S3 : une séance démarrée ouvre l'onglet Séance (/patients/:id/session), qui remplace la vue
 * d'ensemble tant qu'elle est ouverte (un dossier ouvert sur l'onglet 1 avec une séance en cours y
 * va aussi, une fois) ; la clôture passe par le panneau latéral de 520 px, puis un toast de 6 s
 * avec « Modifier » et le retour au dossier (ou à la liste).
 */
@Component({
  selector: 'pm-patient-shell-page',
  imports: [
    CaptureBlockComponent,
    OverviewViewToggleComponent,
    PatientHeaderComponent,
    RouterLink,
    RouterOutlet,
    SessionBarComponent,
    StateComponent,
  ],
  providers: [PatientShellStore],
  templateUrl: './patient-shell.page.html',
  styleUrl: './patient-shell.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientShellPage {
  /** :id de la route (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(PatientShellStore);
  /** Au-delà de 3 h : « non clôturée » au lieu de « en cours depuis … » (maquettes 02 et 03). */
  protected readonly unclosedAfterMin = UNCLOSED_SESSION_AFTER_MIN;
  private readonly toast = inject(ToastService);
  private readonly shortcuts = inject(ShortcutService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** Le bloc de saisie, présent seulement pendant une séance ouverte. */
  private readonly captureBar = viewChild(CaptureBlockComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly panels = inject(SidePanelService);

  /** `?entry=<id>` : correction d'une entrée, le panneau se rouvre au rechargement (fiche 05). */
  private readonly entryParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(ENTRY_QUERY_PARAM))),
  );

  /** `?link=<entryId>` : l'éditeur de lien est ouvert (features/graph le pose et le retire). */
  private readonly linkParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(LINK_QUERY_PARAM))),
  );

  private readonly navigated = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
  );

  /** Onglet affiché (data.tab de la route enfant) : la bascule Vue n'existe que sur l'onglet 1. */
  protected readonly activeTab = computed<ShellTab | null>(() => {
    this.navigated();
    return (this.route.firstChild?.snapshot.data['tab'] as ShellTab | undefined) ?? null;
  });

  protected readonly headerPatient = computed(() => {
    const patient = this.store.patient();
    return patient ? toHeaderInfo(patient, this.store.followedSince()) : null;
  });

  protected readonly headerSession = computed<PatientSessionInfo>(() => {
    const current = this.store.currentSession();
    if (current) return { kind: 'current', startedAt: current.startedAt };
    const last = this.store.lastSession();
    if (last) return { kind: 'last', date: last.startedAt };
    return { kind: 'none' };
  });

  /** L'en-tête montre le chargement et l'erreur qu'un nouvel essai peut lever (5xx, réseau). */
  protected readonly headerState = computed<StateKind | null>(() => {
    if (this.store.patient()) return null;
    return this.store.status() === 'error' ? 'error' : 'loading';
  });

  /** 403 PATIENT_FORBIDDEN, 404 : état erreur du shell, sans « Réessayer » ni redirection. */
  protected readonly finalError = computed(() =>
    this.store.status() === 'error' ? finalLoadError(this.store.problem()) : null,
  );

  /** Horloge de la barre de séance (minuterie), à la seconde tant qu'une séance est ouverte. */
  protected readonly now = signal(new Date());

  constructor() {
    effect((onCleanup) => {
      if (!this.store.currentSession()) return;
      this.now.set(new Date());
      const timer = setInterval(() => this.now.set(new Date()), 1_000);
      onCleanup(() => clearInterval(timer));
    });

    // Un autre :id (lien, historique) recharge le dossier ; le même :id ne refait rien.
    effect(() => {
      const id = this.id();
      untracked(() => {
        if (this.store.patientId() !== id) void this.store.load(id);
      });
    });

    // Dossier ouvert sur l'onglet 1 avec une séance en cours (rechargement, lien) : l'onglet
    // Séance, une fois par dossier lu ; « Vue d'ensemble » reste à un clic dans les onglets.
    let routedFor: string | null = null;
    effect(() => {
      const patient = this.store.patient();
      const session = this.store.currentSession();
      if (!patient || patient.id === routedFor) return;
      routedFor = patient.id;
      if (session && untracked(this.activeTab) === 'overview') {
        untracked(() => void this.goToSession(patient.id, true));
      }
    });

    // « Noter » de l'onglet Séance (04b, état 2) : le bloc reçoit « <point> : », caret à la fin.
    effect(() => {
      const request = this.store.prefillRequest();
      const bar = this.captureBar();
      if (!request || !bar) return;
      untracked(() => {
        bar.prefill(request.text);
        this.store.clearPrefill();
      });
    });

    // Arrivée depuis la création du patient (B3 flux 2, étape 3) : une fois le dossier lu, le bloc
    // de saisie prend le focus s'il y a une séance ouverte, champs repliés (ils recouvriraient
    // l'indice de première entrée ; la première frappe les ouvre) ; sinon le bouton « Démarrer la
    // séance », puisqu'aucune saisie n'est possible sans séance.
    const state = this.router.currentNavigation()?.extras.state;
    if (state?.[CAPTURE_FOCUS_STATE] === true) {
      const arrival = effect(() => {
        if (!this.store.patient()) return;
        arrival.destroy();
        untracked(() => this.focusCapture({ quiet: true }));
      });
    }

    // Éditeur d'entrée (M1-08) : N ouvre une nouvelle entrée ; ?entry=<id> ouvre sa correction.
    inject(DestroyRef).onDestroy(
      this.shortcuts.register(
        'n',
        () => this.newEntry(),
        $localize`:Aide des raccourcis@@shortcuts.n:Nouvelle entrée`,
      ),
    );
    effect(() => {
      const entryId = this.entryParam();
      const patient = this.store.patient();
      if (!entryId || !patient) return;
      untracked(() => {
        const ref = openEntryEditor(patient.id, { entryId, injector: this.injector });
        void ref?.closed.then((saved) => {
          if (saved) this.store.noteWrite(saved.id);
        });
      });
    });
    // Éditeur de lien (M2-04) : L lie l'entrée ouverte ; ?link=<id> s'ouvre après ?entry=.
    connectLinkEditor(() => this.store.patient());
    // Sa fermeture (?link= retiré de l'URL) : un lien a pu être posé, les projections se relisent.
    let link = untracked(() => this.linkParam() ?? null);
    effect(() => {
      const current = this.linkParam() ?? null;
      if (current === link) return;
      const closed = link !== null && current === null;
      link = current;
      if (closed) untracked(() => this.store.noteWrite());
    });
  }

  /** L'indice de première entrée attend la séance d'accueil avant d'ouvrir l'éditeur. */
  protected readonly preparingFirstEntry = signal(false);

  /**
   * « Nouvelle entrée » de l'indice de première entrée (M7-03) : la séance d'accueil arrive en
   * différé après la création du patient ; on s'assure qu'une séance existe (relecture de la séance
   * courante) avant d'ouvrir l'éditeur, qui la présélectionne. Sans séance au bout de l'attente,
   * l'éditeur s'ouvre quand même et affiche le refus de l'API sous le champ Séance.
   */
  protected async firstEntry(): Promise<void> {
    if (this.preparingFirstEntry()) return;
    this.preparingFirstEntry.set(true);
    try {
      await this.store.waitForSession();
    } finally {
      this.preparingFirstEntry.set(false);
    }
    this.newEntry();
  }

  /**
   * N, bouton + ou bloc de saisie (Ctrl+Entrée : saisie interprétée ; Entrée sur un champ vide) :
   * nouvelle entrée dans l'éditeur.
   */
  protected newEntry(prefill: EntryPrefill | null = null): void {
    if (this.panels.isOpen() || !this.store.patient()) return;
    const ref = openEntryEditor(this.id(), {
      prefill: prefill ?? undefined,
      injector: this.injector,
    });
    // La saisie est dans le brouillon de l'éditeur : la barre se vide (pas de doublon à la 2e Entrée).
    if (ref && prefill) this.captureBar()?.clear();
    // Une séance créée depuis l'éditeur s'ouvre : l'en-tête relit la séance courante. Toute
    // entrée enregistrée est une écriture : les projections (vue d'ensemble, onglet Séance) se
    // relisent, la ligne de l'entrée est surlignée.
    void ref?.closed.then((saved) => {
      if (!saved) return;
      this.store.noteWrite(saved.id);
      if (saved.type === 'session') void this.store.refreshSession();
    });
  }

  /** Entrée créée par le bloc de saisie (Entrée, Ctrl+S) : les projections se relisent, sa ligne est surlignée. */
  protected captured(entry: CapturedEntry): void {
    if (entry.id) this.store.noteWrite(entry.id);
  }

  protected reload(): void {
    void this.store.load(this.id());
  }

  /**
   * Démarrer : l'en-tête passe « en cours », l'onglet Séance s'ouvre (proposition 04b, état 2 :
   * pas de toast, la couleur et la minuterie le disent ; une annonce polie pour les lecteurs
   * d'écran), le bloc de saisie prend le focus.
   */
  protected async start(): Promise<void> {
    if (await this.store.startSession()) {
      await this.goToSession(this.id(), false);
      this.announce(
        $localize`:Annonce après le démarrage d'une séance@@patientShell.session.started:Séance démarrée.`,
      );
      this.focusCapture();
    } else if (this.store.actionProblem()) {
      this.toast.warning(sessionProblemText(this.store.actionProblem()));
    }
  }

  /**
   * Panneau de clôture (520 px) ; les touches globales sont suspendues tant qu'il est ouvert.
   * Clôturée : toast de 6 s avec « Modifier » (l'éditeur sur la séance, dans la grâce), retour
   * de l'onglet Séance à la vue d'ensemble, ou à la liste ; 409 : avis, l'en-tête a été relu.
   */
  protected async openClose(): Promise<void> {
    const ref = this.panels.open<CloseSessionPanel, CloseSessionPanelData, CloseSessionResult>(
      CloseSessionPanel,
      { data: { store: this.store, unclosedAfterMin: this.unclosedAfterMin }, width: 520 },
    );
    if (!ref) return;
    this.shortcuts.enabled.set(false);
    const result = await ref.closed;
    this.shortcuts.enabled.set(true);
    if (result === 'closed' || result === 'closed-list') {
      const closed = this.store.lastClosed();
      if (closed) {
        this.toast.success(closedToastText(closed.session.durationMin, closed.withSummary), {
          label: $localize`:Action du toast de clôture@@patientShell.session.closedEdit:Modifier`,
          handler: () => this.editClosed(closed.session.id),
        });
      }
      if (result === 'closed-list') {
        await this.router.navigate(['/patients']);
      } else {
        if (this.activeTab() === 'session') await this.router.navigate(['/patients', this.id()]);
        this.focusCapture();
      }
    } else if (result === 'conflict') {
      this.toast.warning(sessionProblemText(this.store.actionProblem()));
      if (this.activeTab() === 'session') await this.router.navigate(['/patients', this.id()]);
    }
    this.store.clearActionProblem();
  }

  /** « Modifier » du toast : l'éditeur d'entrée sur la séance clôturée (compte rendu, durée). */
  private editClosed(sessionId: string): void {
    const ref = openEntryEditor(this.id(), { entryId: sessionId, injector: this.injector });
    void ref?.closed.then((saved) => {
      if (saved) {
        this.store.noteWrite();
        void this.store.refreshSession();
      }
    });
  }

  /** « Reprendre » de la barre grise : l'onglet Séance. */
  protected resume(): void {
    void this.goToSession(this.id(), false);
  }

  /** L'onglet Séance ; la requête (?entry=, ?link= : éditeurs ouverts par un lien) est gardée. */
  private goToSession(patientId: string, replaceUrl: boolean): Promise<boolean> {
    return this.router.navigate(['/patients', patientId, 'session'], {
      replaceUrl,
      queryParamsHandling: 'preserve',
    });
  }

  /** Une annonce polie, sans toast (region aria-live de la page). */
  protected readonly announcement = signal('');

  private announce(text: string): void {
    this.announcement.set('');
    setTimeout(() => this.announcement.set(text), 50);
  }

  /**
   * Après Démarrer ou Clôturer, le bouton utilisé disparaît de l'en-tête : le bloc de saisie prend
   * le focus (B3 flux 3 et 6 : on démarre la séance puis on note au clavier) ; sans séance ouverte
   * (après Clôturer), le bouton « Démarrer la séance », seul point de départ d'une saisie. Après le
   * prochain rendu : le bloc n'apparaît qu'avec la séance.
   */
  private focusCapture(options: { quiet?: boolean } = {}): void {
    afterNextRender(
      () => {
        const bar = this.captureBar();
        if (bar) bar.focus(options);
        else this.host.nativeElement.querySelector<HTMLElement>('button.start-session')?.focus();
      },
      { injector: this.injector },
    );
  }
}
