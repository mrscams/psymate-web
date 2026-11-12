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

import { PreferencesStore } from '../../../core/preferences';
import { DateFieldComponent } from '../../../shared/ui/date-field';
import {
  EntryIconComponent,
  entryTypeLabel,
  StateAction,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { EntryPrefill, LinkCandidate, LinkChoice } from '../../entries';
import {
  buildPreview,
  CaptureEmotion,
  CapturedEntry,
  CapturePreview,
  CaptureSlot,
  CaptureVisibility,
  ComposedEntry,
  composeEntry,
  detectedGrammar,
  RailReadiness,
  snapshotOf,
} from '../data/capture.model';
import { CaptureStore } from '../data/capture.store';
import { parse } from '../parser/parse';
import { CaptureEntryType, ParsedOccurred } from '../parser/parse.types';
import { CaptureEmotionFieldComponent } from './capture-emotion-field.component';
import { CaptureIntensityScaleComponent } from './capture-intensity-scale.component';
import {
  composedSummary,
  detectedFromText,
  emotionProblemText,
  fieldErrorsBySlot,
  missingText,
  savedNothingText,
  saveProblemText,
  targetIssueText,
  warningText,
} from './capture-labels';
import { CaptureLinksComponent } from './capture-links.component';
import { CaptureWhenFieldComponent } from './capture-when-field.component';
import { EmotionRequest } from './emotion-proposal.component';

/** Pause de frappe avant de lire le résumé (role="status"). */
const ANNOUNCE_DELAY_MS = 500;

/** Les cinq types que le bloc sait créer, dans l'ordre des puces (jamais Séance). */
export const CAPTURE_TYPES: readonly CaptureEntryType[] = [
  'note',
  'feeling',
  'event',
  'situation',
  'medication',
];

/** Un message sous un champ : texte, et s'il bloque Entrée. */
interface FieldNote {
  text: string;
  blocking: boolean;
}

/** Le fuseau du navigateur : il dit au parseur quel jour civil est « aujourd'hui » (M6-01). */
function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Bloc de saisie structuré du dossier patient (UX-S1, décision du 12 novembre 2026 ; propositions
 * 04b « Le champ de saisie » et 04c « Relier, pas à pas »), posé dans l'emplacement [pmCapture] de
 * l'en-tête à la place de la barre de commande (B5, M6-02), dont il garde le parseur pur, le store et
 * le corps du POST. Une rangée de puces de type (la puce suit la grammaire : « anx 7 » presse
 * Ressenti ; la grammaire suit la puce : Ressenti cliqué montre les champs du ressenti), un champ texte
 * de deux lignes (la grammaire ne lit que la première ligne ; les suivantes sont du texte), les champs
 * du type préremplis et modifiables à la souris, une rangée « Lié à » pour UN lien, un bouton
 * « Enregistrer ↵ » et un lien « Détailler ». Entrée enregistre dans la séance courante, Ctrl+Entrée
 * ouvre l'éditeur prérempli (sortie `openEditor`, lien compris), Ctrl+S enregistre un brouillon,
 * Échap replie les champs en gardant le texte. Les avertissements bloquants et les 422 (`errors[]`)
 * s'affichent sous le champ concerné. Le bloc n'existe qu'en séance (décision du 12 novembre 2026,
 * complément du propriétaire : aucune saisie sans séance ouverte) : le dossier ne le pose dans
 * l'en-tête que lorsqu'une séance est ouverte, et il est alors déplié d'emblée.
 */
@Component({
  selector: 'pm-capture-block',
  imports: [
    ReactiveFormsModule,
    EntryIconComponent,
    StateComponent,
    DateFieldComponent,
    CaptureEmotionFieldComponent,
    CaptureIntensityScaleComponent,
    CaptureWhenFieldComponent,
    CaptureLinksComponent,
  ],
  providers: [CaptureStore],
  templateUrl: './capture-block.component.html',
  styleUrl: './capture-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'onKey($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class CaptureBlockComponent {
  /** Le patient du dossier ouvert. */
  readonly patientId = input.required<string>();
  /** Compteur d'écritures du dossier (PatientShellStore.revision) : rail et vocabulaire se relisent. */
  readonly revision = input(0);

  /** Une entrée a été créée depuis le bloc : le dossier relit ses projections. */
  readonly saved = output<CapturedEntry>();
  /** Ouvrir l'éditeur d'entrée, prérempli (Ctrl+Entrée, Détailler) ou vide (Entrée sur un champ vide). */
  readonly openEditor = output<EntryPrefill | null>();

  protected readonly store = inject(CaptureStore);
  private readonly prefs = inject(PreferencesStore);
  private readonly locale = inject(LOCALE_ID);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly timeZone = browserTimeZone();

  protected readonly types = CAPTURE_TYPES;
  protected readonly inputId = 'pm-capture-input';
  protected readonly alertId = 'pm-capture-alert';
  protected readonly ids = {
    emotion: 'pm-capture-emotion',
    intensity: 'pm-capture-intensity',
    when: 'pm-capture-when',
    until: 'pm-capture-until',
    title: 'pm-capture-title',
    molecule: 'pm-capture-molecule',
    dosage: 'pm-capture-dosage',
    visibility: 'pm-capture-visibility',
    link: 'pm-capture-link',
    text: 'pm-capture-text',
    general: 'pm-capture-general',
  } as const satisfies Record<CaptureSlot, string>;

  /** La saisie (état d'écran). */
  protected readonly text = signal('');
  /** Horloge du parseur, avancée à chaque frappe et avant d'enregistrer. */
  protected readonly now = signal(new Date());
  /** Échap a replié les champs ; la frappe suivante les rouvre. */
  private readonly collapsed = signal(false);
  /** Une tentative d'enregistrement a eu lieu : les champs obligatoires vides se disent. */
  private readonly attempted = signal(false);
  /** Créations du bloc dont la révision du dossier n'est pas encore revenue. */
  private ownWrites = 0;
  /** Message sous le bloc : entrée bloquée, enregistrement refusé. */
  protected readonly alert = signal<string | null>(null);
  protected readonly untilControl = new FormControl<string | null>(null);

  protected readonly hasText = computed(() => this.text().trim().length > 0);
  /** Des choix manuels existent : le bloc compose même sans texte (Ressenti cliqué, émotion choisie). */
  private readonly draftActive = computed(() => {
    const draft = this.store.draft();
    return (
      draft.type !== null || Object.keys(draft.overrides).length > 0 || draft.pickedLink !== null
    );
  });
  protected readonly active = computed(() => this.hasText() || this.draftActive());
  /** Les champs sont visibles, sauf repliés par Échap (ou par un focus discret) jusqu'à la frappe. */
  protected readonly expanded = computed(() => !this.collapsed());

  /** La grammaire ne lit que la première ligne ; les suivantes restent du texte. */
  private readonly firstLine = computed(() => this.text().split(/\r?\n/, 1)[0] ?? '');
  private readonly restLines = computed(() => {
    const index = this.text().search(/\r?\n/);
    return index < 0 ? '' : this.text().slice(index + 1);
  });

  protected readonly emotions = computed<CaptureEmotion[]>(() => this.store.emotions().data ?? []);
  protected readonly candidates = computed(() => this.store.candidates().data ?? []);
  protected readonly linkTypes = computed(() => this.store.linkTypes().data ?? []);
  protected readonly defaultVisibility = computed<CaptureVisibility>(() =>
    this.prefs.defaultVisibility() === 'private' ? 'private' : 'clinical',
  );

  /**
   * La première ligne interprétée, confrontée au vocabulaire et au rail ; null quand les champs sont
   * repliés sans saisie ni choix (dépliés, une saisie vide compose une note vide : les champs sont là).
   */
  protected readonly preview = computed<CapturePreview | null>(() =>
    this.active() || this.expanded() ? this.interpret(false) : null,
  );

  /** L'entrée composée : grammaire + choix manuels (la grammaire suit la puce). */
  protected readonly composed = computed<ComposedEntry | null>(() => {
    const preview = this.preview();
    if (!preview) return null;
    return composeEntry(preview, this.store.draft(), {
      emotions: this.emotions(),
      candidates: this.candidates(),
      linkTypes: this.linkTypes(),
      defaultVisibility: this.defaultVisibility(),
      rest: this.restLines(),
    });
  });

  /** Le type pressé : celui composé, Note sans saisie. */
  protected readonly currentType = computed<CaptureEntryType>(
    () => this.composed()?.type ?? 'note',
  );

  /** « détecté depuis « anx 7 » » quand le type vient de la grammaire, pas d'une puce. */
  protected readonly detectedText = computed(() => {
    const preview = this.preview();
    if (!preview || this.store.draft().type !== null) return null;
    const grammar = detectedGrammar(this.firstLine(), preview.type);
    return grammar ? detectedFromText(grammar) : null;
  });

  /**
   * Trois états du vocabulaire : en erreur, la grammaire ne reconnaît aucune émotion et le champ
   * Émotion n'a pas de liste (état erreur sous le texte, Réessayer) ; en lecture, le champ attend.
   */
  protected readonly emotionState = computed<StateKind | null>(() => {
    const kind = stateKind(this.store.emotions());
    return kind === 'empty' ? null : kind;
  });
  protected readonly vocabularyErrorTitle = $localize`:Vocabulaire illisible dans le bloc de saisie@@capture.preview.errorTitle:Impossible de charger les émotions`;
  protected readonly vocabularyRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryEmotions(),
  };

  /** Trois états du rail (chronologie et catalogue des liens). */
  protected readonly railState = computed<StateKind | null>(() => {
    if (this.store.linkTypes().status === 'error' && !this.store.linkTypes().data) return 'error';
    if (this.store.linkTypes().data === null) return 'loading';
    return stateKind(this.store.candidates());
  });

  /** Erreurs du 422 par emplacement du bloc. */
  private readonly fieldErrors = computed(() => fieldErrorsBySlot(this.store.problem()));

  /** Les messages sous chaque champ : avertissements du parseur, champ obligatoire vide, 422. */
  protected readonly notes = computed<Map<CaptureSlot, FieldNote[]>>(() => {
    const map = new Map<CaptureSlot, FieldNote[]>();
    const add = (slot: CaptureSlot, note: FieldNote): void => {
      const list = map.get(slot) ?? [];
      list.push(note);
      map.set(slot, list);
    };
    const composed = this.composed();
    if (composed) {
      for (const item of composed.warnings) {
        add(item.slot, {
          text: warningText(item.warning, composed.type, this.emotions(), this.locale),
          blocking: item.warning.blocking,
        });
      }
      if (composed.targetIssue) {
        add('link', { text: targetIssueText(composed.targetIssue, composed.type), blocking: true });
      }
      if (this.attempted()) {
        for (const slot of composed.missing) add(slot, { text: missingText(slot), blocking: true });
      }
    }
    for (const [slot, text] of this.fieldErrors()) add(slot, { text, blocking: true });
    return map;
  });

  /** Mot lu devant une intensité, inconnu ou ambigu, à montrer dans le champ Émotion. */
  protected readonly pendingWord = computed(() => {
    const preview = this.preview();
    const composed = this.composed();
    if (!preview || !composed || composed.type !== 'feeling' || composed.emotion) return null;
    return preview.unknownEmotion ?? preview.ambiguous?.word ?? null;
  });
  protected readonly unknownEmotion = computed(() => {
    const preview = this.preview();
    return !!preview?.unknownEmotion && !this.composed()?.emotion;
  });

  protected readonly emotionProblem = computed(() => {
    const problem = this.store.emotionProblem();
    return problem ? emotionProblemText(problem) : null;
  });

  protected readonly canSave = computed(() => {
    const composed = this.composed();
    return !!composed && !composed.blocking && !this.store.saving();
  });

  /** Résumé lu par les lecteurs d'écran (role="status"), après une pause de frappe. */
  protected readonly announcement = signal('');

  protected readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.notes().has('text')) ids.push(`${this.ids.text}-note`);
    if (this.alert()) ids.push(this.alertId);
    return ids.length ? ids.join(' ') : null;
  });

  constructor() {
    // La puce suit la grammaire : chaque lecture du parseur réconcilie le brouillon.
    effect(() => {
      const snapshot = snapshotOf(this.preview());
      untracked(() => this.store.applyParsed(snapshot));
    });
    // Résumé pour les lecteurs d'écran : après 500 ms sans frappe, ou tout de suite quand la saisie
    // devient (ou cesse d'être) bloquée.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasBlocking = false;
    effect(() => {
      const composed = this.expanded() ? this.composed() : null;
      const summary = composed ? composedSummary(composed) : '';
      const blocking = !!composed?.blocking;
      clearTimeout(timer);
      if (blocking !== wasBlocking || !summary) {
        wasBlocking = blocking;
        this.announcement.set(summary);
      } else {
        timer = setTimeout(() => this.announcement.set(summary), ANNOUNCE_DELAY_MS);
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    // Le champ « Jusqu'à » d'une situation suit la valeur composée.
    effect(() => {
      const until = this.composed()?.until ?? null;
      untracked(() => {
        if (this.untilControl.value !== until)
          this.untilControl.setValue(until, { emitEvent: false });
      });
    });
    this.untilControl.valueChanges.subscribe((value) => this.store.setField('until', value));
    // Une écriture ailleurs dans le dossier : rail et vocabulaire se relisent à la prochaine saisie.
    // La révision que le bloc provoque lui-même (sortie `saved`) ne compte pas : le store a déjà
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
    // Le bloc est déplié d'emblée : vocabulaire et rail se lisent sans attendre la première frappe.
    effect(() => {
      const patientId = this.patientId();
      untracked(() => void this.store.prepare(patientId));
    });
  }

  /**
   * Donne le focus au champ après le prochain rendu (Démarrer, Clôturer, après un enregistrement).
   * `quiet` : les champs restent repliés jusqu'à la première frappe (arrivée sur un dossier créé :
   * ils ne recouvrent pas l'indice « Dernière étape » du dossier, M7-04).
   */
  focus(options: { quiet?: boolean } = {}): void {
    afterNextRender(
      () => {
        this.field()?.focus();
        if (options.quiet) this.collapsed.set(true);
      },
      { injector: this.injector },
    );
  }

  /** Vide le bloc (son texte est parti dans une entrée ou dans le brouillon de l'éditeur). */
  clear(): void {
    this.text.set('');
    this.attempted.set(false);
    this.alert.set(null);
    this.store.clearDraft();
    this.store.clearProblem();
    this.store.clearEmotionProblem();
    // Le champ peut avoir été rempli sans rendu intermédiaire : on vide aussi sa valeur DOM.
    const field = this.field();
    if (field) {
      field.value = '';
      field.style.height = '';
    }
  }

  protected onInput(field: HTMLTextAreaElement): void {
    this.text.set(field.value);
    this.now.set(new Date());
    this.collapsed.set(false);
    this.alert.set(null);
    this.grow(field);
    void this.store.prepare(this.patientId());
  }

  protected onFocusIn(): void {
    void this.store.prepare(this.patientId());
  }

  /** Le focus quitte le bloc : des champs repliés par Échap reviennent pour la prochaine visite. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    this.collapsed.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    // Composition en cours (accents, IME) : la touche appartient à la saisie.
    if (event.isComposing || event.keyCode === 229) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const modifier = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') {
      if (this.expanded()) {
        event.preventDefault();
        this.collapsed.set(true);
      }
      return;
    }
    if (event.key === 'Enter' && !event.altKey && !event.shiftKey) {
      // Les boutons, les listes, la recherche, la proposition d'émotion gardent leur Entrée.
      const tag = target?.tagName;
      const own =
        tag === 'BUTTON' ||
        tag === 'SELECT' ||
        tag === 'A' ||
        target?.getAttribute('role') === 'combobox' ||
        target?.getAttribute('type') === 'search' ||
        !!target?.closest('pm-emotion-proposal, pm-date-field, pm-month-field');
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

  // Puces et champs ---------------------------------------------------------------------------------

  protected typeLabel(type: CaptureEntryType): string {
    return entryTypeLabel(type);
  }

  protected chooseType(type: CaptureEntryType): void {
    this.alert.set(null);
    this.store.chooseType(type);
    void this.store.prepare(this.patientId());
  }

  protected setEmotion(code: string): void {
    this.store.setField('emotionCode', code);
  }

  protected setIntensity(value: number): void {
    this.store.setField('intensity', value);
  }

  protected setWhen(when: ParsedOccurred | null): void {
    this.store.setField('when', when);
  }

  protected setVisibility(value: string): void {
    this.store.setField('visibility', value === 'private' ? 'private' : 'clinical');
  }

  protected setTitle(value: string): void {
    this.store.setField('title', value);
  }

  protected setMolecule(value: string): void {
    this.store.setField('molecule', value);
  }

  protected setDosage(value: string): void {
    this.store.setField('dosage', value);
  }

  protected setOngoing(checked: boolean): void {
    this.store.setField('ongoing', checked);
  }

  protected notesFor(slot: CaptureSlot): FieldNote[] {
    return this.notes().get(slot) ?? [];
  }

  protected invalid(slot: CaptureSlot): boolean {
    return this.notesFor(slot).some((note) => note.blocking);
  }

  protected noteId(slot: CaptureSlot): string | null {
    return this.notesFor(slot).length > 0 ? `${this.ids[slot]}-note` : null;
  }

  // Liens --------------------------------------------------------------------------------------------

  protected toggleLink(event: { candidate: LinkCandidate; choice: LinkChoice }): void {
    this.alert.set(null);
    this.store.toggleLink(event.candidate.id, event.choice, this.targetId());
  }

  protected chooseVerb(choice: LinkChoice): void {
    const link = this.composed()?.link;
    if (link) this.store.chooseVerb(link.candidate.id, choice);
  }

  protected pickOther(event: { candidate: LinkCandidate; choice: LinkChoice }): void {
    this.alert.set(null);
    this.store.pickOther(event.candidate, event.choice);
  }

  protected searchOther(query: string): void {
    if (!query.trim()) this.store.clearSearch();
    else void this.store.searchEntries(query);
  }

  /** Crée l'émotion inconnue (POST /api/me/emotions) : la saisie est aussitôt réinterprétée. */
  protected async createEmotion(request: EmotionRequest): Promise<void> {
    const emotion = await this.store.createEmotion(request.label, request.family);
    if (!emotion) return;
    // Émotion tapée dans la liste (pas lue par la grammaire) : elle devient celle du ressenti.
    if (!this.preview()?.unknownEmotion) this.store.setField('emotionCode', emotion.code);
    const label = emotion.label;
    this.toast.success(
      $localize`:Toast après la création d'une émotion depuis le bloc@@capture.emotion.created:Émotion « ${label}:label: » créée.`,
    );
    this.focus();
  }

  // Enregistrer, Détailler ----------------------------------------------------------------------

  /** Entrée (final) ou Ctrl+S (brouillon) : POST dans la séance courante. */
  protected async submit(status: 'final' | 'draft'): Promise<void> {
    if (this.store.saving()) return;
    if (!this.active()) {
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
        $localize`:Erreur du bloc de saisie@@capture.error.vocabulary:Les émotions n'ont pas pu être chargées : réessayez, ou ouvrez l'éditeur (Ctrl+Entrée).`,
      );
      return;
    }
    // Au moment d'enregistrer, un rail toujours illisible rend la cible du `>` indisponible.
    const preview = this.interpret(true);
    const composed = composeEntry(preview, this.store.draft(), {
      emotions: this.emotions(),
      candidates: this.candidates(),
      linkTypes: this.linkTypes(),
      defaultVisibility: this.defaultVisibility(),
      rest: this.restLines(),
    });
    this.attempted.set(true);
    const reason = this.blockingReason(composed);
    if (reason) {
      this.alert.set(
        $localize`:Entrée bloquée par un avertissement du bloc de saisie@@capture.blocked:Rien n'est enregistré. ${reason}:reason:`,
      );
      return;
    }
    // La saisie envoyée : si elle change pendant l'enregistrement, le bloc la garde.
    const sent = this.text();
    const saved = await this.store.save(patientId, composed.prefill, status, composed.visibility);
    if (!saved) {
      const problem = this.store.problem();
      if (problem) {
        const placed = [...this.fieldErrors().keys()].some((slot) => slot !== 'general');
        this.alert.set(placed ? savedNothingText() : saveProblemText(problem));
      }
      return;
    }
    this.toast.success(
      status === 'draft'
        ? $localize`:Toast après un brouillon depuis le bloc@@capture.saved.draft:Brouillon enregistré.`
        : $localize`:Toast après une création depuis le bloc@@capture.saved.create:Entrée enregistrée.`,
    );
    if (this.text() === sent) this.clear();
    if (saved.id) this.ownWrites++;
    this.saved.emit(saved);
    this.focus();
  }

  /**
   * Ctrl+Entrée ou « Détailler » : l'éditeur d'entrée, prérempli avec ce que le bloc a composé, lien
   * compris (sans attendre une lecture en cours : l'éditeur laisse tout corriger).
   */
  protected refine(): void {
    if (this.store.saving()) return;
    const composed = this.composed();
    if (!composed) {
      this.openEditor.emit(null);
      return;
    }
    this.now.set(new Date());
    this.openEditor.emit(this.composed()?.prefill ?? null);
  }

  /** La cible du `>` trouvée dans le rail, pour la rangée « Lié à ». */
  protected targetId(): string | null {
    return this.preview()?.target?.candidate.id ?? null;
  }

  protected targetQuery(): string | null {
    const query = this.preview()?.target ? this.lastTargetQuery() : null;
    return query || null;
  }

  private lastTargetQuery(): string {
    const line = this.firstLine();
    const index = line.lastIndexOf('>');
    return index < 0 ? '' : line.slice(index + 1).trim();
  }

  /**
   * Interprète la première ligne. Rail en cours de lecture : la cible du `>` n'est ni trouvée ni
   * manquante, sauf au moment d'enregistrer (`saving`) où elle est indisponible, comme après un échec.
   */
  private interpret(saving: boolean): CapturePreview {
    const emotions = this.emotions();
    const result = parse(this.firstLine(), {
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

  /** Le premier point bloquant, en texte ; null si Entrée peut enregistrer. */
  private blockingReason(composed: ComposedEntry): string | null {
    const missing = composed.missing[0];
    if (missing) return missingText(missing);
    const warning = composed.warnings.find((item) => item.warning.blocking);
    if (warning) return warningText(warning.warning, composed.type, this.emotions(), this.locale);
    return composed.targetIssue ? targetIssueText(composed.targetIssue, composed.type) : null;
  }

  /** Le champ grandit avec son texte (deux lignes au moins déplié, une repliée). */
  private grow(field: HTMLTextAreaElement): void {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }

  private field(): HTMLTextAreaElement | null {
    return this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#${this.inputId}`);
  }
}
