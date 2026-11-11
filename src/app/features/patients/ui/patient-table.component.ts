import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';

import {
  ageInYears,
  formatMonthYear,
  formatRelativeDay,
  SubjectLabelPipe,
} from '../../../core/i18n';
import { initials } from '../../../shared/util';
import {
  demoDisplayName,
  DominantEmotion,
  isDemoPatient,
  PatientActivity,
  PatientSort,
  PatientView,
} from '../data/patient.model';
import { PatientListRow } from '../data/patient-list.store';
import { highlightParts } from './highlight';
import { sessionModalityLabel } from './patient-labels';
import { PatientFlagsComponent } from './patient-flags.component';

/** Seuil sous lequel la colonne d'émotions dit « peu de données » (ressentis sur 30 jours). */
export const FEW_FEELINGS = 3;

/** État du résumé d'une ligne pour les colonnes qui en dépendent. */
type ActivityState = 'none' | 'loading' | 'error' | 'loaded';

interface EmotionDot {
  code: string;
  label: string;
  color: string;
}

/** Ligne préparée pour le gabarit. */
interface TableRow {
  patient: PatientView;
  link: string[];
  initials: string;
  name: { text: string; match: boolean }[];
  /** « 34 ans · suivie depuis mars 2025 », « données fictives · supprimable », « archivé·e … ». */
  detail: string;
  archived: boolean;
  /** Patient de démonstration (« DEMO · … », G Q22) : badge, avatar pointillé, « Supprimer ». */
  demo: boolean;
  state: ActivityState;
  last: { relative: string; detail: string } | null;
  emotions: EmotionDot[];
  /** « anxiété ↑ », « stable », « peu de données », ou la phrase d'absence. */
  emotionText: string;
  /** Même information, en toutes lettres, pour les lecteurs d'écran. */
  emotionSpoken: string;
  situations: { count: number; first: string | null } | null;
  drafts: number;
}

/**
 * Tableau des patients (fiche 01, maquette 01, UX-B1) : vrai `<table>`, en-têtes `scope="col"`,
 * tri annoncé par `aria-sort`. Colonnes Patient · Dernière séance · Émotions dominantes 30 j ·
 * Situations actives · Flags (masquée quand aucun patient n'en porte) ; la colonne « Prochaine »
 * de la maquette est absente, le contrat n'a pas de séance planifiée (G Q25, agenda hors V1).
 * Le nom est un lien vers la vue d'ensemble étendu à toute la ligne (pseudo-élément sur la ligne,
 * pas de clic en JavaScript), « Ouvrir → » en dernière colonne ; ↑ ↓ passent d'une ligne à l'autre
 * et Entrée ouvre. Le patient de démonstration porte le badge DEMO, un avatar pointillé et
 * « Supprimer » (confirmation simple, planche 29) ; archivé, « Restaurer ».
 */
@Component({
  selector: 'pm-patient-table',
  imports: [RouterLink, MatMenuModule, PatientFlagsComponent, SubjectLabelPipe],
  templateUrl: './patient-table.component.html',
  styleUrl: './patient-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ↑ ↓ entre les liens des lignes (les liens portent le focus, l'hôte n'écoute que la touche).
  host: { '(keydown)': 'onKeydown($event)' },
})
export class PatientTableComponent {
  readonly rows = input.required<PatientListRow[]>();
  readonly query = input('');
  readonly sort = input<PatientSort>('lastSession');
  /** Rechargement en cours avec la liste précédente affichée : grisée. */
  readonly refreshing = input(false);
  /** « Supprimer » sur la ligne d'un patient de démonstration actif. */
  readonly removeDemo = output<PatientView>();
  /** « Restaurer » sur la ligne d'un patient de démonstration archivé. */
  readonly restoreDemo = output<PatientView>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly view = computed<TableRow[]>(() => {
    const now = new Date();
    return this.rows().map((row) => this.toRow(row, now));
  });

  /** Colonne Flags seulement si un patient affiché porte un drapeau ou un brouillon (audit 01). */
  protected readonly showFlags = computed(() =>
    this.view().some((row) => row.patient.flags.length > 0 || row.drafts > 0),
  );

  protected readonly nameSort = computed(() => (this.sort() === 'name' ? 'ascending' : null));
  protected readonly lastSort = computed(() =>
    this.sort() === 'lastSession' ? 'descending' : null,
  );

  protected readonly unavailable = $localize`:Cellule de la liste sans résumé@@patients.table.unavailable:Résumé indisponible`;
  protected readonly notLoaded = $localize`:Cellule de la liste au-delà des résumés chargés@@patients.table.notLoaded:Résumé chargé pour les 20 premiers seulement`;
  protected readonly loadingLabel = $localize`:Cellule de la liste en cours de chargement@@patients.table.loading:Chargement…`;

  /** Première ligne du tableau (↓ depuis le filtre). */
  focusFirst(): void {
    this.links()[0]?.focus();
  }

  /** ↑ ↓ sur un lien de ligne : ligne précédente ou suivante ; Entrée suit le lien (natif). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = this.links();
    const index = links.indexOf(event.target as HTMLAnchorElement);
    if (index === -1) return;
    event.preventDefault();
    const next = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
  }

  private links(): HTMLAnchorElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLAnchorElement>('a.row-link')];
  }

  protected removeLabel(name: string): string {
    return $localize`:Nom accessible du retrait du patient de démonstration@@patients.demo.removeLabel:Supprimer la démo : ${name}:name:`;
  }

  protected restoreLabel(name: string): string {
    return $localize`:Nom accessible de la restauration du patient de démonstration@@patients.demo.restoreLabel:Restaurer le patient de démonstration ${name}:name:`;
  }

  protected moreLabel(name: string): string {
    return $localize`:Bouton du menu d'actions d'une ligne@@patients.table.moreLabel:Plus d'actions pour ${name}:name:`;
  }

  protected editLabel(name: string): string {
    return $localize`:Lien vers la fiche d'un patient@@patients.table.editLabel:Modifier la fiche de ${name}:name:`;
  }

  private toRow(row: PatientListRow, now: Date): TableRow {
    const patient = row.patient;
    const demo = isDemoPatient(patient);
    const shown = demoDisplayName(patient);
    const archived = !!patient.archivedAt;
    const activity = row.activity;
    const state: ActivityState =
      row.cell === null
        ? 'none'
        : activity
          ? 'loaded'
          : row.cell.status === 'error'
            ? 'error'
            : 'loading';
    const emotions = activity ? this.emotionDots(activity.emotions) : [];
    const { text, spoken } = this.emotionSummary(activity);
    return {
      patient,
      link: ['/patients', patient.id, 'overview'],
      initials: initials(shown),
      name: highlightParts(shown, this.query()),
      detail: this.detail(patient, activity, demo, archived, now),
      archived,
      demo,
      state,
      last: activity?.lastSession ? this.lastSession(activity, now) : null,
      emotions,
      emotionText: text,
      emotionSpoken: spoken,
      situations: activity ? activity.situations : null,
      drafts: activity?.drafts ?? 0,
    };
  }

  private detail(
    patient: PatientView,
    activity: PatientActivity | null,
    demo: boolean,
    archived: boolean,
    now: Date,
  ): string {
    if (archived) {
      const when = formatRelativeDay(patient.archivedAt!, this.locale, now);
      return $localize`:Date d'archivage dans la liste@@patients.table.archivedSince:Archivé·e ${when}:when:`;
    }
    if (demo) {
      return $localize`:Sous-titre du patient de démonstration@@patients.demo.detail:données fictives · supprimable`;
    }
    const parts: string[] = [];
    const age = ageInYears(patient.birthDate, now);
    if (age !== null) {
      parts.push(
        $localize`:Âge dans la liste des patients@@patients.table.ageYears:${age}:age: ans`,
      );
    }
    const since = patient.followUp.since ?? activity?.followedSince ?? null;
    if (since) {
      const month = formatMonthYear(since, this.locale, 'UTC');
      parts.push(followedSince(month, patient.pronoun));
    }
    return parts.join(' · ');
  }

  private lastSession(activity: PatientActivity, now: Date): { relative: string; detail: string } {
    const session = activity.lastSession!;
    const relative = relativeAge(session.at, this.locale, now);
    const day = new Intl.DateTimeFormat(this.locale, { day: 'numeric', month: 'short' }).format(
      new Date(session.at),
    );
    const detail = session.modality ? `${day} · ${sessionModalityLabel(session.modality)}` : day;
    return { relative, detail };
  }

  private emotionDots(emotions: DominantEmotion[]): EmotionDot[] {
    return emotions.map((emotion) => ({
      code: emotion.code,
      label: emotion.label,
      color: emotion.family ? `var(--emotion-${emotion.family})` : 'var(--feeling)',
    }));
  }

  /**
   * Libellé court de la maquette : émotion dominante et sens de sa variation sur 30 jours (↑ ↓),
   * « stable » sans variation, « peu de données » sous FEW_FEELINGS ressentis.
   */
  private emotionSummary(activity: PatientActivity | null): { text: string; spoken: string } {
    if (!activity) return { text: '', spoken: '' };
    const [first] = activity.emotions;
    if (!first) {
      const none = activity.lastSession
        ? $localize`:Liste, aucune émotion sur 30 jours après une séance@@patients.emotions.noneYet:pas de ressenti sur 30 j`
        : $localize`:Liste, aucune séance ni émotion@@patients.emotions.none:aucun ressenti`;
      return { text: none, spoken: none };
    }
    const names = activity.emotions.map((emotion) => emotion.label).join(', ');
    const label = first.label.toLocaleLowerCase(this.locale);
    if (activity.feelingCount < FEW_FEELINGS) {
      const few = $localize`:Liste, émotions dominantes avec peu de ressentis@@patients.emotions.few:peu de données`;
      return { text: few, spoken: `${names} · ${few}` };
    }
    if (first.delta > 0) {
      return {
        text: `${label} ↑`,
        spoken: $localize`:Liste, émotion dominante en hausse (lecteur d'écran)@@patients.emotions.upSpoken:${names}:names: ; ${label}:label: en hausse`,
      };
    }
    if (first.delta < 0) {
      return {
        text: `${label} ↓`,
        spoken: $localize`:Liste, émotion dominante en baisse (lecteur d'écran)@@patients.emotions.downSpoken:${names}:names: ; ${label}:label: en baisse`,
      };
    }
    const stable = $localize`:Liste, émotions dominantes stables@@patients.emotions.stable:stable`;
    return { text: stable, spoken: `${names} · ${stable}` };
  }
}

const DAY_MS = 86_400_000;

/**
 * Ancienneté de la dernière séance, comme la maquette : « aujourd'hui », « hier », « il y a 3 j »
 * jusqu'à 13 jours, puis « il y a 2 sem. » jusqu'à 8 semaines, puis « il y a 3 mois » (Intl, style
 * court, jours civils du navigateur).
 */
export function relativeAge(value: string, locale: string, now: Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / DAY_MS);
  if (days < 14) return formatRelativeDay(date, locale, now);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (days < 56) return format.format(-Math.round(days / 7), 'week');
  return format.format(-Math.round(days / 30), 'month');
}

/** « suivie depuis mars 2025 » : l'accord suit le pronom de la fiche, écriture inclusive sinon. */
function followedSince(month: string, pronoun: string | null): string {
  switch (pronoun) {
    case 'elle':
      return $localize`:Début du suivi dans la liste, accord féminin@@patients.table.since.f:suivie depuis ${month}:month:`;
    case 'il':
      return $localize`:Début du suivi dans la liste, accord masculin@@patients.table.since.m:suivi depuis ${month}:month:`;
    default:
      return $localize`:Début du suivi dans la liste, accord inclusif@@patients.table.since.n:suivi·e depuis ${month}:month:`;
  }
}
