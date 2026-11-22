import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BookingWindow } from '../../../../core/preferences';
import { BookingWindowsEditorComponent } from './booking-windows-editor.component';
import { windowFaults } from './booking-windows';

const MONDAY_MORNING: BookingWindow = { day: 1, start: '09:00', end: '12:00' };

async function render(windows: BookingWindow[] = [], serverError: string | null = null) {
  TestBed.configureTestingModule({ imports: [BookingWindowsEditorComponent] });
  const fixture = TestBed.createComponent(BookingWindowsEditorComponent);
  fixture.componentRef.setInput('windows', windows);
  fixture.componentRef.setInput('serverError', serverError);
  const saved: BookingWindow[][] = [];
  fixture.componentInstance.save.subscribe((value) => saved.push(value));
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, saved };
}

function day(el: HTMLElement, name: string): HTMLElement {
  const group = el.querySelector<HTMLElement>(`[role="group"][aria-label="Plages du ${name}"]`);
  if (!group) throw new Error(`jour absent : ${name}`);
  return group;
}

function button(scope: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!found) throw new Error(`bouton absent : ${text}`);
  return found;
}

function field(el: HTMLElement, label: string): HTMLInputElement {
  const target = Array.from(el.querySelectorAll('label')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const input = target ? el.querySelector<HTMLInputElement>(`#${target.htmlFor}`) : null;
  if (!input) throw new Error(`champ absent : ${label}`);
  return input;
}

async function type(
  fixture: ComponentFixture<unknown>,
  input: HTMLInputElement,
  value: string,
): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  await fixture.whenStable();
}

function saveButton(el: HTMLElement): HTMLButtonElement {
  return button(el, 'Enregistrer les plages');
}

describe('windowFaults', () => {
  it('format, ordre, chevauchement ; contiguës admises', () => {
    const faults = windowFaults([
      { key: 1, day: 1, start: '09:00', end: '12:00' },
      { key: 2, day: 1, start: '12:00', end: '14:00' },
      { key: 3, day: 1, start: '13:00', end: '15:00' },
      { key: 4, day: 2, start: '14:00', end: '12:00' },
      { key: 5, day: 3, start: '9h', end: '12:00' },
      { key: 6, day: 3, start: '09:03', end: '12:00' },
      { key: 7, day: 4, start: '09:00', end: '12:00' },
    ]);
    expect(faults.get(1)).toBeUndefined();
    expect(faults.get(2)).toBeUndefined();
    expect(faults.get(3)).toBe('overlap');
    expect(faults.get(4)).toBe('order');
    expect(faults.get(5)).toBe('format');
    expect(faults.get(6)).toBe('format');
    expect(faults.get(7)).toBeUndefined();
  });
});

describe('BookingWindowsEditorComponent', () => {
  afterEach(() => document.body.replaceChildren());

  it('vide : sept jours « Aucune plage », « 0 plage sur 21 », enregistrement inactif', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('[role="group"]')).toHaveLength(7);
    expect(Array.from(el.querySelectorAll('h3')).map((h) => h.textContent?.trim())).toEqual([
      'Lundi',
      'Mardi',
      'Mercredi',
      'Jeudi',
      'Vendredi',
      'Samedi',
      'Dimanche',
    ]);
    expect(el.querySelectorAll('.wd-none')).toHaveLength(7);
    expect(el.querySelector('.count')?.textContent).toContain('0 plage sur 21');
    expect(saveButton(el).disabled).toBe(true);
    expect(el.querySelector('.saved-flag')?.textContent?.trim()).toBe('');
  });

  it('plages du serveur : champs nommés, « Retirer » qui dit quelle plage, « Enregistré »', async () => {
    const { el } = await render([MONDAY_MORNING, { day: 1, start: '14:00', end: '18:00' }]);
    expect(field(el, 'Début de la plage 1 du lundi').value).toBe('09:00');
    expect(field(el, 'Fin de la plage 2 du lundi').value).toBe('18:00');
    expect(
      el.querySelector('[aria-label="Retirer la plage du lundi, 09:00 à 12:00"]'),
    ).not.toBeNull();
    expect(el.querySelector('.count')?.textContent).toContain('2 plages sur 21');
    expect(el.querySelector('.saved-flag')?.textContent?.trim()).toBe('Enregistré');
    expect(saveButton(el).disabled).toBe(true);
  });

  it('ajouter : focus sur Début, rien n’est émis avant « Enregistrer les plages »', async () => {
    const { fixture, el, saved } = await render();
    button(day(el, 'lundi'), 'Ajouter une plage').click();
    await fixture.whenStable();
    const start = field(el, 'Début de la plage 1 du lundi');
    expect(document.activeElement).toBe(start);
    await type(fixture, start, '09:00');
    await type(fixture, field(el, 'Fin de la plage 1 du lundi'), '12:00');
    expect(saved).toHaveLength(0);
    expect(el.querySelector('.saved-flag')?.textContent?.trim()).toBe(
      'Modifications non enregistrées',
    );
    expect(button(el, 'Annuler les modifications')).toBeTruthy();
    saveButton(el).click();
    expect(saved).toEqual([[MONDAY_MORNING]]);
  });

  it('fin avant début : message sous la plage, champs invalides, aucune émission', async () => {
    const { fixture, el, saved } = await render([MONDAY_MORNING]);
    button(day(el, 'lundi'), 'Ajouter une plage').click();
    await fixture.whenStable();
    await type(fixture, field(el, 'Début de la plage 2 du lundi'), '14:00');
    await type(fixture, field(el, 'Fin de la plage 2 du lundi'), '12:00');
    const error = day(el, 'lundi').querySelector('[role="alert"]');
    expect(error?.textContent?.trim()).toBe('La fin doit être après le début.');
    const start = field(el, 'Début de la plage 2 du lundi');
    expect(start.getAttribute('aria-invalid')).toBe('true');
    expect(start.getAttribute('aria-describedby')).toBe(error?.id);
    expect(saveButton(el).disabled).toBe(true);
    saveButton(el).click();
    expect(saved).toHaveLength(0);
  });

  it('chevauchement refusé, plages contiguës acceptées', async () => {
    const { fixture, el, saved } = await render([MONDAY_MORNING]);
    button(day(el, 'lundi'), 'Ajouter une plage').click();
    await fixture.whenStable();
    await type(fixture, field(el, 'Début de la plage 2 du lundi'), '11:00');
    await type(fixture, field(el, 'Fin de la plage 2 du lundi'), '13:00');
    expect(day(el, 'lundi').querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Cette plage chevauche une autre plage du même jour.',
    );
    expect(saveButton(el).disabled).toBe(true);

    await type(fixture, field(el, 'Début de la plage 2 du lundi'), '12:00');
    await type(fixture, field(el, 'Fin de la plage 2 du lundi'), '14:00');
    expect(day(el, 'lundi').querySelector('[role="alert"]')).toBeNull();
    saveButton(el).click();
    expect(saved).toEqual([[MONDAY_MORNING, { day: 1, start: '12:00', end: '14:00' }]]);
  });

  it('format : message une fois la plage quittée (minutes de 5 en 5)', async () => {
    const { fixture, el } = await render();
    button(day(el, 'mercredi'), 'Ajouter une plage').click();
    await fixture.whenStable();
    const start = field(el, 'Début de la plage 1 du mercredi');
    start.value = '9h';
    start.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(day(el, 'mercredi').querySelector('[role="alert"]')).toBeNull();
    start.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await fixture.whenStable();
    expect(day(el, 'mercredi').querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Heure attendue au format HH:MM, minutes de 5 en 5.',
    );
  });

  it('retirer : focus sur « Ajouter une plage » du jour, puis « Annuler les modifications »', async () => {
    const { fixture, el } = await render([MONDAY_MORNING]);
    const remove = el.querySelector<HTMLButtonElement>(
      '[aria-label="Retirer la plage du lundi, 09:00 à 12:00"]',
    );
    remove?.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(button(day(el, 'lundi'), 'Ajouter une plage'));
    expect(day(el, 'lundi').querySelector('.wd-none')?.textContent?.trim()).toBe('Aucune plage');
    expect(saveButton(el).disabled).toBe(false);

    button(el, 'Annuler les modifications').click();
    await fixture.whenStable();
    expect(field(el, 'Début de la plage 1 du lundi').value).toBe('09:00');
    expect(saveButton(el).disabled).toBe(true);
  });

  it('21 plages : les sept « Ajouter une plage » inactifs, « 21 plages au plus. » ; retirer réactive', async () => {
    const windows: BookingWindow[] = [];
    for (let d = 1; d <= 7; d++) {
      for (const [start, end] of [
        ['08:00', '10:00'],
        ['10:00', '12:00'],
        ['14:00', '16:00'],
      ]) {
        windows.push({ day: d, start, end });
      }
    }
    const { fixture, el } = await render(windows);
    const adds = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter(
        (candidate) => candidate.textContent?.trim() === 'Ajouter une plage',
      );
    expect(adds()).toHaveLength(7);
    expect(adds().every((add) => add.disabled)).toBe(true);
    expect(el.querySelector('.count')?.textContent).toContain('21 plages sur 21');
    expect(el.querySelector('.count [role="status"]')?.textContent?.trim()).toBe(
      '21 plages au plus.',
    );

    el.querySelector<HTMLButtonElement>(
      '[aria-label="Retirer la plage du dimanche, 14:00 à 16:00"]',
    )?.click();
    await fixture.whenStable();
    expect(adds().every((add) => !add.disabled)).toBe(true);
    expect(el.querySelector('.count [role="status"]')).toBeNull();
  });

  it('refus du serveur : message sous l’éditeur, brouillon conservé ; relecture changée → brouillon remis', async () => {
    const { fixture, el } = await render([MONDAY_MORNING]);
    button(day(el, 'mardi'), 'Ajouter une plage').click();
    await fixture.whenStable();
    await type(fixture, field(el, 'Début de la plage 1 du mardi'), '09:00');
    await type(fixture, field(el, 'Fin de la plage 1 du mardi'), '12:00');

    // Même contenu relu (refus) : le brouillon reste à l'écran.
    fixture.componentRef.setInput('windows', [{ ...MONDAY_MORNING }]);
    fixture.componentRef.setInput(
      'serverError',
      'Plages invalides : deux plages du même jour se chevauchent.',
    );
    await fixture.whenStable();
    expect(el.querySelector('.error.server')?.textContent?.trim()).toBe(
      'Plages invalides : deux plages du même jour se chevauchent.',
    );
    expect(field(el, 'Début de la plage 1 du mardi').value).toBe('09:00');

    // Écriture acceptée : le serveur renvoie la nouvelle liste, le brouillon repart de celle-ci.
    fixture.componentRef.setInput('serverError', null);
    fixture.componentRef.setInput('windows', [
      MONDAY_MORNING,
      { day: 2, start: '09:00', end: '12:00' },
    ]);
    await fixture.whenStable();
    expect(el.querySelector('.error.server')).toBeNull();
    expect(el.querySelector('.saved-flag')?.textContent?.trim()).toBe('Enregistré');
    expect(saveButton(el).disabled).toBe(true);
  });
});
