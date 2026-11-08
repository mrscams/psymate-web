import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { StateKind } from '../../../shared/util';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { PatientShellStore } from '../../patient-shell';
import {
  blockState,
  EmotionFamily,
  GRAPH_ROOT_PARAM,
  isActivityEmpty,
  isAttentionEmpty,
  isEmotionsEmpty,
  isMedicationsEmpty,
  isSessionsEmpty,
  isSituationsEmpty,
  isTrendEmpty,
  lastWeekAverage,
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
  formatDateTime,
  formatDay,
  formatDelta,
  formatIntensity,
  saveFailedMessage,
  windowLabel,
  windowLongLabel,
} from '../ui/overview-labels';
import { OverviewSessionsComponent } from '../ui/overview-sessions.component';
import { OverviewSimpleComponent } from '../ui/overview-simple.component';
import { OverviewTrendComponent } from '../ui/overview-trend.component';

/** Ce que l'onglet range dans la mémoire du dossier (B2) : les séances dépliées. */
export interface OverviewTabState {
  expanded: string[];
}

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
 * par séance dépliée), émotions dominantes, activité récente, heure de la dernière mise à jour
 * (computedAt ; le serveur recalcule une projection en retard, la réponse n'est jamais obsolète).
 * Vue simple « Récit » (préférence overview.view = simple, le défaut) : pm-overview-simple (M4-07),
 * sur la même synthèse ; la bascule entre les deux vues ne relit rien.
 * La fenêtre (30 j / 90 j / 1 an) est la préférence overview.window, relue par l'API (?window=).
 */
@Component({
  selector: 'pm-overview-page',
  imports: [
    EntryIconComponent,
    OverviewBlockComponent,
    OverviewSessionsComponent,
    OverviewSimpleComponent,
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

  /**
   * Les préférences du compte sont lues (ou leur lecture a échoué) : avant, la vue et la fenêtre
   * sont celles du cache ou des défauts, et la page attendrait une seconde lecture (flash de la vue
   * simple, double requête).
   */
  protected readonly prefsReady = computed(
    () => this.prefs.loaded() || this.prefs.status() === 'error',
  );
  /** Fenêtre de la synthèse affichée (la donnée), sinon celle de la préférence. */
  protected readonly shownWindow = computed(() => this.view()?.window ?? this.window());
  /** Relecture en échec alors que la synthèse précédente reste affichée : bandeau « Réessayer ». */
  protected readonly reloadFailed = computed(
    () => this.store.overview().status === 'error' && this.view() !== null,
  );
  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton du bandeau de relecture en échec@@overview.reloadFailed.retry:Réessayer`,
    handler: () => this.refresh(),
  };

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

  /** Heure du calcul de la synthèse (computedAt), sans connotation de péremption. */
  protected readonly updatedAt = computed(() => {
    const at = this.view()?.computedAt;
    return at ? formatDateTime(at, this.locale) : null;
  });

  protected readonly trendHeading = computed(
    () =>
      $localize`:Titre du bloc tendance@@overview.trend.heading:Tendance d'intensité · ${windowLongLabel(this.shownWindow())}:period:`,
  );
  protected readonly emotionsHeading = computed(
    () =>
      $localize`:Titre du bloc émotions dominantes@@overview.emotions.heading:Émotions dominantes · ${windowLongLabel(this.shownWindow())}:period:`,
  );
  protected readonly latest = computed(() => {
    const view = this.view();
    const value = view ? lastWeekAverage(view.trend.points) : null;
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

  constructor() {
    // Patient du dossier et fenêtre (préférence lue) → GET …/overview?window= (rien si déjà lu).
    effect(() => {
      const id = this.shell.patientId();
      const window = this.window();
      if (!id || !this.prefsReady()) return;
      untracked(() => void this.store.load(id, window));
    });

    // B3 flux 6, étape 4 : « Démarrer la séance » depuis l'en-tête → la séance précédente se replie
    // (la barre de capture prend le focus, côté shell). Une séance déjà ouverte au chargement ne
    // replie rien.
    let session = untracked(() => this.shell.currentSession()?.id ?? null);
    effect(() => {
      const current = this.shell.currentSession()?.id ?? null;
      if (current === session) return;
      session = current;
      if (current) untracked(() => this.setExpanded([]));
    });
  }

  /** L'un des trois états d'un bloc, ou null pour son contenu (blockState). */
  protected state(block: Block): StateKind | null {
    return blockState(this.store.overview(), EMPTY[block]);
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
    return deltaText(value, this.shownWindow());
  }

  protected familyColor(code: string): string {
    const family = this.families().get(code);
    return family ? `var(--emotion-${family})` : 'var(--feeling)';
  }

  protected graphParams(entryId: string): Record<string, string> {
    return { [GRAPH_ROOT_PARAM]: entryId };
  }

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_QUERY_PARAM]: entryId };
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

  protected setExpanded(list: string[]): void {
    this.expandedChoice.set({ patientId: this.patientId(), ids: list });
    this.shell.rememberTab<OverviewTabState>('overview', { expanded: list });
  }

  /** Clic sur un point de la courbe : l'éditeur du ressenti s'ouvre (le shell lit ?entry=). */
  protected openEntry(entryId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [ENTRY_QUERY_PARAM]: entryId },
      queryParamsHandling: 'merge',
    });
  }

  protected refresh(): void {
    void this.store.refresh();
  }
}
