import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { AgendaApi } from '../data/agenda.api';
import { appointmentOf } from '../testing/agenda.testing';
import {
  INPUT_DEBOUNCE_MS,
  NewAppointmentData,
  NewAppointmentPanel,
} from './new-appointment.panel';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

async function settle(fixture: ComponentFixture<unknown>, ms = 0): Promise<void> {
  await wait(ms);
  for (let i = 0; i < 2; i++) {
    await wait();
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const marie = { id: 'p-1', displayName: 'Marie D.', age: 34 };

const freeBusyEmpty = { conflicts: [], previous: null, next: null };

async function render(
  overrides: Partial<NewAppointmentData> = {},
  api: Record<string, unknown> = {},
) {
  const data: NewAppointmentData = {
    slot: new Date(2026, 10, 7, 10, 0),
    patient: null,
    ...overrides,
  };
  const mock = {
    searchPatients: vi
      .fn()
      .mockResolvedValue([marie, { id: 'p-2', displayName: 'Marc A.', age: null }]),
    patientAppointments: vi.fn().mockResolvedValue({
      appointments: [appointmentOf({ startsAt: new Date(2026, 10, 12, 9, 0).toISOString() })],
      defaults: { durationMin: 45, modality: 'phone', rhythm: 'toutes les 2 semaines' },
    }),
    freeBusy: vi.fn().mockResolvedValue(freeBusyEmpty),
    create: vi.fn(),
    ...api,
  };
  const dialogRef = { close: vi.fn() };
  TestBed.configureTestingModule({
    imports: [NewAppointmentPanel],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'fr' },
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: dialogRef },
      { provide: AgendaApi, useValue: mock },
      { provide: PreferencesStore, useValue: { defaultDurationMin: () => 60 } },
    ],
  });
  const fixture = TestBed.createComponent(NewAppointmentPanel);
  document.body.append(fixture.nativeElement);
  await settle(fixture, INPUT_DEBOUNCE_MS + 50);
  const el = fixture.nativeElement as HTMLElement;
  const select = (id: string) => el.querySelector<HTMLSelectElement>(`#field-${id}`)!;
  const choose = async (node: HTMLSelectElement, label: string) => {
    node.value = [...node.options].find((o) => text(o).includes(label))!.value;
    node.dispatchEvent(new Event('change'));
    await settle(fixture);
  };
  const type = async (node: HTMLInputElement, value: string, ms = 0) => {
    node.value = value;
    node.dispatchEvent(new Event('input'));
    await settle(fixture, ms);
  };
  return { fixture, el, dialogRef, api: mock, select, choose, type };
}

describe('NewAppointmentPanel (fiche 15b)', () => {
  afterEach(() => document.querySelectorAll('pm-new-appointment-panel').forEach((n) => n.remove()));

  it('créneau sans patient : recherche en focus initial, durée = préférence, pas de bloc Google', async () => {
    const { el, select } = await render();
    expect(text(el.querySelector('.title'))).toBe('Nouveau rendez-vous');
    expect(text(el.querySelector('.subtitle'))).toBe('Créneau cliqué : samedi 7 novembre, 10:00');
    expect(el.querySelector('.patient-card')).toBeNull();
    const search = el.querySelector<HTMLInputElement>('#field-patientId')!;
    expect(search.getAttribute('role')).toBe('combobox');
    expect(search.hasAttribute('cdkfocusinitial')).toBe(true);
    expect(text(select('duration').selectedOptions[0])).toBe('60 min');
    expect(el.textContent).not.toContain('Google');
    const segments = [...el.querySelectorAll<HTMLButtonElement>('.segment')];
    expect(segments.map((b) => text(b))).toEqual(['Cabinet', 'Visio', 'Téléphone']);
    expect(text(el.querySelector('.submit'))).toBe('Planifier le rendez-vous');
  });

  it('recherche : liste au clavier (↓, Entrée), carte du patient, défauts et prochain rendez-vous', async () => {
    const { fixture, el, api, type, select } = await render();
    const search = el.querySelector<HTMLInputElement>('#field-patientId')!;
    await type(search, 'mar', INPUT_DEBOUNCE_MS + 50);
    expect(api.searchPatients).toHaveBeenCalledTimes(1);
    expect(api.searchPatients).toHaveBeenCalledWith('mar');
    const options = [...el.querySelectorAll('[role=listbox] [role=option]')];
    expect(options.map((o) => text(o))).toEqual(['Marie D. 34 ans', 'Marc A.']);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await settle(fixture);
    expect(search.getAttribute('aria-activedescendant')).toBe(options[0].id);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);
    expect(el.querySelector('[role=listbox]')).toBeNull();
    expect(text(el.querySelector('.patient-card .name'))).toBe('Marie D.');
    expect(api.patientAppointments).toHaveBeenCalledWith('p-1');
    expect(text(el.querySelector('.patient-card .meta'))).toBe(
      '34 ans · rythme toutes les 2 semaines · prochain rendez-vous le 12 nov. à 09:00',
    );
    expect(text(select('duration').selectedOptions[0])).toBe('45 min');
    expect(el.querySelectorAll('.segment')[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('conflits et voisinage : freebusy débouncé (300 ms) ; bandeau ambre ou phrase de voisinage', async () => {
    const freeBusy = vi
      .fn()
      .mockResolvedValueOnce({
        conflicts: [],
        previous: appointmentOf({
          startsAt: new Date(2026, 10, 7, 9, 0).toISOString(),
          patient: { id: 'x', displayName: 'Omar B.', birthDate: null, age: null, archived: false },
        }),
        next: null,
      })
      .mockResolvedValue({
        conflicts: [
          {
            appointmentId: 'y',
            patientDisplayName: 'Théo B.',
            startsAt: new Date(2026, 10, 7, 11, 30).toISOString(),
            endsAt: new Date(2026, 10, 7, 12, 20).toISOString(),
            occurrenceStartsAt: '',
          },
        ],
        previous: null,
        next: null,
      });
    const { el, type } = await render({}, { freeBusy });
    expect(freeBusy).toHaveBeenCalledTimes(1);
    const [from, to, tz] = freeBusy.mock.calls[0];
    expect([from.getHours(), to.getHours()]).toEqual([10, 11]);
    expect(typeof tz).toBe('string');
    expect(text(el.querySelector('.slot + .hint'))).toBe(
      'Se termine à 11:00 · précédent : Omar B. à 09:00 · pas de chevauchement',
    );

    const start = el.querySelector<HTMLInputElement>('#field-start')!;
    await type(start, '11:0');
    await type(start, '11:00');
    await type(start, '11:15', INPUT_DEBOUNCE_MS + 50);
    expect(freeBusy).toHaveBeenCalledTimes(2);
    expect(text(el.querySelector('.warning'))).toBe(
      "Chevauche le rendez-vous de Théo B. (11:30–12:20). Il sera créé quand même ; vous pourrez le déplacer depuis l'agenda.",
    );
  });

  it('soumission : POST avec répétition toutes les 2 semaines × 3, À confirmer, fuseau ; fermeture', async () => {
    const created = {
      appointments: [appointmentOf({ startsAt: '2026-11-07T09:00:00Z' })],
      conflicts: [],
    };
    const create = vi.fn().mockResolvedValue(created);
    const { fixture, el, dialogRef, select, choose } = await render({ patient: marie }, { create });
    await choose(select('repeat'), 'Toutes les 2 semaines');
    await choose(select('count'), '3 fois');
    expect(text(select('count').selectedOptions[0])).toBe("3 fois (jusqu'au 5 déc.)");
    expect(text(el.querySelector('.submit'))).toBe('Planifier 3 rendez-vous');
    el.querySelector<HTMLInputElement>('.confirm input')!.click();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      patientId: 'p-1',
      startsAt: new Date(2026, 10, 7, 10, 0).toISOString(),
      durationMin: 45,
      modality: 'phone',
      tentative: true,
      recurrence: { everyWeeks: 2, count: 3 },
    });
    expect(create.mock.calls[0][0].tz).toBeTruthy();
    expect(dialogRef.close).toHaveBeenCalledWith({ created });
  });

  it('422 : résumé et erreurs sous les champs (startsAt → Début, recurrence → Répétitions)', async () => {
    const create = vi.fn().mockRejectedValue({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        { field: 'startsAt', code: 'OUT_OF_RANGE', message: 'Début hors bornes.' },
        { field: 'recurrence', code: 'TOO_MANY_OCCURRENCES', message: 'Au plus 26.' },
      ],
    });
    const { fixture, el, dialogRef, select, choose } = await render({ patient: marie }, { create });
    await choose(select('repeat'), 'Toutes les semaines');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(text(el.querySelector('pm-form-errors .title'))).toBe('2 champs à corriger.');
    expect(text(el.querySelector('#field-start-error'))).toBe('Début hors bornes.');
    expect(text(el.querySelector('#field-count-error'))).toBe('Au plus 26.');
  });

  it('« Jusqu’à une date… » sans date : soumission bloquée, erreur sous le champ', async () => {
    const { fixture, el, api, select, choose } = await render({ patient: marie });
    await choose(select('repeat'), 'Toutes les semaines');
    await choose(select('count'), 'Jusqu');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.create).not.toHaveBeenCalled();
    expect(text(el.querySelector('#field-until-error'))).toBe('Ce champ est obligatoire.');
  });

  it('pendant l’envoi : Annuler désactivé, Échap retenu ; fermé quand même → onCreated prévient la page', async () => {
    let resolve!: (value: unknown) => void;
    const create = vi.fn(() => new Promise((r) => (resolve = r)));
    const onCreated = vi.fn();
    const { fixture, el, dialogRef } = await render({ patient: marie, onCreated }, { create });
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    const cancel = el.querySelector<HTMLButtonElement>('.cancel')!;
    expect(cancel.disabled).toBe(true);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    el.querySelector('textarea')!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    const created = {
      appointments: [appointmentOf({ startsAt: '2026-11-07T09:00:00Z' })],
      conflicts: [],
    };
    resolve(created);
    await settle(fixture);
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(dialogRef.close).toHaveBeenCalledWith({ created });
  });

  it('libellés : « À confirmer avec le patient » (vocabulaire du compte), heure d’exemple localisée', async () => {
    const { el } = await render();
    expect(text(el.querySelector('.confirm'))).toBe('À confirmer avec le patient');
    expect(el.querySelector<HTMLInputElement>('#field-start')!.placeholder).toBe('10:00');
  });

  it('patient introuvable (404) : message général ; pas de double envoi pendant la requête', async () => {
    let reject!: (value: unknown) => void;
    const create = vi.fn(() => new Promise((_, r) => (reject = r)));
    const { fixture, el } = await render({ patient: marie }, { create });
    const form = el.querySelector<HTMLFormElement>('form')!;
    form.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector<HTMLButtonElement>('.submit')!.disabled).toBe(true);
    form.dispatchEvent(new Event('submit'));
    expect(create).toHaveBeenCalledTimes(1);
    reject({ status: 404, code: 'PATIENT_NOT_FOUND' });
    await settle(fixture);
    expect(text(el.querySelector('.form-message'))).toBe(
      "Ce patient n'est plus accessible : choisissez-en un autre.",
    );
  });

  it('sans patient choisi : la soumission ne part pas, le champ patient est signalé', async () => {
    const { fixture, el, api } = await render();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.create).not.toHaveBeenCalled();
    expect(text(el.querySelector('#field-patientId-error'))).toBe('Ce champ est obligatoire.');
  });
});
