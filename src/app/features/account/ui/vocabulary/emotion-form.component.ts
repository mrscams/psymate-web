import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../../core/http';
import { applyProblem, FieldErrorsComponent, SERVER_ERROR } from '../../../../shared/forms';
import { Emotion, EMOTION_FAMILIES, EmotionFamily } from '../../data/emotions.api';
import { emotionProblemMessage } from './vocabulary-messages';
import { closestEmotion, familyColor, familyLabel } from './vocabulary-labels';

/** Enregistre l'émotion ; renvoie null si c'est fait, sinon le problème du serveur. */
export type CreateEmotionFn = (
  labelFr: string,
  family: EmotionFamily,
) => Promise<ApiProblem | null>;

/**
 * Carte « Ajouter une émotion » (fiche 17, structure 3) : libellé avec avertissement de proximité
 * (aide à la saisie, jamais bloquante), famille en radios réels avec pastille, bouton d'ajout.
 * Le libellé anglais, la valence et l'activation de la maquette n'existent pas dans le contrat
 * (CreateEmotionRequest : labelFr, family) : ils ne sont pas proposés.
 */
@Component({
  selector: 'pm-emotion-form',
  imports: [ReactiveFormsModule, MatButtonModule, FieldErrorsComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate aria-labelledby="h-add-emotion">
      <h2 id="h-add-emotion" i18n="Titre de la carte d'ajout d'émotion@@vocabulary.add.title">
        Ajouter une émotion
      </h2>

      <div class="field">
        <label for="field-labelFr">
          <span i18n="Libellé du champ libellé d'émotion@@vocabulary.add.label">Libellé</span>
          <span class="required" aria-hidden="true">*</span>
        </label>
        <input
          id="field-labelFr"
          type="text"
          formControlName="labelFr"
          autocomplete="off"
          required
          maxlength="80"
          [attr.aria-invalid]="showError('labelFr')"
          [attr.aria-describedby]="describedBy()"
        />
        <pm-field-errors
          [control]="form.controls.labelFr"
          id="field-labelFr-error"
          [force]="submitted()"
        />
        @if (near(); as near) {
          <p class="proximity" id="field-labelFr-near">
            <span class="sign" aria-hidden="true">⚠</span>
            @if (near.scope === 'global') {
              <span i18n="Avertissement de proximité, émotion globale@@vocabulary.add.nearGlobal"
                >Proche de « {{ near.labelFr }} » (vocabulaire global). Vérifiez que ce n'est pas la
                même chose.</span
              >
            } @else {
              <span
                i18n="Avertissement de proximité, émotion personnelle@@vocabulary.add.nearCustom"
                >Proche de « {{ near.labelFr }} » (vos émotions). Vérifiez que ce n'est pas la même
                chose.</span
              >
            }
          </p>
        }
      </div>

      <fieldset
        class="families"
        [attr.aria-invalid]="showError('family')"
        aria-describedby="field-family-error"
      >
        <legend>
          <span i18n="Légende des familles@@vocabulary.add.family">Famille</span>
          <span class="required" aria-hidden="true">*</span>
          <span class="hint" i18n="Aide de la famille@@vocabulary.add.familyHint">
            · détermine la couleur des courbes et la place dans le graphe</span
          >
        </legend>
        <div class="grid">
          @for (family of families; track family) {
            <label class="family" [class.checked]="form.controls.family.value === family">
              <input type="radio" formControlName="family" [value]="family" />
              <span class="dot" [style.background]="color(family)" aria-hidden="true"></span>
              <span>{{ label(family) }}</span>
            </label>
          }
        </div>
        <pm-field-errors
          [control]="form.controls.family"
          id="field-family-error"
          [force]="submitted()"
        />
      </fieldset>

      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">
          <span i18n="Bouton d'ajout d'émotion@@vocabulary.add.submit"
            >Ajouter à mon vocabulaire</span
          >
        </button>
        <p class="muted" i18n="Mention de visibilité d'une émotion@@vocabulary.add.visibility">
          Visible de vous seul·e ; proposée dans la saisie des ressentis dès la prochaine entrée.
        </p>
      </div>
      @if (failed()) {
        <p class="error" role="alert" i18n="Échec de l'ajout d'émotion@@vocabulary.add.failed">
          L'émotion n'a pas été ajoutée. Vérifiez la connexion puis réessayez.
        </p>
      }
    </form>
  `,
  styleUrl: './vocabulary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmotionFormComponent {
  /** Toutes les émotions actives (globales et personnalisées), pour l'avertissement de proximité. */
  readonly emotions = input<readonly Emotion[]>([]);
  readonly busy = input(false);
  readonly save = input.required<CreateEmotionFn>();

  protected readonly families = EMOTION_FAMILIES;
  protected readonly label = familyLabel;
  protected readonly color = familyColor;
  protected readonly submitted = signal(false);
  /** Échec sans champ fautif (réseau, 500) : message sous le bouton, la saisie reste. */
  protected readonly failed = signal(false);

  protected readonly form = new FormGroup({
    labelFr: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    family: new FormControl<EmotionFamily | null>(null, [Validators.required]),
  });

  private readonly labelValue = toSignal(this.form.controls.labelFr.valueChanges, {
    initialValue: '',
  });

  protected readonly near = computed(() => closestEmotion(this.labelValue(), this.emotions()));

  protected readonly describedBy = computed(() =>
    ['field-labelFr-error', this.near() ? 'field-labelFr-near' : null].filter(Boolean).join(' '),
  );

  protected showError(name: 'labelFr' | 'family'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.failed.set(false);
    const { labelFr, family } = this.form.getRawValue();
    if (!labelFr.trim()) this.form.controls.labelFr.setErrors({ required: true });
    if (this.form.invalid || !family) {
      this.form.markAllAsTouched();
      return;
    }
    const problem = await this.save()(labelFr, family);
    if (!problem) {
      this.form.reset({ labelFr: '', family: null });
      this.submitted.set(false);
      return;
    }
    this.applyServerError(problem);
  }

  /** 409 EMOTION_LABEL_EXISTS → sous le libellé ; 422 → champs du contrat. */
  private applyServerError(problem: ApiProblem): void {
    if (problem.code === 'EMOTION_LABEL_EXISTS') {
      const control = this.form.controls.labelFr;
      control.setErrors({ [SERVER_ERROR]: emotionProblemMessage(problem) });
      control.markAsTouched();
      return;
    }
    if (applyProblem(this.form, problem).applied.length === 0) this.failed.set(true);
  }
}
