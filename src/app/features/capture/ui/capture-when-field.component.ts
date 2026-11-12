import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { DateFieldComponent, MonthFieldComponent } from '../../../shared/ui/date-field';
import { formatOccurred, OccurredPrecision } from '../../../shared/util';
import { civilDay, dayOccurred, monthOccurred, yearOccurred } from '../data/capture.model';
import { ParsedOccurred } from '../parser/parse.types';
import { precisionLabel } from './capture-labels';

type Mode = 'now' | 'today' | 'yesterday' | 'before' | 'other' | 'detected';
type Precision = 'day' | 'month' | 'year';

/**
 * Champ « Quand » (ou « Depuis ») du bloc de saisie (UX-S1, maquette 04b « aujourd'hui ▾ ») : une
 * liste courte (maintenant, aujourd'hui, hier, avant-hier, autre date…) et, pour « autre date », un
 * champ date localisé (pm-date-field) ; pour un événement, la précision (jour, mois, année) se choisit
 * à côté. Une date lue par la grammaire qui n'est aucun de ces raccourcis (« 12 mars », « été 2024 »)
 * s'affiche comme option retenue, avec sa précision. La valeur est au format du contrat
 * (EntryOccurredRequest) ; null veut dire « maintenant ».
 */
@Component({
  selector: 'pm-capture-when',
  imports: [ReactiveFormsModule, DateFieldComponent, MonthFieldComponent],
  template: `
    <select
      class="sel"
      [id]="inputId()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      (change)="pick($any($event.target).value)"
    >
      <option
        value="now"
        [selected]="mode() === 'now'"
        i18n="Moment : maintenant@@capture.when.now"
      >
        maintenant
      </option>
      <option
        value="today"
        [selected]="mode() === 'today'"
        i18n="Moment : aujourd'hui@@capture.when.today"
      >
        aujourd'hui
      </option>
      <option
        value="yesterday"
        [selected]="mode() === 'yesterday'"
        i18n="Moment : hier@@capture.when.yesterday"
      >
        hier
      </option>
      <option
        value="before"
        [selected]="mode() === 'before'"
        i18n="Moment : avant-hier@@capture.when.dayBefore"
      >
        avant-hier
      </option>
      <option
        value="other"
        [selected]="mode() === 'other'"
        i18n="Moment : une autre date@@capture.when.other"
      >
        autre date…
      </option>
      @if (detectedText(); as text) {
        <option value="detected" [selected]="mode() === 'detected'">{{ text }}</option>
      }
    </select>
    @if (mode() === 'other') {
      @if (precisionChoice()) {
        <select
          class="sel precision"
          [attr.aria-label]="precisionAria"
          (change)="choosePrecision($any($event.target).value)"
        >
          @for (item of precisions; track item) {
            <option [value]="item" [selected]="precision() === item">{{ labelOf(item) }}</option>
          }
        </select>
      }
      @switch (precision()) {
        @case ('month') {
          <pm-month-field
            [formControl]="monthControl"
            [inputId]="inputId() + '-month'"
            [describedBy]="describedBy()"
            [invalid]="invalid()"
          />
        }
        @case ('year') {
          <input
            class="sel year"
            type="text"
            inputmode="numeric"
            maxlength="4"
            placeholder="aaaa"
            i18n-placeholder="Format d'une année@@capture.when.yearPlaceholder"
            [attr.aria-label]="yearAria"
            [attr.aria-describedby]="describedBy()"
            [value]="year()"
            (input)="chooseYear($any($event.target).value)"
          />
        }
        @default {
          <pm-date-field
            [formControl]="dayControl"
            [inputId]="inputId() + '-day'"
            [describedBy]="describedBy()"
            [invalid]="invalid()"
          />
        }
      }
    } @else if (mode() === 'detected' && value(); as when) {
      <span class="precision-note">{{ precisionNote(when.precision) }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .sel {
      box-sizing: border-box;
      height: 32px;
      padding: 0 8px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
    }
    .sel[aria-invalid='true'] {
      border-color: var(--warning);
    }
    .year {
      width: 72px;
      font-family: var(--font-mono);
    }
    .precision-note {
      color: var(--text-secondary);
      font: var(--mat-sys-label-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureWhenFieldComponent {
  readonly value = input<ParsedOccurred | null>(null);
  readonly inputId = input.required<string>();
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);
  /** Événement : la précision (jour, mois, année) se choisit avec la date. */
  readonly precisionChoice = input(false);
  /** Fuseau du praticien : il dit quel jour civil est « aujourd'hui ». */
  readonly timeZone = input.required<string>();
  readonly now = input<Date>(new Date());

  readonly changed = output<ParsedOccurred | null>();

  private readonly locale = inject(LOCALE_ID);
  protected readonly precisions: readonly Precision[] = ['day', 'month', 'year'];
  protected readonly precisionAria = $localize`:Liste des précisions du moment dans le bloc@@capture.when.precision:Précision de la date`;
  protected readonly yearAria = $localize`:Champ année du moment dans le bloc@@capture.when.year:Année`;

  /** « autre date… » choisie : le champ reste affiché, même vide. */
  private readonly other = signal(false);
  protected readonly precision = signal<Precision>('day');
  protected readonly year = signal('');
  protected readonly dayControl = new FormControl<string | null>(null);
  protected readonly monthControl = new FormControl<string | null>(null);

  protected readonly mode = computed<Mode>(() => {
    const when = this.value();
    if (this.other()) return 'other';
    if (!when) return 'now';
    if (when.precision === 'day' && !when.to) {
      const day = when.from.slice(0, 10);
      const now = this.now();
      const zone = this.timeZone();
      if (day === civilDay(now, zone)) return 'today';
      if (day === civilDay(now, zone, 1)) return 'yesterday';
      if (day === civilDay(now, zone, 2)) return 'before';
    }
    return 'detected';
  });

  /** « 12 mars 2026 » : la date lue par la grammaire, hors raccourcis. */
  protected readonly detectedText = computed(() => {
    const when = this.value();
    if (!when || this.mode() !== 'detected') return null;
    return formatOccurred(
      {
        from: when.from,
        to: when.to ?? null,
        precision: when.precision,
        label: when.label ?? null,
      },
      this.locale,
      when.precision === 'exact' ? {} : { timeZone: 'UTC' },
    );
  });

  constructor() {
    // Les champs de « autre date » suivent la valeur reçue tant qu'ils ne l'ont pas eux-mêmes changée.
    effect(() => {
      const when = this.value();
      untracked(() => {
        if (!when || !this.other()) return;
        const day = when.from.slice(0, 10);
        if (when.precision === 'day' && this.dayControl.value !== day) {
          this.dayControl.setValue(day, { emitEvent: false });
        } else if (when.precision === 'month' && this.monthControl.value !== day.slice(0, 7)) {
          this.monthControl.setValue(day.slice(0, 7), { emitEvent: false });
        } else if (when.precision === 'year') {
          this.year.set(day.slice(0, 4));
        }
      });
    });
    this.dayControl.valueChanges.subscribe((day) => {
      if (!this.other()) return;
      this.changed.emit(day ? dayOccurred(day) : null);
    });
    this.monthControl.valueChanges.subscribe((month) => {
      if (!this.other()) return;
      this.changed.emit(month ? monthOccurred(month) : null);
    });
  }

  protected labelOf(precision: Precision): string {
    return precisionLabel(precision);
  }

  protected precisionNote(precision: OccurredPrecision): string {
    const label = precisionLabel(precision);
    return $localize`:Précision d'une date lue, à côté du moment@@capture.when.precisionNote:(${label}:precision:)`;
  }

  protected pick(mode: string): void {
    const now = this.now();
    const zone = this.timeZone();
    switch (mode) {
      case 'now':
        this.other.set(false);
        this.changed.emit(null);
        break;
      case 'today':
      case 'yesterday':
      case 'before': {
        this.other.set(false);
        const ago = mode === 'today' ? 0 : mode === 'yesterday' ? 1 : 2;
        this.changed.emit(dayOccurred(civilDay(now, zone, ago)));
        break;
      }
      case 'other': {
        this.other.set(true);
        const when = this.value();
        const precision: Precision =
          when?.precision === 'month' || when?.precision === 'year' ? when.precision : 'day';
        this.precision.set(precision);
        const day = when?.from.slice(0, 10) ?? civilDay(now, zone);
        this.dayControl.setValue(precision === 'day' ? day : null, { emitEvent: false });
        this.monthControl.setValue(precision === 'month' ? day.slice(0, 7) : null, {
          emitEvent: false,
        });
        this.year.set(precision === 'year' ? day.slice(0, 4) : '');
        if (!when || when.precision === 'exact' || when.precision === 'period') {
          this.changed.emit(dayOccurred(day));
        }
        break;
      }
      default:
        // « detected » : la date lue reste.
        this.other.set(false);
    }
  }

  protected choosePrecision(value: string): void {
    const precision = this.precisions.find((item) => item === value) ?? 'day';
    this.precision.set(precision);
    const base = this.value()?.from.slice(0, 10) ?? civilDay(this.now(), this.timeZone());
    switch (precision) {
      case 'day':
        this.dayControl.setValue(base, { emitEvent: false });
        this.changed.emit(dayOccurred(base));
        break;
      case 'month':
        this.monthControl.setValue(base.slice(0, 7), { emitEvent: false });
        this.changed.emit(monthOccurred(base.slice(0, 7)));
        break;
      case 'year':
        this.year.set(base.slice(0, 4));
        this.changed.emit(yearOccurred(base.slice(0, 4)));
        break;
    }
  }

  protected chooseYear(value: string): void {
    this.year.set(value);
    const when = yearOccurred(value.trim());
    if (when) this.changed.emit(when);
  }
}
