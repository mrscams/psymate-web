import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';

import { emptyForm } from '../data/patient.model';
import { FlagFieldsComponent } from './flag-fields.component';
import { buildPatientForm } from './patient-form';

async function render(setAt: Record<string, string> = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const form = buildPatientForm(TestBed.inject(NonNullableFormBuilder), emptyForm(50));
  const group = form.controls.flags;
  const fixture = TestBed.createComponent(FlagFieldsComponent);
  fixture.componentRef.setInput('group', group);
  fixture.componentRef.setInput('flags', group.getRawValue());
  fixture.componentRef.setInput('setAt', setAt);
  group.valueChanges.subscribe(() => fixture.componentRef.setInput('flags', group.getRawValue()));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, group, el: fixture.nativeElement as HTMLElement };
}

describe('FlagFieldsComponent', () => {
  it('trois cartes compactes, une par nature, vraie case dans un label, aide de chacune', async () => {
    const { el } = await render();
    const cards = [...el.querySelectorAll('.flagcard')];
    expect(cards.map((c) => c.querySelector('.name')?.textContent)).toEqual([
      'À surveiller',
      'Risque',
      'Suivi conjoint',
    ]);
    for (const card of cards) {
      expect(card.querySelector('label.head input[type="checkbox"]')).not.toBeNull();
      expect(card.classList).not.toContain('on');
    }
    expect(cards[1].querySelector('.d')?.textContent).toContain(
      'Les éléments se notent dans la timeline, en note privée.',
    );
    expect(el.querySelector('#field-flags-watchReason')).toBeNull();
  });

  it('« à surveiller » coché : carte « on », raison dans la carte, requise', async () => {
    const { fixture, group, el } = await render();
    el.querySelector<HTMLInputElement>('.flagcard.watch input')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const card = el.querySelector('.flagcard.watch')!;
    expect(card.classList).toContain('on');
    const reason = card.querySelector<HTMLInputElement>('.reason #field-flags-watchReason')!;
    expect(reason.required).toBe(true);
    expect(card.querySelector('.reason label')?.textContent).toBe(
      'Raison du drapeau « à surveiller »',
    );
    expect(group.controls.watchReason.valid).toBe(false);
    reason.value = 'Sommeil';
    reason.dispatchEvent(new Event('input'));
    expect(group.controls.watchReason.value).toBe('Sommeil');
    expect(group.controls.watchReason.valid).toBe(true);
  });

  it('drapeau déjà posé : « Posé le … » à la place de l’aide', async () => {
    const { fixture, group, el } = await render({ risk: '2026-10-03T10:00:00Z' });
    group.controls.risk.setValue(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.flagcard.risk .d')?.textContent).toBe('Posé le 3 oct. 2026');
    expect(el.querySelector('.flagcard.risk')?.classList).toContain('on');
  });
});
