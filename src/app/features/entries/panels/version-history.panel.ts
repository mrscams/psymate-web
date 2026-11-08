import { ChangeDetectionStrategy, Component, computed, inject, LOCALE_ID } from '@angular/core';

import { SessionStore } from '../../../core/auth';
import { formatDateTime } from '../../../core/i18n';
import { SidePanelComponent, StateAction, StateComponent } from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { EntryEditorStore } from '../data/entry-editor.store';
import { versionDiffs } from '../data/entry.model';
import { versionFieldLabel } from '../ui/entry-labels';

/**
 * Historique des versions d'une entrée (fiche 05 §10, état B) : panneau 420 px empilé sur
 * l'éditeur, en lecture seule (pas de restauration de version en V1). Liste des versions de la plus
 * récente à la plus ancienne (`<ol>`, `aria-current` sur la courante), puis pour chacune les
 * différences avec la précédente, champ par champ (`<dl>`, ancien barré `<s>`, nouveau surligné),
 * et « Inchangés : … ». Le contrat ne versionne que le titre et le texte (EntryVersionDto) : la date
 * et le détail ne figurent pas dans l'historique.
 */
@Component({
  selector: 'pm-version-history-panel',
  imports: [SidePanelComponent, StateComponent],
  templateUrl: './version-history.panel.html',
  styleUrl: './version-history.panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionHistoryPanel {
  protected readonly store = inject(EntryEditorStore);
  private readonly session = inject(SessionStore);
  private readonly locale = inject(LOCALE_ID);

  protected readonly title = $localize`:Titre du panneau d'historique@@entries.history.title:Historique des versions`;
  protected readonly headingId = 'pm-entry-history-heading';

  protected readonly state = computed(() => stateKind(this.store.versions()));
  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.loadVersions(),
  };
  protected readonly errorTitle = $localize`:Historique en erreur@@entries.history.error:Impossible de charger l'historique`;
  protected readonly emptyTitle = $localize`:Historique vide@@entries.history.empty:Aucune version`;

  protected readonly current = computed(() => this.store.entry().data?.version ?? null);

  protected readonly versions = computed(() => {
    const me = this.session.me()?.id ?? null;
    return versionDiffs(this.store.versions().data ?? []).map((diff) => ({
      ...diff,
      when: diff.createdAt ? formatDateTime(diff.createdAt, this.locale) : '',
      mine: !!me && diff.authorId === me,
      rows: diff.changes.map((change) => ({
        ...change,
        label: versionFieldLabel(change.field),
      })),
      unchangedText: diff.unchanged.map((field) => versionFieldLabel(field)).join(', '),
    }));
  });

  protected versionName(version: number): string {
    return $localize`:Nom court d'une version@@entries.history.version:v${version}:version:`;
  }

  protected readonly emptyValue = $localize`:Valeur vide dans l'historique@@entries.history.emptyValue:(vide)`;
}
