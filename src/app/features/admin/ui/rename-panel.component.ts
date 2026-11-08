import { ChangeDetectionStrategy, Component, input, OnInit, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../core/http';
import { clearServerErrors, FieldErrorsComponent, fieldId } from '../../../shared/forms';
import { VocabularyEntry, VocabularyPatch } from '../data/admin.model';
import { applyVocabularyProblem, LABEL_MAX } from './vocabulary-forms';

/**
 * Panneau « Renommer » sous une ligne (fiche 28) : libellé FR (obligatoire), libellé EN (vide =
 * effacé), ordre ; le code ne change jamais. Envoie un PATCH sur le même {kind}/{code}.
 */
@Component({
  selector: 'pm-rename-panel',
  imports: [ReactiveFormsModule, MatButtonModule, FieldErrorsComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" (keydown.escape)="cancelled.emit()">
      <div class="row">
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
          <label [for]="id('labelEn')" i18n="Champ libellé anglais@@admin.vocabulary.labelEn"
            >Libellé EN (vide = effacé)</label
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
        <div class="field order">
          <label [for]="id('sortOrder')" i18n="Champ ordre d'affichage@@admin.vocabulary.order"
            >Ordre</label
          >
          <input
            [id]="id('sortOrder')"
            type="number"
            min="0"
            max="32767"
            formControlName="sortOrder"
            [attr.aria-invalid]="
              (form.controls.sortOrder.invalid && form.controls.sortOrder.touched) || null
            "
            [attr.aria-describedby]="id('sortOrder') + '-error'"
          />
          <pm-field-errors [control]="form.controls.sortOrder" [id]="id('sortOrder') + '-error'" />
        </div>
        <button
          mat-flat-button
          type="submit"
          [disabled]="sending()"
          i18n="Bouton d'enregistrement@@admin.vocabulary.save"
        >
          Enregistrer
        </button>
        <button
          mat-stroked-button
          type="button"
          (click)="cancelled.emit()"
          i18n="Bouton d'annulation d'une confirmation@@confirm.cancel"
        >
          Annuler
        </button>
      </div>
      <p class="rules" i18n="Note du renommage@@admin.vocabulary.renameNote">
        Le code ne change jamais ; les profils gardent l'entrée et affichent le nouveau libellé.
      </p>
      @if (error(); as text) {
        <p class="error" role="alert">{{ text }}</p>
      }
    </form>
  `,
  styleUrl: './vocabulary-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenamePanelComponent implements OnInit {
  readonly entry = input.required<VocabularyEntry>();
  readonly save = input.required<(patch: VocabularyPatch) => Promise<ApiProblem | null>>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    labelFr: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(LABEL_MAX)],
    }),
    labelEn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(LABEL_MAX)],
    }),
    sortOrder: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(32767)],
    }),
  });

  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const entry = this.entry();
    this.form.setValue({
      labelFr: entry.labelFr,
      labelEn: entry.labelEn ?? '',
      sortOrder: entry.sortOrder,
    });
  }

  protected id(field: string): string {
    return `rename-${this.entry().kind}-${this.entry().code}-${fieldId(field)}`;
  }

  protected async submit(): Promise<void> {
    clearServerErrors(this.form);
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.sending.set(true);
    const problem = await this.save()({
      labelFr: value.labelFr.trim(),
      labelEn: value.labelEn.trim(),
      sortOrder: Number(value.sortOrder),
    });
    this.sending.set(false);
    if (!problem) {
      this.saved.emit();
      return;
    }
    this.error.set(applyVocabularyProblem(this.form, problem));
  }
}
