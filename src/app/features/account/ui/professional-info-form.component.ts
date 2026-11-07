import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { Profession } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { applyProblem, FieldErrorsComponent, fieldId, PmValidators } from '../../../shared/forms';
import { ProfessionalInfo, ProfessionalInfoPatch } from '../data/verification.api';
import { professionLabel } from './document-labels';

export interface InfoSaveState {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
  savedAt: number | null;
}

/**
 * Informations professionnelles (fiche 13 §4) : profession déclarée (lecture), n° ADELI / RPPS
 * (recommandé pour psychologues et psychiatres, jamais bloquant, G Q14), téléphone, adresse ou
 * exercice en visio. Enregistrement par PATCH /api/me/professional-info ; 422 relié aux champs.
 */
@Component({
  selector: 'pm-professional-info-form',
  imports: [ReactiveFormsModule, MatButtonModule, FieldErrorsComponent],
  templateUrl: './professional-info-form.component.html',
  styleUrl: './professional-info-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessionalInfoFormComponent {
  readonly info = input.required<ProfessionalInfo>();
  readonly profession = input<Profession | null>(null);
  readonly state = input.required<InfoSaveState>();
  readonly save = output<ProfessionalInfoPatch>();

  protected readonly fieldId = (name: string) => fieldId(`info.${name}`);
  protected readonly addressLabel = $localize`:Groupe adresse des informations professionnelles@@account.verification.info.address:Adresse du cabinet`;

  protected readonly form = inject(NonNullableFormBuilder).group({
    professionalNumber: ['', [PmValidators.maxLengthTrimmed(20)]],
    phone: ['', [PmValidators.maxLengthTrimmed(30)]],
    remoteOnly: [false],
    address: inject(NonNullableFormBuilder).group({
      street: ['', [PmValidators.maxLengthTrimmed(200)]],
      postalCode: ['', [Validators.pattern(/^\d{5}$/)]],
      city: ['', [PmValidators.maxLengthTrimmed(200)]],
    }),
  });

  protected readonly remoteOnly = toSignal(this.form.controls.remoteOnly.valueChanges, {
    initialValue: false,
  });

  protected readonly professionText = computed(() => professionLabel(this.profession()));
  protected readonly numberRecommended = computed(
    () => this.profession() === 'psychologist' || this.profession() === 'psychiatrist',
  );
  protected readonly busy = computed(() => this.state().status === 'busy');
  protected readonly saved = computed(() => this.state().savedAt !== null && !this.form.dirty);
  protected readonly failure = computed(() => {
    const problem = this.state().problem;
    if (!problem || problem.status === 422) return null;
    return $localize`:Enregistrement impossible@@account.verification.info.error.failed:Enregistrement impossible pour le moment. Rien n'a été modifié.`;
  });

  constructor() {
    // Les valeurs du serveur remplissent le formulaire (au chargement et après chaque enregistrement) ;
    // le 422 courant est reposé ensuite, car reset() recalcule les erreurs des contrôles.
    effect(() => {
      const info = this.info();
      untracked(() => {
        this.form.reset({
          professionalNumber: info.professionalNumber,
          phone: info.phone,
          remoteOnly: info.remoteOnly,
          address: { ...info.address },
        });
        this.syncAddress(info.remoteOnly);
        this.applyServerErrors();
      });
    });
    effect(() => {
      this.state().problem;
      untracked(() => this.applyServerErrors());
    });
  }

  private applyServerErrors(): void {
    const problem = this.state().problem;
    if (problem?.status === 422) applyProblem(this.form, problem);
  }

  protected toggleRemoteOnly(): void {
    this.syncAddress(this.form.controls.remoteOnly.value);
  }

  protected submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.save.emit({
      professionalNumber: value.professionalNumber.trim(),
      phone: value.phone.trim(),
      remoteOnly: value.remoteOnly,
      address: {
        street: value.address.street.trim(),
        postalCode: value.address.postalCode.trim(),
        city: value.address.city.trim(),
      },
    });
  }

  private syncAddress(remoteOnly: boolean): void {
    const address = this.form.controls.address;
    if (remoteOnly) address.disable({ emitEvent: false });
    else address.enable({ emitEvent: false });
  }
}
