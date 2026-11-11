import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../core/http';
import { clearServerErrors, FieldErrorsComponent, fieldId } from '../../../shared/forms';
import { EditableKind, VocabularyCreateInput } from '../data/admin.model';
import { applyVocabularyProblem, CODE_PATTERN, LABEL_MAX } from './vocabulary-forms';

/**
 * « Ajouter une spécialité / un public » (fiche 28) : code, libellé FR, libellé EN facultatif,
 * bouton cobalt, rappel des règles de format. 409 VOCABULARY_EXISTS sous le champ code, 422 champ
 * par champ ; le formulaire est conservé en cas d'erreur et vidé après un ajout.
 */
@Component({
  selector: 'pm-add-entry-form',
  imports: [ReactiveFormsModule, MatButtonModule, FieldErrorsComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2>{{ title() }}</h2>
      <div class="row">
        <div class="field">
          <label [for]="id('code')" i18n="Champ code du vocabulaire@@admin.vocabulary.code"
            >Code</label
          >
          <input
            [id]="id('code')"
            type="text"
            formControlName="code"
            autocomplete="off"
            spellcheck="false"
            [attr.aria-invalid]="(form.controls.code.invalid && form.controls.code.touched) || null"
            [attr.aria-describedby]="id('code') + '-error ' + id('rules')"
          />
          <pm-field-errors [control]="form.controls.code" [id]="id('code') + '-error'" />
        </div>
        <div class="field">
          <label [for]="id('labelFr')" i18n="Champ libellé français@@admin.vocabulary.labelFr"
            >Libellé FR</label
          >
          <input
            [id]="id('labelFr')"
            type="text"
            formControlName="labelFr"
            [attr.aria-invalid]="
              (form.controls.labelFr.invalid && form.controls.labelFr.touched) || null
            "
            [attr.aria-describedby]="id('labelFr') + '-error'"
          />
          <pm-field-errors [control]="form.controls.labelFr" [id]="id('labelFr') + '-error'" />
        </div>
        <div class="field">
          <label
            [for]="id('labelEn')"
            i18n="Champ libellé anglais facultatif@@admin.vocabulary.labelEnOptional"
            >Libellé EN (facultatif)</label
          >
          <input
            [id]="id('labelEn')"
            type="text"
            formControlName="labelEn"
            [attr.aria-invalid]="
              (form.controls.labelEn.invalid && form.controls.labelEn.touched) || null
            "
            [attr.aria-describedby]="id('labelEn') + '-error'"
          />
          <pm-field-errors [control]="form.controls.labelEn" [id]="id('labelEn') + '-error'" />
        </div>
        <button mat-flat-button type="submit" [disabled]="sending()">{{ submitLabel }}</button>
      </div>
      <p class="rules" [id]="id('rules')" i18n="Règles de format du code@@admin.vocabulary.rules">
        Code : minuscules, chiffres et soulignés, 2 à 40 caractères, commence par une lettre ; il ne
        change plus ensuite. Libellés : 120 caractères au plus.
      </p>
      @if (error(); as text) {
        <p class="error" role="alert">{{ text }}</p>
      }
    </form>
  `,
  styleUrl: './vocabulary-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddEntryFormComponent {
  readonly kind = input.required<EditableKind>();
  /** Envoi : null si l'entrée est créée, sinon le problème à afficher. */
  readonly create = input.required<(input: VocabularyCreateInput) => Promise<ApiProblem | null>>();

  protected readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(CODE_PATTERN)],
    }),
    labelFr: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(LABEL_MAX)],
    }),
    labelEn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(LABEL_MAX)],
    }),
  });

  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly title = computed(() =>
    this.kind() === 'audience'
      ? $localize`:Titre de l'ajout d'un public@@admin.vocabulary.addAudience:Ajouter un public`
      : $localize`:Titre de l'ajout d'une spécialité@@admin.vocabulary.addSpecialty:Ajouter une spécialité`,
  );
  protected readonly submitLabel = $localize`:Bouton d'ajout au vocabulaire@@admin.vocabulary.add:Ajouter`;

  protected id(field: string): string {
    return `add-${fieldId(field)}`;
  }

  protected async submit(): Promise<void> {
    clearServerErrors(this.form);
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    const value = this.form.getRawValue();
    const problem = await this.create()({ kind: this.kind(), ...value });
    this.sending.set(false);
    if (!problem) {
      this.form.reset();
      return;
    }
    this.error.set(applyVocabularyProblem(this.form, problem));
  }
}
