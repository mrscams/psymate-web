import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { EntryIconComponent, entryTypeLabel } from '../../../shared/ui';
import { Loadable, StateKind } from '../../../shared/util';
import {
  blockState,
  GRAPH_ROOT_PARAM,
  isBriefEmpty,
  isFeelingsEmpty,
  isFrameEmpty,
  isMedicationsEmpty,
  isSessionsEmpty,
  isSinceEmpty,
  isSituationsEmpty,
  isTodoEmpty,
  OverviewView,
  RecentSession,
  TIMELINE_PARAMS,
} from '../data/overview.model';
import { OverviewBlockComponent } from './overview-block.component';
import { OverviewFeelingsComponent } from './overview-feelings.component';
import {
  flagLabel,
  formatDay,
  formatIntensity,
  modalityLabel,
  sessionHeading,
  windowLongLabel,
} from './overview-labels';

/** Paramètre de l'éditeur d'entrée (features/entries, ENTRY_QUERY_PARAM) : le shell l'ouvre. */
const ENTRY_PARAM = 'entry';

/** Les blocs de la vue simple, chacun avec ses trois états. */
export type SimpleBlock =
  | 'brief'
  | 'feelings'
  | 'lastSession'
  | 'situations'
  | 'since'
  | 'medications'
  | 'frame'
  | 'todo';

const EMPTY: Record<SimpleBlock, (view: OverviewView) => boolean> = {
  brief: isBriefEmpty,
  feelings: isFeelingsEmpty,
  lastSession: isSessionsEmpty,
  situations: isSituationsEmpty,
  since: isSinceEmpty,
  medications: isMedicationsEmpty,
  frame: isFrameEmpty,
  todo: isTodoEmpty,
};

/**
 * Vue simple « Récit » de l'onglet 1 (B8, fiche 02 / maquette 02b, M4-07), vue par défaut
 * (préférence overview.view). Même synthèse que la vue complète (GET …/overview, OverviewStore de
 * la page) : seule la présentation change, la bascule ne relit rien.
 * - Colonne de lecture : « En bref » (phrases de narrative.sentences affichées telles quelles, une
 *   par paragraphe, jamais recomposées ; point d'attention narrative.attention), les ressentis réels
 *   (graphe à points), la dernière séance avec son compte rendu entier, les situations en cours.
 * - Colonne latérale : depuis la dernière séance, traitement, cadre du suivi, à compléter.
 * Aucune phrase n'est rédigée ici : seulement des titres et des libellés posés sur les données.
 */
@Component({
  selector: 'pm-overview-simple',
  imports: [EntryIconComponent, OverviewBlockComponent, OverviewFeelingsComponent, RouterLink],
  templateUrl: './overview-simple.component.html',
  styleUrl: './overview-simple.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewSimpleComponent {
  /** La synthèse du store (gardée pendant une relecture, planche 29). */
  readonly overview = input.required<Loadable<OverviewView>>();
  readonly patientId = input.required<string>();
  /** Relecture en cours, le contenu précédent reste affiché. */
  readonly refreshing = input(false);
  /** « Réessayer » d'un bloc en erreur. */
  readonly retry = output<void>();
  /** Clic sur un point du graphe : l'entrée du ressenti. */
  readonly entrySelected = output<string>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly view = computed(() => this.overview().data);

  protected readonly feelingsHeading = computed(() => {
    const window = this.view()?.window;
    return window
      ? $localize`:Titre du bloc des ressentis de la vue simple@@overview.simple.feelings.heading:Comment évoluent les ressentis · ${windowLongLabel(window)}:period:`
      : $localize`:Titre du bloc des ressentis de la vue simple, sans fenêtre@@overview.simple.feelings.headingShort:Comment évoluent les ressentis`;
  });

  /**
   * « Depuis la séance du 17 oct. » ; sans séance clôturée, le serveur donne les dernières entrées
   * hors séances (« Dernières entrées »).
   */
  protected readonly sinceHeading = computed(() => {
    const view = this.view();
    const at = view?.sinceLastSession.lastSessionAt;
    if (at) {
      return $localize`:Titre du bloc depuis la dernière séance, avec sa date@@overview.simple.since.headingDate:Depuis la séance du ${formatDay(at, this.locale)}:date:`;
    }
    if (view) {
      return $localize`:Titre du bloc depuis la dernière séance, sans séance clôturée@@overview.simple.since.headingNone:Dernières entrées`;
    }
    return $localize`:Titre du bloc depuis la dernière séance@@overview.simple.since.heading:Depuis la dernière séance`;
  });

  /** La plus récente des séances : la seule qui porte son compte rendu entier (contrat). */
  protected readonly lastSession = computed(() => this.view()?.recentSessions[0] ?? null);
  protected readonly previousSessions = computed(() => this.view()?.recentSessions.slice(1) ?? []);

  protected readonly untitledSituation = $localize`:Situation sans titre@@overview.situations.untitled:Situation sans titre`;
  protected readonly flagLabel = flagLabel;
  /** Entrée sans titre : le nom de son type (« Note », « Événement »). */
  protected readonly typeLabel = entryTypeLabel;
  protected readonly modalityLabel = modalityLabel;

  protected readonly draftParams = { [TIMELINE_PARAMS.drafts]: '1' };
  protected readonly sessionsParams = { [TIMELINE_PARAMS.mode]: 'session' };

  protected state(block: SimpleBlock): StateKind | null {
    return blockState(this.overview(), EMPTY[block]);
  }

  protected day(value: string | null): string {
    return value ? formatDay(value, this.locale) : '—';
  }

  protected intensity(value: number): string {
    return formatIntensity(value, this.locale);
  }

  protected heading(session: RecentSession): string {
    return sessionHeading(session, this.locale);
  }

  protected sessionParams(entryId: string): Record<string, string> {
    return { [TIMELINE_PARAMS.mode]: 'session', [TIMELINE_PARAMS.focus]: entryId };
  }

  protected graphParams(entryId: string): Record<string, string> {
    return { [GRAPH_ROOT_PARAM]: entryId };
  }

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_PARAM]: entryId };
  }
}
