import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { applyProblem, fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { SidePanelComponent, StateAction, StateComponent } from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { composeSummary } from '../data/next-time';
import {
  CLOSE_DURATION_MAX,
  CLOSE_DURATION_MIN,
  CloseDraft,
  elapsedMinutes,
  proposedDuration,
} from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import { NotedEntriesComponent } from '../ui/noted-entries.component';
import { closePanelSubtitle, sessionProblemText } from '../ui/shell-labels';

/**
 * Ce que la page du shell donne au panneau : le store du dossier (fourni par la page, hors de
 * portée de l'injecteur racine du panneau latéral) et le seuil « non clôturée » (3 h, UX-A8 :
 * au-delà, la durée proposée est la durée prévue plutôt que le temps écoulé ; même valeur que
 * UNCLOSED_SESSION_AFTER_MIN de l'en-tête partagé, passée pour ne pas la dupliquer).
 */
export interface CloseSessionPanelData {
  store: PatientShellStore;
  unclosedAfterMin: number;
}

/**
 * Issue du panneau : clôturée (on reste sur le dossier), clôturée et retour à la liste, ou déjà
 * changée ailleurs (409, l'en-tête a été relu).
 */
export type CloseSessionResult = 'closed' | 'closed-list' | 'conflict';

function durationRange(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return /^\d+$/.test(raw) && value >= CLOSE_DURATION_MIN && value <= CLOSE_DURATION_MAX
    ? null
    : { durationRange: true };
}

/** Titres que les invites insèrent dans le compte rendu (04b, état 5 : « insère un titre, rien de plus »). */
const PROMPTS = {
  theme: () =>
    $localize`:Titre inséré dans le compte rendu@@patientShell.close.prompt.theme:Thème :`,
  goal: () =>
    $localize`:Titre inséré dans le compte rendu@@patientShell.close.prompt.goal:Objectif :`,
} as const;

/**
 * Panneau de clôture (UX-S3, propositions 04 « part 2 » et 04b état 5) : 520 px, le motif maison
 * (fiche 00 §6) à la place du dialogue. Durée proposée depuis l'horloge (temps écoulé arrondi à
 * 5 min ; la durée habituelle en un clic), les entrées notées en séance sous les yeux pendant que
 * le compte rendu s'écrit, deux invites qui insèrent un titre, « Prochaine fois » en courtes lignes
 * qui deviennent les dernières lignes du compte rendu (convention, pas de champ). Deux fins :
 * « Clôturer la séance » et « Clôturer et revenir à la liste ». Échap ou le voile gardent le
 * brouillon dans le store ; 422 → message sous le champ ; 409 → le panneau se ferme, l'en-tête est
 * relu. POST /api/sessions/{id}/close par le PatientShellStore, même corps qu'avant.
 */
@Component({
  selector: 'pm-close-session-panel',
  imports: [
    FieldErrorsComponent,
    NotedEntriesComponent,
    ReactiveFormsModule,
    SidePanelComponent,
    StateComponent,
  ],
  templateUrl: './close-session.panel.html',
  styleUrl: './close-session.panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloseSessionPanel {
  private readonly data = inject<CloseSessionPanelData>(DIALOG_DATA);
  protected readonly store = this.data.store;
  private readonly ref = inject<DialogRef<CloseSessionResult, CloseSessionPanel>>(DialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly locale = inject(LOCALE_ID);

  private readonly now = new Date();
  private readonly session = this.store.currentSession();
  /** Le brouillon gardé par Échap, s'il parle de cette séance. */
  private readonly draft: CloseDraft | null =
    this.store.closeDraft()?.sessionId === this.session?.id ? this.store.closeDraft() : null;

  /** Temps écoulé à l'ouverture (la proposition ne bouge pas sous la main). */
  protected readonly elapsed = this.session ? elapsedMinutes(this.session.startedAt, this.now) : 0;
  protected readonly planned = this.store.plannedDurationMin();
  protected readonly proposed = proposedDuration(
    this.elapsed,
    this.planned,
    this.data.unclosedAfterMin,
  );
  /** Passé le seuil « non clôturée », la durée proposée est la durée prévue, pas l'écoulé. */
  protected readonly fromPlanned = this.elapsed > this.data.unclosedAfterMin;

  protected readonly title = $localize`:Titre du panneau de clôture@@patientShell.close.title:Clôturer la séance`;
  protected readonly subtitle = this.session
    ? closePanelSubtitle(
        this.store.patient()?.displayName ?? '',
        this.session.startedAt,
        this.session.modality,
        this.locale,
        this.now,
      )
    : null;

  protected readonly form = new FormGroup({
    durationMin: new FormControl(this.draft?.durationMin ?? String(this.proposed), {
      nonNullable: true,
      validators: [Validators.required, durationRange],
    }),
    summary: new FormControl(this.draft?.summary ?? '', { nonNullable: true }),
  });
  /** Lignes « Prochaine fois » (une par ligne), plus une ligne vide à remplir. */
  protected readonly nextTime = signal<string[]>(this.draft?.nextTime ?? []);
  protected readonly newLine = signal('');

  protected readonly fid = fieldId;
  protected readonly durationEvents = toSignal(this.form.controls.durationMin.events);
  /** Message de la règle de durée côté client (le serveur reste juge : son 422 passe avant). */
  protected readonly rangeError = computed(() => {
    this.durationEvents();
    const control = this.form.controls.durationMin;
    return control.hasError('durationRange') && (control.touched || control.dirty);
  });
  /** Problème sans champ (5xx, réseau) : affiché en tête du panneau. */
  protected readonly generalError = signal('');

  /** Trois états des entrées notées (lues par le store tant que la séance est ouverte). */
  protected readonly notedState = computed<StateKind | null>(() => stateKind(this.store.noted()));
  protected readonly noted = computed(() => this.store.noted().data ?? []);
  protected readonly notedCount = computed(() => this.store.notedCount());
  protected readonly notedRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.refreshNoted(),
  };
  protected readonly notedErrorTitle = $localize`:Erreur du bloc noté en séance du panneau@@patientShell.close.notedError:Impossible de lire ce qui a été noté`;
  protected readonly emotionLabels = computed(() => this.store.context().data?.emotionLabels ?? {});

  /** « 50 habituels » : la durée prévue, quand elle diffère de la proposition. */
  protected readonly usualOffered = this.planned !== this.proposed;

  private closedWith: CloseSessionResult | null = null;

  constructor() {
    // Fermé sans clôturer (Échap, voile, croix, Annuler) : le brouillon reste au store.
    inject(DestroyRef).onDestroy(() => {
      if (this.closedWith || !this.session) return;
      const { durationMin, summary } = this.form.getRawValue();
      const nextTime = this.lines();
      const untouched =
        durationMin === String(this.proposed) && !summary.trim() && nextTime.length === 0;
      this.store.keepCloseDraft(
        untouched ? null : { sessionId: this.session.id, durationMin, summary, nextTime },
      );
    });
  }

  protected useUsual(): void {
    this.form.controls.durationMin.setValue(String(this.planned));
    this.form.controls.durationMin.markAsDirty();
  }

  /** Insère « Thème : » ou « Objectif : » à la fin du texte, sur un nouveau paragraphe. */
  protected insert(prompt: keyof typeof PROMPTS): void {
    const control = this.form.controls.summary;
    const current = control.value.trimEnd();
    control.setValue(current ? `${current}\n\n${PROMPTS[prompt]()} ` : `${PROMPTS[prompt]()} `);
    control.markAsDirty();
    const area = this.host.nativeElement.querySelector<HTMLTextAreaElement>(
      `#${fieldId('summary')}`,
    );
    if (area) {
      area.focus();
      const end = control.value.length;
      area.setSelectionRange(end, end);
    }
  }

  protected setLine(index: number, value: string): void {
    this.nextTime.update((list) => list.map((line, i) => (i === index ? value : line)));
  }

  protected removeLine(index: number): void {
    this.nextTime.update((list) => list.filter((_, i) => i !== index));
  }

  /** Entrée dans « Ajouter une ligne… » : la ligne rejoint la liste, le champ se vide. */
  protected addLine(): void {
    const value = this.newLine().trim();
    if (!value) return;
    this.nextTime.update((list) => [...list, value]);
    this.newLine.set('');
  }

  /** Les lignes non vides, celle en cours de saisie comprise. */
  private lines(): string[] {
    const pending = this.newLine().trim();
    return [...this.nextTime(), ...(pending ? [pending] : [])]
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  protected async submit(andList = false): Promise<void> {
    if (this.store.busy()) return;
    this.generalError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focus('durationMin');
      return;
    }
    const { durationMin, summary } = this.form.getRawValue();
    const ok = await this.store.closeSession({
      durationMin: Number(durationMin),
      summary: composeSummary(summary, this.lines()),
    });
    if (ok) {
      this.closedWith = andList ? 'closed-list' : 'closed';
      this.ref.close(this.closedWith);
      return;
    }
    const problem = this.store.actionProblem();
    if (problem?.status === 409) {
      this.closedWith = 'conflict';
      this.ref.close('conflict');
      return;
    }
    const { applied } = applyProblem(this.form, problem);
    if (applied.length > 0) this.focus(applied[0].field);
    else this.generalError.set(sessionProblemText(problem));
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  private focus(field: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`#${fieldId(field)}`)?.focus();
  }
}
