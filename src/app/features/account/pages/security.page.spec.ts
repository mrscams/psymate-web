import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ConfirmDialogService, SidePanelService, ToastService } from '../../../shared/ui';
import { SecurityApi, SecurityOverview } from '../data/security.api';
import { OVERVIEW } from '../data/security.fixtures';
import { SecurityPage } from './security.page';

const claire: SessionUser = {
  id: '1',
  email: 'claire@example.test',
  displayName: 'Claire Martin',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

async function render(
  api: Partial<SecurityApi>,
  user: SessionUser = claire,
  confirm = vi.fn().mockResolvedValue(true),
) {
  TestBed.configureTestingModule({
    imports: [SecurityPage],
    providers: [
      provideRouter([]),
      { provide: SecurityApi, useValue: api },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(user) } },
      { provide: ConfirmDialogService, useValue: { confirm } },
    ],
  });
  TestBed.inject(SessionStore).signIn(user);
  const fixture = TestBed.createComponent(SecurityPage);
  await settle(fixture);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    confirm,
    router: TestBed.inject(Router),
    panels: TestBed.inject(SidePanelService),
    toasts: TestBed.inject(ToastService),
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function buttons(el: HTMLElement, text: string): HTMLButtonElement[] {
  return [...el.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text);
}

describe('SecurityPage', () => {
  afterEach(() => TestBed.inject(ToastService).clear());

  it('chargement : squelettes des sessions et de la connexion précédente, cartes identité présentes', async () => {
    const { el } = await render({ loadSecurity: vi.fn(() => new Promise<never>(() => undefined)) });
    expect(el.querySelectorAll('pm-state [aria-busy="true"]')).toHaveLength(2);
    expect(el.querySelector('nav[aria-label="Mon compte"]')).not.toBeNull();
    expect(el.textContent).toContain('claire@example.test');
    expect(el.textContent).toContain('Confirmée');
    expect(el.textContent).toContain('Non activée');
    expect(buttons(el, 'Activer')).toHaveLength(1);
    expect(buttons(el, 'Désactiver')).toHaveLength(0);
  });

  it('erreur : bloc erreur avec Réessayer qui relance GET /api/me/security', async () => {
    const loadSecurity = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(OVERVIEW);
    const { fixture, el } = await render({ loadSecurity });
    const alerts = [...el.querySelectorAll('pm-state [role=alert]')].map((a) => a.textContent);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toContain('Impossible de charger vos sessions');
    expect(alerts[1]).toContain('Impossible de charger votre connexion précédente');
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    await settle(fixture);
    expect(loadSecurity).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('ul.sessions li')).toHaveLength(2);
  });

  it('chargé : sessions listées, la courante marquée sans bouton, révocation unitaire relit la liste', async () => {
    const afterRevoke: SecurityOverview = { ...OVERVIEW, sessions: [OVERVIEW.sessions[0]] };
    const loadSecurity = vi.fn().mockResolvedValueOnce(OVERVIEW).mockResolvedValue(afterRevoke);
    const revokeSession = vi.fn().mockResolvedValue(undefined);
    const { fixture, el } = await render({ loadSecurity, revokeSession });
    const items = el.querySelectorAll('ul.sessions li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('session courante');
    expect(items[0].querySelector('button')).toBeNull();
    const revoke = items[1].querySelector<HTMLButtonElement>('button');
    expect(revoke?.getAttribute('aria-label')).toContain('Safari · iPadOS');
    expect(el.textContent).toContain('Connexion précédente');
    expect(
      el.querySelector('section[aria-labelledby="h-last-login"] .value')?.textContent,
    ).toContain('Chrome · Windows');

    revoke?.click();
    await settle(fixture);
    expect(revokeSession).toHaveBeenCalledWith('s-ipad');
    expect(loadSecurity).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('ul.sessions li')).toHaveLength(1);
  });

  it('Déconnecter les autres : confirmation puis « N appareils déconnectés » (0 compris) en aria-live', async () => {
    const revokeOtherSessions = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const { fixture, el, confirm } = await render({
      loadSecurity: vi.fn().mockResolvedValue(OVERVIEW),
      revokeOtherSessions,
    });
    buttons(el, 'Déconnecter les autres appareils')[0].click();
    await settle(fixture);
    expect(confirm).toHaveBeenCalled();
    expect(revokeOtherSessions).toHaveBeenCalledTimes(1);
    const status = [...el.querySelectorAll('[aria-live=polite]')].map((n) => n.textContent?.trim());
    expect(status).toContain('1 appareil déconnecté.');
    buttons(el, 'Déconnecter les autres appareils')[0].click();
    await settle(fixture);
    expect(el.textContent).toContain("Aucun autre appareil n'était connecté.");
  });

  it('confirmation refusée : aucun appel', async () => {
    const revokeOtherSessions = vi.fn();
    const { fixture, el } = await render(
      { loadSecurity: vi.fn().mockResolvedValue(OVERVIEW), revokeOtherSessions },
      claire,
      vi.fn().mockResolvedValue(false),
    );
    buttons(el, 'Déconnecter les autres appareils')[0].click();
    await settle(fixture);
    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('2FA active : pastille Activée, Régénérer et Désactiver ; un administrateur ne voit pas Désactiver', async () => {
    const enabled = { ...claire, twoFactorEnabled: true };
    const { el } = await render({ loadSecurity: vi.fn().mockResolvedValue(OVERVIEW) }, enabled);
    expect(el.textContent).toContain('Activée');
    expect(buttons(el, 'Régénérer les codes')).toHaveLength(1);
    expect(buttons(el, 'Désactiver')).toHaveLength(1);
    expect(buttons(el, 'Activer')).toHaveLength(0);

    TestBed.resetTestingModule();
    const admin = { ...enabled, role: 'admin' as const };
    const page = await render({ loadSecurity: vi.fn().mockResolvedValue(OVERVIEW) }, admin);
    expect(buttons(page.el, 'Désactiver')).toHaveLength(0);
    expect(page.el.textContent).toContain('obligatoire pour un administrateur');
  });

  it('Activer : navigation vers /2fa (le panneau suit la route)', async () => {
    const { el, router } = await render({ loadSecurity: vi.fn().mockResolvedValue(OVERVIEW) });
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    buttons(el, 'Activer')[0].click();
    expect(navigate).toHaveBeenCalledWith(['2fa'], expect.anything());
  });

  it('Modifier le mot de passe : sur « changed », session oubliée et retour à /connexion avec un toast', async () => {
    const { el, router, panels, toasts } = await render({
      loadSecurity: vi.fn().mockResolvedValue(OVERVIEW),
    });
    vi.spyOn(panels, 'open').mockReturnValue({
      closed: Promise.resolve('changed'),
    } as never);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const edit = el.querySelector<HTMLButtonElement>(
      'section[aria-labelledby="h-password"] button',
    );
    edit?.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(TestBed.inject(SessionStore).authenticated()).toBe(false);
    expect(navigateByUrl).toHaveBeenCalledWith('/connexion');
    expect(toasts.toasts()[0]?.message).toContain('Mot de passe changé');
  });

  it('Modifier l’e-mail : sur 202, la nouvelle adresse est annoncée en aria-live', async () => {
    const { fixture, el, panels } = await render({
      loadSecurity: vi.fn().mockResolvedValue(OVERVIEW),
    });
    vi.spyOn(panels, 'open').mockReturnValue({
      closed: Promise.resolve('nouvelle@example.test'),
    } as never);
    el.querySelector<HTMLButtonElement>('section[aria-labelledby="h-email"] button')?.click();
    await settle(fixture);
    expect(
      el.querySelector('section[aria-labelledby="h-email"] [aria-live]')?.textContent,
    ).toContain('nouvelle@example.test');
  });
});
