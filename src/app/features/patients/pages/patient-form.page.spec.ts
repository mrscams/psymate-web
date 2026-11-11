import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionApi } from '../../../core/auth/data/session.api';
import { SubjectVocabulary } from '../../../core/i18n';
import { PreferencesStore } from '../../../core/preferences';
import { ConfirmDialogService, ToastService } from '../../../shared/ui';
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
}

async function render(api: Partial<PatientApi>, options: Options = {}) {
  const confirm = options.confirm ?? vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    imports: [PatientFormPage],
    providers: [
      provideRouter([]),
      { provide: SessionApi, useValue: {} },
      { provide: PatientApi, useValue: { listTags: vi.fn().mockResolvedValue(TAGS), ...api } },
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

function submit(el: HTMLElement): void {
  el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
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
  afterEach(() => TestBed.inject(ToastService).clear());

  describe('création', () => {
    it('formulaire vide, durée de séance par défaut, aperçu, sans historique ni archivage', async () => {
      const { el } = await render({});
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Nouveau patient');
      expect(field(el, 'followUp-durationMin').value).toBe('60');
      expect(el.querySelector('pm-state')).toBeNull();
      expect(el.querySelector('pm-version-history')).toBeNull();
      expect(el.querySelector('.danger-zone')).toBeNull();
      expect(el.querySelector('pm-patient-export-menu')).toBeNull();
      expect(el.querySelectorAll('fieldset legend')).toHaveLength(5);
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
      // Le résumé est en tête du formulaire, avant le premier champ.
      const form = el.querySelector('form')!;
      expect(form.querySelector('pm-form-errors')).not.toBeNull();
      expect(
        summary!.compareDocumentPosition(field(el, 'displayName')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
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
      el.querySelector<HTMLInputElement>('.flag-card.watch input')!.click();
      await settle(fixture);
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
      type(el, 'tags', 'anxiété');
      await settle(fixture);
      el.querySelector<HTMLButtonElement>('button.add')!.click();
      await settle(fixture);
      expect(el.querySelector('#field-tags-error')?.textContent).toContain('est une émotion');
      expect(el.querySelectorAll('pm-tag-editor .chip')).toHaveLength(0);
    });
  });

  describe('modification', () => {
    const loaded = () => ({
      get: vi.fn().mockResolvedValue(patient({ currentVersion: 3 })),
      versions: vi.fn().mockResolvedValue(VERSIONS),
    });

    it('encart « Export du dossier » : menu « Exporter ce dossier » et note privées exclues', async () => {
      const { el } = await render(loaded(), { id: 'p-marie' });
      const aside = el.querySelector('aside');
      expect(aside?.querySelector('#export-title')?.textContent).toContain('Export du dossier');
      const trigger = aside?.querySelector('pm-patient-export-menu button');
      expect(trigger?.textContent).toContain('Exporter ce dossier');
      expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
      expect(aside?.textContent).toContain('Entrées privées exclues');
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

    it('données : fiche remplie, méta « 3 versions », historique champ par champ, aperçu', async () => {
      const { el } = await render(loaded(), { id: 'p-marie' });
      expect(el.querySelector('h1')?.textContent).toContain('Modifier la fiche · Marie D.');
      expect(el.querySelector('.meta')?.textContent).toContain('3 versions');
      expect(field(el, 'displayName').value).toBe('Marie D.');
      expect(field(el, 'followUp-since').value).toBe('2025-03');
      expect(el.querySelectorAll('pm-tag-editor .chip')).toHaveLength(1);
      const versions = el.querySelectorAll('pm-version-history .version');
      expect(versions).toHaveLength(2);
      expect(versions[0].textContent).toContain('Version 3');
      expect(versions[0].textContent).toContain('Rythme habituel');
      expect(versions[0].querySelector('del')?.textContent).toBe('Hebdomadaire');
      expect(versions[0].querySelector('ins')?.textContent).toBe('Mensuel');
      expect(el.querySelector('pm-header-preview')?.textContent).toContain(
        'suivi·e depuis mars 2025',
      );
    });

    it('historique vide : état vide', async () => {
      const { el } = await render(
        { get: vi.fn().mockResolvedValue(patient()), versions: vi.fn().mockResolvedValue([]) },
        { id: 'p-marie' },
      );
      expect(el.querySelector('pm-version-history [role="status"]')?.textContent).toContain(
        'Aucune modification depuis la création',
      );
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
      expect(el.querySelector('.meta')?.textContent).toContain('4 versions');
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
      el.querySelector<HTMLButtonElement>('.banner--info button')!.click();
      await settle(fixture);
      expect(restore).toHaveBeenCalledWith('p-marie');
      expect(field(el, 'displayName').disabled).toBe(false);
      expect(toasts.toasts()[0].message).toBe('Marie D. restaurée');
    });
  });
});
