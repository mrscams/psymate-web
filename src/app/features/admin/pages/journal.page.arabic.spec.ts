import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AdminApi } from '../data/admin.api';
import { accountPage, journalItem } from '../data/admin.fixtures';
import { JournalPage } from './journal.page';

// Le bundle /ar/ embarque ces données ; le test les enregistre pour les pluriels ICU du gabarit.
registerLocaleData(localeAr);

/** Chiffres arabo-indiens : jamais affichés (G Q71). */
const ARABIC_INDIC = /[٠-٩۰-۹]/;

const ITEMS = [
  journalItem({ id: 'j-1', at: '2026-11-07T10:15:42Z' }),
  journalItem({ id: 'j-2', at: '2026-11-07T10:15:20Z' }),
  journalItem({
    id: 'j-3',
    at: '2026-11-07T09:00:00Z',
    kind: 'admin.suspend',
    summary: 'Diplôme falsifié signalé par l’université.',
    actorName: null,
  }),
];

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(locale: string) {
  TestBed.configureTestingModule({
    imports: [JournalPage],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      {
        provide: AdminApi,
        useValue: {
          accounts: vi.fn().mockResolvedValue(accountPage([])),
          journal: vi.fn().mockResolvedValue({ items: ITEMS, nextCursor: null }),
        },
      },
    ],
  });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(JournalPage);
  fixture.componentRef.setInput('period', 'all');
  await settle(fixture);
  return fixture.nativeElement as HTMLElement;
}

/**
 * M16-13, journal (fiche 22) : code technique et plage horaire en dir="ltr", phrase en dir="auto",
 * noms isolés ; horodatage par la locale de formatage, marqué comme date à nom de mois.
 */
describe('JournalPage, de droite à gauche (M16-13)', () => {
  it('ligne : horodatage en date, code et plage en dir="ltr", phrase en dir="auto", noms isolés', async () => {
    const el = await render('fr');
    const lead = el.querySelector('tbody tr')!;
    const cells = lead.querySelectorAll('td');
    expect(cells[0].classList.contains('date')).toBe(true);
    expect(cells[0].textContent).toMatch(/^\d{1,2} [a-zéû]+\.? \d{4} · \d{2}:\d{2}:\d{2}$/);
    expect(lead.querySelector('.kind bdi')?.getAttribute('dir')).toBe('ltr');
    expect(lead.querySelector('.range')?.getAttribute('dir')).toBe('ltr');
    expect(
      lead.querySelector('.event > span:not(.times):not([aria-hidden])')?.getAttribute('dir'),
    ).toBe('auto');
    expect(cells[3].querySelector('bdi')?.textContent).toBe('Hugo Admin');
    // Nom du praticien : isolé ; les espaces avant le nom et avant la mention cachée sont gardés
    // (&ngsp;) : même textContent qu'avant M16-13, blancs regroupés mais non rognés.
    const name = lead.querySelector('.event button.link')!;
    expect(name.querySelector('bdi')?.textContent).toBe('Claire Moreau');
    expect(name.textContent?.replace(/\s+/g, ' ')).toBe(
      ' Claire Moreau : voir seulement ses événements',
    );
  });

  it('arabe : horodatage et plage en chiffres latins, calendrier grégorien', async () => {
    const el = await render('ar');
    const lead = el.querySelector('tbody tr')!;
    const time = lead.querySelector('td')!.textContent ?? '';
    expect(time).toContain('2026');
    expect(time).toMatch(/\d{2}:\d{2}:\d{2}$/);
    expect(time).not.toMatch(ARABIC_INDIC);
    expect(lead.querySelector('.range')?.textContent).not.toMatch(ARABIC_INDIC);
  });
});
