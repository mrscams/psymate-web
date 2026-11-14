import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { StateAction, StateComponent } from '../../../shared/ui';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { PatientShellStore } from '../../patient-shell';
import { OverviewStore } from '../data/overview.store';
import { OverviewFeelingsComponent } from '../ui/overview-feelings.component';
import { OverviewNotedComponent } from '../ui/overview-noted.component';
import { OverviewSessionsComponent } from '../ui/overview-sessions.component';
import { OverviewSideComponent } from '../ui/overview-side.component';
import { OverviewSinceComponent } from '../ui/overview-since.component';

/** Ce que l'onglet range dans la mémoire du dossier (B2) : le tableau des ressentis déplié. */
export interface OverviewTabState {
  showData: boolean;
}

/**
 * Onglet Vue d'ensemble du dossier, /patients/:id (fiche 02, UX-S6, proposition
 * propositions-2026-11/02-vue-ensemble) : une seule vue, un ordre de lecture, en pleine largeur
 * (route `contentWidth: 'full'`). Colonne de lecture : bande « Depuis la séance » (récit du serveur
 * et trois chiffres), « Comment évoluent les ressentis » (la seule boîte), « Noté depuis la dernière
 * séance », « Dernières séances » ; colonne latérale : le cadre du suivi. Une colonne sous 900 px,
 * la latérale dessous. Aucun bloc de saisie ici (décision 1 du 14 novembre 2026 : en séance, la
 * page du shell le pose au-dessus de l'onglet).
 * La fenêtre (30 j / 90 j / 1 an) est la préférence overview.window, choisie dans l'en-tête
 * (pm-overview-window) et relue par l'API (?window=). Après une écriture faite depuis le dossier,
 * la synthèse est relue (OverviewStore), jamais recalculée ici.
 */
@Component({
  selector: 'pm-overview-page',
  imports: [
    OverviewFeelingsComponent,
    OverviewNotedComponent,
    OverviewSessionsComponent,
    OverviewSideComponent,
    OverviewSinceComponent,
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
  private readonly prefs = inject(PreferencesStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly patientId = computed(() => this.shell.patientId() ?? '');

  /**
   * Les préférences du compte sont lues (ou leur lecture a échoué) : avant, la fenêtre est celle du
   * cache ou du défaut, et la page attendrait une seconde lecture (double requête).
   */
  private readonly prefsReady = computed(
    () => this.prefs.loaded() || this.prefs.status() === 'error',
  );
  /** Relecture en échec alors que la synthèse précédente reste affichée : bandeau « Réessayer ». */
  protected readonly reloadFailed = computed(
    () => this.store.overview().status === 'error' && this.store.view() !== null,
  );
  /**
   * « Voir les données » déplié : ce que l'onglet avait rangé pour ce dossier (B2), sinon replié.
   * Un autre dossier (même page, autre :id) repart de sa propre mémoire.
   */
  private readonly dataChoice = signal<{ patientId: string; open: boolean } | null>(null);
  protected readonly showData = computed(() => {
    const choice = this.dataChoice();
    if (choice?.patientId === this.patientId()) return choice.open;
    return this.shell.recallTab<OverviewTabState>('overview')?.showData ?? false;
  });

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton du bandeau de relecture en échec@@overview.reloadFailed.retry:Réessayer`,
    handler: () => this.refresh(),
  };

  constructor() {
    // Patient du dossier et fenêtre (préférence lue) → GET …/overview?window= (rien si déjà lu).
    effect(() => {
      const id = this.shell.patientId();
      const window = this.prefs.overviewWindow();
      if (!id || !this.prefsReady()) return;
      untracked(() => void this.store.load(id, window));
    });
  }

  /** Clic sur un point du graphe : l'éditeur du ressenti s'ouvre (le shell lit ?entry=). */
  protected openEntry(entryId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [ENTRY_QUERY_PARAM]: entryId },
      queryParamsHandling: 'merge',
    });
  }

  protected setShowData(open: boolean): void {
    this.dataChoice.set({ patientId: this.patientId(), open });
    this.shell.rememberTab<OverviewTabState>('overview', { showData: open });
  }

  protected refresh(): void {
    void this.store.refresh();
  }
}
