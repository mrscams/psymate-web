import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { IntensitySliderComponent } from './intensity-slider.component';
import { TypeChipsComponent } from './type-chips.component';

@Component({
  selector: 'pm-test-host',
  imports: [ReactiveFormsModule, IntensitySliderComponent, TypeChipsComponent],
  template: `
    <pm-intensity-slider [formControl]="intensity" labelledBy="lbl">
      <span id="lbl">Intensité</span>
    </pm-intensity-slider>
    <pm-type-chips [formControl]="type" label="Type d'entrée" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  readonly intensity = new FormControl<number | null>(null);
  readonly type = new FormControl<string>('note', { nonNullable: true });
}

async function render() {
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

function key(target: Element, name: string): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
}

describe('IntensitySliderComponent', () => {
  it('role slider 1–10 gradué, non réglé au départ, chiffres et flèches, valeur en mono', async () => {
    const { fixture, el, host } = await render();
    const slider = el.querySelector<HTMLElement>('[role="slider"]')!;
    expect(slider.getAttribute('aria-valuemin')).toBe('1');
    expect(slider.getAttribute('aria-valuemax')).toBe('10');
    // aria-valuenow est requis pour un slider : le minimum tant que non réglé, la valeur lue dit « Non renseignée ».
    expect(slider.getAttribute('aria-valuenow')).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe('Non renseignée');
    expect(slider.getAttribute('aria-labelledby')).toBe('lbl');
    // Dix repères, de 1 à 10, masqués des lecteurs d'écran (la valeur est lue sur le slider).
    const ticks = [...el.querySelectorAll('.ticks .tick')].map((tick) => tick.textContent?.trim());
    expect(ticks).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(el.querySelector('.ticks')?.getAttribute('aria-hidden')).toBe('true');
    // Le libellé est projeté à gauche de la valeur.
    expect(el.querySelector('pm-intensity-slider .head #lbl')?.textContent).toBe('Intensité');

    key(slider, '8');
    await fixture.whenStable();
    expect(host.intensity.value).toBe(8);
    expect(slider.getAttribute('aria-valuenow')).toBe('8');
    expect(slider.getAttribute('aria-valuetext')).toBe('8 sur 10');
    expect(el.querySelector('.value')?.textContent?.replace(/\s/g, '')).toBe('8/10');
    expect(el.querySelector('.tick.on')?.textContent?.trim()).toBe('8');

    key(slider, 'ArrowRight');
    key(slider, 'ArrowRight');
    key(slider, 'ArrowRight');
    expect(host.intensity.value).toBe(10);
    key(slider, 'PageDown');
    expect(host.intensity.value).toBe(8);
    key(slider, 'Home');
    expect(host.intensity.value).toBe(1);
    key(slider, 'ArrowLeft');
    expect(host.intensity.value).toBe(1);
    key(slider, '1');
    key(slider, '0');
    expect(host.intensity.value).toBe(10);
    key(slider, 'ArrowLeft');
    expect(host.intensity.value).toBe(9);
  });

  it('valeur reçue : 5 par défaut affiché, 0 du contrat gardé tel quel', async () => {
    const { fixture, el, host } = await render();
    const slider = el.querySelector<HTMLElement>('[role="slider"]')!;
    host.intensity.setValue(5);
    await fixture.whenStable();
    expect(slider.getAttribute('aria-valuenow')).toBe('5');
    key(slider, 'ArrowDown');
    expect(host.intensity.value).toBe(4);

    host.intensity.setValue(0);
    await fixture.whenStable();
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    key(slider, 'ArrowRight');
    expect(host.intensity.value).toBe(1);
  });
});

describe('TypeChipsComponent', () => {
  it('six puces, une pressée, ← → changent de type ; désactivées : verrouillées', async () => {
    const { fixture, el, host } = await render();
    const chips = [...el.querySelectorAll<HTMLButtonElement>('pm-type-chips button')];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      'Note',
      'Événement',
      'Situation',
      'Ressenti',
      'Séance',
      'Médicament',
    ]);
    expect(el.querySelector('pm-type-chips [role="group"]')?.getAttribute('aria-label')).toBe(
      "Type d'entrée",
    );
    expect(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(chips.map((chip) => chip.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);

    key(chips[0], 'ArrowRight');
    key(chips[1], 'ArrowRight');
    key(chips[2], 'ArrowRight');
    await fixture.whenStable();
    expect(host.type.value).toBe('feeling');
    expect(chips[3].getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(chips[3]);

    chips[5].click();
    expect(host.type.value).toBe('medication');

    host.type.disable();
    await fixture.whenStable();
    chips[0].click();
    expect(host.type.value).toBe('medication');
    expect(chips[0].getAttribute('aria-disabled')).toBe('true');
    expect(chips.every((chip) => chip.tabIndex === -1)).toBe(true);
  });
});
