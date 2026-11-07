import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { ApiProblem } from '../../../core/http';
import { applyProblem, firstMessage } from '../../../shared/forms';
import { ContactMessage } from '../data/directory.models';
import { ContactStatus } from '../data/practitioner.store';

/** Limites du contrat (SubmitContactRequest). */
export const CONTACT_LIMITS = { name: 200, email: 320, subject: 200, message: 4000 } as const;

/**
 * Formulaire de contact d'une fiche (fiche 09, #contact) : nom, e-mail, objet, message,
 * consentement ; piège à robots `website` caché ; instant d'affichage envoyé avec le message
 * (le serveur ignore un envoi en moins de 3 s). Le client vérifie la forme, le serveur juge (422
 * posés sur les champs). Composant de présentation : la page envoie par le store.
 */
@Component({
  selector: 'pm-contact-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './contact-form.component.html',
  styleUrl: './contact-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactFormComponent {
  readonly practitionerName = input.required<string>();
  readonly status = input<ContactStatus>('idle');
  readonly problem = input<ApiProblem | null>(null);
  /** 429 : instant (ms) où un nouvel envoi sera accepté. */
  readonly retryAt = input<number | null>(null);

  readonly send = output<ContactMessage>();
  readonly writeAnother = output<void>();

  protected readonly limits = CONTACT_LIMITS;
  protected readonly message = firstMessage;

  protected readonly subjects = [
    $localize`:Objet du message de contact@@public.contact.subject.firstAppointment:Demande de premier rendez-vous`,
    $localize`:Objet du message de contact@@public.contact.subject.practice:Question sur la pratique`,
    $localize`:Objet du message de contact@@public.contact.subject.other:Autre demande`,
  ];

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(CONTACT_LIMITS.name)]],
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(CONTACT_LIMITS.email)],
    ],
    subject: [this.subjects[0], [Validators.maxLength(CONTACT_LIMITS.subject)]],
    message: ['', [Validators.required, Validators.maxLength(CONTACT_LIMITS.message)]],
    consent: [false, [Validators.requiredTrue]],
    // Piège à robots : caché, hors tabulation ; rempli, le serveur ignore l'envoi en silence.
    website: [''],
  });

  /** Instant d'affichage du formulaire (navigateur), envoyé en formShownAt. */
  private readonly shownAt = signal<string | null>(null);
  protected readonly submitted = signal(false);

  private readonly events = toSignal(this.form.events);
  protected readonly messageLength = computed(() => {
    this.events();
    return this.form.controls.message.value.length;
  });

  protected readonly retryMinutes = computed(() => {
    const at = this.retryAt();
    return at === null ? 0 : Math.max(1, Math.ceil((at - Date.now()) / 60_000));
  });

  constructor() {
    afterNextRender(() => this.shownAt.set(new Date().toISOString()));

    // Envoi : la saisie est désactivée puis rendue ; un 422 pose ensuite les messages du serveur
    // sous les champs (après enable, qui recalcule les erreurs et effacerait applyProblem).
    effect(() => {
      const status = this.status();
      untracked(() => {
        if (status === 'sending') this.form.disable({ emitEvent: false });
        else this.form.enable({ emitEvent: false });
        if (status === 'invalid' && this.problem()) applyProblem(this.form, this.problem());
      });
    });
  }

  protected submit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.status() === 'sending') return;
    const value = this.form.getRawValue();
    this.send.emit({
      ...value,
      formShownAt: this.shownAt() ?? new Date().toISOString(),
    });
  }

  /** Nouveau message après une confirmation : formulaire vide, nouvel instant d'affichage. */
  protected another(): void {
    this.form.reset();
    this.submitted.set(false);
    this.shownAt.set(new Date().toISOString());
    this.writeAnother.emit();
  }
}
