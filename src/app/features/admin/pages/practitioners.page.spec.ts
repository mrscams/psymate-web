import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { AdminApi } from '../data/admin.api';
import { account, accountPage, appeal } from '../data/admin.fixtures';
import { PractitionersPage } from './practitioners.page';

const never = () => new Promise<never>(() => undefined);

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(api: Partial<AdminApi>) {
  TestBed.configureTestingModule({
    imports: [PractitionersPage],
    providers: [
      provideRouter([]),
      { provide: SessionApi, useValue: {} },
      {
        provide: AdminApi,
        useValue: {
          openAppeals: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
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
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PractitionersPage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, navigate };
}

describe('PractitionersPage', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('chargement : squelettes ; erreur : bloc erreur ; vide : message', async () => {
    const loading = await render({ accounts: vi.fn(never) });
    expect(loading.el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const failing = await render({
      accounts: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
    });
    expect(failing.el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger les comptes',
    );
    TestBed.resetTestingModule();

    const empty = await render({ accounts: vi.fn().mockResolvedValue(accountPage([])) });
    expect(empty.el.querySelector('pm-state [role="status"]')?.textContent).toContain(
      'Aucun compte ne correspond',
    );
  });

  it('UX-A9a : recours lus au premier rendu, jamais par une page remplacée avant d’être rendue', async () => {
    const openAppeals = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    await render({ accounts: vi.fn().mockResolvedValue(accountPage([])), openAppeals });
    expect(openAppeals).toHaveBeenCalledTimes(1);
    TestBed.createComponent(PractitionersPage).destroy();
    expect(openAppeals).toHaveBeenCalledTimes(1);
  });

  it('tableau : statut écrit, actions selon le statut, jamais « Suspendre » sur soi-même', async () => {
    const { el } = await render({
      accounts: vi
        .fn()
        .mockResolvedValue(
          accountPage([
            account(),
            account({ id: 'acc-2', displayName: 'Rémi Lenoir', status: 'suspended' }),
            account({ id: 'admin-1', displayName: 'Hugo Admin', role: 'admin' }),
          ]),
        ),
    });
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Approuvé');
    expect(rows[0].textContent).toContain('Suspendre…');
    expect(rows[1].textContent).toContain('Suspendu');
    expect(rows[1].textContent).toContain('Réactiver…');
    expect(rows[1].textContent).not.toContain('Suspendre…');
    expect(rows[2].textContent).not.toContain('Suspendre…');
    expect(rows[2].textContent).not.toContain('Ouvrir le dossier');
    expect(el.querySelector('caption')?.textContent).toContain('Comptes');
    expect(el.querySelector('.breakdown')?.textContent).toContain('Approuvé');
  });

  it('segment de statut : filtre posé dans l’URL', async () => {
    const { el, navigate } = await render({
      accounts: vi.fn().mockResolvedValue(accountPage([account()])),
    });
    [...el.querySelectorAll<HTMLButtonElement>('.segments button')]
      .find((b) => b.textContent?.includes('Suspendu'))
      ?.click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { status: 'suspended' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('Suspendre… : motif de 20 caractères exigé, 409 affiché dans la boîte, succès relit la liste', async () => {
    const accounts = vi.fn().mockResolvedValue(accountPage([account()]));
    const suspend = vi
      .fn()
      .mockRejectedValueOnce({ status: 409, code: 'ADMIN_LAST_ADMIN' })
      .mockResolvedValueOnce(undefined);
    const { fixture, el } = await render({ accounts, suspend });
    [...el.querySelectorAll<HTMLButtonElement>('tbody button')]
      .find((b) => b.textContent?.includes('Suspendre…'))
      ?.click();
    await settle(fixture);
    const dialog = document.querySelector<HTMLElement>('pm-reason-dialog')!;
    expect(dialog.querySelector('h2')?.textContent).toContain('Suspendre Claire Moreau ?');
    const confirm = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Suspendre le compte',
    )!;
    const reason = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = 'Trop court';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(confirm.disabled).toBe(true);
    reason.value = 'Diplôme falsifié signalé par l’université.';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await settle(fixture);
    expect(dialog.querySelector('.error')?.textContent).toContain('dernier administrateur');
    confirm.click();
    await settle(fixture);
    expect(suspend).toHaveBeenLastCalledWith('acc-1', 'Diplôme falsifié signalé par l’université.');
    expect(accounts).toHaveBeenCalledTimes(2);
    expect(dialog.querySelector('.error')).toBeNull();
  });

  it('recours ouverts : liste avec Accepter… et Écarter…', async () => {
    const { el } = await render({
      accounts: vi.fn().mockResolvedValue(accountPage([])),
      openAppeals: vi.fn().mockResolvedValue({ items: [appeal()], nextCursor: null }),
    });
    const list = el.querySelector('pm-appeal-list');
    expect(list?.textContent).toContain('Rémi Lenoir');
    expect(list?.textContent).toContain('Compte suspendu contesté');
    expect(list?.textContent).toContain('Accepter…');
    expect(list?.textContent).toContain('Écarter…');
  });
});
