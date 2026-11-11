import { Component, LOCALE_ID, signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { DateFieldComponent, MonthFieldComponent } from './date-field.component';
import { formatDateText, fromIsoDate, parseDateText, toIsoDate } from './date-text';

describe('date-text', () => {
  const july28 = new Date(2003, 6, 28);

  it('formate selon la locale : fr jj/mm/aaaa, en mm/dd/yyyy, mois mm/aaaa', () => {
    expect(formatDateText(july28, 'fr', 'day')).toBe('28/07/2003');
    expect(formatDateText(july28, 'en', 'day')).toBe('07/28/2003');
    expect(formatDateText(july28, 'fr', 'month')).toBe('07/2003');
    expect(formatDateText(july28, 'en', 'month')).toBe('07/2003');
  });

  it('analyse « 28/07/2003 » en fr et « 07/28/2003 » en en', () => {
    expect(parseDateText('28/07/2003', 'fr', 'day')).toEqual(july28);
    expect(parseDateText('07/28/2003', 'en', 'day')).toEqual(july28);
    expect(parseDateText('28.7.2003', 'fr', 'day')).toEqual(july28);
    expect(parseDateText(' 28-07-2003 ', 'fr', 'day')).toEqual(july28);
    expect(parseDateText('2003-07-28', 'fr', 'day')).toEqual(july28);
  });

  it('refuse une saisie illisible, une date inexistante ou une année sur 2 chiffres', () => {
    expect(parseDateText('07/28/2003', 'fr', 'day')).toBeNull();
    expect(parseDateText('28/07/2003', 'en', 'day')).toBeNull();
    expect(parseDateText('31/02/2003', 'fr', 'day')).toBeNull();
    expect(parseDateText('28/07/03', 'fr', 'day')).toBeNull();
    expect(parseDateText('28/07', 'fr', 'day')).toBeNull();
    expect(parseDateText('abc', 'fr', 'day')).toBeNull();
    expect(parseDateText('', 'fr', 'day')).toBeNull();
  });

  it('analyse un mois mm/aaaa ou yyyy-MM', () => {
    expect(parseDateText('07/2003', 'fr', 'month')).toEqual(new Date(2003, 6, 1));
    expect(parseDateText('2003-07', 'en', 'month')).toEqual(new Date(2003, 6, 1));
    expect(parseDateText('13/2003', 'fr', 'month')).toBeNull();
    expect(parseDateText('28/07/2003', 'fr', 'month')).toBeNull();
  });

  it('ISO en transit : date civile sans décalage de fuseau', () => {
    expect(toIsoDate(july28, 'day')).toBe('2003-07-28');
    expect(toIsoDate(july28, 'month')).toBe('2003-07');
    expect(fromIsoDate('2003-07-28', 'day')).toEqual(july28);
    expect(fromIsoDate('2003-07-28T23:30:00Z', 'day')).toEqual(july28);
    expect(fromIsoDate('2003-07', 'month')).toEqual(new Date(2003, 6, 1));
    expect(fromIsoDate('2003-07', 'day')).toBeNull();
    expect(fromIsoDate(null, 'day')).toBeNull();
  });
});

@Component({
  imports: [ReactiveFormsModule, DateFieldComponent],
  template: `<pm-date-field
    [formControl]="control"
    inputId="birth"
    errorId="birth-error"
    [invalid]="invalid()"
  />`,
})
class DayHost {
  readonly control = new FormControl<string | null>(null);
  readonly invalid = signal(false);
}

@Component({
  imports: [ReactiveFormsModule, MonthFieldComponent],
  template: `<pm-month-field [formControl]="control" inputId="since" />`,
})
class MonthHost {
  readonly control = new FormControl<string | null>(null);
}

@Component({
  imports: [ReactiveFormsModule, DateFieldComponent],
  template: `<pm-date-field
    [formControl]="control"
    inputId="birth"
    [errorId]="errorId()"
    [describedBy]="hint()"
  />`,
})
class HintedDayHost {
  readonly control = new FormControl<string | null>(null);
  readonly errorId = signal<string | undefined>(undefined);
  readonly hint = signal<string | null>('birth-hint');
}

@Component({
  imports: [ReactiveFormsModule, MonthFieldComponent],
  template: `<pm-month-field
    [formControl]="control"
    inputId="since"
    errorId="since-error"
    describedBy="since-hint"
  />`,
})
class HintedMonthHost {
  readonly control = new FormControl<string | null>(null);
}

async function render<T>(host: Type<T>, locale = 'fr') {
  TestBed.configureTestingModule({
    imports: [host],
    providers: [{ provide: LOCALE_ID, useValue: locale }],
  });
  const fixture = TestBed.createComponent(host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  return { fixture, host: fixture.componentInstance, el, input, type };
}

describe('DateFieldComponent', () => {
  it('fr : affiche la valeur ISO en jj/mm/aaaa, placeholder et toggle traduits', async () => {
    const { fixture, host, input, el } = await render(DayHost, 'fr');
    expect(input.placeholder).toBe('jj/mm/aaaa');
    expect(input.id).toBe('birth');
    expect(input.getAttribute('aria-describedby')).toBe('birth-error');
    host.control.setValue('2003-07-28');
    await fixture.whenStable();
    expect(input.value).toBe('28/07/2003');
    expect(el.querySelector('mat-datepicker-toggle button')?.getAttribute('aria-label')).toBe(
      'Ouvrir le calendrier',
    );
  });

  it('en : affiche mm/dd/yyyy et lit la saisie dans cet ordre', async () => {
    const { fixture, host, input, type } = await render(DayHost, 'en');
    host.control.setValue('2003-07-28');
    await fixture.whenStable();
    expect(input.value).toBe('07/28/2003');
    await type('12/31/2025');
    expect(host.control.value).toBe('2025-12-31');
  });

  it('état normal : la saisie clavier « 28/07/2003 » donne 2003-07-28, sans erreur', async () => {
    const { host, input, type } = await render(DayHost, 'fr');
    await type('28/07/2003');
    expect(host.control.value).toBe('2003-07-28');
    expect(host.control.valid).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('saisie invalide : valeur null, erreur date, aria-invalid ; vider le champ efface l’erreur', async () => {
    const { host, input, type } = await render(DayHost, 'fr');
    await type('28/07/2003');
    await type('31/02/2003');
    expect(host.control.value).toBeNull();
    expect(host.control.errors).toEqual({ date: true });
    expect(input.getAttribute('aria-invalid')).toBe('true');

    await type('abc');
    expect(host.control.errors).toEqual({ date: true });

    await type('');
    expect(host.control.value).toBeNull();
    expect(host.control.errors).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('état erreur : [invalid] du formulaire met aria-invalid', async () => {
    const { fixture, host, input } = await render(DayHost, 'fr');
    host.invalid.set(true);
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('état désactivé : input et bouton du calendrier désactivés avec le contrôle', async () => {
    const { fixture, host, input, el } = await render(DayHost, 'fr');
    host.control.disable();
    await fixture.whenStable();
    expect(input.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('mat-datepicker-toggle button')?.disabled).toBe(
      true,
    );
    host.control.enable();
    await fixture.whenStable();
    expect(input.disabled).toBe(false);
  });

  it('reset() après une saisie valide vide l’input', async () => {
    const { fixture, host, input, type } = await render(DayHost, 'fr');
    await type('28/07/2003');
    host.control.reset();
    await fixture.whenStable();
    expect(input.value).toBe('');
    expect(host.control.value).toBeNull();
  });

  it('reset() après une saisie illisible vide l’input et efface l’erreur', async () => {
    const { fixture, host, input, type } = await render(DayHost, 'fr');
    await type('abc');
    host.control.reset();
    await fixture.whenStable();
    expect(input.value).toBe('');
    expect(host.control.errors).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('setValue() après une saisie affiche la nouvelle date, même égale à la valeur initiale', async () => {
    const { fixture, host, input, type } = await render(DayHost, 'fr');
    host.control.setValue('2003-07-28');
    await fixture.whenStable();
    await type('01/01/2020');
    expect(host.control.value).toBe('2020-01-01');
    host.control.setValue('2003-07-28');
    await fixture.whenStable();
    expect(input.value).toBe('28/07/2003');
  });

  it('marque le contrôle touché à la sortie du champ', async () => {
    const { host, input } = await render(DayHost, 'fr');
    input.dispatchEvent(new Event('blur'));
    expect(host.control.touched).toBe(true);
  });
});

describe('MonthFieldComponent', () => {
  it('affiche yyyy-MM en mm/aaaa et lit la saisie en yyyy-MM', async () => {
    const { fixture, host, input, type } = await render(MonthHost, 'fr');
    expect(input.placeholder).toBe('mm/aaaa');
    host.control.setValue('2025-03');
    await fixture.whenStable();
    expect(input.value).toBe('03/2025');
    await type('07/2003');
    expect(host.control.value).toBe('2003-07');
    await type('13/2003');
    expect(host.control.value).toBeNull();
    expect(host.control.errors).toEqual({ date: true });
    host.control.reset();
    await fixture.whenStable();
    expect(input.value).toBe('');
    expect(host.control.errors).toBeNull();
  });
});

describe('describedBy (UX-A8)', () => {
  it('pm-date-field : note d’aide seule, puis aide et erreur, sans rien : pas d’attribut', async () => {
    const { fixture, host, input } = await render(HintedDayHost, 'fr');
    expect(input.getAttribute('aria-describedby')).toBe('birth-hint');
    host.errorId.set('birth-error');
    await fixture.whenStable();
    expect(input.getAttribute('aria-describedby')).toBe('birth-hint birth-error');
    host.hint.set(null);
    await fixture.whenStable();
    expect(input.getAttribute('aria-describedby')).toBe('birth-error');
    host.errorId.set(undefined);
    await fixture.whenStable();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('pm-month-field : note d’aide avant le message d’erreur', async () => {
    const { input } = await render(HintedMonthHost, 'fr');
    expect(input.getAttribute('aria-describedby')).toBe('since-hint since-error');
  });

  it('sans describedBy : aria-describedby inchangé (errorId seul, ou absent)', async () => {
    const day = await render(DayHost, 'fr');
    expect(day.input.getAttribute('aria-describedby')).toBe('birth-error');
    TestBed.resetTestingModule();
    const month = await render(MonthHost, 'fr');
    expect(month.input.hasAttribute('aria-describedby')).toBe(false);
  });
});
