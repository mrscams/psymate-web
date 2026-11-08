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
  LOCALE_ID,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { formatDate } from '../../../core/i18n';
import { PatientSessionInfo, StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { EntryPrefill, LinkRailComponent, RailLink } from '../../entries';
import {
  buildPreview,
  CaptureEmotion,
  CapturedEntry,
  CapturePreview,
  mergeLinks,
  RailReadiness,
  replaceWord,
  targetLink,
  toPrefill,
} from '../data/capture.model';
import { CaptureStore } from '../data/capture.store';
import { parse } from '../parser/parse';
import {
  emotionProblemText,
  previewSummary,
  saveProblemText,
  targetIssueText,
  warningText,
} from './capture-labels';
import { CapturePreviewComponent } from './capture-preview.component';
import { EmotionProposalComponent, EmotionRequest } from './emotion-proposal.component';

/** Pause de frappe avant de lire le résumé de l'aperçu (role="status"). */
const ANNOUNCE_DELAY_MS = 500;

/** Le fuseau du navigateur : il dit au parseur quel jour civil est « aujourd'hui » (M6-01). */
function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Barre de commande du dossier patient (B5 alternative A, fiche 05 état A, fiche 00 §2) : le champ
 * « Noter quelque chose… » posé dans l'emplacement [pmCapture] de l'en-tête patient. Pendant la
 * frappe, un panneau ancré sous le champ montre l'aperçu interprété par le parseur (M6-01), la
 * proposition de création d'une émotion inconnue et le rail « Lié à… » de features/entries
 * (`Tab` y mène, `Espace` coche). Entrée enregistre dans la séance courante (bloqué tant qu'un
 * avertissement est « À corriger »), Ctrl+Entrée ouvre l'éditeur d'entrée prérempli (sortie
 * `openEditor`, branchée par le dossier), Ctrl+S enregistre un brouillon. Après une création, la
 * barre se vide et garde le focus ; le dossier relit ses projections (sortie `saved`).
 * Échap replie le panneau ; il revient à la frappe suivante. Champ vide : Entrée ouvre l'éditeur.
 */
@Component({
  selector: 'pm-command-bar',
  imports: [
    ReactiveFormsModule,
    StateComponent,
    LinkRailComponent,
    CapturePreviewComponent,
    EmotionProposalComponent,
  ],
  providers: [CaptureStore],
  templateUrl: './command-bar.component.html',
  styleUrl: './command-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'onKey($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class CommandBarComponent {
  /** Le patient du dossier ouvert. */
  readonly patientId = input.required<string>();
  /** Séance de l'en-tête : celle à laquelle l'entrée sera rattachée (aperçu). */
  readonly session = input<PatientSessionInfo | null>(null);
  /** Compteur d'écritures du dossier (PatientShellStore.revision) : rail et vocabulaire se relisent. */
  readonly revision = input(0);

  /** Une entrée a été créée depuis la barre : le dossier relit ses projections. */
  readonly saved = output<CapturedEntry>();
  /** Ouvrir l'éditeur d'entrée, prérempli (Ctrl+Entrée) ou vide (Entrée sur un champ vide). */
  readonly openEditor = output<EntryPrefill | null>();

  protected readonly store = inject(CaptureStore);
  private readonly locale = inject(LOCALE_ID);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly timeZone = browserTimeZone();

  protected readonly inputId = 'pm-capture-input';
  protected readonly previewId = 'pm-capture-preview';
  protected readonly alertId = 'pm-capture-alert';
  protected readonly panelId = 'pm-capture-panel';

  /** La saisie (état d'écran). */
  protected readonly text = signal('');
  /** Horloge du parseur, avancée à chaque frappe et avant d'enregistrer. */
  private readonly now = signal(new Date());
  private readonly focused = signal(false);
  /** Échap a replié le panneau ; la frappe suivante le rouvre. */
  private readonly collapsed = signal(false);
  /** Liens cochés à la main dans le rail. */
  private readonly picked = signal<RailLink[]>([]);
  /** Cible du `>` décochée dans le rail : elle ne part pas. */
  private readonly dismissed = signal<string | null>(null);
  /** Créations de la barre dont la révision du dossier n'est pas encore revenue. */
  private ownWrites = 0;
  /** Message sous la barre : entrée bloquée, enregistrement refusé. */
  protected readonly alert = signal<string | null>(null);

  protected readonly linksControl = new FormControl<RailLink[]>([], { nonNullable: true });

  protected readonly hasText = computed(() => this.text().trim().length > 0);
  protected readonly panelOpen = computed(() => this.focused() && !this.collapsed());

  protected readonly emotions = computed<CaptureEmotion[]>(() => this.store.emotions().data ?? []);
  protected readonly candidates = computed(() => this.store.candidates().data ?? []);
  protected readonly linkTypes = computed(() => this.store.linkTypes().data ?? []);

  /** La saisie interprétée, puis confrontée au vocabulaire et au rail ; null si le champ est vide. */
  protected readonly preview = computed<CapturePreview | null>(() => this.interpret(false));

  /** Trois états de l'aperçu : vide (aide), chargement et erreur du vocabulaire ; null : l'aperçu. */
  protected readonly previewState = computed<StateKind | null>(() => {
    if (!this.hasText()) return 'empty';
    const kind = stateKind(this.store.emotions());
    return kind === 'empty' ? null : kind;
  });

  /** Trois états du rail (chronologie et catalogue des liens). */
  protected readonly railState = computed<StateKind | null>(() => {
    if (this.store.linkTypes().status === 'error' && !this.store.linkTypes().data) return 'error';
    if (this.store.linkTypes().data === null) return 'loading';
    return stateKind(this.store.candidates());
  });

  protected readonly fromTarget = computed(() => targetLink(this.preview()));
  protected readonly links = computed(() =>
    mergeLinks(this.fromTarget(), this.picked(), this.dismissed()),
  );

  protected readonly sessionText = computed(() => {
    const session = this.session();
    if (!session) return null;
    switch (session.kind) {
      case 'current':
        return $localize`:Séance de rattachement dans l'aperçu@@capture.preview.sessionCurrent:séance en cours`;
      case 'last': {
        const date = formatDate(session.date, this.locale);
        return $localize`:Séance de rattachement dans l'aperçu@@capture.preview.sessionLast:séance du ${date}:date:`;
      }
      case 'none':
        return null;
    }
  });

  protected readonly emotionProblem = computed(() => {
    const problem = this.store.emotionProblem();
    return problem ? emotionProblemText(problem) : null;
  });

  /** Résumé lu par les lecteurs d'écran (role="status"), après une pause de frappe. */
  protected readonly announcement = signal('');

  protected readonly describedBy = computed(() => {
    const ids = [];
    if (this.panelOpen()) ids.push(this.previewId);
    if (this.alert()) ids.push(this.alertId);
    return ids.length ? ids.join(' ') : null;
  });

  protected readonly railEmptyTitle = $localize`:Rail vide de la barre de commande@@capture.rail.emptyTitle:Aucune entrée récente à lier`;
  protected readonly railErrorTitle = $localize`:Rail illisible dans la barre de commande@@capture.rail.errorTitle:Impossible de charger les entrées à lier`;
  protected readonly railRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryRail(),
  };

  constructor() {
    // Résumé de l'aperçu pour les lecteurs d'écran : après 500 ms sans frappe, ou tout de suite
    // quand la saisie devient (ou cesse d'être) bloquée.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasBlocking = false;
    effect(() => {
      const preview = this.panelOpen() ? this.preview() : null;
      const summary = preview ? previewSummary(preview) : '';
      const blocking = !!preview?.blocking;
      clearTimeout(timer);
      if (blocking !== wasBlocking || !summary) {
        wasBlocking = blocking;
        this.announcement.set(summary);
      } else {
        timer = setTimeout(() => this.announcement.set(summary), ANNOUNCE_DELAY_MS);
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    // Les liens affichés dans le rail : ceux cochés, et la cible du `>`.
    effect(() => {
      const links = this.links();
      untracked(() => this.linksControl.setValue(links, { emitEvent: false }));
    });
    // Une écriture ailleurs dans le dossier : rail et vocabulaire se relisent à la prochaine saisie.
    // La révision que la barre provoque elle-même (sortie `saved`) ne compte pas : le store a déjà
    // relu le rail après sa création.
    let seen = untracked(this.revision);
    effect(() => {
      const revision = this.revision();
      if (revision === seen) return;
      seen = revision;
      if (this.ownWrites > 0) {
        this.ownWrites--;
        return;
      }
      untracked(() => this.store.markStale());
    });
  }

  /** Donne le focus au champ après le prochain rendu (Démarrer, Clôturer, après un enregistrement). */
  focus(): void {
    afterNextRender(() => this.field()?.focus(), { injector: this.injector });
  }

  /** Vide la barre (son texte est parti dans une entrée ou dans le brouillon de l'éditeur). */
  clear(): void {
    this.text.set('');
    this.picked.set([]);
    this.dismissed.set(null);
    this.alert.set(null);
    this.store.clearProblem();
    this.store.clearEmotionProblem();
    // Le champ peut avoir été rempli sans rendu intermédiaire : on vide aussi sa valeur DOM.
    const field = this.field();
    if (field) field.value = '';
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.now.set(new Date());
    this.collapsed.set(false);
    this.alert.set(null);
    if (!value.trim()) {
      this.picked.set([]);
      this.dismissed.set(null);
    }
    void this.store.prepare(this.patientId());
  }

  protected onFocusIn(): void {
    this.focused.set(true);
    void this.store.prepare(this.patientId());
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    this.focused.set(false);
    this.collapsed.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    // Composition en cours (accents, IME) : la touche appartient à la saisie.
    if (event.isComposing || event.keyCode === 229) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const modifier = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' && this.panelOpen()) {
      event.preventDefault();
      this.collapsed.set(true);
      return;
    }
    if (event.key === 'Enter' && !event.altKey && !event.shiftKey) {
      // Les boutons, les listes et la proposition d'émotion gardent leur Entrée.
      const tag = target?.tagName;
      const own =
        tag === 'BUTTON' ||
        tag === 'SELECT' ||
        tag === 'A' ||
        !!target?.closest('pm-emotion-proposal');
      if (!modifier && own) return;
      event.preventDefault();
      if (event.repeat) return;
      if (modifier) this.refine();
      else void this.submit('final');
      return;
    }
    if (modifier && !event.altKey && (event.key.toLowerCase() === 's' || event.code === 'KeyS')) {
      event.preventDefault();
      if (!event.repeat) void this.submit('draft');
    }
  }

  /** Le rail a changé : liens cochés à la main ; la cible du `>` décochée ne part plus. */
  protected onPicked(list: RailLink[]): void {
    const target = this.fromTarget();
    if (target) {
      const kept = list.find((link) => link.targetId === target.targetId);
      this.dismissed.set(kept ? null : target.targetId);
      this.picked.set(
        list.filter(
          (link) =>
            link.targetId !== target.targetId ||
            link.linkType !== target.linkType ||
            link.direction !== target.direction,
        ),
      );
    } else {
      this.picked.set(list);
    }
  }

  /** Mot ambigu : l'émotion choisie remplace le mot dans la saisie. */
  protected pickEmotion(emotion: CaptureEmotion): void {
    const word = this.preview()?.ambiguous?.word;
    if (!word) return;
    this.text.set(replaceWord(this.text(), word, emotion.label));
    this.focus();
  }

  /** Crée l'émotion inconnue (POST /api/me/emotions) : la saisie est aussitôt réinterprétée. */
  protected async createEmotion(request: EmotionRequest): Promise<void> {
    const emotion = await this.store.createEmotion(request.label, request.family);
    if (!emotion) return;
    const label = emotion.label;
    this.toast.success(
      $localize`:Toast après la création d'une émotion depuis la barre@@capture.emotion.created:Émotion « ${label}:label: » créée.`,
    );
    this.focus();
  }

  /** Entrée (final) ou Ctrl+S (brouillon) : POST dans la séance courante. */
  protected async submit(status: 'final' | 'draft'): Promise<void> {
    if (this.store.saving()) return;
    if (!this.text().trim()) {
      if (status === 'final') this.openEditor.emit(null);
      return;
    }
    this.alert.set(null);
    this.store.clearProblem();
    const patientId = this.patientId();
    await this.store.prepare(patientId);
    this.now.set(new Date());
    if (this.store.emotions().data === null) {
      this.alert.set(
        $localize`:Erreur de la barre de commande@@capture.error.vocabulary:Les émotions n'ont pas pu être chargées : réessayez, ou ouvrez l'éditeur (Ctrl+Entrée).`,
      );
      return;
    }
    // Au moment d'enregistrer, un rail toujours illisible rend la cible du `>` indisponible.
    const preview = this.interpret(true);
    if (!preview) return;
    const reason = this.blockingReason(preview);
    if (reason) {
      this.alert.set(
        $localize`:Entrée bloquée par un avertissement de la barre de commande@@capture.blocked:Rien n'est enregistré. ${reason}:reason:`,
      );
      return;
    }
    // La saisie envoyée : si elle change pendant l'enregistrement, la barre la garde.
    const sent = this.text();
    const saved = await this.store.save(patientId, toPrefill(preview, this.links()), status);
    if (!saved) {
      const problem = this.store.problem();
      if (problem) this.alert.set(saveProblemText(problem));
      return;
    }
    this.toast.success(
      status === 'draft'
        ? $localize`:Toast après un brouillon depuis la barre@@capture.saved.draft:Brouillon enregistré.`
        : $localize`:Toast après une création depuis la barre@@capture.saved.create:Entrée enregistrée.`,
    );
    if (this.text() === sent) this.clear();
    if (saved.id) this.ownWrites++;
    this.saved.emit(saved);
    this.focus();
  }

  /**
   * Ctrl+Entrée : l'éditeur d'entrée, prérempli avec ce que la barre a compris (sans attendre une
   * lecture en cours : l'éditeur laisse tout corriger).
   */
  protected refine(): void {
    if (this.store.saving()) return;
    if (!this.hasText()) {
      this.openEditor.emit(null);
      return;
    }
    this.now.set(new Date());
    const preview = this.preview();
    this.openEditor.emit(preview ? toPrefill(preview, this.links()) : null);
  }

  /**
   * Interprète la saisie. Rail en cours de lecture : la cible du `>` n'est ni trouvée ni manquante,
   * sauf au moment d'enregistrer (`saving`) où elle est indisponible, comme après un échec.
   */
  private interpret(saving: boolean): CapturePreview | null {
    if (!this.hasText()) return null;
    const emotions = this.emotions();
    const result = parse(this.text(), {
      emotions,
      now: this.now(),
      locale: this.locale,
      timeZone: this.timeZone,
    });
    const ready = this.store.candidates().data !== null && this.store.linkTypes().data !== null;
    const failed =
      this.store.candidates().status === 'error' || this.store.linkTypes().status === 'error';
    const rail: RailReadiness = ready ? 'ready' : failed || saving ? 'unavailable' : 'pending';
    return buildPreview(result, {
      emotions,
      candidates: this.candidates(),
      linkTypes: this.linkTypes(),
      rail,
    });
  }

  /** Le premier avertissement bloquant, en texte ; null si Entrée peut enregistrer. */
  private blockingReason(preview: CapturePreview): string | null {
    const warning = preview.warnings.find((item) => item.blocking);
    if (warning) return warningText(warning, preview.type, this.emotions(), this.locale);
    return preview.targetIssue ? targetIssueText(preview.targetIssue, preview.type) : null;
  }

  private field(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>(`#${this.inputId}`);
  }
}
