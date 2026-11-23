import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  LOCALE_ID,
  output,
  untracked,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';

import { ApiProblem, FieldProblem } from '../../../core/http';
import { formatLocale } from '../../../core/i18n';
import {
  applyProblem,
  fieldId,
  firstInvalidField,
  firstMessage,
  PmValidators,
} from '../../../shared/forms';
import { FormErrorsComponent } from '../../../shared/ui';
import { BOOKING_LIMITS, BookingConfirmation, BookingModality } from '../data/booking.models';
import { PUBLIC_FEATURE_PATHS } from '../public-paths';
import { BookingBarComponent } from './booking-bar.component';
import { modalityInline, modalityLabel } from './booking-format';
import { modeSentence } from './booking-mode';

/** Téléphone (contrat) : chiffres, espaces, +, point, tiret, parenthèses, au moins un chiffre. */
const PHONE_PATTERN = /^[\d\s+.()-]*\d[\d\s+.()-]*$/;

/** Saisie du visiteur : prénom, nom, e-mail, téléphone, modalité, consentement, pot de miel. */
export type BookingForm = FormGroup<{
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
  modality: FormControl<BookingModality | ''>;
  consent: FormControl<boolean>;
  website: FormControl<string>;
}>;

/**
 * Formulaire de coordonnées (fiche 31, étape 2). Il appartient à la page, pas au composant : la
 * saisie est conservée après « Changer de créneau », un 409, un 422 ou un 429 (G Q62 : jamais dans
 * le stockage du navigateur ni dans l'URL). Aucun champ libre, aucun « motif ».
 */
export function createBookingForm(fb: NonNullableFormBuilder): BookingForm {
  return fb.group({
    firstName: [
      '',
      [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(BOOKING_LIMITS.firstName)],
    ],
    lastName: [
      '',
      [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(BOOKING_LIMITS.lastName)],
    ],
    email: [
      '',
      [
        PmValidators.trimmedRequired,
        Validators.email,
        PmValidators.maxLengthTrimmed(BOOKING_LIMITS.email),
      ],
    ],
    phone: [
      '',
      [PmValidators.maxLengthTrimmed(BOOKING_LIMITS.phone), Validators.pattern(PHONE_PATTERN)],
    ],
    modality: fb.control<BookingModality | ''>('', Validators.required),
    consent: [false, Validators.requiredTrue],
    // Piège à robots : caché, hors tabulation ; rempli, le serveur ignore la demande en silence.
    website: [''],
  });
}

/** État de l'envoi, tenu par la page (état d'écran). */
export type BookingSendStatus = 'idle' | 'sending' | 'invalid' | 'rate-limited' | 'error';

@Component({
  selector: 'pm-booking-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    NgTemplateOutlet,
    FormErrorsComponent,
    BookingBarComponent,
  ],
  templateUrl: './booking-form.component.html',
  styleUrl: './booking-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingFormComponent {
  readonly form = input.required<BookingForm>();
  readonly practitionerName = input.required<string>();
  readonly confirmation = input.required<BookingConfirmation>();
  readonly modalities = input.required<BookingModality[]>();
  readonly status = input<BookingSendStatus>('idle');
  readonly problem = input<ApiProblem | null>(null);
  /** Identifiant du titre de l'étape (nom du formulaire). */
  readonly labelledBy = input.required<string>();

  /** La forme est bonne : la page envoie. */
  readonly submitted = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly locale = formatLocale(inject(LOCALE_ID));

  protected readonly limits = BOOKING_LIMITS;
  protected readonly message = firstMessage;
  protected readonly fieldId = fieldId;
  protected readonly privacyPath = PUBLIC_FEATURE_PATHS.privacy;
  protected readonly modalityLabel = modalityLabel;

  protected readonly mode = computed(() => modeSentence(this.confirmation()));
  protected readonly submitLabel = computed(() =>
    this.confirmation() === 'auto'
      ? $localize`:Bouton d'envoi, mode automatique@@public.booking.submit.auto:Réserver ce créneau`
      : $localize`:Bouton d'envoi, mode manuel@@public.booking.submit.manual:Envoyer ma demande`,
  );
  /** Une seule modalité : une ligne de texte, sans contrôle (la valeur est envoyée). */
  protected readonly singleModality = computed(() => {
    const modalities = this.modalities();
    return modalities.length === 1 ? modalityInline(modalities[0], this.locale) : null;
  });
  protected readonly retryMinutes = computed(() =>
    Math.max(1, Math.ceil((this.problem()?.retryAfterSeconds ?? 60) / 60)),
  );
  /** errors[] d'un 422 pour le résumé en tête du formulaire. */
  protected readonly serverErrors = computed<FieldProblem[]>(() =>
    this.status() === 'invalid' ? (this.problem()?.errors ?? []) : [],
  );
  protected readonly fieldLabels: Record<string, string> = {
    firstName: $localize`:Champ prénom@@public.booking.summary.firstName:Prénom`,
    lastName: $localize`:Champ nom@@public.booking.summary.lastName:Nom`,
    email: $localize`:Champ e-mail@@public.booking.summary.email:E-mail`,
    phone: $localize`:Champ téléphone, résumé des erreurs@@public.booking.summary.phone:Téléphone`,
    modality: $localize`:Groupe modalité@@public.booking.summary.modality:Modalité`,
    consent: $localize`:Consentement, résumé des erreurs@@public.booking.summary.consent:Consentement`,
  };
  /** Champs du contrat sans contrôle ici (startsAt, formShownAt, locale) : texte sans lien. */
  protected readonly unmatched = ['startsAt', 'formShownAt', 'locale', 'website'];

  constructor() {
    // Envoi : la saisie est désactivée puis rendue ; un 422 pose ensuite les messages du serveur
    // sous les champs (après enable, qui recalcule les erreurs et effacerait applyProblem).
    effect(() => {
      const status = this.status();
      const form = this.form();
      untracked(() => {
        if (status === 'sending') form.disable({ emitEvent: false });
        else form.enable({ emitEvent: false });
        if (status === 'invalid' && this.problem()) applyProblem(form, this.problem());
      });
    });
  }

  protected errorsOf(name: keyof BookingForm['controls']): ValidationErrors | null {
    return this.form().controls[name].errors;
  }

  /** Message d'erreur du consentement et de la modalité, une fois l'envoi tenté. */
  protected showError(name: 'modality' | 'consent', submitted: boolean): boolean {
    const control = this.form().controls[name];
    return control.invalid && (control.touched || submitted);
  }

  protected submit(): void {
    const form = this.form();
    form.markAllAsTouched();
    if (this.status() === 'sending') return;
    if (form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    this.submitted.emit();
  }

  /** Le focus va sur le premier champ en erreur, dans l'ordre du formulaire (fiche 31). */
  private focusFirstInvalid(): void {
    const name = firstInvalidField(this.form());
    if (!name) return;
    afterNextRender(
      () => {
        const id = fieldId(name);
        const target =
          name === 'modality'
            ? this.document.querySelector<HTMLElement>(`#${id} input[type="radio"]`)
            : name === 'consent'
              ? this.document.querySelector<HTMLElement>(`#${id} input[type="checkbox"]`)
              : this.document.getElementById(id);
        target?.focus();
      },
      { injector: this.injector },
    );
  }
}
