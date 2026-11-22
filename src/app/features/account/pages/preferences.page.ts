import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';

import { Profession, SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { AppLocale, formatDateTime, SubjectLabelPipe } from '../../../core/i18n';
import {
  BOOKING_MODALITIES,
  BookingModality,
  BookingWindow,
  isValidPreference,
  PreferenceKey,
  Preferences,
  PreferencesStore,
} from '../../../core/preferences';
import { ThemePreference } from '../../../core/theme';
import {
  ACCOUNT_PATHS,
  AccountNavComponent,
  ConfirmDialogService,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { ProfileStore } from '../data/profile.store';
import { SecurityStore } from '../data/security.store';
import { RELATIVE_TICK_MS, relativeAgo } from '../ui/relative-time';
import {
  deviceLabel,
  revokedOthersMessage,
  revokeOthersConfirmation,
  UNAVAILABLE_MESSAGE,
} from '../ui/security-messages';
import { TWO_FACTOR_SEGMENT } from './two-factor-segment';
import {
  SegmentedControlComponent,
  SegmentOption,
} from '../ui/preferences/segmented-control.component';
import {
  BookingNumberKey,
  modalityLabel,
  NumberSetting,
  numberSettings,
} from '../ui/preferences/booking-labels';
import { BookingWindowsEditorComponent } from '../ui/preferences/booking-windows-editor.component';
import { SettingRowComponent } from '../ui/preferences/setting-row.component';
import { ThemePickerComponent } from '../ui/preferences/theme-picker.component';

/**
 * /mon-compte/preferences (fiche 14, M1-16) : Affichage, Vocabulaire et saisie, Émotions
 * personnalisées (lien vers la page dédiée, M1-09), Compte et sécurité (résumé, lien vers la page
 * dédiée, M1-17). Chaque réglage s'enregistre immédiatement par le PreferencesStore (optimiste) ;
 * une erreur ramène la valeur serveur et s'annonce par un toast. La bascule de la vue d'ensemble
 * et le sélecteur de fenêtre des écrans patient (M4-05, M4-07) lisent les mêmes clés.
 */
@Component({
  selector: 'pm-preferences-page',
  imports: [
    RouterLink,
    MatSlideToggleModule,
    AccountNavComponent,
    StateComponent,
    SubjectLabelPipe,
    SegmentedControlComponent,
    SettingRowComponent,
    ThemePickerComponent,
    BookingWindowsEditorComponent,
  ],
  providers: [SecurityStore, ProfileStore],
  templateUrl: './preferences.page.html',
  styleUrl: './preferences.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreferencesPage {
  protected readonly prefs = inject(PreferencesStore);
  protected readonly session = inject(SessionStore);
  private readonly toasts = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly paths = ACCOUNT_PATHS;

  /** Trois états du bloc : squelette tant que rien ne vient du serveur, erreur si le GET a échoué. */
  protected readonly stateKind = computed<StateKind | null>(() => {
    if (this.prefs.loaded()) return null;
    return this.prefs.status() === 'error' ? 'error' : 'loading';
  });

  protected readonly errorTitle = $localize`:Titre de l'état erreur des préférences@@preferences.errorTitle:Impossible de charger vos préférences`;
  protected readonly retry = {
    label: $localize`:Bouton Réessayer du bloc Préférences@@preferences.retry:Réessayer`,
    handler: (): void => void this.prefs.load(),
  };

  protected readonly displayName = computed(() => this.session.me()?.displayName ?? '');
  protected readonly subtitle = computed(() =>
    professionLabel(this.session.me()?.profession ?? null),
  );

  /**
   * Indicateur sous le titre (UX-C3) : « Enregistrement… » pendant un PATCH, « Enregistré » ensuite
   * (suivi de « il y a n s », savedAgo), « Enregistré automatiquement » avant tout changement.
   */
  protected readonly savedText = computed(() => {
    if (this.prefs.saving()) {
      return $localize`:Statut pendant l'enregistrement d'un réglage@@preferences.saving:Enregistrement…`;
    }
    return this.prefs.savedAt() === null
      ? $localize`:Statut avant tout changement de réglage@@preferences.savedAuto:Enregistré automatiquement`
      : $localize`:Statut après l'enregistrement d'un réglage@@preferences.savedNow:Enregistré`;
  });

  /** « à l'instant », « il y a 12 s » après le dernier PATCH réussi. */
  protected readonly savedAgo = computed(() => {
    const at = this.prefs.savedAt();
    return this.prefs.saving() || at === null ? '' : relativeAgo(at, this.now(), this.locale);
  });

  // Résumé Compte et sécurité (UX-C3) : sessions et connexion précédente de GET /api/me/security.
  protected readonly security = inject(SecurityStore);
  private readonly confirm = inject(ConfirmDialogService);
  protected readonly stateOf = stateKind;
  protected readonly deviceLabel = deviceLabel;
  protected readonly unavailable = UNAVAILABLE_MESSAGE;
  protected readonly twoFactorPath = `${ACCOUNT_PATHS.security}/${TWO_FACTOR_SEGMENT}`;
  protected readonly sessionsErrorTitle = $localize`:Titre de l'état erreur des sessions@@account.security.sessions.errorTitle:Impossible de charger vos sessions`;
  protected readonly retrySecurity = {
    label: $localize`:Réessayer le chargement des sessions@@account.security.sessions.retry:Réessayer`,
    handler: (): void => void this.security.load(),
  };
  protected readonly revokedText = computed(() =>
    revokedOthersMessage(this.security.revokedOthers()),
  );
  protected readonly revokeError = computed(() => this.security.revokeOthersStatus() === 'error');

  private readonly now = signal(Date.now());

  constructor() {
    void this.security.load();
    void this.profile.loadProfile();
    const tick = setInterval(() => this.now.set(Date.now()), RELATIVE_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  protected formatDate(value: string): string {
    return formatDateTime(value, this.locale);
  }

  /** « Déconnecter les autres » : même confirmation que Compte et sécurité, puis le nombre annoncé. */
  protected async revokeOthers(): Promise<void> {
    if (await this.confirm.confirm(revokeOthersConfirmation())) {
      await this.security.revokeOthers();
    }
  }

  protected readonly twoFactorText = computed(() =>
    this.session.twoFactorEnabled()
      ? $localize`:Double authentification active@@preferences.security.twoFactor.on:Activée`
      : $localize`:Double authentification inactive@@preferences.security.twoFactor.off:Non activée`,
  );

  protected readonly windowOptions: SegmentOption<Preferences['overview.window']>[] = [
    { value: '30d', label: $localize`:Fenêtre de 30 jours@@preferences.window.30d:30 j` },
    { value: '90d', label: $localize`:Fenêtre de 90 jours@@preferences.window.90d:90 j` },
    { value: '12m', label: $localize`:Fenêtre de 12 mois@@preferences.window.12m:1 an` },
  ];
  protected readonly groupByOptions: SegmentOption<Preferences['timeline.groupBy']>[] = [
    {
      value: 'session',
      label: $localize`:Timeline par séance@@preferences.groupBy.session:Par séance`,
    },
    { value: 'month', label: $localize`:Timeline par mois@@preferences.groupBy.month:Par mois` },
    {
      value: 'chronological',
      label: $localize`:Timeline chronologique@@preferences.groupBy.chronological:Chronologique`,
    },
  ];
  protected readonly subjectOptions: SegmentOption<Preferences['vocabulary.subjectLabel']>[] = [
    {
      value: 'patient',
      label: $localize`:Désignation patient@@preferences.subject.patient:Patient·e`,
    },
    { value: 'client', label: $localize`:Désignation client@@preferences.subject.client:Client·e` },
  ];
  protected readonly visibilityOptions: SegmentOption<Preferences['entries.defaultVisibility']>[] =
    [
      {
        value: 'clinical',
        label: $localize`:Visibilité clinique@@preferences.visibility.clinical:Clinique`,
      },
      {
        value: 'private',
        label: $localize`:Visibilité privée@@preferences.visibility.private:Privée`,
      },
    ];

  protected setWindow(value: Preferences['overview.window']): void {
    void this.apply('overview.window', value);
  }
  protected setGroupBy(value: Preferences['timeline.groupBy']): void {
    void this.apply('timeline.groupBy', value);
  }
  protected setTheme(value: ThemePreference): void {
    void this.apply('theme', value);
  }
  protected setLocale(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as AppLocale;
    void this.apply('locale', value);
  }
  protected setSubject(value: Preferences['vocabulary.subjectLabel']): void {
    void this.apply('vocabulary.subjectLabel', value);
  }
  protected setMedication(checked: boolean): void {
    void this.apply('entryTypes.medicationVisible', checked);
  }
  protected setVisibility(value: Preferences['entries.defaultVisibility']): void {
    void this.apply('entries.defaultVisibility', value);
  }

  /** Durée de séance : le client vérifie la forme (entier), le serveur juge la plage (422). */
  protected setDuration(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (input.value.trim() === '' || !Number.isInteger(value)) {
      input.value = String(this.prefs.defaultDurationMin());
      this.toasts.warning(
        $localize`:Durée de séance non entière@@preferences.duration.invalid:Saisissez un nombre entier de minutes.`,
      );
      return;
    }
    if (value === this.prefs.defaultDurationMin()) return;
    void this.apply('sessions.defaultDurationMin', value).then((problem) => {
      if (problem) input.value = String(this.prefs.defaultDurationMin());
    });
  }

  // Prise de rendez-vous en ligne (M14-11, fiche 14, G Q64) : les huit clés booking.* lues et écrites
  // par le PreferencesStore ; « publié » vient de GET /api/me/profile (ProfileStore de la feature),
  // « approuvé » du statut de vérification de la session.
  protected readonly profile = inject(ProfileStore);
  private readonly document = inject(DOCUMENT);

  /** Plages enregistrées, telles que le serveur les a renvoyées (jamais la valeur optimiste). */
  protected readonly savedWindows = computed<readonly BookingWindow[]>(
    () => this.prefs.server()?.['booking.windows'] ?? this.prefs.values()['booking.windows'],
  );
  protected readonly bookingEnabled = computed(() => this.prefs.values()['booking.enabled']);
  /** Activation enregistrée par le serveur : « Proposée… » et le lien n'anticipent pas le PATCH. */
  private readonly savedEnabled = computed(
    () => this.prefs.server()?.['booking.enabled'] ?? this.prefs.values()['booking.enabled'],
  );
  protected readonly bookingMode = computed(() => this.prefs.values()['booking.confirmation']);
  /** Vrai, faux, ou null tant que le profil n'est pas lu (ni bandeau ni « Proposée » alors). */
  protected readonly published = computed<boolean | null>(
    () => this.profile.profile().data?.published ?? null,
  );
  private readonly approved = computed(() => this.session.verificationStatus() === 'approved');

  /** Offerte : activée, au moins une plage enregistrée, profil publié, praticien approuvé (Q75). */
  protected readonly bookingOffered = computed(
    () =>
      this.savedEnabled() &&
      this.savedWindows().length > 0 &&
      this.published() === true &&
      this.approved(),
  );

  /** Ligne d'état de la section : une phrase, ou rien (fiche 14, « Structure de la section »). */
  protected readonly bookingStatus = computed<string | null>(() => {
    if (!this.bookingEnabled()) {
      return $localize`:État de la prise de rendez-vous désactivée@@preferences.booking.status.disabled:Désactivée : votre fiche publique n'a pas de bouton « Prendre rendez-vous ».`;
    }
    if (this.savedWindows().length === 0) {
      return $localize`:État de la prise de rendez-vous sans plage@@preferences.booking.status.noWindow:La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage.`;
    }
    return this.bookingOffered()
      ? $localize`:État de la prise de rendez-vous proposée@@preferences.booking.status.offered:Proposée sur votre fiche publique.`
      : null;
  });

  /** « Voir ma page de rendez-vous » : la page publique, sous la langue courante (base href). */
  protected readonly bookingPageUrl = computed(
    () => new URL(`praticiens/${this.profile.slug()}/rendez-vous`, this.document.baseURI).href,
  );

  protected readonly modalities = BOOKING_MODALITIES;
  protected readonly modalityLabel = modalityLabel;
  protected readonly numberSettings = numberSettings();

  /** Cases cochées à l'écran : suivent le store, gardent un décochage refusé (aucune modalité). */
  protected readonly modalityDraft = linkedSignal<readonly BookingModality[]>(
    () => this.prefs.values()['booking.modalities'],
  );

  /** Fuseaux proposés : ceux du moteur Intl, plus la valeur enregistrée si le moteur l'ignore. */
  protected readonly timeZones = computed(() => {
    const saved = this.prefs.values()['booking.timezone'];
    const zones = supportedTimeZones();
    return zones.includes(saved) ? zones : [saved, ...zones];
  });

  /** Fuseau du navigateur, proposé quand la fonction est activée sans plage et qu'il diffère. */
  protected readonly browserTimeZone = browserTimeZone();
  protected readonly suggestTimeZone = computed(
    () =>
      this.browserTimeZone !== null &&
      this.bookingEnabled() &&
      this.savedWindows().length === 0 &&
      this.prefs.values()['booking.timezone'] !== this.browserTimeZone,
  );

  /** Message sous chaque réglage : forme refusée par l'écran, ou 422 du serveur pour cette clé. */
  private readonly bookingErrors = signal<Partial<Record<PreferenceKey, string>>>({});

  /** Saisie hors bornes gardée dans son champ (la valeur du store, elle, n'a pas changé). */
  private readonly numberDrafts = signal<Partial<Record<BookingNumberKey, string>>>({});

  protected readonly windowsSaving = computed(() =>
    Boolean(this.prefs.pending()['booking.windows']),
  );

  protected numberValue(setting: NumberSetting): string {
    return this.numberDrafts()[setting.key] ?? String(this.prefs.values()[setting.key]);
  }

  protected bookingError(key: PreferenceKey): string | null {
    if (key === 'booking.modalities' && this.modalityDraft().length === 0) {
      return $localize`:Erreur, aucune modalité cochée@@preferences.booking.modalities.error:Gardez au moins une modalité.`;
    }
    return this.bookingErrors()[key] ?? null;
  }

  protected setBookingEnabled(checked: boolean): void {
    void this.applyBooking('booking.enabled', checked);
  }

  protected setBookingMode(value: Preferences['booking.confirmation']): void {
    if (value !== this.bookingMode()) void this.applyBooking('booking.confirmation', value);
  }

  protected saveWindows(windows: BookingWindow[]): void {
    void this.applyBooking('booking.windows', windows);
  }

  /** Entier dans les bornes (et au pas) : sinon le message sous le réglage, aucune requête. */
  protected setNumber(setting: NumberSetting, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim();
    const value = Number(raw);
    if (raw === '' || !isValidPreference(setting.key, value)) {
      this.numberDrafts.update((drafts) => ({ ...drafts, [setting.key]: raw }));
      this.setBookingError(setting.key, setting.rangeError);
      return;
    }
    this.numberDrafts.update((drafts) => withoutKey(drafts, setting.key));
    this.setBookingError(setting.key, null);
    if (value === this.prefs.values()[setting.key]) return;
    void this.applyBooking(setting.key, value).then((problem) => {
      if (problem) input.value = this.numberValue(setting);
    });
  }

  /** La dernière case cochée ne se décoche pas sans message ; rien ne part sans modalité. */
  protected toggleModality(modality: BookingModality, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.modalityDraft();
    const next = BOOKING_MODALITIES.filter((candidate) =>
      candidate === modality ? checked : current.includes(candidate),
    );
    // Aucune case cochée : le message vient de l'état des cases (bookingError) et s'efface dès
    // qu'une case est recochée, par le praticien ou par une relecture.
    this.modalityDraft.set(next);
    if (next.length === 0) return;
    void this.applyBooking('booking.modalities', next).then((problem) => {
      if (problem) this.modalityDraft.set(this.prefs.values()['booking.modalities']);
    });
  }

  protected setTimeZone(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value === this.prefs.values()['booking.timezone']) return;
    void this.applyBooking('booking.timezone', select.value).then((problem) => {
      if (problem) select.value = this.prefs.values()['booking.timezone'];
    });
  }

  protected useBrowserTimeZone(): void {
    if (this.browserTimeZone) void this.applyBooking('booking.timezone', this.browserTimeZone);
  }

  private setBookingError(key: PreferenceKey, message: string | null): void {
    this.bookingErrors.update((errors) =>
      message === null ? withoutKey(errors, key) : { ...errors, [key]: message },
    );
  }

  /**
   * Écrit une clé booking.* par le store : la réponse du PATCH (préférences après fusion) est la
   * relecture. Un 422 s'affiche sous le réglage de la clé, avec le message du serveur ; une autre
   * erreur, par le toast de la page. Après un refus, les préférences sont relues (GET).
   */
  private async applyBooking<K extends PreferenceKey>(
    key: K,
    value: Preferences[K],
  ): Promise<ApiProblem | null> {
    this.setBookingError(key, null);
    const problem = await this.prefs.set(key, value);
    if (!problem) return null;
    if (problem.status === 422) {
      const field = problem.errors?.find((error) => error.field === key) ?? problem.errors?.[0];
      this.setBookingError(key, field?.message ?? saveFailedMessage(problem));
    } else {
      this.toasts.warning(saveFailedMessage(problem));
    }
    await this.prefs.load();
    return problem;
  }

  /** Enregistre (optimiste) ; en erreur, le store a déjà rétabli la valeur serveur : on le dit. */
  private async apply<K extends PreferenceKey>(
    key: K,
    value: Preferences[K],
  ): Promise<ApiProblem | null> {
    const problem = await this.prefs.set(key, value);
    if (problem) this.toasts.warning(saveFailedMessage(problem));
    return problem;
  }
}

function saveFailedMessage(problem: ApiProblem): string {
  const fieldMessage = problem.status === 422 ? problem.errors?.[0]?.message : undefined;
  return fieldMessage
    ? $localize`:Toast quand le serveur refuse un réglage (422)@@preferences.saveRejected:Réglage non enregistré : ${fieldMessage}:reason:`
    : $localize`:Toast quand l'enregistrement d'un réglage échoue@@preferences.saveFailed:Impossible d'enregistrer ce réglage. La valeur précédente est rétablie.`;
}

function withoutKey<T extends object>(record: T, key: PropertyKey): T {
  const copy = { ...record } as Record<PropertyKey, unknown>;
  delete copy[key];
  return copy as T;
}

/** Fuseaux IANA du moteur (Intl.supportedValuesOf), vide si le moteur ne les liste pas. */
function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

/** Fuseau du navigateur (Intl), ou null s'il est inconnu. */
function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Libellé de la profession pour la navigation Mon compte (« Psychologue »). */
export function professionLabel(profession: Profession | null): string | undefined {
  switch (profession) {
    case 'psychologist':
      return $localize`:Profession@@profession.psychologist:Psychologue`;
    case 'psychiatrist':
      return $localize`:Profession@@profession.psychiatrist:Psychiatre`;
    case 'coach':
      return $localize`:Profession@@profession.coach:Coach`;
    default:
      return undefined;
  }
}
