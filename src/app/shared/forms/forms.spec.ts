import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, NonNullableFormBuilder, Validators } from '@angular/forms';

import { ApiProblem } from '../../core/http';
import {
  applyProblem,
  clearServerErrors,
  fieldId,
  firstInvalidField,
  toControlPath,
} from './apply-problem';
import { FieldErrorsComponent, firstMessage } from './field-errors.component';
import { ProblemSummaryComponent } from './problem-summary.component';
import { PmValidators } from './validators';

const problem422: ApiProblem = {
  status: 422,
  code: 'VALIDATION_FAILED',
  errors: [
    { field: 'displayName', code: 'REQUIRED', message: 'Le nom affiché est obligatoire.' },
    { field: 'occurred.from', code: 'INVALID_TIME', message: 'Date future.' },
    { field: 'tags[1]', code: 'UNKNOWN_TAG', message: 'Tag inconnu.' },
    { field: 'authorType', code: 'UNKNOWN_FIELD', message: 'Champ refusé.' },
    { field: '', code: 'INVALID_TIME', message: 'Période sans fin.' },
  ],
};

function buildForm(): FormGroup {
  return new FormGroup({
    displayName: new FormControl('Marie', { nonNullable: true, validators: Validators.required }),
    occurred: new FormGroup({ from: new FormControl('2026-01-01') }),
    tags: new FormGroup({ 0: new FormControl('a'), 1: new FormControl('b') }),
  });
}

describe('applyProblem', () => {
  it('relie chaque erreur à son contrôle, garde la saisie et rend les erreurs sans contrôle', () => {
    const form = buildForm();
    const { applied, unmatched } = applyProblem(form, problem422);

    expect(applied.map((e) => e.field)).toEqual(['displayName', 'occurred.from', 'tags[1]']);
    expect(unmatched.map((e) => e.field)).toEqual(['authorType', '']);
    expect(form.get('displayName')?.errors).toEqual({ server: 'Le nom affiché est obligatoire.' });
    expect(form.get('displayName')?.touched).toBe(true);
    expect(form.get('displayName')?.value).toBe('Marie');
    expect(form.get('occurred.from')?.errors).toEqual({ server: 'Date future.' });
    expect(form.get('tags.1')?.errors).toEqual({ server: 'Tag inconnu.' });
    expect(form.invalid).toBe(true);
  });

  it('une nouvelle application efface les erreurs serveur précédentes', () => {
    const form = buildForm();
    applyProblem(form, problem422);
    applyProblem(form, { status: 422, code: 'VALIDATION_FAILED', errors: [] });
    expect(form.get('displayName')?.errors).toBeNull();
    expect(form.valid).toBe(true);
    applyProblem(form, problem422);
    clearServerErrors(form);
    expect(form.valid).toBe(true);
  });

  it('un problème sans errors[] ne touche à rien', () => {
    const form = buildForm();
    applyProblem(form, { status: 409, code: 'LINK_EXISTS' });
    applyProblem(form, null);
    expect(form.valid).toBe(true);
  });

  it('chemins et identifiants', () => {
    expect(toControlPath('tags[2]')).toBe('tags.2');
    expect(fieldId('occurred.from')).toBe('field-occurred-from');
    const form = buildForm();
    form.get('displayName')?.setValue('');
    expect(firstInvalidField(form)).toBe('displayName');
    form.get('displayName')?.setValue('x');
    form.get('occurred.from')?.setErrors({ server: 'x' });
    expect(firstInvalidField(form)).toBe('occurred.from');
  });
});

describe('PmValidators', () => {
  it('forme seulement : requis après trim, longueur, mot de passe, date', () => {
    expect(PmValidators.trimmedRequired(new FormControl('   '))).toEqual({ required: true });
    expect(PmValidators.trimmedRequired(new FormControl(' a '))).toBeNull();
    expect(PmValidators.maxLengthTrimmed(2)(new FormControl(' abc '))).toMatchObject({
      maxlength: { requiredLength: 2, actualLength: 3 },
    });
    expect(PmValidators.password(new FormControl('court'))).toMatchObject({ minlength: {} });
    expect(PmValidators.password(new FormControl('Fil-Rouge-Clinique-2026'))).toBeNull();
    const now = () => new Date('2026-10-20T00:00:00Z');
    expect(PmValidators.notFutureDate(now)(new FormControl('2026-10-21'))).toEqual({
      futureDate: true,
    });
    expect(PmValidators.notFutureDate(now)(new FormControl('2026-10-19'))).toBeNull();
    expect(PmValidators.notFutureDate(now)(new FormControl('hier'))).toEqual({ date: true });
    expect(PmValidators.date(new FormControl(''))).toBeNull();
  });
});

describe('firstMessage', () => {
  it('message du serveur d’abord, puis règles de forme', () => {
    expect(firstMessage({ required: true, server: 'Du serveur.' })).toBe('Du serveur.');
    expect(firstMessage({ required: true })).toBe('Ce champ est obligatoire.');
    expect(firstMessage({ minlength: { requiredLength: 12, actualLength: 3 } })).toBe(
      'Au moins 12 caractères.',
    );
    expect(firstMessage({ futureDate: true })).toBe('La date ne peut pas être dans le futur.');
    expect(firstMessage({ custom: true })).toBe('Valeur invalide.');
  });
});

@Component({
  selector: 'pm-field-host',
  imports: [FieldErrorsComponent],
  template: `<pm-field-errors [control]="control()" id="field-displayName" [force]="force()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FieldHost {
  readonly control = input.required<FormControl>();
  readonly force = input(false);
}

describe('FieldErrorsComponent', () => {
  it('rien tant que le champ n’est pas touché, puis le message, puis le message serveur', async () => {
    const control = inject().control('', Validators.required);
    const fixture = TestBed.createComponent(FieldHost);
    fixture.componentRef.setInput('control', control);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('p')).toBeNull();

    control.markAsTouched();
    control.updateValueAndValidity();
    await fixture.whenStable();
    expect(el.querySelector('p#field-displayName')?.textContent).toContain('obligatoire');

    control.setValue('Marie');
    control.setErrors({ server: 'Déjà pris.' });
    await fixture.whenStable();
    expect(el.querySelector('p')?.textContent).toContain('Déjà pris.');

    control.setErrors(null);
    await fixture.whenStable();
    expect(el.querySelector('p')).toBeNull();
  });

  it('force affiche le message d’un champ jamais touché', async () => {
    const control = inject().control('', Validators.required);
    const fixture = TestBed.createComponent(FieldHost);
    fixture.componentRef.setInput('control', control);
    fixture.componentRef.setInput('force', true);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('p')).not.toBeNull();
  });

  function inject(): NonNullableFormBuilder {
    TestBed.configureTestingModule({ imports: [FieldHost] });
    return TestBed.inject(NonNullableFormBuilder);
  }
});

describe('ProblemSummaryComponent', () => {
  it('résumé role=alert avec un lien par champ, le reste en texte, et le focus', async () => {
    TestBed.configureTestingModule({ imports: [ProblemSummaryComponent] });
    const fixture = TestBed.createComponent(ProblemSummaryComponent);
    fixture.componentRef.setInput('errors', problem422.errors);
    fixture.componentRef.setInput('labels', { displayName: 'Nom affiché' });
    fixture.componentRef.setInput('unmatched', ['authorType']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('5 champs à corriger.');
    const links = [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([
      ['#field-displayName', 'Nom affiché'],
      ['#field-occurred-from', 'occurred.from'],
      ['#field-tags-1', 'tags[1]'],
    ]);
    expect(el.textContent).toContain('Champ refusé.');
    expect(el.textContent).toContain('Période sans fin.');
    expect(document.activeElement).toBe(alert);

    fixture.componentRef.setInput('errors', []);
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
