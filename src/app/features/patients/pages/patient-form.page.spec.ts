import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionApi } from '../../../core/auth/data/session.api';
import { SubjectVocabulary } from '../../../core/i18n';
import { PreferencesStore } from '../../../core/preferences';
import { ConfirmDialogService, SidePanelService, ToastService } from '../../../shared/ui';
import { PatientApi } from '../data/patient.api';
import { PatientExportApi } from '../data/patient-export.api';
import { patient, TAGS, VERSIONS } from '../data/patient.fixtures';
import { CAPTURE_FOCUS_STATE } from '../../patient-shell';
import { PatientFormPage } from './patient-form.page';

const never = () => new Promise<never>(() => undefined);

interface Options {
  id?: string;
  label?: 'patient' | 'client';
  confirm?: ReturnType<typeof vi.fn>;
  /** LOCALE_ID du test (en-US par défaut, comme le banc Angular). */
  locale?: string;
}

async function render(api: Partial<PatientApi>, options: Options = {}) {
  const confirm = options.confirm ?? vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    imports: [PatientFormPage],
    providers: [
      provideRouter([]),
      ...(options.locale ? [{ provide: LOCALE_ID, useValue: options.locale }] : []),
      { provide: SessionApi, useValue: {} },
      {
        provide: PatientApi,
        useValue: {
          listTags: vi.fn().mockResolvedValue(TAGS),
          sessionCount: vi.fn().mockResolvedValue(31),
          ...api,
        },
      },
      { provide: PreferencesStore, useValue: { defaultDurationMin: () => 60 } },
      { provide: ConfirmDialogService, useValue: { confirm } },
      { provide: PatientExportApi, useValue: { exportPatient: vi.fn() } },
    ],
  });
  TestBed.inject(SubjectVocabulary).set(options.label ?? 'patient');
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PatientFormPage);
  if (options.id) fixture.componentRef.setInput('id', options.id);
  await settle(fixture);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    router,
    confirm,
    toasts: TestBed.inject(ToastService),
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function field(el: HTMLElement, id: string): HTMLInputElement {
  return el.querySelector<HTMLInputElement>(`#field-${id}`)!;
}

function type(el: HTMLElement, id: string, value: string): void {
  const input = field(el, id);
  input.value = value;
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
}

/** Enregistrer, dans le rail (relié au formulaire par l'attribut form). */
function submit(el: HTMLElement): void {
  el.querySelector<HTMLButtonElement>('pm-record-rail button[type="submit"]')!.click();
}

function railLinks(el: HTMLElement): HTMLAnchorElement[] {
  return [...el.querySelectorAll<HTMLAnchorElement>('pm-record-rail nav a')];
}

/** Texte d'un élément, espaces normalisés (nom accessible d'un lien du rail). */
function text(node: Element): string {
  return node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function railNote(el: HTMLElement): string {
  return el.querySelector('pm-record-rail .note')?.textContent?.trim() ?? '';
}

function cancelButton(el: HTMLElement): HTMLButtonElement {
  return el.querySelector<HTMLButtonElement>('pm-record-rail .save button[type="button"]')!;
}

/** Le panneau d'historique s'ouvre dans l'overlay du CDK, hors de la page. */
function historyPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('pm-patient-versions-panel');
}

const problem422 = {
  status: 422,
  code: 'VALIDATION_FAILED',
  errors: [
    {
      field: 'displayName',
      code: 'TOO_LONG',
      message: 'Le nom affiché fait 120 caractères au plus.',
    },
    {
      field: 'birthDate',
      code: 'INVALID_DATE',
      message: 'La date de naissance doit être passée et de moins de 120 ans.',
    },
  ],
};

describe('PatientFormPage', () => {
  beforeEach(() => {
    // « il y a 13 j », âge : la date du jour est fixée (seul Date est simulé).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  });
  afterEach(() => {
    TestBed.inject(ToastService).clear();
    TestBed.inject(SidePanelService).closeAll();
    vi.useRealTimers();
  });

  describe('création', () => {
    it('proposition 16 : rail (aperçu, sections, Créer le dossier), sections dans l’ordre, aucun « facultatif »', async () => {
      const { el } = await render({});
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Nouveau patient');
      expect(field(el, 'followUp-durationMin').value).toBe('60');
      expect(el.querySelector('pm-state')).toBeNull();
      // Pas d'historique, d'export ni d'archivage avant la création.
      expect(el.querySelector('.head-actions')).toBeNull();
      expect(el.querySelector('.danger-zone')).toBeNull();
      // Sections continues, dans l'ordre de la maquette, chacune un fieldset à légende.
      expect(
        [...el.querySelectorAll('form fieldset > legend h2')].map((h) => h.textContent?.trim()),
      ).toEqual(['Identité', 'Contexte', 'Suivi', 'Drapeaux', 'Tags du dossier']);
      // Le rail : aperçu, liens vers les sections (sans « Archivage »), Créer le dossier, Ctrl+↵.
      const rail = el.querySelector('pm-record-rail')!;
      expect(rail.querySelector('pm-header-preview')?.textContent).toContain('Nom affiché');
      expect(railLinks(el).map((a) => a.querySelector('.label')?.textContent)).toEqual([
        'Identité',
        'Contexte',
        'Suivi',
        'Drapeaux',
        'Tags',
      ]);
      expect(railLinks(el).map((a) => a.getAttribute('href'))).toEqual([
        '/patients/nouveau#identite',
        '/patients/nouveau#contexte',
        '/patients/nouveau#suivi',
        '/patients/nouveau#drapeaux',
        '/patients/nouveau#tags',
      ]);
      const save = rail.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(save.textContent).toContain('Créer le dossier');
      expect(save.querySelector('kbd')?.textContent).toBe('Ctrl+↵');
      expect(save.getAttribute('form')).toBe(el.querySelector('form')?.id);
      expect(save.getAttribute('aria-keyshortcuts')).toBe('Control+Enter');
      expect(railNote(el)).toBe('Chaque enregistrement crée une version horodatée.');
      // « (facultatif) » disparaît : seul le nom affiché est marqué, une mention unique le dit.
      expect(el.textContent).not.toContain('(facultatif)');
      expect(el.querySelectorAll('.required')).toHaveLength(1);
      expect(el.querySelector('.required')?.closest('label')?.htmlFor).toBe('field-displayName');
      expect(el.textContent?.match(/Le reste est facultatif/g)).toHaveLength(1);
      // Les anciennes cartes latérales deviennent des notes sous les champs qu'elles concernent.
      expect(el.querySelector('aside')).toBeNull();
      expect(field(el, 'phone').getAttribute('aria-describedby')).toContain('contact-note');
      expect(el.querySelector('#contact-note')?.textContent).toContain('jamais synchronisées');
      expect(el.querySelector('#section-suivi .inline-note')?.textContent).toContain(
        "Une séance d'accueil est créée avec le dossier",
      );
      expect(el.querySelector('#field-followUp-durationMin-hint')?.textContent).toBe(
        'préférence du compte : 60 min',
      );
      // Exemples, pas de crochets.
      expect(field(el, 'followUp-fee').placeholder).toBe('70 €');
      expect(field(el, 'phone').placeholder).toBe('06 12 34 56 78');
    });

    it('le rail suit la saisie : aperçu, décomptes des sections', async () => {
      const { fixture, el } = await render({});
      expect(railLinks(el)[0].querySelector('.st')).toBeNull();
      // La durée par défaut compte déjà dans « Suivi ».
      expect(text(railLinks(el)[2])).toBe('Suivi 1 champ renseigné');
      type(el, 'displayName', 'Nour K.');
      type(el, 'firstName', 'Nour');
      type(el, 'context-situation', 'En couple');
      await settle(fixture);
      expect(text(railLinks(el)[0])).toBe('Identité 2 champs renseignés');
      expect(railLinks(el)[0].querySelector('.st')?.textContent).toContain('2 champs');
      expect(text(railLinks(el)[1])).toBe('Contexte 1 champ renseigné');
      el.querySelector<HTMLInputElement>('.flagcard.watch input')!.click();
      await settle(fixture);
      expect(railLinks(el)[3].querySelector('.st')?.textContent?.trim()).toBe('1 posé');
      expect(el.querySelector('pm-header-preview .nm')?.textContent).toBe('Nour K.');
      expect(el.querySelector('pm-header-preview .chip')?.textContent).toContain('À surveiller');
    });

    it('lien du rail : défile jusqu’à la section, la marque courante, focus sur son titre', async () => {
      const { fixture, el } = await render({});
      const section = el.querySelector<HTMLElement>('#section-drapeaux')!;
      section.scrollIntoView = vi.fn();
      expect(railLinks(el)[0].getAttribute('aria-current')).toBe('true');
      railLinks(el)[3].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(fixture);
      expect(section.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
      expect(railLinks(el)[3].getAttribute('aria-current')).toBe('true');
      expect(railLinks(el)[0].getAttribute('aria-current')).toBeNull();
      expect(document.activeElement).toBe(el.querySelector('#section-drapeaux-title'));
    });

    it('Annuler (création) : retour à la liste', async () => {
      const { el, router } = await render({});
      expect(cancelButton(el).textContent).toContain('Annuler');
      cancelButton(el).click();
      expect(router.navigate).toHaveBeenCalledWith(['/patients']);
    });

    it('dates en français (UX-B8) : saisie jj/mm/aaaa et mm/aaaa, envoi AAAA-MM-JJ sans décalage', async () => {
      const create = vi.fn().mockResolvedValue(patient({ id: 'p-new' }));
      const { fixture, el } = await render({ create }, { locale: 'fr' });
      expect(field(el, 'birthDate').getAttribute('placeholder')).toBe('jj/mm/aaaa');
      type(el, 'displayName', 'Quentin S.');
      type(el, 'birthDate', '28/07/2003');
      type(el, 'followUp-since', '03/2025');
      submit(el);
      await settle(fixture);
      expect(create).toHaveBeenCalledWith({
        displayName: 'Quentin S.',
        birthDate: '2003-07-28',
        followUp: { since: '2025-03-01', durationMin: 60 },
      });
    });

    it('date illisible : erreur sous le champ, aucun appel', async () => {
      const create = vi.fn();
      const { fixture, el } = await render({ create }, { locale: 'fr' });
      type(el, 'displayName', 'Quentin S.');
      type(el, 'birthDate', '31/02/2003');
      submit(el);
      await settle(fixture);
      expect(create).not.toHaveBeenCalled();
      expect(field(el, 'birthDate').getAttribute('aria-invalid')).toBe('true');
      expect(el.querySelector('#field-birthDate-error')?.textContent).toContain('Date invalide');
      // L'aide puis l'erreur décrivent le champ (describedBy de pm-date-field, UX-A8).
      expect(field(el, 'birthDate').getAttribute('aria-describedby')).toBe(
        'field-birthDate-hint field-birthDate-error',
      );
      expect(el.querySelector('#field-birthDate-hint')?.textContent).toBe(
        "L'âge et les phases de vie en découlent",
      );
    });

    it('date de naissance lue : l’aide donne l’âge (« 35 ans · … »)', async () => {
      const { fixture, el } = await render({}, { locale: 'fr' });
      type(el, 'birthDate', '12/04/1991');
      await settle(fixture);
      expect(el.querySelector('#field-birthDate-hint')?.textContent).toBe(
        "35 ans · l'âge et les phases de vie en découlent",
      );
    });

    it('coach : « Nouveau client »', async () => {
      const { el } = await render({}, { label: 'client' });
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Nouveau client');
    });

    it('nom vide et date future : erreurs sous les champs, focus sur le premier, aucun appel', async () => {
      const create = vi.fn();
      const { fixture, el } = await render({ create });
      type(el, 'birthDate', '2999-01-01');
      submit(el);
      await settle(fixture);
      expect(create).not.toHaveBeenCalled();
      expect(el.querySelector('#field-displayName-error')?.textContent).toContain(
        'Ce champ est obligatoire.',
      );
      expect(el.querySelector('#field-birthDate-error')?.textContent).toContain(
        'La date ne peut pas être dans le futur.',
      );
      expect(field(el, 'displayName').getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(field(el, 'displayName'));
    });

    it('422 du serveur : messages sous les champs, résumé en tête avec focus, liens vers les champs', async () => {
      const create = vi.fn().mockRejectedValue(problem422);
      const { fixture, el, router } = await render({ create });
      type(el, 'displayName', 'Marie D.');
      type(el, 'birthDate', '1890-01-01');
      submit(el);
      await settle(fixture);
      expect(create).toHaveBeenCalledTimes(1);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(el.querySelector('#field-displayName-error')?.textContent).toContain(
        '120 caractères au plus',
      );
      expect(el.querySelector('#field-birthDate-error')?.textContent).toContain('moins de 120 ans');
      const summary = el.querySelector<HTMLElement>('pm-form-errors [role="alert"]');
      expect(summary?.textContent).toContain('2 champs à corriger.');
      expect(document.activeElement).toBe(summary);
      const links = [...el.querySelectorAll<HTMLAnchorElement>('pm-form-errors a')];
      expect(links.map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
        ['#field-displayName', 'Nom affiché'],
        ['#field-birthDate', 'Date de naissance'],
      ]);
      // Le résumé est en tête, avant le rail et le premier champ ; le rail reste là (Enregistrer).
      expect(
        summary!.compareDocumentPosition(field(el, 'displayName')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        summary!.compareDocumentPosition(el.querySelector('pm-record-rail')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(el.querySelector('pm-record-rail button[type="submit"]')).not.toBeNull();
      field(el, 'birthDate').scrollIntoView = vi.fn();
      links[1].click();
      expect(document.activeElement).toBe(field(el, 'birthDate'));

      // Une nouvelle tentative efface le résumé (l'erreur de forme reprend la main).
      type(el, 'displayName', '');
      submit(el);
      await settle(fixture);
      expect(el.querySelector('pm-form-errors [role="alert"]')).toBeNull();
    });

    it('« à surveiller » sans raison : erreur sur la raison, aucun appel', async () => {
      const create = vi.fn();
      const { fixture, el } = await render({ create });
      type(el, 'displayName', 'Marie D.');
      el.querySelector<HTMLInputElement>('.flagcard.watch input')!.click();
      await settle(fixture);
      // La raison vit dans la carte cochée.
      expect(el.querySelector('.flagcard.watch #field-flags-watchReason')).not.toBeNull();
      submit(el);
      await settle(fixture);
      expect(create).not.toHaveBeenCalled();
      expect(el.querySelector('#field-flags-watchReason-error')?.textContent).toContain(
        'Ce champ est obligatoire.',
      );
      expect(document.activeElement).toBe(field(el, 'flags-watchReason'));
    });

    it('enregistrer (Ctrl+Entrée) : POST puis vue d’ensemble du nouveau patient', async () => {
      const create = vi.fn().mockResolvedValue(patient({ id: 'p-new' }));
      const { fixture, el, router } = await render({ create });
      type(el, 'displayName', ' Marie D. ');
      type(el, 'followUp-rhythm', 'weekly');
      field(el, 'displayName').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
      );
      await settle(fixture);
      expect(create).toHaveBeenCalledWith({
        displayName: 'Marie D.',
        followUp: { rhythm: 'weekly', durationMin: 60 },
      });
      expect(router.navigate).toHaveBeenCalledWith(['/patients', 'p-new', 'overview'], {
        state: { [CAPTURE_FOCUS_STATE]: true },
      });
    });

    it('tag égal à une émotion : refus avec le message du serveur', async () => {
      const createTag = vi.fn().mockRejectedValue({
        status: 422,
        code: 'TAG_IS_EMOTION',
        errors: [
          { field: 'label', code: 'TAG_IS_EMOTION', message: '« anxiété » est une émotion.' },
        ],
      });
      const { fixture, el } = await render({ createTag });
      // Saisie dans la zone de puces, Entrée ajoute (plus de bouton « Ajouter » séparé).
      type(el, 'tags', 'anxiété');
      await settle(fixture);
      expect(el.querySelector('pm-tag-editor button.add')).toBeNull();
      field(el, 'tags').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      await settle(fixture);
      expect(createTag).toHaveBeenCalledWith('anxiété');
      expect(el.querySelector('#field-tags-error')?.textContent).toContain('est une émotion');
      expect(el.querySelectorAll('pm-tag-editor .chip')).toHaveLength(0);
    });
  });

  describe('tag tapé sans Entrée (brouillon) à l’enregistrement', () => {
    it('création : le brouillon part comme tag dans le POST', async () => {
      const create = vi.fn().mockResolvedValue(patient({ id: 'p-new' }));
      const { fixture, el } = await render({ create });
      type(el, 'displayName', 'Marie D.');
      type(el, 'tags', ' #santé ');
      submit(el);
      await settle(fixture);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ tags: ['santé'] }));
    });

    it('modification : le brouillon s’ajoute aux tags envoyés, puis le toast', async () => {
      const replaceTags = vi
        .fn()
        .mockResolvedValue(patient({ tags: [{ id: 't-travail', label: 'travail' }] }));
      const { fixture, el, toasts } = await render(
        {
          get: vi.fn().mockResolvedValue(patient()),
          versions: vi.fn().mockResolvedValue([]),
          replaceTags,
        },
        { id: 'p-marie' },
      );
      type(el, 'tags', 'santé');
      submit(el);
      await settle(fixture);
      expect(replaceTags).toHaveBeenCalledWith('p-marie', ['travail', 'santé']);
      expect(toasts.toasts().map((t) => t.message)).toEqual(['Fiche enregistrée']);
    });

    it('brouillon refusé (émotion) : aucun envoi, message sous le champ, focus dessus', async () => {
      const create = vi.fn();
      const createTag = vi.fn().mockRejectedValue({
        status: 422,
        code: 'TAG_IS_EMOTION',
        errors: [
          { field: 'label', code: 'TAG_IS_EMOTION', message: '« anxiété » est une émotion.' },
        ],
      });
      const { fixture, el } = await render({ create, createTag });
      type(el, 'displayName', 'Marie D.');
      type(el, 'tags', 'anxiété');
      submit(el);
      await settle(fixture);
      expect(create).not.toHaveBeenCalled();
      expect(el.querySelector('#field-tags-error')?.textContent).toContain('est une émotion');
      expect(document.activeElement).toBe(field(el, 'tags'));
    });
  });

  describe('modification', () => {
    const loaded = () => ({
      get: vi.fn().mockResolvedValue(patient({ currentVersion: 3 })),
      versions: vi.fn().mockResolvedValue(VERSIONS),
    });

    it('en-tête : « Exporter le dossier ▾ » et « Historique des versions »', async () => {
      const { el } = await render(loaded(), { id: 'p-marie' });
      const actions = el.querySelector('.page-head .head-actions')!;
      const trigger = actions.querySelector('pm-patient-export-menu button');
      expect(trigger?.textContent).toContain('Exporter le dossier');
      expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
      // Variante compacte : les notes de l'export ne sont plus sur la fiche (maquette 16).
      expect(actions.textContent).not.toContain('Entrées privées exclues');
      const buttons = [...actions.querySelectorAll(':scope > button')];
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Historique des versions']);
    });

    it('chargement : squelette à la place du formulaire', async () => {
      const { el } = await render({ get: vi.fn(never), versions: vi.fn(never) }, { id: 'p-marie' });
      expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
      expect(el.querySelector('form')).toBeNull();
    });

    it('erreur : bloc erreur, Réessayer relit la fiche', async () => {
      const get = vi
        .fn()
        .mockRejectedValueOnce({ status: 403, code: 'PATIENT_FORBIDDEN' })
        .mockResolvedValueOnce(patient());
      const { fixture, el } = await render(
        { get, versions: vi.fn().mockResolvedValue([]) },
        { id: 'p-marie' },
      );
      expect(el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
        'Impossible de charger cette fiche',
      );
      el.querySelector<HTMLButtonElement>('pm-state button')!.click();
      await settle(fixture);
      expect(get).toHaveBeenCalledTimes(2);
      expect(el.querySelector('form')).not.toBeNull();
    });

    it('données : fiche remplie, méta « (3 versions) », rail, aperçu, historique dans un panneau', async () => {
      const { fixture, el } = await render(loaded(), { id: 'p-marie', locale: 'fr' });
      expect(el.querySelector('h1')?.textContent).toBe('Fiche · Marie D.');
      // Méta de la proposition 16 : création, séances, dernière modification (n versions).
      expect(text(el.querySelector('.page-head .sub')!)).toBe(
        'Créée le 1 nov. 2026 · 31 séances · dernière modification il y a 13 j (3 versions)',
      );
      expect(field(el, 'displayName').value).toBe('Marie D.');
      // Rail : décomptes de la fiche lue, lien « Archivage », Enregistrer.
      expect(railLinks(el).map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'Identité 5 champs renseignés',
        'Contexte 1 champ renseigné',
        'Suivi 4 champs renseignés',
        'Drapeaux',
        'Tags 1 tag',
        'Archivage',
      ]);
      expect(railLinks(el)[5].getAttribute('href')).toBe('/patients/p-marie/fiche#archivage');
      expect(el.querySelector('pm-record-rail button[type="submit"]')?.textContent).toContain(
        'Enregistrer',
      );
      expect(el.querySelector('pm-version-history')).toBeNull();
      // Champs date localisés (UX-A4, UX-B8) : « 12/04/1990 », « 03/2025 ».
      expect(field(el, 'birthDate').value).toBe('12/04/1990');
      expect(field(el, 'followUp-since').value).toBe('03/2025');
      expect(el.querySelectorAll('pm-tag-editor .chip')).toHaveLength(1);
      expect(el.querySelector('pm-header-preview')?.textContent).toContain(
        'suivi·e depuis mars 2025',
      );
      // « (3 versions) » ouvre l'historique dans un panneau latéral.
      el.querySelector<HTMLButtonElement>('.page-head .sub button')!.click();
      await settle(fixture);
      const panel = historyPanel()!;
      expect(panel.querySelector('h2')?.textContent).toContain('Historique des versions');
      expect(panel.textContent).toContain('Marie D.');
      const versions = panel.querySelectorAll('pm-version-history .version');
      expect(versions).toHaveLength(2);
      expect(versions[0].textContent).toContain('Version 3');
      expect(versions[0].textContent).toContain('Rythme habituel');
      expect(versions[0].querySelector('del')?.textContent).toBe('Hebdomadaire');
      expect(versions[0].querySelector('ins')?.textContent).toBe('Mensuel');
    });

    it('méta sans le nombre de séances quand la projection est illisible', async () => {
      const { el } = await render(
        { ...loaded(), sessionCount: vi.fn().mockRejectedValue({ status: 503 }) },
        { id: 'p-marie' },
      );
      const meta = el.querySelector('.page-head .sub')?.textContent ?? '';
      expect(meta).toContain('Créée le');
      expect(meta).not.toContain('séance');
      expect(el.querySelector('pm-state')).toBeNull();
    });

    it('drapeau déjà posé : carte cochée avec sa date, case à droite du libellé', async () => {
      const { el } = await render(
        {
          get: vi.fn().mockResolvedValue(
            patient({
              flags: [{ kind: 'watch', reason: 'Sommeil', setAt: '2026-10-03T10:00:00Z' }],
            }),
          ),
          versions: vi.fn().mockResolvedValue([]),
        },
        { id: 'p-marie', locale: 'fr' },
      );
      const card = el.querySelector('.flagcard.watch')!;
      expect(card.classList).toContain('on');
      expect(card.textContent).toContain('Posé le 3 oct. 2026');
      const input = card.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      expect(input.checked).toBe(true);
      // Nom accessible : le libellé seul ; l'aide (ou la date) en description.
      expect(el.querySelector(`#${input.getAttribute('aria-labelledby')}`)?.textContent).toBe(
        'À surveiller',
      );
      expect(input.previousElementSibling?.classList).toContain('name');
      // La raison dans la carte, nommée « Raison du drapeau « à surveiller » ».
      const reason = card.querySelector<HTMLInputElement>('#field-flags-watchReason')!;
      expect(reason.value).toBe('Sommeil');
      expect(card.querySelector('.reason label')?.textContent).toBe(
        'Raison du drapeau « à surveiller »',
      );
      expect(railLinks(el)[3].querySelector('.st')?.textContent?.trim()).toBe('1 posé');
    });

    it('historique vide : état vide dans le panneau ; pas de « dernière modification »', async () => {
      const { fixture, el } = await render(
        { get: vi.fn().mockResolvedValue(patient()), versions: vi.fn().mockResolvedValue([]) },
        { id: 'p-marie' },
      );
      expect(el.querySelector('.page-head .sub')?.textContent).not.toContain('modification');
      el.querySelector<HTMLButtonElement>('.head-actions > button')!.click();
      await settle(fixture);
      expect(historyPanel()?.querySelector('[role="status"]')?.textContent).toContain(
        'Aucune modification depuis la création',
      );
    });

    it('historique en erreur : bloc erreur, Réessayer relit les versions', async () => {
      const versions = vi
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce(VERSIONS);
      const { fixture, el } = await render(
        { get: vi.fn().mockResolvedValue(patient({ currentVersion: 3 })), versions },
        { id: 'p-marie' },
      );
      el.querySelector<HTMLButtonElement>('.head-actions > button')!.click();
      await settle(fixture);
      expect(historyPanel()?.textContent).toContain("Impossible de charger l'historique");
      historyPanel()!.querySelector<HTMLButtonElement>('pm-version-history button')!.click();
      await settle(fixture);
      expect(versions).toHaveBeenCalledTimes(2);
      expect(historyPanel()?.querySelectorAll('.version')).toHaveLength(2);
    });

    it('champs modifiés : décompte sous Enregistrer, « Annuler les modifications » remet la fiche', async () => {
      const api = { ...loaded(), patch: vi.fn() };
      const { fixture, el } = await render(api, { id: 'p-marie' });
      expect(railNote(el)).toBe('Chaque enregistrement crée une version horodatée.');
      expect(cancelButton(el).textContent).toContain('Annuler les modifications');
      expect(cancelButton(el).disabled).toBe(true);
      type(el, 'followUp-rhythm', 'monthly');
      await settle(fixture);
      expect(railNote(el)).toBe(
        '1 champ modifié · chaque enregistrement crée une version horodatée.',
      );
      type(el, 'phone', '06 12 34 56 78');
      el.querySelector<HTMLInputElement>('.flagcard.risk input')!.click();
      await settle(fixture);
      expect(railNote(el)).toBe(
        '3 champs modifiés · chaque enregistrement crée une version horodatée.',
      );
      expect(cancelButton(el).disabled).toBe(false);
      cancelButton(el).click();
      await settle(fixture);
      expect(field(el, 'followUp-rhythm').value).toBe('weekly');
      expect(field(el, 'phone').value).toBe('');
      expect(railNote(el)).toBe('Chaque enregistrement crée une version horodatée.');
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('modifier le rythme : PATCH partiel, fiche relue, toast', async () => {
      const api = {
        ...loaded(),
        patch: vi.fn().mockResolvedValue(patient({ currentVersion: 4 })),
      };
      const { fixture, el, toasts } = await render(api, { id: 'p-marie' });
      type(el, 'followUp-rhythm', 'monthly');
      submit(el);
      await settle(fixture);
      expect(api.patch).toHaveBeenCalledWith('p-marie', { followUp: { rhythm: 'monthly' } });
      expect(api.versions).toHaveBeenCalledTimes(2);
      expect(el.querySelector('.page-head .sub button')?.textContent).toBe('4 versions');
      expect(toasts.toasts().map((t) => t.message)).toEqual(['Fiche enregistrée']);
    });

    it('nom ancien de plus de 120 caractères inchangé : enregistrable (G Q47)', async () => {
      const longName = 'A'.repeat(130);
      const api = {
        get: vi.fn().mockResolvedValue(patient({ displayName: longName })),
        versions: vi.fn().mockResolvedValue([]),
        patch: vi.fn().mockResolvedValue(patient({ displayName: longName, currentVersion: 2 })),
      };
      const { fixture, el } = await render(api, { id: 'p-marie' });
      type(el, 'followUp-rhythm', 'monthly');
      submit(el);
      await settle(fixture);
      expect(api.patch).toHaveBeenCalledWith('p-marie', { followUp: { rhythm: 'monthly' } });
      type(el, 'displayName', longName + 'B');
      submit(el);
      await settle(fixture);
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(el.querySelector('#field-displayName-error')?.textContent).toContain('120');
    });

    it('archiver : nom à retaper, DELETE, retour à la liste avec « Restaurer »', async () => {
      const api = { ...loaded(), archive: vi.fn().mockResolvedValue(undefined) };
      const { fixture, el, router, confirm, toasts } = await render(api, { id: 'p-marie' });
      // La zone d'archivage est la dernière section, ciblée par le lien « Archivage » du rail.
      expect(el.querySelector('#section-archivage .danger-zone h2')?.textContent?.trim()).toBe(
        'Archiver ce dossier',
      );
      el.querySelector<HTMLButtonElement>('.danger-zone button')!.click();
      await settle(fixture);
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ confirmWord: 'Marie D.', destructive: true }),
      );
      expect(api.archive).toHaveBeenCalledWith('p-marie');
      expect(router.navigate).toHaveBeenCalledWith(['/patients']);
      const [toast] = toasts.toasts();
      expect(toast.message).toBe('Marie D. archivée');
      expect(toast.action?.label).toBe('Restaurer');
    });

    it('archivage annulé : rien n’est envoyé', async () => {
      const api = { ...loaded(), archive: vi.fn() };
      const { fixture, el } = await render(api, {
        id: 'p-marie',
        confirm: vi.fn().mockResolvedValue(false),
      });
      el.querySelector<HTMLButtonElement>('.danger-zone button')!.click();
      await settle(fixture);
      expect(api.archive).not.toHaveBeenCalled();
    });

    it('dossier archivé : bandeau, formulaire inactif, Restaurer → POST /restore', async () => {
      const restore = vi.fn().mockResolvedValue(patient());
      const { fixture, el, toasts } = await render(
        {
          get: vi.fn().mockResolvedValue(patient({ archivedAt: '2026-11-05T10:00:00Z' })),
          versions: vi.fn().mockResolvedValue([]),
          restore,
        },
        { id: 'p-marie' },
      );
      expect(el.querySelector('.banner--info')?.textContent).toContain('Ce dossier est archivé');
      expect(field(el, 'displayName').disabled).toBe(true);
      expect(el.querySelector('.danger-zone')).toBeNull();
      // Le rail reste, Enregistrer inactif, plus de lien « Archivage ».
      expect(
        el.querySelector<HTMLButtonElement>('pm-record-rail button[type="submit"]')!.disabled,
      ).toBe(true);
      expect(railLinks(el).map((a) => a.querySelector('.label')?.textContent)).not.toContain(
        'Archivage',
      );
      el.querySelector<HTMLButtonElement>('.banner--info button')!.click();
      await settle(fixture);
      expect(restore).toHaveBeenCalledWith('p-marie');
      expect(field(el, 'displayName').disabled).toBe(false);
      expect(text(railLinks(el).at(-1)!)).toBe('Archivage');
      expect(toasts.toasts()[0].message).toBe('Marie D. restaurée');
    });
  });
});
