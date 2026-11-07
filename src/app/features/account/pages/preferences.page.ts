import { ChangeDetectionStrategy, Component, computed, inject, LOCALE_ID } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';

import { Profession, SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { AppLocale, SubjectLabelPipe } from '../../../core/i18n';
import { PreferenceKey, Preferences, PreferencesStore } from '../../../core/preferences';
import { ThemePreference } from '../../../core/theme';
import {
  ACCOUNT_PATHS,
  AccountNavComponent,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { StateKind } from '../../../shared/util';
import {
  SegmentedControlComponent,
  SegmentOption,
} from '../ui/preferences/segmented-control.component';
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
  ],
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

  protected readonly retry = {
    label: $localize`:Bouton Réessayer du bloc Préférences@@preferences.retry:Réessayer`,
    handler: (): void => void this.prefs.load(),
  };

  protected readonly displayName = computed(() => this.session.me()?.displayName ?? '');
  protected readonly subtitle = computed(() =>
    professionLabel(this.session.me()?.profession ?? null),
  );

  /** « Enregistrement… » pendant un PATCH, puis « Enregistré à 09:12 ». */
  protected readonly savedText = computed(() => {
    if (this.prefs.saving()) {
      return $localize`:Statut pendant l'enregistrement d'un réglage@@preferences.saving:Enregistrement…`;
    }
    const at = this.prefs.savedAt();
    if (at === null) return '';
    const time = new Intl.DateTimeFormat(this.locale, { timeStyle: 'short' }).format(new Date(at));
    return $localize`:Statut après l'enregistrement d'un réglage@@preferences.saved:Enregistré à ${time}:time:`;
  });

  protected readonly twoFactorText = computed(() =>
    this.session.twoFactorEnabled()
      ? $localize`:Double authentification active@@preferences.security.twoFactor.on:Activée`
      : $localize`:Double authentification inactive@@preferences.security.twoFactor.off:Non activée`,
  );

  protected readonly viewOptions: SegmentOption<Preferences['overview.view']>[] = [
    { value: 'simple', label: $localize`:Vue d'ensemble simple@@preferences.view.simple:Simple` },
    {
      value: 'complete',
      label: $localize`:Vue d'ensemble complète@@preferences.view.complete:Complète`,
    },
  ];
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

  protected setView(value: Preferences['overview.view']): void {
    void this.apply('overview.view', value);
  }
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
