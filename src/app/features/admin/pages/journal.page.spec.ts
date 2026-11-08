import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AdminApi } from '../data/admin.api';
import { accountPage, journalItem } from '../data/admin.fixtures';
import { JournalPage } from './journal.page';

const never = () => new Promise<never>(() => undefined);

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(api: Partial<AdminApi>, inputs: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [JournalPage],
    providers: [
      provideRouter([]),
      {
        provide: AdminApi,
        useValue: { accounts: vi.fn().mockResolvedValue(accountPage([])), ...api },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(JournalPage);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, navigate };
}

describe('JournalPage', () => {
  it('trois états : chargement, erreur, vide', async () => {
    const loading = await render({ journal: vi.fn(never) });
    expect(loading.el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const failing = await render({
      journal: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
    });
    expect(failing.el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger le journal',
    );
    TestBed.resetTestingModule();

    const empty = await render({
      journal: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    });
    expect(empty.el.querySelector('pm-state [role="status"]')?.textContent).toContain(
      'Aucun événement pour ces filtres',
    );
  });

  it('lignes : horodatage, badge de type écrit, phrase, auteur ; lecture seule', async () => {
    const { el } = await render({
      journal: vi.fn().mockResolvedValue({
        items: [
          journalItem(),
          journalItem({
            id: 'j-2',
            kind: 'login_failed',
            actorType: 'practitioner',
            actorName: null,
            summary: 'login_failed',
          }),
        ],
        nextCursor: null,
      }),
    });
    const rows = el.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Accès document');
    expect(rows[0].textContent).toContain("Ouverture d'un justificatif");
    expect(rows[0].textContent).toContain('Hugo Admin');
    expect(rows[1].textContent).toContain('Sécurité');
    expect(rows[1].textContent).toContain('Échec de connexion');
    expect(rows[1].textContent).toContain('praticien·ne');
    expect(el.querySelector('caption')?.textContent).toContain('7 derniers jours');
    expect(el.querySelectorAll('tbody button:not(.link)')).toHaveLength(0);
  });

  it('filtres de l’URL transmis au serveur ; segment posé dans l’URL', async () => {
    const journal = vi.fn().mockResolvedValue({ items: [journalItem()], nextCursor: null });
    const { el, navigate } = await render(
      { journal },
      { type: 'documents', period: 'all', practitioner: '11111111-1111-4111-8111-111111111111' },
    );
    expect(journal).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'admin.document_read',
        practitionerId: '11111111-1111-4111-8111-111111111111',
        from: null,
      }),
    );
    expect(el.querySelector('.chip')?.textContent).toContain('Retirer ce filtre');
    [...el.querySelectorAll<HTMLButtonElement>('.segments button')]
      .find((b) => b.textContent?.trim() === 'Recours')
      ?.click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { type: 'appeals' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('Afficher plus : page suivante ajoutée, focus sur la première nouvelle ligne', async () => {
    const journal = vi
      .fn()
      .mockResolvedValueOnce({ items: [journalItem()], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [journalItem({ id: 'j-2' })], nextCursor: null });
    const { fixture, el } = await render({ journal });
    document.body.appendChild(el);
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Afficher plus')
      ?.click();
    await settle(fixture);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(document.activeElement).toBe(rows[1]);
    el.remove();
  });
});
