import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ChipOption, ChipPickerComponent } from './chip-picker.component';

const OPTIONS: ChipOption[] = [
  { code: 'anxiety', label: 'Anxiété' },
  { code: 'burnout', label: 'Burn-out' },
  { code: 'grief', label: 'Deuil' },
];

@Component({
  imports: [ReactiveFormsModule, ChipPickerComponent],
  template: `<pm-chip-picker
    [formControl]="control"
    label="Spécialités"
    [options]="options"
    [max]="max()"
  />`,
})
class HostComponent {
  readonly control = new FormControl<string[]>(['grief'], { nonNullable: true });
  readonly options = OPTIONS;
  readonly max = signal<number | null>(8);
}

async function render() {
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  return { fixture, el, input, host: fixture.componentInstance };
}

async function type(
  fixture: { whenStable(): Promise<unknown> },
  input: HTMLInputElement,
  text: string,
) {
  input.focus();
  input.dispatchEvent(new Event('focus'));
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

function key(input: HTMLInputElement, name: string): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
}

function chips(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.chip > span:first-child')).map(
    (chip) => chip.textContent?.trim() ?? '',
  );
}

describe('ChipPickerComponent', () => {
  it('affiche les puces choisies avec un bouton « Retirer X » et le compteur', async () => {
    const { el } = await render();
    expect(chips(el)).toEqual(['Deuil']);
    expect(el.querySelector('.remove')?.getAttribute('aria-label')).toBe('Retirer Deuil');
    expect(el.querySelector('.count')?.textContent).toContain('1 / 8');
    expect(el.querySelector('label')?.getAttribute('for')).toBe(
      el.querySelector('input')?.id ?? 'absent',
    );
  });

  it('filtre la liste fermée (accents ignorés) et Entrée ajoute l’option surlignée', async () => {
    const { fixture, el, input, host } = await render();
    await type(fixture, input, 'anxi');
    const options = Array.from(el.querySelectorAll('[role="option"]')).map((o) =>
      o.textContent?.trim(),
    );
    expect(options).toEqual(['Anxiété']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    key(input, 'Enter');
    await fixture.whenStable();
    expect(host.control.value).toEqual(['grief', 'anxiety']);
    expect(input.value).toBe('');
  });

  it('aucune valeur libre : un texte hors liste n’entre jamais, « Pas dans la liste » est dit', async () => {
    const { fixture, el, input, host } = await render();
    await type(fixture, input, 'Astrologie');
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(el.querySelector('.none')?.textContent).toContain('Pas dans la liste');
    key(input, 'Enter');
    await fixture.whenStable();
    expect(host.control.value).toEqual(['grief']);
  });

  it('Retour arrière sur champ vide retire la dernière puce ; le bouton × retire la sienne', async () => {
    const { fixture, el, input, host } = await render();
    host.control.setValue(['grief', 'anxiety']);
    await fixture.whenStable();
    key(input, 'Backspace');
    await fixture.whenStable();
    expect(host.control.value).toEqual(['grief']);
    el.querySelector<HTMLButtonElement>('.remove')!.click();
    await fixture.whenStable();
    expect(host.control.value).toEqual([]);
  });

  it('flèches puis Entrée : choisit l’option suivante', async () => {
    const { fixture, input, host } = await render();
    await type(fixture, input, '');
    key(input, 'ArrowDown');
    await fixture.whenStable();
    key(input, 'Enter');
    await fixture.whenStable();
    // Options restantes : Anxiété, Burn-out ; la flèche passe de la première à la deuxième.
    expect(host.control.value).toEqual(['grief', 'burnout']);
  });

  it('maximum atteint : champ en lecture seule mais focalisable, plus aucun ajout', async () => {
    const { fixture, el, input, host } = await render();
    host.max.set(1);
    await fixture.whenStable();
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('aria-disabled')).toBe('true');
    await type(fixture, input, 'anx');
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(0);
    key(input, 'Enter');
    await fixture.whenStable();
    expect(host.control.value).toEqual(['grief']);
  });
});
