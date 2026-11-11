import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FieldProblem } from '../../../core/http';
import { FormErrorsComponent } from './form-errors.component';

const ERRORS: FieldProblem[] = [
  { field: 'displayName', code: 'REQUIRED', message: 'Le nom affiché est obligatoire.' },
  { field: 'occurred.from', code: 'INVALID_TIME', message: 'Date future.' },
  { field: 'tags[1]', code: 'UNKNOWN_TAG', message: 'Tag inconnu.' },
  { field: 'authorType', code: 'UNKNOWN_FIELD', message: 'Champ refusé.' },
  { field: '', code: 'INVALID_TIME', message: 'Période sans fin.' },
];

/** Un formulaire minimal : le résumé en tête, puis les champs aux id de fieldId(). */
@Component({
  imports: [FormErrorsComponent],
  template: `
    <pm-form-errors [errors]="errors()" [labels]="labels" [unmatched]="unmatched()" />
    <label for="field-displayName">Nom affiché</label>
    <input id="field-displayName" />
    <label for="field-occurred-from">Début</label>
    <input id="field-occurred-from" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FormHost {
  readonly errors = signal<FieldProblem[]>([]);
  readonly unmatched = signal<string[]>([]);
  readonly labels = { displayName: 'Nom affiché' };
}

async function setup() {
  TestBed.configureTestingModule({ imports: [FormHost] });
  const fixture = TestBed.createComponent(FormHost);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('FormErrorsComponent (pm-form-errors)', () => {
  afterEach(() => document.body.replaceChildren());

  it("ne rend rien tant qu'il n'y a aucune erreur", async () => {
    const { el } = await setup();
    expect(el.querySelector('pm-form-errors [role="alert"]')).toBeNull();
    expect(el.querySelector('pm-form-errors')?.textContent?.trim()).toBe('');
  });

  it('apparaît en role=alert avec un lien par champ, le reste en texte', async () => {
    const { fixture, host, el } = await setup();
    host.errors.set(ERRORS);
    host.unmatched.set(['authorType']);
    await fixture.whenStable();
    const alert = el.querySelector('pm-form-errors [role="alert"]');
    expect(alert?.textContent).toContain('5 champs à corriger.');
    const links = [...el.querySelectorAll('pm-form-errors a')].map((a) => [
      a.getAttribute('href'),
      a.textContent,
    ]);
    expect(links).toEqual([
      ['#field-displayName', 'Nom affiché'],
      ['#field-occurred-from', 'occurred.from'],
      ['#field-tags-1', 'tags[1]'],
    ]);
    expect(alert?.textContent).toContain('Le nom affiché est obligatoire.');
    expect(alert?.textContent).toContain('Champ refusé.');
    expect(alert?.textContent).toContain('Période sans fin.');
  });

  it('titre au singulier pour une seule erreur', async () => {
    const { fixture, host, el } = await setup();
    host.errors.set([ERRORS[0]]);
    await fixture.whenStable();
    expect(el.querySelector('pm-form-errors [role="alert"]')?.textContent).toContain(
      '1 champ à corriger.',
    );
  });

  it("prend le focus à l'apparition, et de nouveau quand les erreurs changent", async () => {
    const { fixture, host, el } = await setup();
    host.errors.set([ERRORS[0]]);
    await fixture.whenStable();
    const alert = el.querySelector<HTMLElement>('pm-form-errors [role="alert"]');
    expect(alert?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(alert);

    el.querySelector<HTMLInputElement>('#field-displayName')?.focus();
    host.errors.set([ERRORS[0], ERRORS[1]]);
    await fixture.whenStable();
    expect(document.activeElement).toBe(el.querySelector('pm-form-errors [role="alert"]'));
  });

  it('un lien met le focus sur son champ sans suivre l’ancre', async () => {
    const { fixture, host, el } = await setup();
    host.errors.set(ERRORS.slice(0, 2));
    await fixture.whenStable();
    const field = el.querySelector<HTMLInputElement>('#field-occurred-from');
    field!.scrollIntoView = vi.fn();
    const link = [...el.querySelectorAll<HTMLAnchorElement>('pm-form-errors a')][1];
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(field!.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it("un lien vers un champ absent laisse faire l'ancre", async () => {
    const { fixture, host, el } = await setup();
    host.errors.set([ERRORS[2]]);
    await fixture.whenStable();
    const link = el.querySelector<HTMLAnchorElement>('pm-form-errors a')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('disparaît quand les erreurs sont effacées', async () => {
    const { fixture, host, el } = await setup();
    host.errors.set(ERRORS);
    await fixture.whenStable();
    host.errors.set([]);
    await fixture.whenStable();
    expect(el.querySelector('pm-form-errors [role="alert"]')).toBeNull();
  });
});
