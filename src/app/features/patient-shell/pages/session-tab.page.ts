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
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { EntryIconComponent, entryTitle, StateAction, StateComponent } from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { splitNextTime } from '../data/next-time';
import { SessionReminders } from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import { NotedEntriesComponent } from '../ui/noted-entries.component';
import { dayLabel, flagLabel, formatShortDay, previousHeading } from '../ui/shell-labels';

/** La ligne qui vient d'être notée reste surlignée 2 s (proposition 04b, « Enter rules »). */
export const HIGHLIGHT_MS = 2_000;

/** Ce que l'onglet range dans la mémoire du dossier (B2) : les points « Prévu » cochés. */
export interface SessionTabState {
  sessionId: string;
  ticked: string[];
}

/**
 * Onglet « Séance » (UX-S3, propositions 04 et 04b, états 2 à 4) : tant qu'une séance est ouverte,
 * la page /patients/:id/session remplace la vue d'ensemble. Le bloc de saisie reste dans l'en-tête
 * (UX-S1) ; ici, en colonne de contenu, le statut de la séance (modalité, début, minuterie, durée
 * prévue, dépassement en teinte warning), puis « Noté pendant cette séance » (la chronologie
 * filtrée sur la séance, ligne surlignée 2 s après une création, « modifier » pendant la grâce) ou,
 * tant que rien n'est noté, le « carnet vide » (« Prévu la dernière fois » et « Depuis la séance
 * du … »). En colonne latérale : « Prévu la dernière fois » (les lignes « Prochaine fois : » du
 * dernier compte rendu, cocher est un confort local, « Noter » prépare une note), la séance
 * précédente, « À garder en tête » (drapeaux, médicaments, situations en cours, lus sur la vue
 * d'ensemble) et les raccourcis dans le texte. Rien n'est calculé : tout est relu après écriture.
 * Sans séance ouverte (clôturée ici ou ailleurs), la page renvoie sur la vue d'ensemble.
 */
@Component({
  selector: 'pm-session-tab-page',
  imports: [EntryIconComponent, NgTemplateOutlet, NotedEntriesComponent, StateComponent],
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
  /** Points « Prévu la dernière fois » cochés (indices), confort local non persisté. */
  protected readonly ticked = signal<string[]>([]);

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

  /** Trois états du contexte (séance précédente, rappels, vocabulaire). */
  protected readonly contextState = computed<StateKind | null>(() => {
    const kind = stateKind(this.shell.context());
    return kind === 'empty' ? null : kind;
  });
  protected readonly context = computed(() => this.shell.context().data);
  protected readonly contextRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.shell.loadContext(true),
  };
  protected readonly contextErrorTitle = $localize`:Erreur du contexte de la séance@@patientShell.context.error:Impossible de lire le contexte de la séance`;
  protected readonly emotionLabels = computed(() => this.context()?.emotionLabels ?? {});

  /** Le compte rendu précédent, séparé de ses lignes « Prochaine fois ». */
  private readonly previousSplit = computed(() => splitNextTime(this.context()?.previous?.summary));
  protected readonly plannedLines = computed(() => this.previousSplit().nextTime);
  protected readonly previousBody = computed(() => this.previousSplit().body);
  protected readonly previousTitle = computed(() =>
    previousHeading(this.context()?.previous?.startedAt ?? null, this.locale),
  );
  protected readonly reminders = computed<SessionReminders | null>(
    () => this.context()?.reminders ?? null,
  );
  protected readonly hasReminders = computed(() => {
    const r = this.reminders();
    return !!r && (r.flags.length > 0 || r.medications.length > 0 || r.situations.length > 0);
  });
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

    // Contexte lu à l'ouverture de la séance (le shell en relit une partie après chaque écriture) ;
    // points cochés repris de la mémoire de l'onglet.
    effect(() => {
      const session = this.session();
      if (!session) return;
      untracked(() => {
        void this.shell.loadContext();
        const remembered = this.shell.recallTab<SessionTabState>('session');
        this.ticked.set(remembered?.sessionId === session.id ? remembered.ticked : []);
      });
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

  protected readonly flagLabel = flagLabel;

  protected day(value: string | null): string {
    return value ? dayLabel(value, this.locale) : '';
  }

  protected shortDay(value: string | null): string {
    return value ? formatShortDay(value, this.locale) : '';
  }

  /** Titre de repli d'une entrée « Depuis la séance du … ». */
  protected sinceName(entry: SessionReminders['since']['entries'][number]): string {
    return entryTitle(
      { type: entry.type, title: entry.title, occurred: entry.occurredFrom },
      this.locale,
      { now: this.now() },
    );
  }

  protected isTicked(line: string): boolean {
    return this.ticked().includes(line);
  }

  /** Cocher n'enregistre rien : un confort pour la séance, rangé dans la mémoire de l'onglet. */
  protected toggle(line: string): void {
    const session = this.session();
    if (!session) return;
    const list = this.isTicked(line)
      ? this.ticked().filter((item) => item !== line)
      : [...this.ticked(), line];
    this.ticked.set(list);
    this.shell.rememberTab<SessionTabState>('session', { sessionId: session.id, ticked: list });
  }

  /**
   * « Noter » (04b, état 2) : sélectionne la puce Note et met « <point> : » dans le bloc de saisie,
   * caret à la fin, pour que la première note soit à une Entrée. Le bloc est dans l'en-tête : la
   * page le demande au shell (CaptureBlockComponent.prefill).
   */
  protected note(line: string): void {
    this.shell.requestPrefill(`${line} : `);
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
