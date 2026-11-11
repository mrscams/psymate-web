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

  it('UX-A9a : administrateurs lus au premier rendu, jamais par une page remplacée avant d’être rendue', async () => {
    const accounts = vi.fn().mockResolvedValue(accountPage([]));
    await render({ journal: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), accounts });
    expect(accounts).toHaveBeenCalledTimes(1);
    TestBed.createComponent(JournalPage).destroy();
    expect(accounts).toHaveBeenCalledTimes(1);
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
    // Horodatage Intl « 7 nov. 2026 · hh:mm:ss » en mono (UX-E3), jamais 07/11/2026.
    expect(rows[0].querySelector('td.mono')?.textContent).toMatch(
      /^\s*7 nov\. 2026 · \d{2}:\d{2}:42\s*$/,
    );
    // Aucune ligne n'a de contexte : colonne masquée.
    expect([...el.querySelectorAll('th')].map((th) => th.textContent?.trim())).not.toContain(
      'Contexte',
    );
  });

  it('colonne Contexte affichée dès qu’une décision a un dossier', async () => {
    const { el } = await render({
      journal: vi.fn().mockResolvedValue({
        items: [journalItem({ kind: 'admin.approved', source: 'verification_decision' })],
        nextCursor: null,
      }),
    });
    expect([...el.querySelectorAll('th')].map((th) => th.textContent?.trim())).toContain(
      'Contexte',
    );
    expect(el.querySelector('tbody a')?.textContent).toContain('Voir le dossier');
  });

  it('UX-G2b : décision et ligne admin.decision nommées en français, jamais « approved » seul', async () => {
    const { el } = await render({
      journal: vi.fn().mockResolvedValue({
        items: [
          journalItem({
            id: 'j-1',
            kind: 'admin.approved',
            source: 'verification_decision',
            summary: 'approved',
          }),
          journalItem({
            id: 'j-2',
            kind: 'admin.decision',
            summary: 'admin.decision',
            detailKind: 'approved',
          }),
          journalItem({
            id: 'j-3',
            kind: 'system.journal_export',
            summary: 'system.journal_export',
          }),
        ],
        nextCursor: null,
      }),
    });
    const events = [...el.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('.event > span')?.textContent?.trim() ?? '',
    );
    expect(events).toEqual([
      'Dossier approuvé',
      'Décision enregistrée : Dossier approuvé',
      'Événement non répertorié (system.journal_export)',
    ]);
  });

  it('UX-G2b : liste des administrateurs en erreur, ligne discrète et « Réessayer » qui la relit', async () => {
    const accounts = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(accountPage([]));
    const { fixture, el } = await render({
      journal: vi.fn().mockResolvedValue({ items: [journalItem()], nextCursor: null }),
      accounts,
    });
    const error = el.querySelector('[data-testid="journal-actor-error"]');
    expect(error?.textContent).toContain('Liste des administrateurs indisponible.');
    expect(el.querySelector('#journal-actor')?.getAttribute('aria-describedby')).toBe(
      'journal-actor-error',
    );
    // Le journal reste affiché : l'échec ne touche que le filtre.
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    error!.querySelector('button')!.click();
    await settle(fixture);
    expect(accounts).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid="journal-actor-error"]')).toBeNull();
    expect(el.querySelector('#journal-actor')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('lignes identiques consécutives du même acteur dans la minute : regroupées, dépliables', async () => {
    const { fixture, el } = await render({
      journal: vi.fn().mockResolvedValue({
        items: [
          journalItem({ id: 'a', at: '2026-11-07T10:15:50Z' }),
          journalItem({ id: 'b', at: '2026-11-07T10:15:20Z' }),
          journalItem({ id: 'c', at: '2026-11-07T10:14:55Z' }),
          // Autre acteur : nouvelle ligne.
          journalItem({ id: 'd', at: '2026-11-07T10:14:50Z', actorName: 'Inès Admin' }),
          // Même acteur mais plus d'une minute après la tête du groupe suivant : séparée.
          journalItem({ id: 'e', at: '2026-11-07T10:14:40Z', actorName: 'Inès Admin' }),
          journalItem({ id: 'f', at: '2026-11-07T10:13:00Z', actorName: 'Inès Admin' }),
        ],
        nextCursor: null,
      }),
    });
    let rows = el.querySelectorAll('tbody tr');
    expect([...rows].map((row) => row.getAttribute('data-id'))).toEqual(['a', 'd', 'f']);
    expect(rows[0].textContent).toContain('3 ×');
    const toggle = rows[0].querySelector<HTMLButtonElement>('.group-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Afficher 2 lignes identiques');
    expect(rows[1].textContent).toContain('2 ×');
    expect(rows[1].querySelector('.group-toggle')?.textContent).toContain(
      'Afficher 1 ligne identique',
    );
    expect(rows[2].querySelector('.group-toggle')).toBeNull();
    toggle.click();
    await settle(fixture);
    rows = el.querySelectorAll('tbody tr');
    expect([...rows].map((row) => row.getAttribute('data-id'))).toEqual(['a', 'b', 'c', 'd', 'f']);
    expect(rows[1].classList).toContain('nested');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Masquer les 2 lignes identiques');
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
      .mockResolvedValueOnce({
        items: [journalItem({ id: 'j-2', at: '2026-11-07T10:05:00Z' })],
        nextCursor: null,
      });
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
