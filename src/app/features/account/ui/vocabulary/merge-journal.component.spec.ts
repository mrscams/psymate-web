import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MergeJournalEntry } from '../../data/merge-journal';
import { MergeJournalComponent } from './merge-journal.component';

const ENTRY: MergeJournalEntry = {
  merge: {
    id: 'merge-1',
    sourceCode: 'c-1',
    targetCode: 'c-2',
    affectedCount: 3,
    mergedAt: '2026-11-17T10:00:00Z',
    undoUntil: '2026-12-17T10:00:00Z',
    undoneAt: null,
  },
  sourceLabel: 'ضجر',
  targetLabel: 'Morosité',
};

// Le bundle /ar/ embarque ces données ; le test les enregistre pour les pluriels ICU du gabarit.
registerLocaleData(localeAr);

async function render(locale: string) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }] });
  const fixture = TestBed.createComponent(MergeJournalComponent);
  fixture.componentRef.setInput('entries', [ENTRY]);
  fixture.componentRef.setInput('undo', () => undefined);
  fixture.componentRef.setInput('now', Date.parse('2026-11-20T10:00:00Z'));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('MergeJournalComponent (M16-12, version arabe)', () => {
  it('libellés saisis en dir="auto", flèche source → cible retournée en arabe', async () => {
    const el = await render('fr');
    const names = [...el.querySelectorAll('.journal-title .name')];
    expect(names.map((n) => n.getAttribute('dir'))).toEqual(['auto', 'auto']);
    const arrow = el.querySelector('.journal-title .arrow');
    expect(arrow?.classList).toContain('pm-flip-rtl');
    // Rendu français inchangé : « source → cible », espaces compris.
    expect(el.querySelector('.journal-title')?.textContent).toContain('ضجر → ');
  });

  it('dates : locale de formatage, chiffres latins en arabe', async () => {
    const el = await render('ar');
    const meta = el.querySelector('.journal li .muted')?.textContent ?? '';
    expect(meta).toContain('2026');
    expect(meta).not.toMatch(/[٠-٩]/);
  });
});
