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
 * Drapeaux de la fiche 16 (proposition 16, `.flagcards`) : trois cartes compactes, une par nature ;
 * libellé et aide à gauche, vraie case à cocher à droite dans un label englobant. Une carte cochée
 * d'un drapeau déjà posé dit sa date (« Posé le 3 oct. 2026 ») ; « à surveiller » coché porte sa
 * raison dans la carte, qui grandit. L'aide de « risque » rappelle que les éléments se notent dans
 * la timeline. Reçoit le sous-groupe du formulaire de la page ; aucune donnée serveur ici.
 */
@Component({
  selector: 'pm-flag-fields',
  imports: [ReactiveFormsModule, FieldErrorsComponent],
  template: `
    <div class="flagcards" [formGroup]="group()">
      <div class="flagcard watch" [class.on]="flags()?.watch">
        <label class="head">
          <span class="name" id="flag-watch-name">{{ text.watch }}</span>
          <input
            type="checkbox"
            formControlName="watch"
            aria-labelledby="flag-watch-name"
            aria-describedby="flag-watch-help"
          />
          @if (flags()?.watch && setAtText('watch'); as date) {
            <span class="d" id="flag-watch-help">{{ date }}</span>
          } @else {
            <span
              class="d"
              id="flag-watch-help"
              i18n="Aide du drapeau à surveiller@@patients.form.flag.watch.help"
              >Avec une raison, visible dans l'en-tête et la liste.</span
            >
          }
        </label>
        @if (flags()?.watch) {
          <div class="reason">
            <label [for]="reasonId"
              ><span i18n="Libellé court de la raison@@patients.form.flag.reasonShort">Raison</span
              >{{ ' '
              }}<span
                class="sr-only"
                i18n="Fin du libellé de la raison@@patients.form.flag.reasonEnd"
                >du drapeau « à surveiller »</span
              ></label
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
      </div>
      <div class="flagcard risk" [class.on]="flags()?.risk">
        <label class="head">
          <span class="name" id="flag-risk-name">{{ text.risk }}</span>
          <input
            type="checkbox"
            formControlName="risk"
            aria-labelledby="flag-risk-name"
            aria-describedby="flag-risk-help"
          />
          @if (flags()?.risk && setAtText('risk'); as date) {
            <span class="d" id="flag-risk-help">{{ date }}</span>
          } @else {
            <span
              class="d"
              id="flag-risk-help"
              i18n="Aide du drapeau risque@@patients.form.flag.risk.help"
              >Idées suicidaires, mise en danger. Les éléments se notent dans la timeline, en note
              privée.</span
            >
          }
        </label>
      </div>
      <div class="flagcard shared" [class.on]="flags()?.sharedCare">
        <label class="head">
          <span class="name" id="flag-shared-name">{{ text.sharedCare }}</span>
          <input
            type="checkbox"
            formControlName="sharedCare"
            aria-labelledby="flag-shared-name"
            aria-describedby="flag-shared-help"
          />
          @if (flags()?.sharedCare && setAtText('shared_care'); as date) {
            <span class="d" id="flag-shared-help">{{ date }}</span>
          } @else {
            <span
              class="d"
              id="flag-shared-help"
              i18n="Aide du drapeau suivi conjoint@@patients.form.flag.shared.help"
              >Suivi partagé avec un autre professionnel.</span
            >
          }
        </label>
      </div>
    </div>
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
