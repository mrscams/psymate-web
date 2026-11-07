import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import {
  ageInYears,
  formatDate,
  formatMinutes,
  formatMonthYear,
  minutesBetween,
} from '../../../core/i18n';
import { ShortcutService } from '../../../core/shortcuts';
import { StateKind } from '../../util';
import { StateComponent } from '../state/state.component';

/** Ce que l'en-tête affiche d'un patient (modèle de vue préparé par le store de patient-shell). */
export interface PatientHeaderInfo {
  id: string;
  displayName: string;
  /** Date de naissance (AAAA-MM-JJ) ; l'âge est calculé ici. */
  birthDate?: string | null;
  /** Début du suivi (date ISO) : « suivi·e depuis mars 2025 ». */
  followedSince?: string | null;
  /** Drapeaux posés par le praticien, toujours ambre (fiche 00 §2). */
  flags?: PatientFlag[];
}

export interface PatientFlag {
  code: string;
  label: string;
}

/** Séance courante (GET /api/patients/{id}/sessions/current) ou dernière séance. */
export type PatientSessionInfo =
  { kind: 'current'; startedAt: string } | { kind: 'last'; date: string } | { kind: 'none' };

/** Les trois onglets du dossier et leurs routes (fiches 02, 03, 04). */
export const PATIENT_TABS = [
  {
    key: '1',
    segment: '',
    label: () => $localize`:Onglet du dossier@@patientHeader.tab.overview:Vue d'ensemble`,
  },
  {
    key: '2',
    segment: 'timeline',
    label: () => $localize`:Onglet du dossier@@patientHeader.tab.timeline:Timeline`,
  },
  {
    key: '3',
    segment: 'graph',
    label: () => $localize`:Onglet du dossier@@patientHeader.tab.graph:Graphe`,
  },
] as const;

/**
 * En-tête patient permanent (fiche 00 §2, B2) : nom, âge, « suivi·e depuis », drapeaux ambre,
 * séance courante ou dernière séance, Démarrer / Clôturer la séance (en `output()`), onglets
 * 1 Vue d'ensemble · 2 Timeline · 3 Graphe (touches 1 2 3, `aria-current`), emplacements pour la
 * bascule Vue et la barre de capture. Composant bête : le PatientShellStore (M1-07) le nourrit.
 * Place réservée, jamais dessinée, pour le marqueur « rapporté par le patient » (A11, B9).
 */
@Component({
  selector: 'pm-patient-header',
  imports: [MatButtonModule, RouterLink, RouterLinkActive, StateComponent],
  templateUrl: './patient-header.component.html',
  styleUrl: './patient-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientHeaderComponent {
  readonly patient = input<PatientHeaderInfo | null>(null);
  readonly session = input<PatientSessionInfo | null>(null);
  /** État du bloc quand le patient n'est pas encore là : loading ou error ; null sinon. */
  readonly state = input<StateKind | null>(null);
  /** Une action de séance est en cours : boutons inactifs. */
  readonly busy = input(false);
  /** Onglet 1 seulement : la bascule Vue (slot [pmViewToggle]) n'a de sens que là. */
  readonly showViewToggle = input(false);

  readonly startSession = output<void>();
  readonly closeSession = output<void>();
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly router = inject(Router);
  private readonly shortcuts = inject(ShortcutService);
  private readonly now = signal(Date.now());

  protected readonly tabs = PATIENT_TABS;

  protected readonly age = computed(() =>
    ageInYears(this.patient()?.birthDate, new Date(this.now())),
  );
  protected readonly since = computed(() => {
    const value = this.patient()?.followedSince;
    return value ? formatMonthYear(value, this.locale) : '';
  });
  protected readonly flags = computed(() => this.patient()?.flags ?? []);

  protected readonly sessionText = computed(() => {
    const session = this.session();
    if (!session || session.kind === 'none') return '';
    if (session.kind === 'current') {
      const day = formatDate(session.startedAt, this.locale, 'medium');
      const since = formatMinutes(
        minutesBetween(session.startedAt, new Date(this.now())),
        this.locale,
      );
      return $localize`:Séance en cours dans l'en-tête patient@@patientHeader.session.current:Séance du ${day}:day: · en cours depuis ${since}:since:`;
    }
    const last = formatDate(session.date, this.locale, 'medium');
    return $localize`:Dernière séance dans l'en-tête patient@@patientHeader.session.last:Dernière séance : ${last}:last:`;
  });

  protected readonly retryAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };
  protected readonly errorTitle = $localize`:État erreur de l'en-tête patient@@patientHeader.error.title:Impossible de charger ce dossier`;

  constructor() {
    // Minute par minute : « en cours depuis 18 min » et l'âge restent justes sans rechargement.
    effect((onCleanup) => {
      if (this.session()?.kind !== 'current') return;
      const timer = setInterval(() => this.now.set(Date.now()), 60_000);
      onCleanup(() => clearInterval(timer));
    });
    // Touches 1 2 3 (B2) tant qu'un patient est affiché.
    effect((onCleanup) => {
      const patient = this.patient();
      if (!patient) return;
      const releases = this.tabs.map((tab) =>
        this.shortcuts.register(
          tab.key,
          () => void this.router.navigate(this.link(patient.id, tab.segment)),
        ),
      );
      onCleanup(() => releases.forEach((release) => release()));
    });
  }

  protected link(id: string, segment: string): string[] {
    return segment ? ['/patients', id, segment] : ['/patients', id];
  }
}
