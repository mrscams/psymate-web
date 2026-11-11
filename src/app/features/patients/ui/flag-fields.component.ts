import { ChangeDetectionStrategy, Component, inject, input, LOCALE_ID } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { formatDate } from '../../../core/i18n';
import { fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { FlagKind } from '../data/patient.model';
import { flagLabel } from './patient-labels';

/** Groupe « flags » du formulaire de la fiche 16. */
export type FlagsGroup = FormGroup<{
  watch: FormControl<boolean>;
  watchReason: FormControl<string>;
  risk: FormControl<boolean>;
  sharedCare: FormControl<boolean>;
}>;

/**
 * Drapeaux de la fiche 16 (maquette 16) : trois cartes-cases, libellé et aide à gauche, vraie case
 * à cocher à droite dans un label englobant ; une carte cochée d'un drapeau déjà posé dit sa date
 * (« Posé le 3 oct. »). « Raison du drapeau « à surveiller » » quand « à surveiller » est coché,
 * rappel quand « risque » est coché. Reçoit le sous-groupe du formulaire de la page ; aucune donnée
 * serveur ici.
 */
@Component({
  selector: 'pm-flag-fields',
  imports: [ReactiveFormsModule, FieldErrorsComponent],
  template: `
    <div class="flag-cards" [formGroup]="group()">
      <label class="flag-card watch" [class.checked]="flags()?.watch">
        <span class="flag-name" id="flag-watch-name">{{ text.watch }}</span>
        <input
          type="checkbox"
          formControlName="watch"
          aria-labelledby="flag-watch-name"
          aria-describedby="flag-watch-help"
        />
        @if (flags()?.watch && setAtText('watch'); as date) {
          <span class="flag-help" id="flag-watch-help">{{ date }}</span>
        } @else {
          <span
            class="flag-help"
            id="flag-watch-help"
            i18n="Aide du drapeau à surveiller@@patients.form.flag.watch.help"
            >Avec une raison, visible dans l'en-tête et la liste.</span
          >
        }
      </label>
      <label class="flag-card risk" [class.checked]="flags()?.risk">
        <span class="flag-name" id="flag-risk-name">{{ text.risk }}</span>
        <input
          type="checkbox"
          formControlName="risk"
          aria-labelledby="flag-risk-name"
          aria-describedby="flag-risk-help"
        />
        @if (flags()?.risk && setAtText('risk'); as date) {
          <span class="flag-help" id="flag-risk-help">{{ date }}</span>
        } @else {
          <span
            class="flag-help"
            id="flag-risk-help"
            i18n="Aide du drapeau risque@@patients.form.flag.risk.help"
            >Idées suicidaires, mise en danger.</span
          >
        }
      </label>
      <label class="flag-card shared" [class.checked]="flags()?.sharedCare">
        <span class="flag-name" id="flag-shared-name">{{ text.sharedCare }}</span>
        <input
          type="checkbox"
          formControlName="sharedCare"
          aria-labelledby="flag-shared-name"
          aria-describedby="flag-shared-help"
        />
        @if (flags()?.sharedCare && setAtText('shared_care'); as date) {
          <span class="flag-help" id="flag-shared-help">{{ date }}</span>
        } @else {
          <span
            class="flag-help"
            id="flag-shared-help"
            i18n="Aide du drapeau suivi conjoint@@patients.form.flag.shared.help"
            >Suivi partagé avec un autre professionnel.</span
          >
        }
      </label>
    </div>
    @if (flags()?.watch) {
      <div class="field" [formGroup]="group()">
        <label
          [for]="reasonId"
          i18n="Champ raison de la fiche patient@@patients.form.flag.reasonLabel"
          >Raison du drapeau « à surveiller »</label
        >
        <input
          [id]="reasonId"
          type="text"
          formControlName="watchReason"
          autocomplete="off"
          required
          [attr.aria-invalid]="invalid(group().controls.watchReason)"
          [attr.aria-describedby]="reasonId + '-error'"
        />
        <pm-field-errors [control]="group().controls.watchReason" [id]="reasonId + '-error'" />
      </div>
    }
    @if (flags()?.risk) {
      <p
        class="reminder"
        role="note"
        i18n="Rappel du drapeau risque@@patients.form.flag.risk.reminder"
      >
        Les éléments de risque se notent dans la timeline (note privée).
      </p>
    }
  `,
  styleUrl: './flag-fields.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlagFieldsComponent {
  readonly group = input.required<FlagsGroup>();
  /** Valeur courante du groupe (signal du formulaire de la page). */
  readonly flags = input<Partial<{ watch: boolean; risk: boolean; sharedCare: boolean }>>();
  /** Date de pose des drapeaux actifs de la fiche lue (ISO), absente à la création. */
  readonly setAt = input<Partial<Record<FlagKind, string | null>>>({});

  private readonly locale = inject(LOCALE_ID);
  protected readonly reasonId = fieldId('flags.watchReason');
  protected readonly text = {
    watch: flagLabel('watch'),
    risk: flagLabel('risk'),
    sharedCare: flagLabel('shared_care'),
  };

  /** « Posé le 3 oct. 2026 » pour un drapeau déjà enregistré, sinon null. */
  protected setAtText(kind: FlagKind): string | null {
    const at = this.setAt()[kind];
    if (!at) return null;
    const date = formatDate(at, this.locale, 'medium');
    return $localize`:Date de pose d'un drapeau@@patients.form.flag.setAt:Posé le ${date}:date:`;
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }
}
