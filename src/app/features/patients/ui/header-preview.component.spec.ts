import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HeaderPreviewComponent } from './header-preview.component';

async function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HeaderPreviewComponent);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('HeaderPreviewComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('vide (création) : « Nom affiché » en attente, ni méta ni drapeau', async () => {
    const el = await render({});
    expect(el.querySelector('h2')?.textContent?.trim()).toBe("Aperçu de l'en-tête");
    expect(el.querySelector('.nm.placeholder')?.textContent).toBe('Nom affiché');
    expect(el.querySelector('.m')).toBeNull();
    expect(el.querySelector('.chips')).toBeNull();
  });

  it('rempli : nom, « 35 ans · suivi·e depuis septembre 2026 », drapeaux dans l’ordre de l’en-tête', async () => {
    const el = await render({
      displayName: '  Nour K. ',
      birthDate: '1991-04-12',
      since: '2026-09',
      flags: [
        { kind: 'watch', reason: 'Sommeil', setAt: null },
        { kind: 'risk', reason: null, setAt: null },
      ],
    });
    expect(el.querySelector('.nm')?.textContent).toBe('Nour K.');
    expect(el.querySelector('.m')?.textContent?.replace(/\s+/g, ' ')).toBe(
      '35 ans · suivi·e depuis septembre 2026',
    );
    const chips = [...el.querySelectorAll('.chip')];
    expect(chips.map((c) => c.firstChild?.textContent?.trim())).toEqual(['Risque', 'À surveiller']);
    // La raison est lue par les lecteurs d'écran, pas affichée.
    expect(chips[1].querySelector('.sr-only')?.textContent).toBe(': Sommeil');
  });
});
