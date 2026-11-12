import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, firstValueFrom, map } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';
import {
  PatientHeaderComponent,
  PatientSessionInfo,
  SessionBarComponent,
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
import { CloseSessionDialog, CloseSessionResult } from '../panels/close-session.dialog';
import {
  finalLoadError,
  sessionProblemText,
  textShortcutRows,
  toHeaderInfo,
} from '../ui/shell-labels';

/**
 * Page patient /patients/:id (B2, fiche 00 §2 ; UX-S2, proposition 04b) : la barre de séance
 * (pm-session-bar) tant qu'une séance est ouverte, l'en-tête compact (pm-patient-header, nourri par
 * le PatientShellStore), la colonne de contenu (.pad-layout : le bloc de saisie au-dessus de
 * l'onglet courant, replié hors séance ; en séance, une colonne latérale de 340 px), et l'onglet
 * courant dans le router-outlet (overview, timeline, graph, search). Le store est fourni ici : les onglets
 * l'injectent et y rangent leur état, qui survit aux changements d'onglet tant que le dossier
 * reste ouvert. 403 PATIENT_FORBIDDEN et 404 : état erreur du shell, sans redirection.
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
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly shortcuts = inject(ShortcutService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly captureBar = viewChild(CaptureBlockComponent);
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
    inject(Router).events.pipe(filter((event) => event instanceof NavigationEnd)),
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
    if (current) {
      return { kind: 'current', startedAt: current.startedAt, modality: current.modality };
    }
    const last = this.store.lastSession();
    if (last) {
      return {
        kind: 'last',
        date: last.startedAt,
        modality: last.modality,
        durationMin: last.durationMin,
      };
    }
    return { kind: 'none' };
  });

  /** Mode séance : barre de séance, onglet « Séance », bloc déplié, colonne latérale. */
  protected readonly inSession = computed(() => this.store.currentSession() !== null);

  /** Colonne latérale en séance (04b « Raccourcis dans le texte ») : la grammaire du bloc. */
  protected readonly textShortcuts = textShortcutRows();

  /** L'en-tête montre le chargement et l'erreur qu'un nouvel essai peut lever (5xx, réseau). */
  protected readonly headerState = computed<StateKind | null>(() => {
    if (this.store.patient()) return null;
    return this.store.status() === 'error' ? 'error' : 'loading';
  });

  /** 403 PATIENT_FORBIDDEN, 404 : état erreur du shell, sans « Réessayer » ni redirection. */
  protected readonly finalError = computed(() =>
    this.store.status() === 'error' ? finalLoadError(this.store.problem()) : null,
  );

  constructor() {
    // Un autre :id (lien, historique) recharge le dossier ; le même :id ne refait rien.
    effect(() => {
      const id = this.id();
      untracked(() => {
        if (this.store.patientId() !== id) void this.store.load(id);
      });
    });

    // Arrivée depuis la création du patient (B3 flux 2, étape 3) : une fois le dossier lu, la barre
    // de capture prend le focus, une seule fois, panneau d'aperçu replié (il recouvrirait l'indice
    // de première entrée ; la première frappe l'ouvre).
    const state = inject(Router).currentNavigation()?.extras.state;
    if (state?.[CAPTURE_FOCUS_STATE] === true) {
      const arrival = effect(() => {
        const bar = this.captureBar();
        if (!bar || !this.store.patient()) return;
        arrival.destroy();
        untracked(() => bar.focus({ quiet: true }));
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
          if (saved) this.store.noteWrite();
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
   * N, ou le bloc de saisie (Ctrl+Entrée et « Détailler » : saisie interprétée ; Entrée sur un champ
   * vide) : nouvelle entrée dans l'éditeur. Le bouton « + » de l'en-tête a disparu avec UX-S2 (04b).
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
    // entrée enregistrée est une écriture : les projections (vue d'ensemble) se relisent.
    void ref?.closed.then((saved) => {
      if (!saved) return;
      this.store.noteWrite();
      if (saved.type === 'session') void this.store.refreshSession();
    });
  }

  /** Entrée créée par la barre de commande (Entrée, Ctrl+S) : les projections se relisent. */
  protected captured(entry: CapturedEntry): void {
    if (entry.id) this.store.noteWrite();
  }

  protected reload(): void {
    void this.store.load(this.id());
  }

  protected async start(): Promise<void> {
    if (await this.store.startSession()) {
      this.toast.success(
        $localize`:Toast après le démarrage d'une séance@@patientShell.session.started:Séance démarrée.`,
      );
      this.focusCapture();
    } else if (this.store.actionProblem()) {
      this.toast.warning(sessionProblemText(this.store.actionProblem()));
    }
  }

  /** Dialogue durée + compte rendu ; les touches globales sont suspendues tant qu'il est ouvert. */
  protected async openClose(): Promise<void> {
    this.shortcuts.enabled.set(false);
    const ref = this.dialog.open<CloseSessionDialog, void, CloseSessionResult>(CloseSessionDialog, {
      injector: this.injector,
      role: 'dialog',
      ariaModal: true,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
    });
    const result = await firstValueFrom(ref.afterClosed());
    this.shortcuts.enabled.set(true);
    if (result === 'closed') {
      this.toast.success(
        $localize`:Toast après la clôture d'une séance@@patientShell.session.closed:Séance clôturée.`,
      );
      this.focusCapture();
    } else if (result === 'conflict') {
      this.toast.warning(sessionProblemText(this.store.actionProblem()));
    }
    this.store.clearActionProblem();
  }

  /**
   * Après Démarrer ou Clôturer, le bouton utilisé disparaît (de l'en-tête, de la barre de séance) :
   * le bloc de saisie prend le focus (B3 flux 3 et 6 : on démarre la séance puis on note au clavier).
   */
  private focusCapture(): void {
    this.captureBar()?.focus();
  }
}
