import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { flagLabel } from './patient-labels';

/** Groupe « flags » du formulaire de la fiche 16. */
export type FlagsGroup = FormGroup<{
  watch: FormControl<boolean>;
  watchReason: FormControl<string>;
  risk: FormControl<boolean>;
  sharedCare: FormControl<boolean>;
}>;

/**
 * Drapeaux de la fiche 16 : trois cartes-cases (vraies cases à cocher dans un label englobant),
 * « Raison du drapeau » quand « à surveiller » est coché, rappel quand « risque » est coché.
 * Reçoit le sous-groupe du formulaire de la page ; aucune donnée serveur ici.
 */
@Component({
  selector: 'pm-flag-fields',
  imports: [ReactiveFormsModule, FieldErrorsComponent],
  template: `
    <div class="flag-cards" [formGroup]="group()">
      <label class="flag-card watch" [class.checked]="flags()?.watch">
        <input type="checkbox" formControlName="watch" />
        <span class="flag-name">{{ text.watch }}</span>
        <span class="flag-help" i18n="Aide du drapeau à surveiller@@patients.form.flag.watch.help"
          >Avec une raison, visible dans l'en-tête et la liste.</span
        >
      </label>
      <label class="flag-card risk" [class.checked]="flags()?.risk">
        <input type="checkbox" formControlName="risk" />
        <span class="flag-name">{{ text.risk }}</span>
        <span class="flag-help" i18n="Aide du drapeau risque@@patients.form.flag.risk.help"
          >Idées suicidaires, mise en danger.</span
        >
      </label>
      <label class="flag-card shared" [class.checked]="flags()?.sharedCare">
        <input type="checkbox" formControlName="sharedCare" />
        <span class="flag-name">{{ text.sharedCare }}</span>
        <span
          class="flag-help"
          i18n="Aide du drapeau suivi conjoint@@patients.form.flag.shared.help"
          >Suivi partagé avec un autre professionnel.</span
        >
      </label>
    </div>
    @if (flags()?.watch) {
      <div class="field" [formGroup]="group()">
        <label [for]="reasonId" i18n="Champ de la fiche patient@@patients.field.watchReason"
          >Raison du drapeau</label
        >
        <textarea
          [id]="reasonId"
          rows="2"
          formControlName="watchReason"
          required
          [attr.aria-invalid]="invalid(group().controls.watchReason)"
          [attr.aria-describedby]="reasonId + '-error'"
        ></textarea>
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

  protected readonly reasonId = fieldId('flags.watchReason');
  protected readonly text = {
    watch: flagLabel('watch'),
    risk: flagLabel('risk'),
    sharedCare: flagLabel('shared_care'),
  };

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }
}
