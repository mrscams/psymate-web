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
import { ActivatedRoute, Router } from '@angular/router';

import { EntryIconComponent, entryTitle, StateAction, StateComponent } from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { splitNextTime } from '../data/next-time';
import { SessionReminders } from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import { NotedEntriesComponent } from '../ui/noted-entries.component';
import { PlannedChecklistComponent } from '../ui/planned-checklist.component';
import { formatShortDay } from '../ui/shell-labels';

export type { SessionTabState } from '../ui/planned-checklist.component';

/** La ligne qui vient d'être notée reste surlignée 2 s (proposition 04b, « Enter rules »). */
export const HIGHLIGHT_MS = 2_000;

/**
 * Onglet « Séance » (UX-S3, propositions 04 et 04b, états 2 à 4) : tant qu'une séance est ouverte,
 * la page /patients/:id/session est l'onglet 1 du dossier (l'en-tête le nomme « Séance », la vue
 * d'ensemble reste à un clic). Dans la colonne de contenu de la page du shell (UX-S2 : sous le bloc
 * de saisie, la colonne latérale de contexte à côté) : « Noté pendant cette séance » (la chronologie
 * filtrée sur la séance, ligne surlignée 2 s après une création, « modifier » pendant la grâce) ou,
 * tant que rien n'est noté, le « carnet vide » (« Prévu la dernière fois » et « Depuis la séance
 * du … »). Rien n'est calculé : tout est relu après écriture. Sans séance ouverte à l'arrivée, la
 * page renvoie sur la vue d'ensemble ; après la clôture, c'est le shell qui route.
 */
@Component({
  selector: 'pm-session-tab-page',
  imports: [EntryIconComponent, NotedEntriesComponent, PlannedChecklistComponent, StateComponent],
  templateUrl: './session-tab.page.html',
  styleUrl: './session-tab.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionTabPage {
  protected readonly shell = inject(PatientShellStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly locale = inject(LOCALE_ID);

  /** Horloge de la page (grâce des lignes, titres de repli), à la minute tant que la séance est ouverte. */
  protected readonly now = signal(new Date());
  /** Ligne surlignée (entrée qui vient d'être notée), pendant HIGHLIGHT_MS. */
  protected readonly highlighted = signal<string | null>(null);

  protected readonly session = this.shell.currentSession;
  protected readonly patientId = computed(() => this.shell.patientId() ?? '');

  /** Trois états de « Noté pendant cette séance ». */
  protected readonly notedState = computed<StateKind | null>(() => stateKind(this.shell.noted()));
  protected readonly noted = computed(() => this.shell.noted().data ?? []);
  protected readonly notedRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.shell.refreshNoted(),
  };
  protected readonly notedErrorTitle = $localize`:Erreur du bloc noté pendant la séance@@patientShell.noted.error:Impossible de lire ce qui a été noté`;
  protected readonly countText = computed(() => {
    const count = this.shell.notedCount();
    if (count === null) return '';
    if (count === 0)
      return $localize`:Compte des entrées de la séance, aucune@@patientShell.noted.count.none:rien de noté encore`;
    if (count === 1)
      return $localize`:Compte des entrées de la séance, une@@patientShell.noted.count.one:1 entrée · la plus récente en haut`;
    return $localize`:Compte des entrées de la séance@@patientShell.noted.count.many:${count}:count: entrées · la plus récente en haut`;
  });

  /** Le contexte (séance précédente, rappels, vocabulaire) : le carnet vide en lit deux blocs. */
  protected readonly contextState = computed<StateKind | null>(() => {
    const kind = stateKind(this.shell.context());
    return kind === 'empty' ? null : kind;
  });
  protected readonly context = computed(() => this.shell.context().data);
  protected readonly emotionLabels = computed(() => this.context()?.emotionLabels ?? {});
  protected readonly plannedLines = computed(
    () => splitNextTime(this.context()?.previous?.summary).nextTime,
  );
  private readonly reminders = computed<SessionReminders | null>(
    () => this.context()?.reminders ?? null,
  );
  protected readonly sinceTitle = computed(() => {
    const at = this.reminders()?.since.lastSessionAt;
    return at
      ? $localize`:Titre du bloc depuis la séance précédente, daté@@patientShell.since.dated:Depuis la séance du ${formatShortDay(at, this.locale)}:day:`
      : $localize`:Titre du bloc depuis la séance précédente@@patientShell.since.plain:Depuis la dernière séance`;
  });
  protected readonly sinceEntries = computed(() => this.reminders()?.since.entries ?? []);

  constructor() {
    const destroy = inject(DestroyRef);

    // Sans séance ouverte à l'arrivée (dossier lu), l'onglet n'a pas lieu d'être : la vue
    // d'ensemble, requête gardée (?entry=). Ensuite c'est le shell qui route (clôture, 409) : une
    // seule navigation.
    const arrival = effect(() => {
      if (!this.shell.patient()) return;
      arrival.destroy();
      if (this.session()) return;
      untracked(
        () =>
          void this.router.navigate(['/patients', this.patientId()], {
            replaceUrl: true,
            queryParamsHandling: 'preserve',
          }),
      );
    });

    // Le carnet vide lit le contexte (prévu la dernière fois, depuis la séance) : lu une fois par
    // séance, la colonne latérale le partage.
    effect(() => {
      if (!this.session()) return;
      untracked(() => void this.shell.loadContext());
    });

    // Horloge à la minute tant que la séance est ouverte (« modifier » devient « corriger »).
    effect((onCleanup) => {
      if (!this.session()) return;
      const timer = setInterval(() => this.now.set(new Date()), 60_000);
      onCleanup(() => clearInterval(timer));
    });

    // Entrée créée depuis le bloc : sa ligne est surlignée 2 s, puis oubliée.
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const id = this.shell.lastWrittenId();
      if (!id) return;
      untracked(() => {
        clearTimeout(highlightTimer);
        this.highlighted.set(id);
        highlightTimer = setTimeout(() => {
          this.highlighted.set(null);
          this.shell.clearLastWritten();
        }, HIGHLIGHT_MS);
      });
    });
    destroy.onDestroy(() => clearTimeout(highlightTimer));
  }

  /** Titre de repli d'une entrée « Depuis la séance du … ». */
  protected sinceName(entry: SessionReminders['since']['entries'][number]): string {
    return entryTitle(
      { type: entry.type, title: entry.title, occurred: entry.occurredFrom },
      this.locale,
      { now: this.now() },
    );
  }

  /** « modifier » / « corriger » : l'éditeur sur l'entrée (?entry=<id>, lu par le shell). */
  protected edit(entryId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [ENTRY_QUERY_PARAM]: entryId },
      queryParamsHandling: 'merge',
    });
  }
}
