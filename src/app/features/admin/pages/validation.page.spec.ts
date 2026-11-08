import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ToastService } from '../../../shared/ui';
import { AdminApi } from '../data/admin.api';
import { accountPage, CLAIRE, dossierOf, REMI } from '../data/admin.fixtures';
import { ValidationPage } from './validation.page';

const never = () => new Promise<never>(() => undefined);

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(api: Partial<AdminApi>, practitionerId?: string) {
  TestBed.configureTestingModule({
    imports: [ValidationPage],
    providers: [
      provideRouter([]),
      {
        provide: AdminApi,
        useValue: {
          accounts: vi.fn().mockResolvedValue(accountPage([])),
          documentUrl: vi.fn(never),
          ...api,
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ValidationPage);
  if (practitionerId) fixture.componentRef.setInput('practitionerId', practitionerId);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, navigate };
}

describe('ValidationPage', () => {
  it('chargement : squelettes de la file, titre « À vérifier »', async () => {
    const { el } = await render({ queue: vi.fn(never) });
    expect(el.querySelector('h1')?.textContent?.trim()).toMatch(/^À vérifier/);
    expect(el.querySelector('.queue pm-state [aria-busy="true"]')).not.toBeNull();
  });

  it('erreur : bloc erreur de la file, Réessayer relit', async () => {
    const queue = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const { fixture, el } = await render({ queue });
    expect(el.querySelector('.queue pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger la file',
    );
    el.querySelector<HTMLButtonElement>('.queue pm-state button')?.click();
    await settle(fixture);
    expect(queue).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.queue pm-state [role="status"]')?.textContent).toContain(
      'Aucun dossier à vérifier',
    );
  });

  it('sans dossier dans l’URL : le plus ancien de la file s’ouvre', async () => {
    const { navigate, el } = await render({
      queue: vi.fn().mockResolvedValue({ items: [CLAIRE, REMI], nextCursor: null }),
    });
    expect(el.querySelector('h1')?.textContent).toContain('À vérifier · 2');
    expect(navigate).toHaveBeenCalledWith(['/admin/validation', CLAIRE.practitionerId], {
      queryParams: {},
      replaceUrl: true,
    });
    const items = el.querySelectorAll('ol[aria-label="Dossiers en attente de vérification"] li');
    expect(items).toHaveLength(2);
    expect(items[1].textContent).toContain('hors délai');
    expect(items[1].textContent).toContain("Manque : Pièce d'identité");
  });

  it('dossier ouvert : en-tête, justificatifs, liste de contrôle et décision ; aria-current dans la file', async () => {
    const { el } = await render(
      {
        queue: vi.fn().mockResolvedValue({ items: [CLAIRE, REMI], nextCursor: null }),
        dossier: vi.fn().mockResolvedValue(dossierOf()),
      },
      CLAIRE.practitionerId,
    );
    expect(el.querySelector('#dossier-title')?.textContent).toBe('Claire Moreau');
    expect(el.querySelector('a[aria-current="true"]')?.textContent).toContain('Claire Moreau');
    expect(el.querySelector('.documents h2')?.textContent).toContain('Justificatifs · 2');
    expect(el.querySelectorAll('pm-document-list li')).toHaveLength(2);
    expect(el.querySelector('.checklist legend')?.textContent).toContain('Liste de contrôle');
    expect(el.textContent).toContain('Approuver');
  });

  it('dossier introuvable : bloc erreur dédié', async () => {
    const { el } = await render(
      {
        queue: vi.fn().mockResolvedValue({ items: [CLAIRE], nextCursor: null }),
        dossier: vi.fn().mockRejectedValue({ status: 404, code: 'ADMIN_DOSSIER_NOT_FOUND' }),
      },
      'inconnu',
    );
    expect(el.querySelector('.dossier pm-state [role="alert"]')?.textContent).toContain(
      "Ce dossier n'existe pas",
    );
  });

  it('après une approbation : toast, file relue, dossier suivant ouvert', async () => {
    const queue = vi
      .fn()
      .mockResolvedValueOnce({ items: [CLAIRE, REMI], nextCursor: null })
      .mockResolvedValueOnce({ items: [REMI], nextCursor: null });
    const decide = vi.fn().mockResolvedValue(undefined);
    const { fixture, el, navigate } = await render(
      { queue, dossier: vi.fn().mockResolvedValue(dossierOf({ documents: [] })), decide },
      CLAIRE.practitionerId,
    );
    const toast = vi.spyOn(TestBed.inject(ToastService), 'success');
    for (const box of el.querySelectorAll<HTMLInputElement>('.checklist input')) box.click();
    await settle(fixture);
    [...el.querySelectorAll<HTMLButtonElement>('pm-decision-form button')]
      .find((b) => b.textContent?.trim() === 'Approuver')
      ?.click();
    await settle(fixture);
    expect(decide).toHaveBeenCalledWith(
      CLAIRE.practitionerId,
      expect.objectContaining({ kind: 'approved', force: false }),
    );
    expect(toast).toHaveBeenCalledWith('Claire Moreau approuvé·e · e-mail envoyé');
    expect(queue).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenLastCalledWith(['/admin/validation', REMI.practitionerId], {
      queryParams: {},
      replaceUrl: false,
    });
  });
});
