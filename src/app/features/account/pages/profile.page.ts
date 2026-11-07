import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { SessionStore } from '../../../core/auth';
import { toAppLocale } from '../../../core/i18n';
import { applyProblem, FieldErrorsComponent, fieldId } from '../../../shared/forms';
import { AccountNavComponent, StateComponent, ToastService } from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import {
  Availability,
  fieldsOf,
  Profile,
  PROFILE_LIMITS,
  ProfileFields,
} from '../data/profile.api';
import { MissingItem, ProfileStore } from '../data/profile.store';
import { professionLabel } from '../ui/document-labels';
import {
  SegmentedControlComponent,
  SegmentOption,
} from '../ui/preferences/segmented-control.component';
import { ChipPickerComponent } from '../ui/profile/chip-picker.component';
import { PhotoEditorComponent } from '../ui/profile/photo-editor.component';
import {
  availabilityLabel,
  chipOptions,
  initialsOf,
  itemLabel,
  responseDelayOptions,
} from '../ui/profile/profile-labels';
import { ProfilePreviewComponent } from '../ui/profile/profile-preview.component';
import { ChecklistItem, PublishCardComponent } from '../ui/profile/publish-card.component';

/** Adresse http(s) avec un nom d'hôte (contrat : websiteUrl). */
const WEBSITE_PATTERN = /^https?:\/\/[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i;

/** Rafraîchissement de « il y a n s ». */
const TICK_MS = 5_000;

/**
 * /mon-compte/profil-public (fiche 10, M5-04, flux 8) : formulaire en enregistrement automatique
 * (PUT complet 800 ms après la dernière saisie valide, « Enregistré · il y a … »), photo recadrée
 * côté web, spécialités et publics choisis dans la liste fermée (G Q15), contacts avec leur
 * interrupteur « Afficher » ; colonne droite : publication (409 détaillé) et aperçu visiteur.
 * Le formulaire est l'état d'écran : rempli une fois au chargement, jamais réécrit par le serveur.
 */
@Component({
  selector: 'pm-profile-page',
  imports: [
    ReactiveFormsModule,
    AccountNavComponent,
    StateComponent,
    FieldErrorsComponent,
    SegmentedControlComponent,
    ChipPickerComponent,
    PhotoEditorComponent,
    PublishCardComponent,
    ProfilePreviewComponent,
  ],
  providers: [ProfileStore],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  protected readonly store = inject(ProfileStore);
  protected readonly session = inject(SessionStore);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly locale = toAppLocale(this.localeId);

  protected readonly limits = PROFILE_LIMITS;
  protected readonly id = fieldId;

  protected readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(PROFILE_LIMITS.displayName)],
    }),
    titleLabel: text(PROFILE_LIMITS.titleLabel),
    showProfessionalNumber: new FormControl(false, { nonNullable: true }),
    availability: new FormControl<Availability>('unknown', { nonNullable: true }),
    nextSlotAt: new FormControl('', { nonNullable: true }),
    bio: text(PROFILE_LIMITS.bio),
    specialties: new FormControl<string[]>([], { nonNullable: true }),
    audiences: new FormControl<string[]>([], { nonNullable: true }),
    modalities: new FormControl<string[]>([], { nonNullable: true }),
    languages: new FormControl<string[]>([], { nonNullable: true }),
    fees: text(PROFILE_LIMITS.fees),
    contactPhone: text(PROFILE_LIMITS.contactPhone),
    showPhone: new FormControl(false, { nonNullable: true }),
    contactEmail: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(PROFILE_LIMITS.contactEmail)],
    }),
    showEmail: new FormControl(false, { nonNullable: true }),
    websiteUrl: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.pattern(WEBSITE_PATTERN),
        Validators.maxLength(PROFILE_LIMITS.websiteUrl),
      ],
    }),
    responseDelay: text(PROFILE_LIMITS.responseDelay),
    address: text(PROFILE_LIMITS.address),
    postalCode: text(PROFILE_LIMITS.postalCode),
    city: text(PROFILE_LIMITS.city),
    showAddress: new FormControl(false, { nonNullable: true }),
    country: new FormControl('FR', { nonNullable: true }),
  });

  /** Valeur courante du formulaire (aperçu, liste de contrôle) ; null avant le chargement. */
  protected readonly values = signal<ProfileFields | null>(null);
  protected readonly formInvalid = signal(false);
  /** URL locale de la photo envoyée dans cette visite (aucune route ne sert encore les photos). */
  protected readonly photoUrl = signal<string | null>(null);
  private readonly now = signal(Date.now());

  protected readonly profileState = computed(() => stateKind(this.store.profile()));
  protected readonly vocabularyState = computed(() => stateKind(this.store.vocabulary()));

  protected readonly retry = {
    label: $localize`:Bouton Réessayer du profil public@@profile.retry:Réessayer`,
    handler: (): void => void this.store.load(),
  };
  protected readonly retryVocabulary = {
    label: $localize`:Bouton Réessayer de la liste fermée@@profile.vocabulary.retry:Réessayer`,
    handler: (): void => void this.store.loadVocabulary(),
  };

  protected readonly profession = computed(() =>
    professionLabel(this.store.data()?.profession ?? this.session.me()?.profession ?? null),
  );
  protected readonly navName = computed(
    () => this.values()?.displayName.trim() || this.session.me()?.displayName || '',
  );
  protected readonly navSubtitle = computed(() => {
    const city = this.values()?.city.trim();
    return city ? `${this.profession()} · ${city}` : this.profession();
  });
  protected readonly initials = computed(() => initialsOf(this.values()?.displayName ?? ''));

  protected readonly canPublish = computed(() => this.session.verificationStatus() === 'approved');

  protected readonly publicUrl = computed(
    () => new URL(`praticiens/${this.store.slug()}`, this.document.baseURI).href,
  );

  protected readonly specialtyOptions = computed(() =>
    chipOptions(this.store.vocabulary().data?.specialties ?? [], this.locale),
  );
  protected readonly audienceOptions = computed(() =>
    chipOptions(this.store.vocabulary().data?.audiences ?? [], this.locale),
  );
  protected readonly languageOptions = computed(() =>
    chipOptions(this.store.vocabulary().data?.languages ?? [], this.locale),
  );
  protected readonly modalityOptions = computed(() =>
    (this.store.vocabulary().data?.modalities ?? []).map((item) => ({
      code: item.code,
      label: itemLabel(item, this.locale),
    })),
  );

  protected readonly availabilityOptions: SegmentOption<Availability>[] = (
    ['accepting', 'waitlist', 'closed'] as const
  ).map((value) => ({ value, label: availabilityLabel(value) }));

  /** Délais proposés, plus la valeur enregistrée si elle n'en fait pas partie (saisie par l'API). */
  protected readonly delayOptions = computed(() => {
    const options = responseDelayOptions();
    const current = this.values()?.responseDelay ?? '';
    return current && !options.includes(current) ? [current, ...options] : options;
  });

  protected readonly bioLength = computed(() => this.values()?.bio.length ?? 0);

  protected readonly checklist = computed<ChecklistItem[]>(() => {
    const values = this.values();
    if (!values) return [];
    const identity = Boolean(values.displayName.trim() && this.profession() && values.city.trim());
    const contact = Boolean(
      (values.showPhone && values.contactPhone.trim()) ||
      (values.showEmail && values.contactEmail.trim()) ||
      (values.showAddress && values.address.trim()),
    );
    const photo = this.store.hasPhoto();
    return [
      {
        id: 'verification',
        state: this.canPublish() ? 'ok' : 'todo',
        label: this.canPublish()
          ? $localize`:Contrôle, dossier approuvé@@profile.checklist.verified:Dossier professionnel approuvé`
          : $localize`:Contrôle, dossier non approuvé@@profile.checklist.unverified:Dossier professionnel pas encore approuvé`,
      },
      {
        id: 'identity',
        state: identity ? 'ok' : 'todo',
        label: $localize`:Contrôle, identité@@profile.checklist.identity:Nom affiché, profession, ville`,
      },
      {
        id: 'contact',
        state: contact ? 'ok' : 'todo',
        label: $localize`:Contrôle, contact@@profile.checklist.contact:Au moins un moyen de contact affiché`,
      },
      {
        id: 'photo',
        state: photo ? 'ok' : 'warning',
        label: photo
          ? $localize`:Contrôle, photo présente@@profile.checklist.photo:Photo ajoutée`
          : $localize`:Contrôle, photo absente@@profile.checklist.noPhoto:Photo absente : les initiales sont affichées`,
      },
    ];
  });

  /** État d'enregistrement annoncé (région live) : change rarement, contrairement à « il y a ». */
  protected readonly saveStatus = computed(() => {
    if (this.formInvalid()) {
      return $localize`:Formulaire à corriger, rien n'est enregistré@@profile.save.invalid:Non enregistré : corrigez les champs signalés.`;
    }
    switch (this.store.autosave().status) {
      case 'pending':
      case 'saving':
        return $localize`:Enregistrement automatique en cours@@profile.save.saving:Enregistrement…`;
      case 'saved':
        return $localize`:Enregistrement automatique réussi@@profile.save.saved:Enregistré`;
      case 'error':
        return $localize`:Enregistrement automatique en échec@@profile.save.error:Erreur d'enregistrement`;
      case 'idle':
        return $localize`:Enregistrement automatique, au repos@@profile.save.idle:Enregistré automatiquement`;
    }
  });

  /** « il y a 12 s » (après un PUT) ou « dernière modification il y a 3 min » (au chargement). */
  protected readonly savedAgo = computed(() => {
    const status = this.store.autosave().status;
    if (this.formInvalid() || status === 'error' || status === 'pending' || status === 'saving') {
      return '';
    }
    const savedAt = this.store.autosave().savedAt;
    if (status === 'saved' && savedAt !== null) return this.relative(savedAt);
    const updatedAt = this.store.data()?.updatedAt;
    if (!updatedAt) return '';
    const ago = this.relative(Date.parse(updatedAt));
    return $localize`:Date de dernière modification du profil@@profile.save.lastChange:dernière modification ${ago}:ago:`;
  });

  protected readonly saveProblemText = computed(() => {
    const problem = this.store.autosave().problem;
    if (!problem || problem.status === 422) return null;
    return $localize`:Explication de l'erreur d'enregistrement@@profile.save.errorDetail:Vos dernières modifications ne sont pas enregistrées.`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.store.load();

    // Le formulaire se remplit une fois, au premier profil reçu ; ensuite il ne suit que la saisie.
    effect(() => {
      const profile = this.store.data();
      if (profile && untracked(this.values) === null) untracked(() => this.fill(profile));
    });

    // 422 du PUT : chaque message sous son champ (le client ne vérifie que la forme).
    effect(() => {
      const problem = this.store.autosave().problem;
      if (problem?.status === 422) untracked(() => applyProblem(this.form, problem));
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.onChange());

    const tick = setInterval(() => this.now.set(Date.now()), TICK_MS);
    destroyRef.onDestroy(() => {
      clearInterval(tick);
      const url = this.photoUrl();
      if (url) URL.revokeObjectURL(url);
    });
  }

  protected setAvailability(value: Availability): void {
    this.form.controls.availability.setValue(value);
  }

  protected toggleModality(code: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.form.controls.modalities.value;
    const next = checked ? [...current, code] : current.filter((value) => value !== code);
    // Ordre de la liste fermée, sans doublon.
    const order = this.modalityOptions().map((option) => option.code);
    this.form.controls.modalities.setValue(
      order.filter((value) => next.includes(value)).concat(next.filter((v) => !order.includes(v))),
    );
  }

  protected retrySave(): void {
    void this.store.retrySave();
  }

  protected async publish(): Promise<void> {
    if (await this.store.publishProfile()) {
      this.toasts.success(
        $localize`:Toast après publication@@profile.published:Votre fiche est publiée dans l'annuaire.`,
      );
    }
  }

  protected async unpublish(): Promise<void> {
    if (await this.store.unpublishProfile()) {
      this.toasts.success(
        $localize`:Toast après dépublication@@profile.unpublished:Votre fiche est retirée de l'annuaire.`,
      );
    }
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.publicUrl());
      this.toasts.success($localize`:Toast lien copié@@profile.linkCopied:Lien copié.`);
    } catch {
      this.toasts.warning(
        $localize`:Copie du lien impossible@@profile.linkCopyFailed:Copie impossible : sélectionnez l'adresse affichée.`,
      );
    }
  }

  protected async savePhoto(photo: Blob): Promise<void> {
    if (!(await this.store.uploadPhoto(photo))) return;
    this.replacePhotoUrl(URL.createObjectURL(photo));
    this.toasts.success($localize`:Toast photo enregistrée@@profile.photoSaved:Photo enregistrée.`);
  }

  protected async removePhoto(): Promise<void> {
    if (await this.store.removePhoto()) this.replacePhotoUrl(null);
  }

  /** Ligne d'un refus 409 → le champ à corriger reçoit le focus. */
  protected focusMissing(item: MissingItem): void {
    const target: Partial<Record<MissingItem, string>> = {
      displayName: 'displayName',
      city: 'city',
      contact: 'contactPhone',
      specialties: 'specialties',
      audiences: 'audiences',
    };
    const field = target[item];
    if (field) this.document.getElementById(fieldId(field))?.focus();
  }

  private fill(profile: Profile): void {
    this.form.reset(fieldsOf(profile), { emitEvent: false });
    this.values.set(this.form.getRawValue());
  }

  private onChange(): void {
    const values = this.form.getRawValue();
    this.values.set(values);
    this.formInvalid.set(this.form.invalid);
    if (this.form.valid) this.store.edit(values);
  }

  private replacePhotoUrl(url: string | null): void {
    const previous = this.photoUrl();
    if (previous) URL.revokeObjectURL(previous);
    this.photoUrl.set(url);
  }

  private relative(at: number): string {
    const seconds = Math.max(0, Math.round((this.now() - at) / 1000));
    if (seconds < 5) {
      return $localize`:Enregistré il y a moins de 5 secondes@@profile.save.justNow:à l'instant`;
    }
    const format = new Intl.RelativeTimeFormat(this.localeId, { style: 'short', numeric: 'auto' });
    if (seconds < 60) return format.format(-seconds, 'second');
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return format.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return format.format(-hours, 'hour');
    return format.format(-Math.round(hours / 24), 'day');
  }
}

function text(max: number): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators: [Validators.maxLength(max)] });
}
