import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { formatDate, formatDateTime, formatMonthYear } from '../../../core/i18n';
import { StateAction, StateComponent } from '../../../shared/ui';
import { StateKind } from '../../../shared/util';
import {
  MODALITIES,
  Modality,
  PRONOUNS,
  Pronoun,
  RHYTHMS,
  Rhythm,
  VersionDiff,
} from '../data/patient.model';
import { fieldLabel, modalityLabel, pronounLabel, rhythmLabel } from './patient-labels';

/**
 * Historique des versions de la fiche (fiche 16, GET /api/patients/{id}/versions) : de la plus
 * récente à la plus ancienne, chaque version liste ses changements champ par champ « avant →
 * après ». La version 1 (création) n'a pas d'instantané : la plus ancienne modification montre
 * les valeurs enregistrées, sans « avant ». Trois états par pm-state.
 */
@Component({
  selector: 'pm-version-history',
  imports: [StateComponent],
  templateUrl: './version-history.component.html',
  styleUrl: './version-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionHistoryComponent {
  readonly history = input<VersionDiff[]>([]);
  readonly state = input<StateKind | null>(null);
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };
  protected readonly emptyTitle = $localize`:Historique vide@@patients.history.empty:Aucune modification depuis la création`;
  protected readonly errorTitle = $localize`:Historique en erreur@@patients.history.error:Impossible de charger l'historique`;

  protected readonly entries = computed(() =>
    this.history().map((diff) => ({
      ...diff,
      when: diff.createdAt ? formatDateTime(diff.createdAt, this.locale) : '',
      rows: diff.changes.map((change) => ({
        field: change.field,
        label: fieldLabel(change.field),
        before: change.before === undefined ? null : this.format(change.field, change.before),
        after: this.format(change.field, change.after),
      })),
    })),
  );

  protected versionTitle(version: number): string {
    return $localize`:Titre d'une version de la fiche@@patients.history.version:Version ${version}:version:`;
  }

  protected readonly emptyValue = $localize`:Valeur vide dans l'historique@@patients.history.emptyValue:(vide)`;

  private format(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return this.emptyValue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    switch (field) {
      case 'birthDate':
        return formatDate(text, this.locale, 'medium', 'UTC') || text;
      case 'followUp.since':
        return formatMonthYear(text, this.locale, 'UTC') || text;
      case 'pronoun':
        return PRONOUNS.includes(text as Pronoun) ? pronounLabel(text as Pronoun) : text;
      case 'followUp.rhythm':
        return RHYTHMS.includes(text as Rhythm) ? rhythmLabel(text as Rhythm) : text;
      case 'followUp.modality':
        return MODALITIES.includes(text as Modality) ? modalityLabel(text as Modality) : text;
      default:
        return text;
    }
  }
}
