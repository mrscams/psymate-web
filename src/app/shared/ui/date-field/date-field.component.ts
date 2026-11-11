import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { DateAdapter, MAT_DATE_FORMATS, MatDateFormats } from '@angular/material/core';
import {
  MatDatepicker,
  MatDatepickerIntl,
  MatDatepickerModule,
} from '@angular/material/datepicker';

import { PM_DAY_FORMATS, PM_MONTH_FORMATS, PmDateAdapter, PmDatepickerIntl } from './date-adapter';
import { DateGranularity, fromIsoDate, toIsoDate } from './date-text';

/**
 * Socle commun de pm-date-field et pm-month-field : un input texte numérique (JetBrains Mono)
 * relié à un calendrier Material, valeur ISO dans le contrôle de formulaire.
 */
@Directive()
abstract class DateFieldBase implements ControlValueAccessor, Validator {
  protected abstract readonly granularity: DateGranularity;

  /** id de l'input (le `<label for>` du formulaire pointe dessus). */
  readonly inputId = input.required<string>();
  /** id du message d'erreur (pm-field-errors), relié par aria-describedby. */
  readonly errorId = input<string>();
  /** Erreur signalée par le formulaire (validateur, 422) : bordure danger et aria-invalid. */
  readonly invalid = input(false);
  /** Bornes du calendrier, en ISO (`yyyy-MM-dd` ou `yyyy-MM`) ; la règle reste au validateur du formulaire. */
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);

  private readonly adapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly formats = inject<MatDateFormats>(MAT_DATE_FORMATS);
  protected readonly picker = viewChild.required<MatDatepicker<Date>>('picker');

  /** Valeur poussée vers l'input par le formulaire (writeValue) ; la saisie ne la réécrit pas. */
  protected readonly modelDate = signal<Date | null>(null);
  protected readonly disabled = signal(false);
  /** Texte saisi illisible ou date inexistante. */
  protected readonly parseError = signal(false);
  protected readonly ariaInvalid = computed(() => this.invalid() || this.parseError());
  protected readonly minDate = computed(() => fromIsoDate(this.min(), this.granularity));
  protected readonly maxDate = computed(() => fromIsoDate(this.max(), this.granularity));

  private iso: string | null = null;
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    const date = fromIsoDate(value, this.granularity);
    this.iso = date ? toIsoDate(date, this.granularity) : null;
    this.parseError.set(false);
    this.modelDate.set(date);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  /** `{ date: true }` (« Date invalide. » dans pm-field-errors) tant que la saisie est illisible. */
  validate(): ValidationErrors | null {
    return this.parseError() ? { date: true } : null;
  }

  /** Saisie clavier ou choix dans le calendrier : relit le texte de l'input. */
  protected sync(text: string): void {
    const parsed = this.adapter.parse(text, this.formats.parse.dateInput);
    const date = this.adapter.getValidDateOrNull(parsed);
    const error = text.trim() !== '' && date === null;
    const iso = date ? toIsoDate(date, this.granularity) : null;
    const errorChanged = error !== this.parseError();
    this.parseError.set(error);
    if (iso !== this.iso) {
      this.iso = iso;
      this.onChange(iso);
    } else if (errorChanged) {
      this.onValidatorChange();
    }
  }

  /** Variante mois : le choix d'un mois dans le calendrier est retenu sans descendre au jour. */
  protected monthSelected(month: Date): void {
    if (this.granularity !== 'month') return;
    this.picker().select(month);
    this.picker().close();
  }

  protected touched(): void {
    this.onTouched();
  }
}

/**
 * Champ date localisé (UX-A4) : saisie au clavier `jj/mm/aaaa` en fr (`mm/dd/yyyy` en en) et
 * calendrier Material. Valeur du contrôle : `yyyy-MM-dd` ou null ; texte illisible → null et erreur
 * `date`. Usage, à la place d'un `input[type=date]` :
 *
 * ```html
 * <label [for]="fid('birthDate')">Date de naissance</label>
 * <pm-date-field formControlName="birthDate" [inputId]="fid('birthDate')"
 *   [errorId]="fid('birthDate') + '-error'" [invalid]="invalid(form.controls.birthDate)" />
 * <pm-field-errors [control]="form.controls.birthDate" [id]="fid('birthDate') + '-error'" />
 * ```
 */
@Component({
  selector: 'pm-date-field',
  imports: [MatDatepickerModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateFieldComponent), multi: true },
    { provide: DateAdapter, useClass: PmDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: PM_DAY_FORMATS },
    { provide: MatDatepickerIntl, useClass: PmDatepickerIntl },
  ],
  templateUrl: './date-field.component.html',
  styleUrl: './date-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateFieldComponent extends DateFieldBase {
  protected readonly granularity: DateGranularity = 'day';
  protected readonly placeholder = $localize`:Format affiché dans un champ date vide@@shared.dateField.placeholder.day:jj/mm/aaaa`;
}

/**
 * Variante mois de pm-date-field : saisie `mm/aaaa`, calendrier ouvert sur les années puis les
 * mois. Valeur du contrôle : `yyyy-MM` ou null. Même usage que pm-date-field, à la place d'un
 * `input[type=month]`.
 */
@Component({
  selector: 'pm-month-field',
  imports: [MatDatepickerModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MonthFieldComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MonthFieldComponent), multi: true },
    { provide: DateAdapter, useClass: PmDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: PM_MONTH_FORMATS },
    { provide: MatDatepickerIntl, useClass: PmDatepickerIntl },
  ],
  templateUrl: './date-field.component.html',
  styleUrl: './date-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthFieldComponent extends DateFieldBase {
  protected readonly granularity: DateGranularity = 'month';
  protected readonly placeholder = $localize`:Format affiché dans un champ mois vide@@shared.dateField.placeholder.month:mm/aaaa`;
}
