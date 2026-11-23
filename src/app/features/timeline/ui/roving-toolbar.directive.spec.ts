import { Component, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { RovingToolbarDirective } from './roving-toolbar.directive';

@Component({
  imports: [RovingToolbarDirective],
  template: `
    <div role="toolbar" aria-label="Barre" pmRovingToolbar>
      <button type="button">un</button>
      <button type="button">deux</button>
      <button type="button" disabled>sauté</button>
      <button type="button">trois</button>
    </div>
  `,
})
class HostComponent {}

async function render(locale: string) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }] });
  const fixture = TestBed.createComponent(HostComponent);
  document.body.append(fixture.nativeElement);
  await fixture.whenStable();
  const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
  const focused = () => (document.activeElement as HTMLElement | null)?.textContent;
  const press = (key: string) =>
    (document.activeElement ?? buttons[0]).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  buttons[0].focus();
  return { fixture, focused, press };
}

describe('RovingToolbarDirective : flèches dans le sens de lecture (Q81, arabe.md §6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('de gauche à droite (fr) : → va au suivant, ← au précédent, en boucle', async () => {
    const { focused, press, fixture } = await render('fr');
    press('ArrowRight');
    expect(focused()).toBe('deux');
    press('ArrowRight');
    expect(focused()).toBe('trois');
    press('ArrowRight');
    expect(focused()).toBe('un');
    press('ArrowLeft');
    expect(focused()).toBe('trois');
    fixture.nativeElement.remove();
  });

  it('de droite à gauche (ar) : ← va au suivant, → au précédent ; Début et Fin inchangés', async () => {
    const { focused, press, fixture } = await render('ar');
    press('ArrowLeft');
    expect(focused()).toBe('deux');
    press('ArrowLeft');
    expect(focused()).toBe('trois');
    press('ArrowRight');
    expect(focused()).toBe('deux');
    press('ArrowRight');
    press('ArrowRight');
    expect(focused()).toBe('trois');
    press('Home');
    expect(focused()).toBe('un');
    press('End');
    expect(focused()).toBe('trois');
    fixture.nativeElement.remove();
  });
});
