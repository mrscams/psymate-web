import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';

import { formatDate } from '../../../core/i18n';
import { FLAG_KINDS, PatientFlagView } from '../data/patient.model';
import { flagLabel } from './patient-labels';

/**
 * Drapeaux d'un patient en puces ambre (fiche 00 §2 : toujours ambre, jamais de rouge sur un
 * patient), dans l'ordre risque, à surveiller, suivi conjoint (fiche 16 : le risque en premier).
 * « À surveiller » porte sa date de pose.
 */
@Component({
  selector: 'pm-patient-flags',
  template: `
    @if (chips().length > 0) {
      <ul class="flags" [attr.aria-label]="listLabel">
        @for (chip of chips(); track chip.kind) {
          <li class="flag" [attr.title]="chip.reason">{{ chip.text }}</li>
        }
      </ul>
    }
  `,
  styles: `
    .flags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .flag {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--flag-bg);
      color: var(--warning);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientFlagsComponent {
  readonly flags = input<PatientFlagView[]>([]);

  private readonly locale = inject(LOCALE_ID);
  protected readonly listLabel = $localize`:Étiquette de la liste des drapeaux d'un patient@@patients.flags.list:Drapeaux`;

  private readonly order: readonly string[] = ['risk', 'watch', 'shared_care'];

  protected readonly chips = computed(() =>
    this.flags()
      .filter((flag) => FLAG_KINDS.includes(flag.kind))
      .sort((a, b) => this.order.indexOf(a.kind) - this.order.indexOf(b.kind))
      .map((flag) => {
        const label = flagLabel(flag.kind);
        const date = flag.setAt ? formatDate(flag.setAt, this.locale, 'medium') : '';
        return {
          kind: flag.kind,
          reason: flag.reason,
          text:
            flag.kind === 'watch' && date
              ? $localize`:Drapeau à surveiller avec sa date@@patients.flags.watchSince:${label}:label: depuis le ${date}:date:`
              : label,
        };
      }),
  );
}
