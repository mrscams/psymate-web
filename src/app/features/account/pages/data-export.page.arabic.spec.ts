import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ConfirmDialogService } from '../../../shared/ui';
import { DataExportApi } from '../data/data-export.api';
import { EXPORT_USER, PATIENT_OPTIONS } from '../data/data-export.fixtures';
import { DataExportPage } from './data-export.page';

// Le bundle /ar/ embarque ces données ; le test les enregistre pour les pluriels ICU du gabarit.
registerLocaleData(localeAr);

async function render(locale: string) {
  TestBed.configureTestingModule({
    imports: [DataExportPage],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      {
        provide: DataExportApi,
        useValue: { searchPatients: vi.fn().mockResolvedValue(PATIENT_OPTIONS) },
      },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(EXPORT_USER) } },
      { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
    ],
  });
  TestBed.inject(SessionStore).signIn(EXPORT_USER);
  const fixture = TestBed.createComponent(DataExportPage);
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
  return fixture.nativeElement as HTMLElement;
}

/**
 * Rappel des règles d'export (M16-12) : en arabe, le document reste en français (psymate-api Q102,
 * second temps M16-31) ; la page ne promet pas un export dans la langue de l'interface. Les tests
 * tournent sans traduction chargée : chaque message s'affiche dans sa source française.
 */
describe('DataExportPage, langue du document exporté', () => {
  beforeEach(() => localStorage.clear());

  it('français : le rappel existant, « celle de l’interface »', async () => {
    const reminder = (await render('fr')).querySelector('.reminder');
    expect(reminder?.textContent).toContain("langue du document : celle de l'interface.");
    expect(reminder?.textContent).not.toContain('le français');
  });

  it('anglais : le même rappel que le français (même unité)', async () => {
    const reminder = (await render('en-US')).querySelector('.reminder');
    expect(reminder?.textContent).toContain("celle de l'interface");
  });

  it('arabe : le rappel dit que le document reste en français', async () => {
    const el = await render('ar');
    const reminders = el.querySelectorAll('.reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0].textContent).toContain('langue du document : le français');
    expect(reminders[0].textContent).not.toContain("celle de l'interface");
  });
});
