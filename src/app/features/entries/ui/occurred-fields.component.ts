import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';

import { fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { EntryType } from '../../../shared/ui';
import { OCCURRED_PRECISIONS, OccurredPrecision } from '../../../shared/util';
import { localDateTime } from '../data/entry.model';
import { OccurredForm } from './entry-form';
import { precisionLabel } from './entry-labels';

/**
 * Bloc « Quand » (fiche 05 §5) : « Maintenant », précision (exact · jour · mois · année · période ·
 * phase de vie, `role="group"` + `aria-pressed`) et la date au format de la précision, en JetBrains
 * Mono. Situation : début et « en cours / fin ». Les valeurs restent celles des contrôles HTML ;
 * entry.model les traduit en UTC.
 */
@Component({
  selector: 'pm-occurred-fields',
  imports: [ReactiveFormsModule, FieldErrorsComponent],
  templateUrl: './occurred-fields.component.html',
  styleUrl: './occurred-fields.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OccurredFieldsComponent {
  readonly group = input.required<OccurredForm>();
  readonly type = input.required<EntryType>();
  /** En création, « Maintenant » laisse le serveur prendre l'instant de saisie. */
  readonly creating = input(true);

  protected readonly precisions = OCCURRED_PRECISIONS;
  protected readonly fid = fieldId;

  private readonly value = toSignal(
    toObservable(this.group).pipe(
      switchMap((group) => group.valueChanges.pipe(startWith(group.getRawValue()))),
    ),
  );

  protected readonly now = computed(() => this.value()?.now ?? true);
  protected readonly precision = computed<OccurredPrecision>(
    () => this.value()?.precision ?? 'exact',
  );
  protected readonly ongoing = computed(() => this.value()?.ongoing ?? true);
  protected readonly situation = computed(() => this.type() === 'situation');

  /** Type de l'input HTML selon la précision. */
  protected readonly inputType = computed(() => {
    switch (this.precision()) {
      case 'exact':
        return 'datetime-local';
      case 'month':
        return 'month';
      case 'year':
        return 'text';
      default:
        return 'date';
    }
  });

  protected labelOf(precision: OccurredPrecision): string {
    return precisionLabel(precision);
  }

  protected setNow(): void {
    const group = this.group();
    if (this.creating()) {
      group.patchValue({ now: true, precision: 'exact', from: '' });
    } else {
      group.patchValue({ now: false, precision: 'exact', from: localDateTime(new Date()) });
    }
    group.markAsDirty();
  }

  protected choose(precision: OccurredPrecision): void {
    const group = this.group();
    const current = group.getRawValue();
    const changed = current.precision !== precision || current.now;
    group.patchValue({
      now: false,
      precision,
      from: changed ? defaultValue(precision) : current.from,
      to: changed ? '' : current.to,
    });
    group.markAsDirty();
  }

  protected invalid(name: 'from' | 'to' | 'label'): boolean {
    const control = this.group().controls[name];
    return control.invalid && (control.touched || control.dirty);
  }
}

/** Valeur proposée quand on choisit une précision : maintenant, à la granularité de la précision. */
function defaultValue(precision: OccurredPrecision): string {
  const now = new Date();
  const local = localDateTime(now);
  switch (precision) {
    case 'exact':
      return local;
    case 'day':
    case 'period':
      return local.slice(0, 10);
    case 'month':
      return local.slice(0, 7);
    case 'year':
      return local.slice(0, 4);
    case 'life_phase':
      return '';
  }
}
