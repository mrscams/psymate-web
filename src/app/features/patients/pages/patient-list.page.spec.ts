import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionApi } from '../../../core/auth/data/session.api';
import { ShortcutService } from '../../../core/shortcuts';
import { SubjectVocabulary } from '../../../core/i18n';
import { ConfirmDialogService, ToastService } from '../../../shared/ui';
import { ShortcutsHelp } from '../../patient-shell';
import { PatientApi } from '../data/patient.api';
import { activity, OMAR, patient, TAGS } from '../data/patient.fixtures';
import { PatientListQuery } from '../data/patient.model';
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

/** Bascule « Afficher les archivés » / « Revenir aux actifs » de l'en-tête. */
function archivedToggle(el: HTMLElement): HTMLButtonElement {
  return el.querySelector<HTMLButtonElement>('.page-head button.outline')!;
}

/** Dix patients numérotés (une page pleine). */
const ten = (from: number) =>
  Array.from({ length: 10 }, (_, i) =>
    patient({ id: `p-${from + i}`, displayName: `Patient ${from + i}`, flags: [] }),
  );

function key(key: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('PatientListPage', () => {
  beforeEach(() => localStorage.removeItem(SORT_STORAGE_KEY));

  it('chargement : six lignes squelette, titre et boutons présents, sans sous-titre chiffré', async () => {
    const { el } = await render({ list: vi.fn(never) });
    expect(text(el.querySelector('h1'))).toBe('Mes patients');
    expect(el.querySelector('.page-head p')).toBeNull();
    expect(text(archivedToggle(el))).toBe('Afficher les archivés');
    expect(text(el.querySelector('.page-head a.new'))).toBe('Nouveau patient N');
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

  it('vide sans filtre : « Créez votre premier patient » avec N ; archivés vides : Effacer les filtres', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { fixture, el, router } = await render({ list });
    expect(el.querySelector('pm-state [role="status"]')?.textContent).toContain(
      'Créez votre premier patient',
    );
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/patients/nouveau');

    archivedToggle(el).click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true }));
    expect(text(el.querySelector('h1'))).toBe('Patients archivés');
    expect(text(archivedToggle(el))).toBe('Revenir aux actifs');
    expect(el.querySelector('pm-state')?.textContent).toContain('Aucun patient ne correspond');
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: false }));
    expect(text(el.querySelector('h1'))).toBe('Mes patients');
  });

  it('données : colonnes de la maquette 01, date seule, puce en cours, depuis la séance, attention', async () => {
    const now = new Date();
    const started = new Date(now.getTime() - 12 * 60_000).toISOString();
    const api = {
      list: vi.fn().mockResolvedValue({ items: [patient(), OMAR], nextCursor: null }),
      activity: vi.fn((id: string) =>
        Promise.resolve(
          id === 'p-marie'
            ? activity({
                lastSession: {
                  at: `${now.getFullYear()}-11-05T09:00:00Z`,
                  closedAt: `${now.getFullYear()}-11-05T09:50:00Z`,
                  modality: 'in_person',
                  entryCount: 1,
                  reportMissing: true,
                },
                drafts: 1,
              })
            : activity({
                openSessionAt: started,
                since: { entries: 0, capped: false, strongest: null },
                intensities: [],
                feelingCount: 0,
                dominant: null,
                situations: { count: 0, first: null },
              }),
        ),
      ),
    };
    const { fixture, el } = await render(api);
    await settle(fixture);
    expect([...el.querySelectorAll('thead th')].map((th) => text(th))).toEqual([
      'Patient',
      'Dernière séance',
      'Depuis la séance',
      'Ressentis · 30 j',
      'Situations',
      'Attention',
      'Actions',
    ]);
    expect(el.querySelector('thead th')?.getAttribute('aria-sort')).toBe('ascending');
    const [marie, omar] = [...el.querySelectorAll('tbody tr')];
    expect(text(marie.querySelector('a.row-link'))).toBe('Marie D.');
    expect(marie.querySelector('a.row-link')?.getAttribute('href')).toBe('/patients/p-marie');
    expect(text(marie.querySelector('td.who .sub'))).toMatch(
      /^\d+ ans · depuis mars 2025 · #travail$/,
    );
    // Décision 2 : la date seule, ni modalité ni durée relative.
    expect(text(marie.querySelector('td.last'))).toBe('5 nov.');
    expect(text(marie.querySelector('td.since'))).toBe('5 entrées · anxiété 8/10');
    expect(marie.querySelector('td.feel svg.spark')?.getAttribute('aria-label')).toBe(
      'Intensité moyenne sur 30 jours : de 6 à 8 sur 10',
    );
    expect(text(marie.querySelector('td.feel'))).toContain('anxiété en hausse');
    expect(text(marie.querySelector('td.situations'))).toBe('3 · Surcharge au travail');
    expect([...marie.querySelectorAll('td.att .chip')].map((c) => text(c))).toEqual([
      '1 brouillon',
      'compte rendu à écrire',
    ]);
    expect(text(omar.querySelector('td.last .chip.live'))).toBe('en cours · 12 min');
    expect(text(omar.querySelector('td.since'))).toBe('—aucune entrée depuis la séance');
    expect(text(omar.querySelector('td.feel'))).toBe('pas encore de ressenti');
    expect([...omar.querySelectorAll('td.att .chip')].map((c) => text(c))).toEqual([
      'À surveiller',
    ]);
    expect(omar.querySelector('button.icon-btn')?.getAttribute('aria-label')).toBe(
      "Plus d'actions pour Omar B.",
    );
    expect(omar.querySelector('a.icon-btn')?.getAttribute('href')).toBe('/patients/p-omar/fiche');
  });

  it('bande « Aujourd’hui » : présente avec une séance ouverte ou clôturée aujourd’hui, sans compteur', async () => {
    const now = new Date();
    const started = new Date(now.getTime() - 5 * 60_000).toISOString();
    const closed = new Date(now.getTime() - 60_000).toISOString();
    const lea = patient({ id: 'p-lea', displayName: 'Léa M.' });
    const { fixture, el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient(), OMAR, lea], nextCursor: null }),
      activity: vi.fn((id: string) =>
        Promise.resolve(
          id === 'p-omar'
            ? activity({ openSessionAt: started })
            : id === 'p-lea'
              ? activity({
                  lastSession: {
                    at: closed,
                    closedAt: closed,
                    modality: 'video',
                    entryCount: 0,
                    reportMissing: true,
                  },
                })
              : activity(),
        ),
      ),
    });
    await settle(fixture);
    const band = el.querySelector('pm-patient-today')!;
    expect(text(band.querySelector('h2'))).toBe("Aujourd'hui");
    const cards = [...band.querySelectorAll('.tcard')];
    expect(cards).toHaveLength(2);
    expect(text(cards[0].querySelector('.chip.live'))).toBe('en séance · 5 min');
    expect(text(cards[0].querySelector('.sub'))).toBe('cabinet · 2 entrées notées');
    expect(text(cards[0].querySelector('a'))).toBe('Reprendre');
    expect(cards[0].querySelector('a')?.getAttribute('href')).toBe('/patients/p-omar/session');
    expect(text(cards[1].querySelector('.sub'))).toMatch(
      /^visio · clôturée à \d\d:\d\d · compte rendu à écrire$/,
    );
    expect(text(cards[1].querySelector('a'))).toBe('Compte rendu');
    expect(cards[1].querySelector('a')?.getAttribute('href')).toBe('/patients/p-lea/session');
  });

  it('bande « Aujourd’hui » : absente les jours calmes', async () => {
    const { fixture, el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null }),
    });
    await settle(fixture);
    expect(el.querySelector('pm-patient-today')).toBeNull();
  });

  it('filtres rapides : un seul groupe sans comptes ; À surveiller ; filtre vide → Afficher tous', async () => {
    const list = vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null });
    const { fixture, el } = await render({ list });
    await settle(fixture);
    const group = el.querySelector('[role="group"]')!;
    const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => text(b))).toEqual([
      'Tous',
      "Aujourd'hui",
      'À surveiller',
      'Brouillons',
    ]);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    buttons[2].click();
    await settle(fixture);
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('table')).toBeNull();
    expect(text(el.querySelector('.lst pm-state'))).toContain(
      'Aucune ligne pour le filtre « À surveiller ».',
    );
    el.querySelector<HTMLButtonElement>('.lst pm-state button')!.click();
    await settle(fixture);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('tri : Nom, Création, Modification, Dernière séance ; le choix relit la première page', async () => {
    const list = vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null });
    const { fixture, el } = await render({ list });
    const select = el.querySelector<HTMLSelectElement>('#patients-sort')!;
    expect([...select.options].map((o) => text(o))).toEqual([
      'Nom',
      'Création',
      'Modification',
      'Dernière séance',
    ]);
    select.value = 'created';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'created', cursor: null }),
    );
    expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe('created');
  });

  it('pied : « 10 patients affichés », Précédent / Suivant grisés en bout, aide si filtre sur plusieurs pages', async () => {
    const list = vi.fn((query: PatientListQuery) =>
      Promise.resolve(
        query.cursor === 'c-2'
          ? { items: ten(11).slice(0, 2), nextCursor: null }
          : { items: ten(1), nextCursor: 'c-2' },
      ),
    );
    const { fixture, el } = await render({ list });
    await settle(fixture);
    const prev = () => el.querySelector<HTMLButtonElement>('.foot button.prev')!;
    const next = () => el.querySelector<HTMLButtonElement>('.foot button.next')!;
    expect(text(el.querySelector('.foot .shown'))).toBe('10 patients affichés');
    expect(text(prev())).toBe('‹Précédent');
    expect(text(next())).toBe('Suivant›');
    expect(prev().disabled).toBe(true);
    expect(next().disabled).toBe(false);
    expect(el.querySelector('.foot .note')).toBeNull();
    expect(el.querySelector('.foot')?.textContent).not.toMatch(/sur \d/);

    next().click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c-2' }));
    expect(text(el.querySelector('.foot .shown'))).toBe('2 patients affichés');
    expect(prev().disabled).toBe(false);
    expect(next().disabled).toBe(true);

    prev().click();
    await settle(fixture);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null }));
    el.querySelectorAll<HTMLButtonElement>('[role="group"] button')[3].click();
    await settle(fixture);
    expect(text(el.querySelector('.foot .note'))).toBe('Filtre et tri appliqués à cette page.');
  });

  it('résumé en chargement puis en échec : barres d’attente, avertissement, Réessayer', async () => {
    let fail!: (reason: unknown) => void;
    const read = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockResolvedValueOnce(activity());
    const { fixture, el } = await render({
      list: vi.fn().mockResolvedValue({ items: [patient()], nextCursor: null }),
      activity: read,
    });
    expect(el.querySelectorAll('tbody .pending').length).toBeGreaterThan(0);
    fail({ status: 500, code: 'INTERNAL_ERROR' });
    await settle(fixture);
    const warning = el.querySelector('.activity-warning');
    expect(text(warning)).toContain("Le résumé d'une ligne n'a pas pu être chargé.");
    expect(text(el.querySelector('td.last'))).toBe('—Résumé indisponible');
    warning!.querySelector<HTMLButtonElement>('button')!.click();
    await settle(fixture);
    expect(read).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.activity-warning')).toBeNull();
  });

  it('menu d’une ligne : Ouvrir, Fiche, Exporter, Archiver ; archiver confirme (nom à retaper), toast Restaurer', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [patient(), OMAR], nextCursor: null })
      .mockResolvedValue({ items: [OMAR], nextCursor: null });
    const archive = vi.fn().mockResolvedValue(undefined);
    const restore = vi.fn().mockResolvedValue(patient());
    const { fixture, el, confirm } = await render({ list, archive, restore });
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('tbody tr button.icon-btn')!.click();
    await settle(fixture);
    const items = [
      ...document.querySelectorAll<HTMLElement>(
        '.mat-mdc-menu-panel [mat-menu-item], .mat-mdc-menu-panel .mat-mdc-menu-item',
      ),
    ];
    expect(items.map((item) => text(item))).toEqual(['Ouvrir', 'Fiche', 'Exporter', 'Archiver']);
    items[3].click();
    await settle(fixture);
    const options = confirm.confirm.mock.calls[0][0];
    expect(options.title).toBe('Archiver Marie D. ?');
    expect(options.confirmWord).toBe('Marie D.');
    expect(archive).toHaveBeenCalledWith('p-marie');
    expect(list).toHaveBeenCalledTimes(2);
    const toast = TestBed.inject(ToastService).toasts().at(-1)!;
    expect(toast.message).toBe('Marie D. archivée');
    toast.action!.handler();
    await settle(fixture);
    expect(restore).toHaveBeenCalledWith('p-marie');
    expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe('Marie D. restaurée');
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
      expect(row.querySelector('.av.dashed')?.textContent?.trim()).toBe('CR');
      expect(text(row.querySelector('a.row-link'))).toBe('DEMO · Camille R.');
      expect(text(row.querySelector('td.who .sub'))).toBe(
        'données fictives · supprimable · #travail',
      );
      const remove = row.querySelector<HTMLButtonElement>('button.text-action');
      expect(text(remove)).toBe('Supprimer');
      expect(remove?.getAttribute('aria-label')).toBe('Supprimer la démo : DEMO · Camille R.');
      expect(row.querySelector('button.icon-btn')).toBeNull();
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
      expect(real.querySelector('button.icon-btn')).not.toBeNull();
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
      expect(router.navigate).toHaveBeenCalledWith(['/patients', 'p-marie']);
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
