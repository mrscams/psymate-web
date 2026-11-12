import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  untracked,
} from '@angular/core';

import { EntryIconComponent, StateAction, StateComponent } from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { splitNextTime } from '../data/next-time';
import { SessionReminders } from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import { PlannedChecklistComponent } from './planned-checklist.component';
import { dayLabel, flagLabel, previousHeading, textShortcutRows } from './shell-labels';

/**
 * Colonne latérale en séance (UX-S2 `.pad-layout` ; UX-S3, proposition 04b, états 2 et 3), posée par
 * la page du shell à côté de la colonne de contenu tant qu'une séance est ouverte, sur tous les
 * onglets : le contexte de la séance, lu une fois par séance et relu en partie après chaque écriture
 * (PatientShellStore.context, trois états). Blocs séparés par des filets : « Prévu la dernière fois »
 * (les lignes « Prochaine fois : » du dernier compte rendu, à cocher, « Noter »), ou, tant que le
 * carnet de l'onglet Séance est vide et montre déjà cette liste, la séance précédente et son compte
 * rendu ; « À garder en tête » (drapeaux, médicaments et situations en cours, lus sur la vue
 * d'ensemble) ; « Raccourcis dans le texte » (la grammaire du bloc de saisie). Rien n'est calculé.
 */
@Component({
  selector: 'pm-session-context',
  imports: [EntryIconComponent, PlannedChecklistComponent, StateComponent],
  templateUrl: './session-context.component.html',
  styleUrl: './session-context.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionContextComponent {
  /**
   * L'onglet Séance montre le carnet vide, où la liste « Prévu la dernière fois » est déjà : la
   * colonne donne alors la séance précédente (04b, état 2) au lieu de répéter la liste.
   */
  readonly padEmpty = input(false);

  protected readonly shell = inject(PatientShellStore);
  private readonly locale = inject(LOCALE_ID);

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

  /** « Raccourcis dans le texte » (04b, état 3) : la grammaire du bloc de saisie. */
  protected readonly textShortcuts = textShortcutRows();
  protected readonly flagLabel = flagLabel;

  constructor() {
    // Contexte lu à l'ouverture de la séance (le store en relit une partie après chaque écriture).
    effect(() => {
      if (!this.shell.currentSession()) return;
      untracked(() => void this.shell.loadContext());
    });
  }

  protected day(value: string | null): string {
    return value ? dayLabel(value, this.locale) : '';
  }
}
