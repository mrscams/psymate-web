import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionApi } from '../../../core/auth/data/session.api';
import { SubjectVocabulary } from '../../../core/i18n';
import { PatientApi } from '../data/patient.api';
import { OMAR, patient, TAGS } from '../data/patient.fixtures';
import { SORT_STORAGE_KEY } from '../data/patient-list.store';
import { FILTER_DEBOUNCE_MS, PatientListPage } from './patient-list.page';

const never = () => new Promise<never>(() => undefined);

async function render(api: Partial<PatientApi>, label: 'patient' | 'client' = 'patient') {
  TestBed.configureTestingModule({
    imports: [PatientListPage],
    providers: [
      provideRouter([]),
      { provide: SessionApi, useValue: {} },
      { provide: PatientApi, useValue: { listTags: vi.fn().mockResolvedValue(TAGS), ...api } },
    ],
  });
  TestBed.inject(SubjectVocabulary).set(label);
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PatientListPage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, router };
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
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PatientListPage);
  await vi.advanceTimersByTimeAsync(0);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, router };
}
