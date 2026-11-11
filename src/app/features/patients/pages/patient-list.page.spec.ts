import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionApi } from '../../../core/auth/data/session.api';
import { ShortcutService } from '../../../core/shortcuts';
import { SubjectVocabulary } from '../../../core/i18n';
import { ConfirmDialogService, ToastService } from '../../../shared/ui';
import { ShortcutsHelp } from '../../patient-shell';
import { PatientApi } from '../data/patient.api';
import { activity, OMAR, patient, TAGS } from '../data/patient.fixtures';
import { PatientListStore, SORT_STORAGE_KEY } from '../data/patient-list.store';
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
      {
        provide: PatientApi,
        useValue: {
          listTags: vi.fn().mockResolvedValue(TAGS),
          activity: vi.fn().mockResolvedValue(activity()),
          ...api,
        },
      },
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

/** Bascule « Afficher les archivés » de l'en-tête. */
function archivedToggle(el: HTMLElement): HTMLButtonElement {
  return el.querySelector<HTMLButtonElement>('button.archived-toggle')!;
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

    archivedToggle(el).click();
    await settle(fixture);
    expect(archivedToggle(el).getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('pm-state')?.textContent).toContain('Aucun patient ne correspond');
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: false }));
  });

  it('données : colonnes de la maquette 01, ligne cliquable, compteur, pied, menu des tags', async () => {
    const today = new Date();
    const api = {
      list: vi.fn().mockResolvedValue({ items: [patient(), OMAR], nextCursor: null }),
      activity: vi.fn((id: string) =>
        Promise.resolve(
          id === 'p-marie'
            ? activity({ lastSession: { at: today.toISOString(), modality: 'video' }, drafts: 1 })
            : activity({
                lastSession: null,
                emotions: [],
                feelingCount: 0,
                situations: { count: 0, first: null },
              }),
        ),
      ),
    };
    const { fixture, el } = await render(api);
    await settle(fixture);
    const headers = [...el.querySelectorAll('thead th')].map((th) => text(th));
    expect(headers).toEqual([
      'Patient',
      'Dernière séance',
      'Émotions dominantes · 30 j',
      'Situations actives',
      'Flags',
      'Actions',
    ]);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    // Tri par défaut « Dernière séance » : Marie (séance du jour) avant Omar (aucune séance).
    const marie = rows[0];
    expect(marie.querySelector('a.row-link')?.getAttribute('href')).toBe(
      '/patients/p-marie/overview',
    );
    expect(text(marie.querySelector('a.row-link'))).toBe('Marie D.');
    expect(text(marie.querySelector('.detail'))).toMatch(/^\d+ ans · suivie depuis mars 2025$/);
    expect(text(marie.querySelector('td.last'))).toMatch(/^aujourd’hui · .+ · visio$/);
    expect(marie.querySelectorAll('td.emotions .dot')).toHaveLength(2);
    expect(text(marie.querySelector('td.emotions .muted'))).toBe('anxiété ↑');
    expect(text(marie.querySelector('td.emotions .sr-only'))).toBe(
      'Anxiété, Tristesse ; anxiété en hausse',
    );
    expect(text(marie.querySelector('td.situations'))).toBe('3 · Surcharge au travail');
    expect(text(marie.querySelector('td.flags'))).toBe('1 brouillon');
    expect(text(marie.querySelector('.open'))).toBe('Ouvrir →');
    expect(marie.querySelector('button.more')?.getAttribute('aria-label')).toBe(
      "Plus d'actions pour Marie D.",
    );
    const omar = rows[1];
    expect(text(omar.querySelector('td.last'))).toBe('aucune séance');
    expect(text(omar.querySelector('td.emotions .muted'))).toBe('aucun ressenti');
    expect(text(omar.querySelector('td.situations'))).toBe('—aucune situation active');
    expect(text(omar.querySelector('td.flags pm-patient-flags'))).toBe('À surveiller : Sommeil');
    expect(el.querySelector('th[aria-sort="descending"]')?.textContent).toContain(
      'Dernière séance',
    );

    expect(text(el.querySelector('.counter'))).toBe("2 suivis actifs · 1 séance aujourd'hui");
    const chips = [...el.querySelectorAll('pm-patient-filters .chips button')].map((c) => text(c));
    expect(chips).toEqual(['Tous · 2', "Aujourd'hui · 1", 'Flags · 1', 'Brouillons · 1', 'Tags ▾']);
    expect(text(el.querySelector('.table-footer .shown'))).toBe(
      '2 patients affichés sur 2 · filtrés par « Tous »',
    );
    expect(text(el.querySelector('.table-footer .keys'))).toBe(
      '↑ ↓ choisir · Entrée ouvrir · N nouveau',
    );
    expect(el.querySelector('.legend')?.textContent).toContain('30 derniers jours');
  });

  it('filtres rapides : Flags ne garde que les patients à drapeau ; filtre vide → Afficher tous', async () => {
    const { fixture, el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient(), OMAR], nextCursor: null }),
    });
    await settle(fixture);
    const chip = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('pm-patient-filters .chip')].find((c) =>
        text(c).startsWith(label),
      )!;
    chip('Flags').click();
    fixture.detectChanges();
    expect(chip('Flags').getAttribute('aria-pressed')).toBe('true');
    expect([...el.querySelectorAll('tbody a.row-link')].map((a) => text(a))).toEqual(['Omar B.']);
    expect(text(el.querySelector('.table-footer .shown'))).toBe(
      '1 patient affiché sur 2 · filtré par « Flags »',
    );
    chip('Brouillons').click();
    fixture.detectChanges();
    expect(el.querySelector('table')).toBeNull();
    const empty = el.querySelector('pm-state [role="status"]');
    expect(text(empty)).toContain('Aucun patient ne correspond');
    empty!.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('liste incomplète : « Tous · 2+ », pas de tri par séance, Aujourd’hui / Brouillons désactivés, note', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [patient(), OMAR], nextCursor: 'c-2' })
      .mockResolvedValue({ items: [], nextCursor: null });
    const { fixture, el } = await render({ list });
    await settle(fixture);
    const chips = [...el.querySelectorAll<HTMLButtonElement>('pm-patient-filters .chip')];
    expect(chips.map((c) => text(c))).toEqual([
      'Tous · 2+',
      "Aujourd'hui",
      'Flags',
      'Brouillons',
      'Tags ▾',
    ]);
    expect(chips[1].disabled).toBe(true);
    expect(chips[3].disabled).toBe(true);
    expect(chips[1].getAttribute('aria-describedby')).toBe('patients-quick-hint');
    expect(text(el.querySelector('#patients-quick-hint'))).toContain('jusqu');
    const select = el.querySelector<HTMLSelectElement>('#patients-sort')!;
    expect([...select.options].map((o) => o.value)).not.toContain('lastSession');
    expect(select.value).toBe('updated');
    expect(el.querySelector('thead th[aria-sort]')).toBeNull();
    expect(text(el.querySelector('.table-footer .partial'))).toBe(
      "Résumé d'activité affiché pour les 20 premiers patients",
    );
    expect(text(el.querySelector('.counter'))).toBe('plus de 2 suivis actifs');

    // Filtre « Flags » vide parmi les chargés : le dire, et proposer de charger la suite.
    chips[2].click();
    fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('liste incomplète, filtre sans résultat : seuls les chargés sont filtrés, Charger la suite', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [patient()], nextCursor: 'c-2' })
      .mockResolvedValue({ items: [], nextCursor: null });
    const { fixture, el } = await render({ list });
    await settle(fixture);
    [...el.querySelectorAll<HTMLButtonElement>('pm-patient-filters .chip')]
      .find((c) => text(c) === 'Flags')!
      .click();
    fixture.detectChanges();
    const empty = el.querySelector('pm-state [role="status"]');
    expect(text(empty)).toContain('parmi les 1 patients chargés : seuls ceux-là sont filtrés');
    const action = empty!.querySelector<HTMLButtonElement>('button')!;
    expect(text(action)).toBe('Charger la suite');
    action.click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c-2' }));
  });

  it('colonne Flags masquée quand aucun patient affiché n’a ni drapeau ni brouillon', async () => {
    const { fixture, el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null }),
    });
    await settle(fixture);
    expect([...el.querySelectorAll('thead th')].map((th) => text(th))).not.toContain('Flags');
  });

  it('résumé en chargement puis en échec : barres d’attente, avertissement, Réessayer', async () => {
    let fail: (reason: unknown) => void = () => undefined;
    const activityCall = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockResolvedValue(activity());
    const { fixture, el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null }),
      activity: activityCall,
    });
    expect(el.querySelectorAll('tbody .pending')).toHaveLength(3);
    expect(text(el.querySelector('td.last .sr-only'))).toBe('Chargement…');
    fail({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    await settle(fixture);
    const warning = el.querySelector('.activity-warning[role="alert"]');
    expect(text(warning)).toContain("Le résumé d'une ligne n'a pas pu être chargé.");
    expect(text(el.querySelector('td.last .sr-only'))).toBe('Résumé indisponible');
    warning!.querySelector<HTMLButtonElement>('button')!.click();
    await settle(fixture);
    expect(activityCall).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.activity-warning')).toBeNull();
    expect(text(el.querySelector('td.last'))).toContain('cabinet');
  });

  it('clavier : ↓ depuis le filtre va à la première ligne, ↓ ↑ passent d’une ligne à l’autre', async () => {
    const { fixture, el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient(), OMAR], nextCursor: null }),
    });
    await settle(fixture);
    const links = [...el.querySelectorAll<HTMLAnchorElement>('tbody a.row-link')];
    const filter = el.querySelector<HTMLInputElement>('#patients-filter')!;
    key('ArrowDown', filter);
    expect(document.activeElement).toBe(links[0]);
    key('ArrowDown', links[0]);
    expect(document.activeElement).toBe(links[1]);
    key('ArrowDown', links[1]);
    expect(document.activeElement).toBe(links[1]);
    key('ArrowUp', links[1]);
    expect(document.activeElement).toBe(links[0]);
  });

  it('tags : menu « Tags ▾ » ; choisir un tag relit la liste filtrée', async () => {
    const list = vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null });
    const { fixture, el } = await render({ list });
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('pm-patient-filters .chip.tags')!.click();
    await settle(fixture);
    const items = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(items.map((item) => text(item))).toEqual(['✓Tous les tags', '#travail', '#santé']);
    items[1].click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'travail' }));
    expect(text(el.querySelector('pm-patient-filters .chip.tags'))).toBe('Tag : #travail ▾');
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

    it('seulement la démo : « Créez votre premier patient », « ou explorez… », badge DEMO, Supprimer', async () => {
      const { el } = await render({
        list: vi.fn().mockResolvedValue({ items: [DEMO], nextCursor: null }),
      });
      const empty = el.querySelector('.welcome-empty pm-state [role="status"]');
      expect(text(empty)).toContain('Créez votre premier patient');
      const explore = el.querySelector('.explore');
      expect(text(explore)).toBe('ou explorez un patient de démonstration');
      expect(
        explore!.compareDocumentPosition(el.querySelector('table')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(el.querySelector('pm-onboarding')).not.toBeNull();
      const row = el.querySelector('tbody tr')!;
      expect(text(row.querySelector('.demo-badge'))).toBe('DEMO');
      expect(row.querySelector('.avatar.dashed')?.textContent?.trim()).toBe('CR');
      expect(text(row.querySelector('a.row-link'))).toBe('DEMO · Camille R.');
      expect(text(row.querySelector('.detail'))).toBe('données fictives · supprimable');
      const remove = row.querySelector<HTMLButtonElement>('button.text-action');
      expect(text(remove)).toBe('Supprimer');
      expect(remove?.getAttribute('aria-label')).toBe('Supprimer la démo : DEMO · Camille R.');
      expect(row.querySelector('button.more')).toBeNull();
    });

    it('un vrai patient : pas d’accueil ; puce et bouton seulement sur la démo', async () => {
      const { el } = await render({
        list: vi.fn().mockResolvedValue({ items: [DEMO, patient()], nextCursor: null }),
      });
      expect(el.querySelector('pm-onboarding')).toBeNull();
      expect(el.querySelector('.explore')).toBeNull();
      const rows = [...el.querySelectorAll('tbody tr')];
      const demo = rows.find((row) => row.querySelector('.demo-badge'))!;
      const real = rows.find((row) => !row.querySelector('.demo-badge'))!;
      expect(demo.querySelector('button.text-action')).not.toBeNull();
      expect(real.querySelector('button.text-action')).toBeNull();
      expect(real.querySelector('button.more')).not.toBeNull();
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

      el.querySelector<HTMLButtonElement>('button.text-action')!.click();
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
      expect(el.querySelector('tbody .demo-badge')).not.toBeNull();
      expect(toasts.toasts().at(-1)?.message).toBe('Patient de démonstration restauré');
    });

    it('Supprimer la démo annulé : rien n’est archivé', async () => {
      const archive = vi.fn();
      const { fixture, el } = await render(
        { list: vi.fn().mockResolvedValue({ items: [DEMO], nextCursor: null }), archive },
        'patient',
        false,
      );
      el.querySelector<HTMLButtonElement>('button.text-action')!.click();
      await settle(fixture);
      expect(archive).not.toHaveBeenCalled();
    });

    it('retrait refusé : avertissement dans la liste (pas de toast d’erreur), la démo reste', async () => {
      const { fixture, el } = await render({
        list: vi.fn().mockResolvedValue({ items: [DEMO], nextCursor: null }),
        archive: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
      });
      el.querySelector<HTMLButtonElement>('button.text-action')!.click();
      await settle(fixture);
      const alert = el.querySelector('p.warning[role="alert"]');
      // Planche 29 : icône et mot du niveau, pas la couleur seule.
      expect(alert?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(text(alert?.querySelector('strong'))).toBe('Avertissement');
      expect(text(alert)).toContain("n'a pas pu être retiré");
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(0);
      expect(el.querySelector('tbody .demo-badge')).not.toBeNull();
    });

    it('restauration refusée (toast de la fiche) : message générique, effacé au filtre suivant', async () => {
      const list = vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null });
      const { fixture, el } = await render({
        list,
        restore: vi.fn().mockRejectedValue({ status: 403, code: 'PATIENT_FORBIDDEN' }),
      });
      await TestBed.inject(PatientListStore).restore('p-marie');
      await settle(fixture);
      const alert = el.querySelector('p.warning[role="alert"]');
      expect(text(alert)).toContain("La restauration n'a pas abouti");
      expect(text(alert)).not.toContain('démonstration');
      archivedToggle(el).click();
      await settle(fixture);
      expect(el.querySelector('p.warning')).toBeNull();
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
      archivedToggle(el).click();
      await settle(fixture);
      expect(el.querySelector('pm-onboarding')).toBeNull();
      const button = el.querySelector<HTMLButtonElement>('tbody button.text-action');
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
      expect(el.querySelector('tbody a.row-link')?.textContent?.trim()).toBe('Marie D.');
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
      {
        provide: PatientApi,
        useValue: {
          listTags: vi.fn().mockResolvedValue(TAGS),
          activity: vi.fn().mockResolvedValue(activity()),
          ...api,
        },
      },
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
