import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { AUTH_PATHS, Profession } from '../../../core/auth';
import { FieldProblem } from '../../../core/http';
import {
  applyProblem,
  fieldId,
  FieldErrorsComponent,
  firstMessage,
  PmValidators,
} from '../../../shared/forms';
import { FormErrorsComponent } from '../../../shared/ui';
import { passwordStrength, PasswordStrengthLevel } from '../data/password-strength';
import { RegisterStore } from '../data/register.store';

/** Une carte de profession (fiche 12, section 2) : libellé et ce que le choix change. */
interface ProfessionCard {
  value: Profession;
  label: string;
  description: string;
}

/** Code postal français : cinq chiffres (le serveur reste juge, POSTAL_CODE_INVALID). */
const POSTAL_CODE = /^\d{5}$/;

/**
 * /inscription (fiche 12, G Q21 : ouverte à tous) : trois sections (qui vous êtes, profession,
 * accès), consentements, jauge de force, « Ensuite » en quatre étapes. Validation de forme au blur,
 * résumé des erreurs après tentative, 422 relié aux champs par applyProblem. 201 (même réponse si
 * l'adresse est déjà connue) → /confirmer-email.
 */
@Component({
  selector: 'pm-register-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    FieldErrorsComponent,
    FormErrorsComponent,
  ],
  providers: [RegisterStore],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  protected readonly store = inject(RegisterStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  protected readonly loginPath = AUTH_PATHS.login;
  protected readonly fieldId = fieldId;
  protected readonly mismatchMessage = clientMessage('passwordConfirm', { mismatch: true });
  protected readonly termsMessage = clientMessage('terms', { required: true });

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(100)]],
    lastName: ['', [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    profession: ['' as Profession | '', [Validators.required]],
    professionalNumber: ['', [PmValidators.maxLengthTrimmed(30)]],
    phone: ['', [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(30)]],
    remoteOnly: [false],
    address: inject(NonNullableFormBuilder).group({
      street: ['', [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(200)]],
      postalCode: ['', [Validators.required, Validators.pattern(POSTAL_CODE)]],
      city: ['', [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(200)]],
    }),
    password: ['', [Validators.required, PmValidators.password, Validators.maxLength(200)]],
    passwordConfirm: ['', [Validators.required, sameAs('password')]],
    terms: [false, [Validators.requiredTrue]],
  });

  /** Libellés des champs pour le résumé (fiche 12, planche 29). */
  protected readonly labels: Record<string, string> = {
    firstName: $localize`:Champ de l'inscription@@auth.register.firstName:Prénom`,
    lastName: $localize`:Champ de l'inscription@@auth.register.lastName:Nom`,
    email: $localize`:Champ de l'inscription@@auth.register.email:E-mail professionnel`,
    profession: $localize`:Légende des cartes de profession@@auth.register.profession:Profession`,
    professionalNumber: $localize`:Champ de l'inscription@@auth.register.professionalNumber:Numéro professionnel (ADELI / RPPS, facultatif)`,
    phone: $localize`:Champ de l'inscription@@auth.register.phone:Téléphone`,
    address: $localize`:Groupe adresse de l'inscription@@auth.register.address:Adresse du cabinet`,
    'address.street': $localize`:Champ de l'inscription@@auth.register.address.street:Adresse du cabinet`,
    'address.postalCode': $localize`:Champ de l'inscription@@auth.register.address.postalCode:Code postal`,
    'address.city': $localize`:Champ de l'inscription@@auth.register.address.city:Ville`,
    password: $localize`:Champ de l'inscription@@auth.register.password:Mot de passe`,
    passwordConfirm: $localize`:Champ de l'inscription@@auth.register.passwordConfirm:Confirmer le mot de passe`,
    terms: $localize`:Case des consentements, libellé court pour le résumé@@auth.register.terms.short:Conditions d'utilisation et confidentialité`,
    'consents.terms': $localize`:Case des consentements, libellé court pour le résumé@@auth.register.terms.short:Conditions d'utilisation et confidentialité`,
    'consents.privacy': $localize`:Case des consentements, libellé court pour le résumé@@auth.register.terms.short:Conditions d'utilisation et confidentialité`,
  };

  protected readonly professions: ProfessionCard[] = [
    {
      value: 'psychologist',
      label: $localize`:Carte de profession@@auth.register.profession.psychologist:Psychologue`,
      description: $localize`:Ce que change la profession psychologue@@auth.register.profession.psychologist.desc:Suivi psychothérapeutique. Entrées : note, événement, situation, ressenti, séance. Médicament en lecture seule si prescrit par un confrère.`,
    },
    {
      value: 'psychiatrist',
      label: $localize`:Carte de profession@@auth.register.profession.psychiatrist:Psychiatre`,
      description: $localize`:Ce que change la profession psychiatre@@auth.register.profession.psychiatrist.desc:Suivi médical et thérapeutique. Tous les types d'entrées, dont médicament avec posologie et prescripteur.`,
    },
    {
      value: 'coach',
      label: $localize`:Carte de profession@@auth.register.profession.coach:Coach`,
      description: $localize`:Ce que change la profession coach@@auth.register.profession.coach.desc:Accompagnement. Vocabulaire « client » possible, type médicament masqué. Libellé public « Coach ».`,
    },
  ];

  /** Erreurs de forme du client, résumées en tête après une tentative (fiche 12). */
  protected readonly clientErrors = signal<FieldProblem[]>([]);
  /** Erreurs du serveur sans champ dans le formulaire (422 sur un champ inconnu, ou sans champ). */
  protected readonly unmatched = signal<FieldProblem[]>([]);

  protected readonly summaryErrors = computed(() => {
    const problem = this.store.problem();
    // consents.terms / consents.privacy n'ont qu'une case dans le formulaire : « terms ».
    if (problem?.errors?.length)
      return problem.errors.map((e) => ({ ...e, field: consentField(e.field) }));
    if (problem && problem.status !== 422) {
      return [
        {
          field: '',
          code: problem.code,
          message: $localize`:Inscription impossible, serveur ou réseau@@auth.register.error.unavailable:Inscription impossible pour le moment. Rien n'a été enregistré ; réessayez dans un instant.`,
        },
      ];
    }
    return this.clientErrors();
  });
  protected readonly unmatchedFields = computed(() => this.unmatched().map((e) => e.field));

  private readonly passwordValue = toSignal(
    this.form.controls.password.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected readonly strength = computed(() => passwordStrength(this.passwordValue()));
  protected readonly strengthBars = [1, 2, 3, 4] as const;
  protected readonly strengthText = computed(() =>
    strengthText(this.strength().level, this.strength().length),
  );

  protected readonly remoteOnly = toSignal(this.form.controls.remoteOnly.valueChanges, {
    initialValue: false,
  });

  protected readonly submitting = computed(() => this.store.status() === 'submitting');

  constructor() {
    // La confirmation se revalide quand le mot de passe change (sameAs lit son voisin).
    effect(() => {
      this.passwordValue();
      this.form.controls.passwordConfirm.updateValueAndValidity({ emitEvent: false });
    });
  }

  /** « J'exerce uniquement en visio » : l'adresse n'est ni requise ni saisissable (fiche 12). */
  protected toggleRemoteOnly(): void {
    const address = this.form.controls.address;
    if (this.form.controls.remoteOnly.value) {
      address.disable();
    } else {
      address.enable();
    }
  }

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    this.unmatched.set([]);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.clientErrors.set(collectClientErrors(this.form.controls, ''));
      return;
    }
    this.clientErrors.set([]);
    const value = this.form.getRawValue();
    const profession = value.profession as Profession;
    const sent = await this.store.submit({
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      email: value.email.trim(),
      password: value.password,
      profession,
      professionalNumber: value.professionalNumber.trim(),
      phone: value.phone.trim(),
      remoteOnly: value.remoteOnly,
      address: {
        street: value.address.street.trim(),
        postalCode: value.address.postalCode.trim(),
        city: value.address.city.trim(),
      },
      consents: { terms: value.terms, privacy: value.terms },
    });
    if (sent) {
      await this.router.navigateByUrl(AUTH_PATHS.confirmEmail, {
        state: { email: value.email.trim() },
      });
      return;
    }
    const problem = this.store.problem();
    const applied = applyProblem(
      this.form,
      problem?.errors
        ? {
            ...problem,
            errors: problem.errors.map((e) => ({ ...e, field: consentField(e.field) })),
          }
        : problem,
    );
    this.unmatched.set(applied.unmatched);
    const first = applied.applied[0]?.field;
    if (first) {
      const id = fieldId(first);
      afterNextRender(() => this.document.getElementById(id)?.focus(), {
        injector: this.injector,
      });
    }
  }
}

/** Le contrôle doit valoir la même chose que son voisin `other` (confirmation du mot de passe). */
function sameAs(other: string) {
  return (control: AbstractControl): ValidationErrors | null => {
    const sibling = control.parent?.get(other);
    if (!sibling || !control.value) return null;
    return control.value === sibling.value ? null : { mismatch: true };
  };
}

function collectClientErrors(
  controls: Record<string, AbstractControl>,
  prefix: string,
): FieldProblem[] {
  const errors: FieldProblem[] = [];
  for (const [name, control] of Object.entries(controls)) {
    const field = prefix ? `${prefix}.${name}` : name;
    const children = (control as { controls?: Record<string, AbstractControl> }).controls;
    if (children && !Array.isArray(children)) {
      errors.push(...collectClientErrors(children, field));
    } else if (control.enabled && control.invalid && control.errors) {
      errors.push({ field, code: 'INVALID_FIELD', message: clientMessage(field, control.errors) });
    }
  }
  return errors;
}

/** consents.terms et consents.privacy (contrat) n'ont qu'une case dans le formulaire : terms. */
function consentField(field: string): string {
  return field.startsWith('consents.') ? 'terms' : field;
}

/** Messages de forme propres à l'inscription, sinon ceux de shared/forms. */
export function clientMessage(field: string, errors: ValidationErrors): string {
  if (errors['mismatch']) {
    return $localize`:Confirmation du mot de passe différente@@auth.register.error.mismatch:Les deux mots de passe ne sont pas identiques.`;
  }
  if (field === 'address.postalCode' && errors['pattern']) {
    return $localize`:Code postal mal formé@@auth.register.error.postalCode:Le code postal comporte cinq chiffres.`;
  }
  if (field === 'terms' && errors['required']) {
    return $localize`:Consentement obligatoire@@auth.register.error.terms:Vous devez accepter les conditions d'utilisation et la politique de confidentialité.`;
  }
  return firstMessage(errors);
}

/** Texte de la jauge (fiche 12 : jamais la couleur seule). */
export function strengthText(level: PasswordStrengthLevel, length: number): string {
  switch (level) {
    case 0:
      return $localize`:Jauge de force, vide@@auth.register.strength.empty:12 caractères minimum.`;
    case 1:
      return $localize`:Jauge de force, trop court@@auth.register.strength.short:Trop court · ${length}:length: caractères sur 12.`;
    case 2:
      return $localize`:Jauge de force, faible@@auth.register.strength.weak:Faible · ${length}:length: caractères. Mélangez majuscules, chiffres et signes.`;
    case 3:
      return $localize`:Jauge de force, bon@@auth.register.strength.good:Bon · ${length}:length: caractères.`;
    case 4:
      return $localize`:Jauge de force, fort@@auth.register.strength.strong:Fort · ${length}:length: caractères.`;
  }
}
