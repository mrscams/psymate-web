import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  LOCALE_ID,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';

import { ApiProblem } from '../../../core/http';
import { toAppLocale } from '../../../core/i18n';
import { StateComponent } from '../../../shared/ui';
import { BookingModality, BookingSlot } from '../data/booking.models';
import { BookingStore } from '../data/booking.store';
import { hasNextWindow, windowAt } from '../data/booking-window';
import { PUBLIC_FACTS } from '../public-facts';
import { practitionerPath, PUBLIC_FEATURE_PATHS } from '../public-paths';
import { BookingBarComponent } from '../ui/booking-bar.component';
import {
  BookingFormComponent,
  BookingSendStatus,
  createBookingForm,
} from '../ui/booking-form.component';
import {
  modalitiesSentence,
  modalityInline,
  retryMinutes,
  slotRecap,
  zoneLabel,
} from '../ui/booking-format';
import { modeSentence } from '../ui/booking-mode';
import { BookingSlotsComponent } from '../ui/booking-slots.component';
import { EmergencyNoteComponent } from '../ui/emergency-note.component';
import { PublicMeta } from './page-meta';

type Step = 'slots' | 'details' | 'sent';

/** Identifiants des titres qui reçoivent le focus (étapes, écran d'attente). */
const TITLES = {
  slots: 'booking-step-slots',
  details: 'booking-step-details',
  sent: 'booking-sent',
};

/**
 * /praticiens/:slug/rendez-vous (fiche 31, maquette 31) : un visiteur sans compte choisit un créneau
 * puis laisse ses coordonnées ; après le 202, « Consultez votre boîte mail ». Deux étapes dans la
 * même route. L'étape, le créneau choisi, la saisie, `formShownAt` et l'état de l'envoi sont de
 * l'état d'écran (ici) ; réglages et créneaux sont dans BookingStore. Rien du visiteur n'est écrit
 * dans le stockage du navigateur ni dans l'URL (G Q62). Non prérendue, `noindex`.
 */
@Component({
  selector: 'pm-booking-page',
  imports: [
    MatButtonModule,
    RouterLink,
    StateComponent,
    BookingBarComponent,
    BookingFormComponent,
    BookingSlotsComponent,
    EmergencyNoteComponent,
  ],
  providers: [BookingStore],
  templateUrl: './booking.page.html',
  styleUrl: './booking.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingPage {
  /** Paramètre de route :slug (withComponentInputBinding). */
  readonly slug = input.required<string>();

  protected readonly store = inject(BookingStore);
  private readonly router = inject(Router);
  private readonly meta = inject(PublicMeta);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly localeId = inject(LOCALE_ID);
  private readonly locale = toAppLocale(this.localeId);

  protected readonly titles = TITLES;
  protected readonly paths = PUBLIC_FEATURE_PATHS;
  protected readonly linkMinutes = PUBLIC_FACTS.bookingLinkMinutes;

  /** Saisie du visiteur : vit ici, survit aux changements d'étape (G Q62). */
  protected readonly form = createBookingForm(inject(NonNullableFormBuilder));

  // État d'écran.
  protected readonly step = signal<Step>('slots');
  protected readonly windowIndex = signal(0);
  protected readonly chosen = signal<BookingSlot | null>(null);
  /** 409 : le créneau choisi n'est plus offert ; avertissement en tête de l'étape 1. */
  protected readonly slotGone = signal(false);
  protected readonly sendStatus = signal<BookingSendStatus>('idle');
  protected readonly sendProblem = signal<ApiProblem | null>(null);
  /**
   * Instant du premier affichage du formulaire de coordonnées : jamais remis à zéro tant que la page
   * n'est pas rechargée (l'API ignore en silence un envoi fait moins de 3 s après cet instant).
   */
  private readonly formShownAt = signal<string | null>(null);
  /** Créneau et modalité demandés, pour l'écran d'attente (jamais le nom ni l'adresse). */
  protected readonly sent = signal<{ slot: BookingSlot; modality: BookingModality } | null>(null);

  protected readonly settings = computed(() => this.store.settings().data);
  protected readonly practitionerLink = computed(() => practitionerPath(this.slug()));
  protected readonly settingsFailed = computed(
    () => this.store.settings().status === 'error' && !this.store.notAvailable(),
  );
  protected readonly settingsRateLimited = computed(
    () => this.store.settings().problem?.status === 429,
  );
  protected readonly settingsRetryMinutes = computed(() =>
    retryMinutes(this.store.settings().problem?.retryAfterSeconds),
  );

  protected readonly facts = computed(() => {
    const settings = this.settings();
    if (!settings) return [];
    return [
      $localize`:Durée d'un créneau@@public.booking.duration:Créneaux de ${settings.slotDurationMin}:minutes: min`,
      modalitiesSentence(settings.modalities, this.localeId),
    ].filter(Boolean);
  });
  protected readonly mode = computed(() => {
    const settings = this.settings();
    return settings ? modeSentence(settings.confirmation) : '';
  });

  protected readonly window = computed(() => {
    const today = this.store.today();
    return today ? windowAt(today, this.windowIndex()) : null;
  });
  protected readonly canNext = computed(() => {
    const today = this.store.today();
    const settings = this.settings();
    return !!today && !!settings && hasNextWindow(today, this.windowIndex(), settings.horizonDays);
  });

  /** Rappel du créneau (étape 2) ou du créneau demandé (écran d'attente). */
  protected readonly recap = computed(() => {
    const settings = this.settings();
    const slot = this.step() === 'sent' ? this.sent()?.slot : this.chosen();
    if (!settings || !slot) return null;
    return {
      ...slotRecap(slot, settings.timezone, this.localeId),
      zone: zoneLabel(settings.timezone, this.localeId, new Date(slot.startsAt)),
    };
  });
  protected readonly sentModality = computed(() => {
    const modality = this.sent()?.modality;
    return modality ? modalityInline(modality, this.localeId) : '';
  });

  constructor() {
    // Données publiques sans session, réponses no-store : jamais au prérendu.
    if (this.browser) {
      effect(() => {
        const slug = this.slug();
        untracked(() => void this.store.load(slug));
      });
    }
    // 404 BOOKING_NOT_AVAILABLE (réglages, créneaux) : la fiche affiche son propre état.
    effect(() => {
      if (this.store.notAvailable()) untracked(() => this.toPractitioner());
    });
    // Une seule modalité : pas de contrôle, la valeur est envoyée (fiche 31).
    effect(() => {
      const modalities = this.settings()?.modalities ?? [];
      untracked(() => {
        if (modalities.length === 1) this.form.controls.modality.setValue(modalities[0]);
      });
    });
    this.meta.apply(
      {
        description: $localize`:Description de la page de prise de rendez-vous@@public.booking.meta.description:Choisissez un créneau et demandez un rendez-vous en ligne avec un praticien de l'annuaire PsyMate.`,
        robots: 'noindex,follow',
        canonicalPath: null,
      },
      this.destroyRef,
    );
  }

  protected retrySettings(): void {
    void this.store.load(this.slug());
  }

  protected retrySlots(): void {
    void this.store.reloadSlots();
  }

  protected moveWindow(delta: number): void {
    const today = this.store.today();
    if (!today) return;
    const index = Math.max(0, this.windowIndex() + delta);
    this.windowIndex.set(index);
    this.slotGone.set(false);
    void this.store.loadSlots(windowAt(today, index));
  }

  /** Choisir un créneau : étape 2, focus sur son titre « Vos coordonnées ». */
  protected pick(slot: BookingSlot): void {
    this.chosen.set(slot);
    this.slotGone.set(false);
    this.sendStatus.set('idle');
    this.sendProblem.set(null);
    this.step.set('details');
    if (this.formShownAt() === null) this.formShownAt.set(new Date().toISOString());
    this.focus(TITLES.details);
  }

  /** « Changer de créneau » : retour à l'étape 1, saisie conservée. */
  protected changeSlot(): void {
    this.step.set('slots');
    this.focus(TITLES.slots);
  }

  protected async send(): Promise<void> {
    const slot = this.chosen();
    const shownAt = this.formShownAt();
    if (!slot || !shownAt || this.sendStatus() === 'sending') return;
    const value = this.form.getRawValue();
    const modality = value.modality;
    if (!modality) return;
    this.sendStatus.set('sending');
    this.sendProblem.set(null);
    const result = await this.store.send({
      startsAt: slot.startsAt,
      modality,
      firstName: value.firstName,
      lastName: value.lastName,
      email: value.email,
      phone: value.phone,
      locale: this.locale,
      consent: value.consent,
      website: value.website,
      formShownAt: shownAt,
    });
    switch (result.outcome) {
      case 'sent':
        this.sent.set({ slot, modality });
        this.sendStatus.set('idle');
        this.step.set('sent');
        // Plus rien du visiteur à l'écran ni en mémoire de la page.
        this.form.reset();
        this.focus(TITLES.sent);
        return;
      case 'slot-gone':
        this.chosen.set(null);
        this.sendStatus.set('idle');
        this.slotGone.set(true);
        this.step.set('slots');
        this.focus(TITLES.slots);
        return;
      case 'not-available':
        this.toPractitioner();
        return;
      default:
        this.sendProblem.set(result.problem);
        this.sendStatus.set(result.outcome);
    }
  }

  private toPractitioner(): void {
    void this.router.navigateByUrl(practitionerPath(this.slug()), { replaceUrl: true });
  }

  private focus(id: string): void {
    afterNextRender(() => this.document.getElementById(id)?.focus(), {
      injector: this.injector,
    });
  }
}
