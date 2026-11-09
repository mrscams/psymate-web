import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionApi } from '../../../core/auth/data/session.api';
import { ShortcutService } from '../../../core/shortcuts';
import { SubjectVocabulary } from '../../../core/i18n';
import { ConfirmDialogService, ToastService } from '../../../shared/ui';
import { ShortcutsHelp } from '../../patient-shell';
import { PatientApi } from '../data/patient.api';
import { OMAR, patient, TAGS } from '../data/patient.fixtures';
import { SORT_STORAGE_KEY } from '../data/patient-list.store';
import { FILTER_DEBOUNCE_MS, PatientListPage } from './patient-list.page';

const never = () => new Promise<never>(() => undefined);

async function render(
  api: Partial<PatientApi>,
  label: 'patient' | 'client' = 'patient',
  confirmed = true,
) {
  const help = { open: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(confirmed) };
  TestBed.configureTestingModule({
    imports: [PatientListPage],
    providers: [
      provideRouter([]),
      { provide: SessionApi, useValue: {} },
      { provide: PatientApi, useValue: { listTags: vi.fn().mockResolvedValue(TAGS), ...api } },
      { provide: ShortcutsHelp, useValue: help },
      { provide: ConfirmDialogService, useValue: confirm },
    ],
  });
  TestBed.inject(SubjectVocabulary).set(label);
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PatientListPage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, router, help, confirm };
}

const DEMO = patient({ id: 'p-demo', displayName: 'DEMO · Camille R.', pronoun: 'elle' });

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function key(key: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('PatientListPage', () => {
  beforeEach(() => localStorage.removeItem(SORT_STORAGE_KEY));

  it('chargement : six lignes squelette, titre et bouton présents', async () => {
    const { el } = await render({ list: vi.fn(never) });
    expect(el.querySelector('h1')?.textContent).toContain('Mes patients');
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelectorAll('pm-state .piece')).toHaveLength(6);
    expect(el.querySelector('table')).toBeNull();
  });

  it('erreur : bloc erreur, Réessayer relance la liste', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce({ items: [patient()], nextCursor: null });
    const { fixture, el } = await render({ list });
    expect(el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger vos patients',
    );
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    await settle(fixture);
    expect(list).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('vide sans filtre : « Créez votre premier patient » avec N ; vide filtré : Effacer les filtres', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { fixture, el, router } = await render({ list });
    expect(el.querySelector('pm-state [role="status"]')?.textContent).toContain(
      'Créez votre premier patient',
    );
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/patients/nouveau');

    el.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    await settle(fixture);
    expect(el.querySelector('pm-state')?.textContent).toContain('Aucun patient ne correspond');
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: false }));
  });

  it('données : tableau avec âge, drapeau daté, tags, liens dossier et fiche, puces de tags', async () => {
    const { el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient(), OMAR], nextCursor: null }),
    });
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('a.name')?.getAttribute('href')).toBe(
      '/patients/p-marie/overview',
    );
    expect(rows[0].querySelector('a.name')?.textContent?.trim()).toBe('Marie D.');
    expect(rows[0].textContent).toContain('ans');
    expect(rows[0].textContent).toContain('#travail');
    expect(rows[1].querySelector('pm-patient-flags')?.textContent).toContain(
      'À surveiller depuis le',
    );
    expect(rows[1].querySelector('a.edit')?.getAttribute('aria-label')).toBe(
      'Modifier la fiche de Omar B.',
    );
    expect(el.querySelector('th[aria-sort="ascending"]')).not.toBeNull();
    const chips = [...el.querySelectorAll('.chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Tous', '#travail', '#santé']);
  });

  it('coach : « Mes clients » et « Nouveau client »', async () => {
    const { el } = await render(
      { list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) },
      'client',
    );
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Mes clients');
    expect(el.querySelector('a.new')?.textContent).toContain('Nouveau client');
    expect(el.querySelector('pm-state')?.textContent).toContain('Créez votre premier client');
  });

  it('raccourcis : N ouvre la création, / focalise le filtre (N ignoré dans un champ)', async () => {
    const { el, router } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null }),
    });
    key('/');
    const filter = el.querySelector<HTMLInputElement>('#patients-filter');
    expect(document.activeElement).toBe(filter);
    key('n', filter!);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    key('n');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/patients/nouveau');
  });

  it('aide des raccourcis : N et / décrits pour la liste (planche 29 §6)', async () => {
    await render({ list: vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null }) });
    const active = TestBed.inject(ShortcutService).active();
    const about = (k: string) => active.find((s) => s.key === k)?.description;
    expect(about('n')).toBe('Nouveau patient');
    expect(about('/')).toBe('Filtrer mes patients');
  });

  describe('première connexion (M7-03)', () => {
    it('vide sans filtre : état vide avec phrase et N, puis l’accueil en trois étapes (étape 1)', async () => {
      const { el, help } = await render({
        list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      });
      const empty = el.querySelector('pm-state [role="status"]');
      expect(text(empty)).toContain('Créez votre premier patient');
      expect(text(empty)).toContain('se construisent à partir de la première entrée');
      expect(text(empty?.querySelector('button'))).toBe('Nouveau patient N');
      const welcome = el.querySelector('pm-onboarding');
      expect(welcome).not.toBeNull();
      expect(welcome?.querySelectorAll('li')).toHaveLength(3);
      expect(text(welcome?.querySelector('li[aria-current="step"] strong'))).toBe(
        'Créez un patient',
      );
      expect(welcome?.querySelector('.demo')).toBeNull();
      welcome?.querySelector<HTMLButtonElement>('button.shortcuts')?.click();
      expect(help.open).toHaveBeenCalledTimes(1);
    });

    it('seulement la démo : accueil au-dessus de la liste, puce « Démo », Supprimer la démo', async () => {
      const { el } = await render({
        list: vi.fn().mockResolvedValue({ items: [DEMO], nextCursor: null }),
      });
      const welcome = el.querySelector('pm-onboarding');
      expect(welcome).not.toBeNull();
      expect(
        welcome!.compareDocumentPosition(el.querySelector('table')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(welcome?.querySelector('.demo')).not.toBeNull();
      const row = el.querySelector('tbody tr')!;
      expect(text(row.querySelector('.demo-chip'))).toBe('Démo');
      const remove = row.querySelector<HTMLButtonElement>('button.demo-action');
      expect(text(remove)).toBe('Supprimer la démo');
      expect(remove?.getAttribute('aria-label')).toBe('Supprimer la démo : DEMO · Camille R.');
    });

    it('un vrai patient : pas d’accueil ; puce et bouton seulement sur la démo', async () => {
      const { el } = await render({
        list: vi.fn().mockResolvedValue({ items: [DEMO, patient()], nextCursor: null }),
      });
      expect(el.querySelector('pm-onboarding')).toBeNull();
      const rows = el.querySelectorAll('tbody tr');
      expect(rows[0].querySelector('.demo-chip')).not.toBeNull();
      expect(rows[1].querySelector('.demo-chip')).toBeNull();
      expect(rows[1].querySelector('button.demo-action')).toBeNull();
    });

    it('Supprimer la démo : confirmation simple sans nom à retaper, archivage, liste relue, toast Restaurer', async () => {
      const list = vi
        .fn()
        .mockResolvedValueOnce({ items: [DEMO], nextCursor: null })
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockResolvedValueOnce({ items: [DEMO], nextCursor: null });
      const archive = vi.fn().mockResolvedValue(undefined);
      const restore = vi.fn().mockResolvedValue(DEMO);
      const { fixture, el, confirm } = await render({ list, archive, restore });
      const toasts = TestBed.inject(ToastService);

      el.querySelector<HTMLButtonElement>('button.demo-action')!.click();
      await settle(fixture);
      const options = confirm.confirm.mock.calls[0][0];
      expect(options.title).toBe('Supprimer le patient de démonstration ?');
      expect(options.confirmWord).toBeUndefined();
      expect(options.destructive).toBe(true);
      expect(archive).toHaveBeenCalledWith('p-demo');
      expect(list).toHaveBeenCalledTimes(2);
      expect(el.querySelector('table')).toBeNull();
      expect(el.querySelector('pm-onboarding')).not.toBeNull();

      const toast = toasts.toasts().at(-1)!;
      expect(toast.message).toBe('Patient de démonstration retiré');
      expect(toast.action?.label).toBe('Restaurer');
      toast.action!.handler();
      await settle(fixture);
      expect(restore).toHaveBeenCalledWith('p-demo');
      expect(list).toHaveBeenCalledTimes(3);
      expect(el.querySelector('tbody .demo-chip')).not.toBeNull();
      expect(toasts.toasts().at(-1)?.message).toBe('Patient de démonstration restauré');
    });

    it('Supprimer la démo annulé : rien n’est archivé', async () => {
      const archive = vi.fn();
      const { fixture, el } = await render(
        { list: vi.fn().mockResolvedValue({ items: [DEMO], nextCursor: null }), archive },
        'patient',
        false,
      );
      el.querySelector<HTMLButtonElement>('button.demo-action')!.click();
      await settle(fixture);
      expect(archive).not.toHaveBeenCalled();
    });

    it('retrait refusé : avertissement dans la liste (pas de toast d’erreur), la démo reste', async () => {
      const { fixture, el } = await render({
        list: vi.fn().mockResolvedValue({ items: [DEMO], nextCursor: null }),
        archive: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
      });
      el.querySelector<HTMLButtonElement>('button.demo-action')!.click();
      await settle(fixture);
      expect(text(el.querySelector('p.warning[role="alert"]'))).toContain("n'a pas pu être retiré");
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(0);
      expect(el.querySelector('tbody .demo-chip')).not.toBeNull();
    });

    it('archivés : la démo archivée se restaure depuis sa ligne', async () => {
      const archived = { ...DEMO, archivedAt: '2026-11-09T08:00:00Z' };
      const list = vi
        .fn()
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockResolvedValueOnce({ items: [archived], nextCursor: null })
        .mockResolvedValue({ items: [], nextCursor: null });
      const restore = vi.fn().mockResolvedValue(DEMO);
      const { fixture, el } = await render({ list, restore });
      el.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
      await settle(fixture);
      expect(el.querySelector('pm-onboarding')).toBeNull();
      const button = el.querySelector<HTMLButtonElement>('tbody button.demo-action');
      expect(text(button)).toBe('Restaurer');
      expect(button?.getAttribute('aria-label')).toBe(
        'Restaurer le patient de démonstration DEMO · Camille R.',
      );
      button!.click();
      await settle(fixture);
      expect(restore).toHaveBeenCalledWith('p-demo');
    });
  });

  it('filtre : envoyé après la pause de frappe, Entrée ouvre le premier résultat, surlignage', async () => {
    vi.useFakeTimers();
    try {
      const list = vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null });
      const { fixture, el, router } = await renderWithFakeTimers({ list });
      const filter = el.querySelector<HTMLInputElement>('#patients-filter')!;
      filter.value = 'marié';
      filter.dispatchEvent(new Event('input'));
      expect(list).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'marié' }));
      fixture.detectChanges();
      expect(el.querySelector('tbody mark')?.textContent).toBe('Marie');
      expect(el.querySelector('tbody a.name')?.textContent?.trim()).toBe('Marie D.');
      key('Enter', filter);
      await vi.advanceTimersByTimeAsync(0);
      expect(router.navigate).toHaveBeenCalledWith(['/patients', 'p-marie', 'overview']);
    } finally {
      vi.useRealTimers();
    }
  });
});

async function renderWithFakeTimers(api: Partial<PatientApi>) {
  TestBed.configureTestingModule({
    imports: [PatientListPage],
    providers: [
      provideRouter([]),
      { provide: SessionApi, useValue: {} },
      { provide: PatientApi, useValue: { listTags: vi.fn().mockResolvedValue(TAGS), ...api } },
      { provide: ShortcutsHelp, useValue: { open: vi.fn() } },
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PatientListPage);
  await vi.advanceTimersByTimeAsync(0);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, router };
}
