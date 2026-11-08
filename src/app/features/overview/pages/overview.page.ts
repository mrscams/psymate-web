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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import {
  EntryIconComponent,
  entryTypeLabel,
  StateAction,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { PatientShellStore } from '../../patient-shell';
import {
  EmotionFamily,
  GRAPH_ROOT_PARAM,
  isActivityEmpty,
  isAttentionEmpty,
  isEmotionsEmpty,
  isMedicationsEmpty,
  isSessionsEmpty,
  isSituationsEmpty,
  isStale,
  isTrendEmpty,
  latestAverage,
  OVERVIEW_WINDOWS,
  OverviewView,
  OverviewWindow,
  TIMELINE_PARAMS,
} from '../data/overview.model';
import { OverviewStore } from '../data/overview.store';
import { OverviewBlockComponent } from '../ui/overview-block.component';
import {
  deltaText,
  flagLabel,
  formatAgo,
  formatDay,
  formatDelta,
  formatIntensity,
  saveFailedMessage,
  windowLabel,
  windowLongLabel,
} from '../ui/overview-labels';
import { OverviewSessionsComponent } from '../ui/overview-sessions.component';
import { OverviewTrendComponent } from '../ui/overview-trend.component';

/** Ce que l'onglet range dans la mémoire du dossier (B2) : les séances dépliées. */
export interface OverviewTabState {
  expanded: string[];
}

/** Paramètre de l'éditeur d'entrée (features/entries, ENTRY_QUERY_PARAM) : le shell l'ouvre. */
const ENTRY_PARAM = 'entry';

/** Rafraîchissement de « il y a 2 min » et du signal « Recalculer ». */
const CLOCK_MS = 30_000;

/** Les blocs de la vue complète, chacun avec ses trois états. */
type Block =
  | 'summary'
  | 'trend'
  | 'attention'
  | 'situations'
  | 'medications'
  | 'sessions'
  | 'emotions'
  | 'activity';

const EMPTY: Record<Block, (view: OverviewView) => boolean> = {
  // Le résumé n'est jamais « vide » : un zéro est une information (aucun ressenti, aucune séance).
  summary: () => false,
  trend: isTrendEmpty,
  attention: isAttentionEmpty,
  situations: isSituationsEmpty,
  medications: isMedicationsEmpty,
  sessions: isSessionsEmpty,
  emotions: isEmotionsEmpty,
  activity: isActivityEmpty,
};

/**
 * Onglet 1 du dossier, /patients/:id (fiche 02, B4 écran 2, B3 flux 6, B8). Vue complète : résumé
 * chiffré, tendance (ECharts en @defer), points d'attention vers la timeline filtrée, situations
 * actives (« Voir dans le graphe » → graph?root=), traitement en cours, dernières séances (timeline
 * par séance dépliée), émotions dominantes, activité récente, « dernière mise à jour » et
 * « Recalculer ». Vue simple (préférence overview.view = simple) : M4-07 ; un état provisoire ici.
 * La fenêtre (30 j / 90 j / 1 an) est la préférence overview.window, relue par l'API (?window=).
 */
@Component({
  selector: 'pm-overview-page',
  imports: [
    EntryIconComponent,
    OverviewBlockComponent,
    OverviewSessionsComponent,
    OverviewTrendComponent,
    RouterLink,
    StateComponent,
  ],
  providers: [OverviewStore],
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPage {
  protected readonly store = inject(OverviewStore);
  protected readonly shell = inject(PatientShellStore);
  protected readonly prefs = inject(PreferencesStore);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly locale = inject(LOCALE_ID);

  protected readonly windows = OVERVIEW_WINDOWS;
  protected readonly view = this.store.view;
  protected readonly mode = this.prefs.overviewView;
  protected readonly window = this.prefs.overviewWindow;
  protected readonly patientId = computed(() => this.shell.patientId() ?? '');

  /** Horloge de « il y a 2 min » et de « Recalculer ». */
  protected readonly now = signal(Date.now());

  /**
   * Séances dépliées : ce que l'onglet avait rangé pour ce dossier (B2), sinon la plus récente. Un
   * autre dossier (même page, autre :id) repart de sa propre mémoire.
   */
  private readonly expandedChoice = signal<{ patientId: string; ids: string[] } | null>(null);
  protected readonly expanded = computed(() => {
    const patientId = this.patientId();
    const choice = this.expandedChoice();
    if (choice?.patientId === patientId) return choice.ids;
    const remembered = this.shell.recallTab<OverviewTabState>('overview')?.expanded;
    if (remembered) return remembered;
    const first = this.view()?.recentSessions[0];
    return first ? [first.entryId] : [];
  });

  protected readonly stale = computed(() => isStale(this.view()?.computedAt ?? null, this.now()));
  protected readonly updatedAgo = computed(() => {
    const at = this.view()?.computedAt;
    return at ? formatAgo(at, this.now(), this.locale) : null;
  });

  protected readonly trendHeading = computed(
    () =>
      $localize`:Titre du bloc tendance@@overview.trend.heading:Tendance d'intensité · ${windowLongLabel(this.window())}:period:`,
  );
  protected readonly emotionsHeading = computed(
    () =>
      $localize`:Titre du bloc émotions dominantes@@overview.emotions.heading:Émotions dominantes · ${windowLongLabel(this.window())}:period:`,
  );
  protected readonly latest = computed(() => {
    const view = this.view();
    const value = view ? latestAverage(view.trend.points) : null;
    return value === null ? null : formatIntensity(value, this.locale);
  });
  protected readonly windowSessions = computed(
    () => this.view()?.trend.markers.filter((m) => m.kind === 'session').length ?? 0,
  );
  /** Code d'émotion → famille (séries du serveur) : couleur des émotions dominantes. */
  private readonly families = computed(() => {
    const map = new Map<string, EmotionFamily | null>();
    for (const series of this.view()?.feelings.series ?? []) {
      map.set(series.emotionCode, series.family);
    }
    return map;
  });

  protected readonly simpleAction: StateAction = {
    label: $localize`:Action de l'état provisoire de la vue simple@@overview.simple.action:Afficher la vue complète`,
    handler: () => void this.setMode('complete'),
  };

  constructor() {
    // Patient du dossier et fenêtre (préférence) → GET …/overview?window= (rien si déjà lu).
    effect(() => {
      const id = this.shell.patientId();
      const window = this.window();
      if (!id) return;
      untracked(() => void this.store.load(id, window));
    });

    const timer = setInterval(() => this.now.set(Date.now()), CLOCK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** L'un des trois états d'un bloc, ou null pour son contenu. */
  protected state(block: Block): StateKind | null {
    return stateKind(this.store.overview(), EMPTY[block]);
  }

  protected windowLabel(window: OverviewWindow): string {
    return windowLabel(window);
  }

  protected readonly flagLabel = flagLabel;
  protected readonly untitledSituation = $localize`:Situation sans titre@@overview.situations.untitled:Situation sans titre`;
  /** Entrée sans titre : le nom de son type (« Séance », « Note »). */
  protected readonly typeLabel = entryTypeLabel;

  protected day(value: string | null): string {
    return value ? formatDay(value, this.locale) : '—';
  }

  protected intensity(value: number): string {
    return formatIntensity(value, this.locale);
  }

  protected delta(value: number): string {
    return formatDelta(value);
  }

  protected deltaText(value: number): string {
    return deltaText(value, this.window());
  }

  protected familyColor(code: string): string {
    const family = this.families().get(code);
    return family ? `var(--emotion-${family})` : 'var(--feeling)';
  }

  protected graphParams(entryId: string): Record<string, string> {
    return { [GRAPH_ROOT_PARAM]: entryId };
  }

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_PARAM]: entryId };
  }

  protected readonly draftParams = { [TIMELINE_PARAMS.drafts]: '1' };
  protected readonly sessionsParams = { [TIMELINE_PARAMS.mode]: 'session' };

  protected sessionParams(entryId: string): Record<string, string> {
    return { [TIMELINE_PARAMS.mode]: 'session', [TIMELINE_PARAMS.focus]: entryId };
  }

  protected emotionParams(code: string): Record<string, string> {
    return { [TIMELINE_PARAMS.emotion]: code };
  }

  /** Bascule de fenêtre : préférence overview.window (optimiste), la synthèse est relue. */
  protected async setWindow(window: OverviewWindow): Promise<void> {
    if (this.window() === window) return;
    const problem = await this.prefs.set('overview.window', window);
    if (problem) this.toasts.warning(saveFailedMessage(problem));
  }

  protected async setMode(mode: 'simple' | 'complete'): Promise<void> {
    const problem = await this.prefs.set('overview.view', mode);
    if (problem) this.toasts.warning(saveFailedMessage(problem));
  }

  protected setExpanded(list: string[]): void {
    this.expandedChoice.set({ patientId: this.patientId(), ids: list });
    this.shell.rememberTab<OverviewTabState>('overview', { expanded: list });
  }

  /** Clic sur un point de la courbe : l'éditeur du ressenti s'ouvre (le shell lit ?entry=). */
  protected openEntry(entryId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [ENTRY_PARAM]: entryId },
      queryParamsHandling: 'merge',
    });
  }

  protected refresh(): void {
    this.now.set(Date.now());
    void this.store.refresh();
  }
}
