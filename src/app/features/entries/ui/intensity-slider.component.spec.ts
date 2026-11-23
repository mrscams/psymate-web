import { ChangeDetectionStrategy, Component, LOCALE_ID } from '@angular/core';
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
    // État « non renseigné » visible : pas de pouce, « Non renseignée » à la place de la valeur.
    expect(el.querySelector('.value.unset')?.textContent?.trim()).toBe('Non renseignée');
    expect(el.querySelector('.thumb')).toBeNull();
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

/** Même hôte dans un bundle donné (LOCALE_ID ; « ar » : de droite à gauche, core/i18n textDirection). */
async function renderIn(locale: string) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }] });
  return render();
}

function startOf(element: Element | null): string {
  return (element as HTMLElement | null)?.style.getPropertyValue('inset-inline-start') ?? '';
}

describe('IntensitySliderComponent, sens de lecture (M16-19)', () => {
  it('position par le bord de début (logique), même valeur en fr et en ar', async () => {
    for (const locale of ['fr', 'ar']) {
      TestBed.resetTestingModule();
      const { fixture, el, host } = await renderIn(locale);
      host.intensity.setValue(4);
      await fixture.whenStable();
      // (4 − 1) / 9 : un tiers de la piste depuis le bord de début (gauche en fr, droite en ar).
      expect(startOf(el.querySelector('.thumb'))).toMatch(/^33\.33/);
      expect(el.querySelector<HTMLElement>('.thumb')?.style.getPropertyValue('left')).toBe('');
      const ticks = [...el.querySelectorAll('.ticks .tick')].map(startOf);
      expect(ticks[0]).toBe('0%');
      expect(ticks[9]).toBe('100%');
    }
  });

  it('de droite à gauche : ← augmente, → diminue ; ↑ ↓ et aria-value* inchangés', async () => {
    const { fixture, el, host } = await renderIn('ar');
    const slider = el.querySelector<HTMLElement>('[role="slider"]')!;
    host.intensity.setValue(5);
    await fixture.whenStable();

    key(slider, 'ArrowLeft');
    await fixture.whenStable();
    expect(host.intensity.value).toBe(6);
    expect(slider.getAttribute('aria-valuenow')).toBe('6');
    key(slider, 'ArrowRight');
    key(slider, 'ArrowRight');
    await fixture.whenStable();
    expect(host.intensity.value).toBe(4);
    expect(slider.getAttribute('aria-valuenow')).toBe('4');
    key(slider, 'ArrowUp');
    expect(host.intensity.value).toBe(5);
    key(slider, 'ArrowDown');
    expect(host.intensity.value).toBe(4);
    key(slider, 'End');
    key(slider, 'ArrowLeft');
    expect(host.intensity.value).toBe(10);
    key(slider, 'Home');
    key(slider, 'ArrowRight');
    await fixture.whenStable();
    expect(host.intensity.value).toBe(1);
    expect(slider.getAttribute('aria-valuemin')).toBe('1');
    expect(slider.getAttribute('aria-valuemax')).toBe('10');
    expect(slider.getAttribute('aria-valuenow')).toBe('1');
  });

  it('de gauche à droite (en) : → augmente, ← diminue, comme en fr', async () => {
    const { fixture, el, host } = await renderIn('en');
    const slider = el.querySelector<HTMLElement>('[role="slider"]')!;
    host.intensity.setValue(5);
    await fixture.whenStable();
    key(slider, 'ArrowRight');
    expect(host.intensity.value).toBe(6);
    key(slider, 'ArrowLeft');
    key(slider, 'ArrowLeft');
    expect(host.intensity.value).toBe(4);
  });

  it('pointeur : la distance se mesure depuis la droite de droite à gauche', async () => {
    for (const locale of ['fr', 'ar']) {
      TestBed.resetTestingModule();
      const { fixture, el, host } = await renderIn(locale);
      const slider = el.querySelector<HTMLElement>('[role="slider"]')!;
      const track = el.querySelector<HTMLElement>('.track')!;
      track.getBoundingClientRect = () =>
        ({ left: 100, right: 280, width: 180, top: 0, bottom: 4, height: 4 }) as DOMRect;
      // Près du bord droit : 10 de gauche à droite, 1 de droite à gauche.
      slider.dispatchEvent(new MouseEvent('pointerdown', { clientX: 278, bubbles: true }));
      await fixture.whenStable();
      expect(host.intensity.value).toBe(locale === 'ar' ? 1 : 10);
      // Aux deux tiers depuis la gauche : 7 en fr ; en ar, un tiers depuis la droite : 4.
      slider.dispatchEvent(new MouseEvent('pointerdown', { clientX: 220, bubbles: true }));
      expect(host.intensity.value).toBe(locale === 'ar' ? 4 : 7);
    }
  });
});

describe('TypeChipsComponent, sens de lecture (M16-19)', () => {
  it('de droite à gauche : ← passe au type suivant, → au précédent ; ↓ ↑ inchangés', async () => {
    const { fixture, el, host } = await renderIn('ar');
    const chip = (type: string) =>
      el.querySelector<HTMLButtonElement>(`pm-type-chips [data-type="${type}"]`)!;

    key(chip('note'), 'ArrowLeft');
    await fixture.whenStable();
    expect(host.type.value).toBe('event');
    expect(document.activeElement).toBe(chip('event'));
    key(chip('event'), 'ArrowLeft');
    await fixture.whenStable();
    expect(host.type.value).toBe('situation');
    key(chip('situation'), 'ArrowRight');
    await fixture.whenStable();
    expect(host.type.value).toBe('event');
    key(chip('event'), 'ArrowDown');
    await fixture.whenStable();
    expect(host.type.value).toBe('situation');
    key(chip('situation'), 'ArrowUp');
    await fixture.whenStable();
    expect(host.type.value).toBe('event');
    // Aux bords : → depuis la première puce revient à la dernière.
    key(chip('event'), 'ArrowRight');
    key(chip('note'), 'ArrowRight');
    await fixture.whenStable();
    expect(host.type.value).toBe('medication');
  });
});
