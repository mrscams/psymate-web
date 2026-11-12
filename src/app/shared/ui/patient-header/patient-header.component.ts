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

import { ageInYears, formatDate } from '../../../core/i18n';
import { ShortcutService } from '../../../core/shortcuts';
import { StateKind } from '../../util';
import { StateComponent } from '../state/state.component';

/** Ce que l'en-tête affiche d'un patient (modèle de vue préparé par le store de patient-shell). */
export interface PatientHeaderInfo {
  id: string;
  displayName: string;
  /** Date de naissance (AAAA-MM-JJ) ; l'âge est calculé ici. */
  birthDate?: string | null;
  /** Début du suivi (date ISO) : « suivi·e depuis sept. 2026 ». */
  followedSince?: string | null;
  /** Drapeaux posés par le praticien, toujours ambre (fiche 00 §2). */
  flags?: PatientFlag[];
}

export interface PatientFlag {
  code: string;
  label: string;
}

/** Modalité d'une séance (EntrySessionDto.modality) : « cabinet », « visio », « téléphone », « e-mail ». */
export type SessionModalityCode = 'in_person' | 'video' | 'phone' | 'email';

/**
 * Séance courante (GET /api/patients/{id}/sessions/current) ou dernière séance. La modalité et la
 * durée sont facultatives : la barre de séance et la ligne « Dernière séance » les écrivent quand
 * elles sont connues (« jeu. 5 nov. · cabinet · 50 min »).
 */
export type PatientSessionInfo =
  | { kind: 'current'; startedAt: string; modality?: SessionModalityCode | null }
  | {
      kind: 'last';
      date: string;
      modality?: SessionModalityCode | null;
      durationMin?: number | null;
    }
  | { kind: 'none' };

/**
 * Seuil recommandé (3 h, audit UX du 9 nov. 2026, section 02) au-delà duquel une séance encore
 * ouverte s'affiche « non clôturée » plutôt qu'avec son chronomètre. Libellé d'affichage seulement :
 * la séance reste ouverte côté serveur, Clôturer reste proposé. La feature le passe à l'entrée
 * `unclosedAfterMin` de pm-session-bar.
 */
export const UNCLOSED_SESSION_AFTER_MIN = 180;

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

/** Libellé court d'une modalité de séance, écrit après un « · » (proposition 04b : « cabinet »). */
export function sessionModalityLabel(modality: SessionModalityCode | null | undefined): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité de séance, en minuscules après un point médian@@patientHeader.modality.inPerson:cabinet`;
    case 'video':
      return $localize`:Modalité de séance, en minuscules après un point médian@@patientHeader.modality.video:visio`;
    case 'phone':
      return $localize`:Modalité de séance, en minuscules après un point médian@@patientHeader.modality.phone:téléphone`;
    case 'email':
      return $localize`:Modalité de séance, en minuscules après un point médian@@patientHeader.modality.email:e-mail`;
    default:
      return '';
  }
}

/**
 * En-tête patient permanent, compact (fiche 00 §2, B2 ; proposition 04b « Anatomy and measures » :
 * ligne d'identité de 44 px + onglets de 38 px). Ligne d'identité : nom, âge, « suivi·e depuis »,
 * drapeaux ambre sur une même ligne de base ; à droite, hors séance, « Dernière séance : … » et
 * Démarrer la séance (en `output()`). En séance, rien à droite : le chronomètre et Clôturer sont
 * dans pm-session-bar, posée au-dessus par la feature. Onglets 1 · 2 · 3 (touches 1 2 3,
 * `aria-current`) : l'onglet 1 s'appelle « Séance » tant qu'une séance est ouverte, « Vue
 * d'ensemble » sinon ; emplacement [pmViewToggle] au bout de la ligne des onglets. Composant bête :
 * le PatientShellStore (M1-07) le nourrit. Place réservée, jamais dessinée, pour le marqueur
 * « rapporté par le patient » (A11, B9). Le bloc de saisie n'est plus dans l'en-tête (UX-S2) : la
 * page le pose dans la colonne de contenu.
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
  /** Une action de séance est en cours : Démarrer inactif. */
  readonly busy = input(false);
  /** Onglet 1 seulement : la bascule Vue (slot [pmViewToggle]) n'a de sens que là. */
  readonly showViewToggle = input(false);

  readonly startSession = output<void>();
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly router = inject(Router);
  private readonly shortcuts = inject(ShortcutService);
  private readonly now = signal(Date.now());

  protected readonly tabs = PATIENT_TABS;

  protected readonly inSession = computed(() => this.session()?.kind === 'current');

  protected readonly age = computed(() =>
    ageInYears(this.patient()?.birthDate, new Date(this.now())),
  );
  /** « sept. 2026 » : mois abrégé, la ligne d'identité tient en 44 px (maquette 04b). */
  protected readonly since = computed(() => {
    const value = this.patient()?.followedSince;
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(this.locale, { month: 'short', year: 'numeric' }).format(date);
  });
  protected readonly flags = computed(() => this.patient()?.flags ?? []);

  /** « Dernière séance : jeu. 5 nov. · cabinet · 50 min » ; rien en séance ni sans séance. */
  protected readonly lastSessionText = computed(() => {
    const session = this.session();
    if (!session || session.kind !== 'last') return '';
    const last = formatDate(session.date, this.locale, 'medium');
    const parts = [
      $localize`:Dernière séance dans l'en-tête patient@@patientHeader.session.last:Dernière séance : ${last}:last:`,
    ];
    const modality = sessionModalityLabel(session.modality);
    if (modality) parts.push(modality);
    if (session.durationMin) {
      const minutes = session.durationMin;
      parts.push(
        $localize`:Durée d'une séance dans l'en-tête patient@@patientHeader.session.duration:${minutes}:minutes: min`,
      );
    }
    return parts.join(' · ');
  });

  protected readonly retryAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };
  protected readonly errorTitle = $localize`:État erreur de l'en-tête patient@@patientHeader.error.title:Impossible de charger ce dossier`;

  constructor() {
    // Minute par minute : l'âge reste juste sans rechargement.
    effect((onCleanup) => {
      if (!this.patient()) return;
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

  /** Libellé de l'onglet 1 : « Séance » tant qu'une séance est ouverte. */
  protected tabLabel(tab: (typeof PATIENT_TABS)[number]): string {
    if (tab.key === '1' && this.inSession()) {
      return $localize`:Onglet 1 du dossier pendant une séance@@patientHeader.tab.session:Séance`;
    }
    return tab.label();
  }

  protected link(id: string, segment: string): string[] {
    return segment ? ['/patients', id, segment] : ['/patients', id];
  }
}
