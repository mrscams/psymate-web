import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ToastService } from '../../../shared/ui';
import { AdminApi } from '../data/admin.api';
import { account, accountPage, appeal } from '../data/admin.fixtures';
import { PractitionersPage } from './practitioners.page';

// Le bundle /ar/ embarque ces données ; le test les enregistre pour les pluriels ICU du gabarit.
registerLocaleData(localeAr);

const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(locale: string, api: Partial<AdminApi> = {}) {
  TestBed.configureTestingModule({
    imports: [PractitionersPage],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      { provide: SessionApi, useValue: {} },
      {
        provide: AdminApi,
        useValue: {
          accounts: vi.fn().mockResolvedValue(accountPage([account()])),
          openAppeals: vi.fn().mockResolvedValue({
            items: [appeal({ message: 'رسالة التظلّم.' })],
            nextCursor: null,
          }),
          suspend: vi.fn().mockResolvedValue(undefined),
          ...api,
        },
      },
    ],
  });
  TestBed.inject(SessionStore).signIn({
    id: 'admin-1',
    email: 'admin@example.test',
    displayName: 'Hugo Admin',
    profession: 'psychologist',
    verificationStatus: 'approved',
    role: 'admin',
    twoFactorEnabled: true,
    passwordChangeRequired: false,
  });
  const fixture = TestBed.createComponent(PractitionersPage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Ouvre « Suspendre… », envoie un motif valide ; renvoie le titre de la boîte et le toast. */
async function suspendFirst(fixture: ComponentFixture<unknown>, el: HTMLElement) {
  const toast = vi.spyOn(TestBed.inject(ToastService), 'success');
  [...el.querySelectorAll<HTMLButtonElement>('tbody button')]
    .find((b) => b.textContent?.includes('Suspendre…'))
    ?.click();
  await settle(fixture);
  const dialog = document.querySelector<HTMLElement>('pm-reason-dialog')!;
  const title = dialog.querySelector('h2')?.textContent ?? '';
  const reason = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
  reason.value = 'Diplôme falsifié signalé par l’université.';
  reason.dispatchEvent(new Event('input'));
  await settle(fixture);
  dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  // Fermeture de la boîte (animation de sortie), puis afterClosed : le toast.
  await vi.waitFor(async () => {
    await settle(fixture);
    expect(toast).toHaveBeenCalled();
  });
  return { title, reason, toast };
}

/**
 * M16-13, praticiens et recours (fiche 21) : nom saisi isolé, adresse en dir="ltr", dates à nom de
 * mois hors de la chasse fixe des chiffres en arabe, motif en dir="auto" ; en arabe, le nom inséré
 * dans un titre de boîte ou un toast est isolé (FSI … PDI), et rien ne change en français.
 */
describe('PractitionersPage, de droite à gauche (M16-13)', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('ligne : nom en <bdi>, adresse en dir="ltr" sans blanc ajouté, dates marquées', async () => {
    const { el } = await render('fr');
    const row = el.querySelector('tbody tr')!;
    expect(row.querySelector('.name bdi')?.textContent).toBe('Claire Moreau');
    expect(row.querySelector('.name')?.textContent?.trim()).toBe('Claire Moreau');
    const email = row.querySelector('.email')!;
    expect(email.getAttribute('dir')).toBe('ltr');
    expect(email.textContent).toBe('claire.moreau@example.test');
    expect(row.querySelector('td.mono.date')?.textContent).toContain('1 nov. 2026');
    expect(el.querySelector<HTMLInputElement>('#accounts-search')?.getAttribute('dir')).toBe(
      'auto',
    );
  });

  it('recours : nom isolé, message saisi en dir="auto"', async () => {
    const { el } = await render('fr');
    const item = el.querySelector('pm-appeal-list li')!;
    expect(item.querySelector('.name bdi')?.textContent).toBe('Rémi Lenoir');
    expect(item.querySelector('blockquote')?.getAttribute('dir')).toBe('auto');
  });

  it('français : titre de la boîte et toast inchangés, sans isolat ; motif en dir="auto"', async () => {
    const { fixture, el } = await render('fr');
    const { title, reason, toast } = await suspendFirst(fixture, el);
    expect(title.trim()).toBe('Suspendre Claire Moreau ?');
    expect(reason.getAttribute('dir')).toBe('auto');
    expect(toast).toHaveBeenCalledWith(
      'Claire Moreau suspendu · sessions révoquées, e-mail envoyé',
    );
  });

  it('anglais : aucun isolat non plus', async () => {
    const { fixture, el } = await render('en-US');
    const { title, toast } = await suspendFirst(fixture, el);
    expect(title).not.toContain(FSI);
    expect(toast.mock.calls[0][0]).not.toContain(FSI);
  });

  it('arabe : le nom inséré est isolé dans le titre et dans le toast', async () => {
    const { fixture, el } = await render('ar');
    const { title, toast } = await suspendFirst(fixture, el);
    expect(title).toContain(`${FSI}Claire Moreau${PDI}`);
    expect(toast.mock.calls[0][0]).toContain(`${FSI}Claire Moreau${PDI}`);
  });
});
