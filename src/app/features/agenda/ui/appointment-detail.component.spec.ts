import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ToastService } from '../../../shared/ui';
import { loaded } from '../../../shared/util';
import { Appointment } from '../data/agenda.model';
import { AgendaStore, DetailState } from '../data/agenda.store';
import { appointmentOf } from '../testing/agenda.testing';
import { AppointmentDetailComponent } from './appointment-detail.component';

const ok = (value: unknown = null) => Promise.resolve({ ok: true, value, conflicts: [] });

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const base = appointmentOf({
  id: 'a-1',
  startsAt: new Date(2026, 9, 31, 10, 0).toISOString(),
  planningNote: 'carnet du soir',
});

async function render(appointment: Appointment | null, state: DetailState = 'ready') {
  const store = {
    context: signal({
      patientId: 'p-1',
      preparation: loaded({
        lastSessionAt: null,
        feelings: 0,
        events: 0,
        others: 0,
        followedSince: null,
      }),
      rhythm: null,
    }),
    loadContext: vi.fn(),
    retrySelected: vi.fn(),
    move: vi.fn(() => ok()),
    saveNote: vi.fn(() => ok()),
    cancel: vi.fn(() => ok()),
    confirm: vi.fn(() => ok()),
  };
  TestBed.configureTestingModule({
    imports: [AppointmentDetailComponent],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'fr' },
      { provide: AgendaStore, useValue: store },
    ],
  });
  const toasts = TestBed.inject(ToastService);
  toasts.clear();
  const fixture = TestBed.createComponent(AppointmentDetailComponent);
  document.body.append(fixture.nativeElement);
  fixture.componentRef.setInput('appointment', appointment);
  fixture.componentRef.setInput('state', state);
  const closed = vi.fn();
  const duplicated = vi.fn();
  fixture.componentInstance.closed.subscribe(closed);
  fixture.componentInstance.duplicated.subscribe(duplicated);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label);
  return { fixture, el, store, toasts, closed, duplicated, button };
}

describe('AppointmentDetailComponent (fiche 15 §5)', () => {
  afterEach(() => document.querySelectorAll('pm-appointment-detail').forEach((n) => n.remove()));

  it('planifié : Démarrer inerte « à venir », Déplacer, Dupliquer, Annuler ; pas de Confirmer', async () => {
    const { el, button, store } = await render(base);
    expect(store.loadContext).toHaveBeenCalledWith('p-1');
    const start = el.querySelector('.start')!;
    expect(start.getAttribute('aria-disabled')).toBe('true');
    expect(start.getAttribute('aria-label')).toBe('Démarrer la séance · à venir');
    expect([...el.querySelectorAll('.actions button')].map((b) => text(b))).toEqual([
      'Déplacer',
      'Dupliquer',
      'Annuler',
    ]);
    expect(button('Confirmer le rendez-vous')).toBeUndefined();
    expect(text(el.querySelector('.prepare'))).toBe("Aucune séance clôturée pour l'instant.");
  });

  it('à confirmer : Confirmer visible → POST confirm, toast ; 409 → toast avec le détail', async () => {
    const { fixture, button, store, toasts } = await render({ ...base, status: 'tentative' });
    button('Confirmer le rendez-vous')!.click();
    await settle(fixture);
    expect(store.confirm).toHaveBeenCalledWith('a-1');
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Rendez-vous confirmé.']);

    store.confirm.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        problem: { status: 409, code: 'APPOINTMENT_NOT_ACTIVE', detail: 'Déjà confirmé.' },
      }) as never,
    );
    button('Confirmer le rendez-vous')!.click();
    await settle(fixture);
    expect(toasts.toasts().at(-1)).toMatchObject({ level: 'warning', message: 'Déjà confirmé.' });
  });

  it('annulé : « Annulé le … (motif) », plus ni Déplacer ni Annuler, note en lecture seule', async () => {
    const { el } = await render({
      ...base,
      status: 'cancelled',
      cancelledAt: new Date(2026, 9, 30, 9, 15).toISOString(),
      cancelReason: 'empêchement',
    });
    expect(text(el.querySelector('.kicker'))).toBe('Annulé · cabinet');
    expect(text(el.querySelector('.cancelled'))).toBe('Annulé le 30 oct. à 09:15 (empêchement)');
    expect([...el.querySelectorAll('.actions button')].map((b) => text(b))).toEqual(['Dupliquer']);
    expect(el.querySelector('.start')).toBeNull();
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.readOnly).toBe(true);
  });

  it('Annuler : confirmation sur place, motif facultatif → POST cancel, toast, détail fermé', async () => {
    const { fixture, el, button, store, toasts, closed } = await render(base);
    button('Annuler')!.click();
    await settle(fixture);
    const reason = el.querySelector<HTMLTextAreaElement>('.inline textarea')!;
    reason.value = 'empêchement';
    reason.dispatchEvent(new Event('input'));
    button('Annuler le rendez-vous')!.click();
    await settle(fixture);
    expect(store.cancel).toHaveBeenCalledWith('a-1', 'empêchement');
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Rendez-vous annulé.']);
    expect(closed).toHaveBeenCalledWith(base);
  });

  it('Déplacer et Annuler : focus au premier champ, aria-controls, retour au bouton d’origine', async () => {
    const { fixture, el, button } = await render(base);
    const move = button('Déplacer')!;
    expect(move.getAttribute('aria-expanded')).toBe('false');
    move.click();
    await settle(fixture);
    const form = el.querySelector('.inline')!;
    expect(move.getAttribute('aria-controls')).toBe(form.id);
    expect(document.activeElement?.closest('pm-date-field')).not.toBeNull();
    button('Annuler')!.click();
    await settle(fixture);
    expect(el.querySelector('.inline')).toBeNull();
    expect(document.activeElement).toBe(move);

    const cancel = [...el.querySelectorAll<HTMLButtonElement>('.actions button')].at(-1)!;
    cancel.click();
    await settle(fixture);
    expect(document.activeElement).toBe(el.querySelector('.inline textarea'));
    button('Garder')!.click();
    await settle(fixture);
    expect(document.activeElement).toBe(cancel);
  });

  it('Déplacer : 422 lié aux champs (startsAt → Début)', async () => {
    const { fixture, el, button, store } = await render(base);
    button('Déplacer')!.click();
    await settle(fixture);
    store.move.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        problem: {
          status: 422,
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'durationMin', code: 'OUT_OF_RANGE', message: 'Entre 5 et 600.' }],
        },
      }) as never,
    );
    el.querySelector<HTMLButtonElement>('.inline button[type=submit]')!.click();
    await settle(fixture);
    expect(text(el.querySelector('.inline select + pm-field-errors'))).toBe('Entre 5 et 600.');
    expect(el.querySelector('.inline .error')).toBeNull();
  });

  it('Déplacer : formulaire prérempli (date, heure, durée) → PATCH ; erreur affichée sur place', async () => {
    const { fixture, el, button, store } = await render(base);
    button('Déplacer')!.click();
    await settle(fixture);
    const start = el.querySelector<HTMLInputElement>('.inline input.mono')!;
    expect(start.value).toBe('10:00');
    start.value = '14:30';
    start.dispatchEvent(new Event('input'));
    store.move.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        problem: { status: 409, code: 'APPOINTMENT_NOT_ACTIVE', detail: 'Rendez-vous annulé.' },
      }) as never,
    );
    el.querySelector<HTMLButtonElement>('.inline button[type=submit]')!.click();
    await settle(fixture);
    expect(store.move).toHaveBeenCalledWith('a-1', new Date(2026, 9, 31, 14, 30).toISOString(), 50);
    expect(text(el.querySelector('.inline .error'))).toBe('Rendez-vous annulé.');
  });

  it('note : une relecture ne remplace pas une note en cours de saisie, seulement un champ intact', async () => {
    const { fixture, el } = await render(base);
    const note = el.querySelector<HTMLTextAreaElement>('textarea')!;
    note.dispatchEvent(new Event('focus'));
    note.value = 'brouillon';
    note.dispatchEvent(new Event('input'));
    fixture.componentRef.setInput('appointment', { ...base, planningNote: 'du serveur' });
    await settle(fixture);
    expect(note.value).toBe('brouillon');

    TestBed.resetTestingModule();
    const other = await render(base);
    other.fixture.componentRef.setInput('appointment', { ...base, planningNote: 'du serveur' });
    await settle(other.fixture);
    expect(other.el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('du serveur');
  });

  it('note : enregistrée au blur si elle a changé ; vide → null ; « Enregistré »', async () => {
    const { fixture, el, store } = await render(base);
    const note = el.querySelector<HTMLTextAreaElement>('textarea')!;
    note.dispatchEvent(new Event('blur'));
    expect(store.saveNote).not.toHaveBeenCalled();
    note.value = '  ';
    note.dispatchEvent(new Event('input'));
    note.dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(store.saveNote).toHaveBeenCalledWith('a-1', null);
    expect(text(el.querySelector('.saved'))).toBe('Enregistré');
  });

  it('Dupliquer émet le rendez-vous ; 404 : « Rendez-vous introuvable » dans la carte', async () => {
    const { button, duplicated } = await render(base);
    button('Dupliquer')!.click();
    expect(duplicated).toHaveBeenCalledWith(base);
    TestBed.resetTestingModule();

    const missing = await render(null, 'missing');
    expect(text(missing.el.querySelector('pm-state'))).toContain('Rendez-vous introuvable');
    expect(missing.el.querySelector('.close')).not.toBeNull();
    TestBed.resetTestingModule();

    const failed = await render(null, 'error');
    failed.el.querySelector<HTMLButtonElement>('pm-state button')!.click();
    expect(failed.store.retrySelected).toHaveBeenCalled();
  });
});
