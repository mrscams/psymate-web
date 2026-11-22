import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ToastService } from '../../../shared/ui';
import { loaded } from '../../../shared/util';
import { Appointment } from '../data/agenda.model';
import { AgendaStore, DetailState } from '../data/agenda.store';
import {
  appointmentOf,
  guestAppointmentOf,
  guestOf,
  onlineRequestOf,
  PURGED_GUEST,
} from '../testing/agenda.testing';
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

  it('patient : initiales, nom lié au dossier, âge, bloc Préparer avec ses liens', async () => {
    const { el } = await render({
      ...base,
      patient: {
        id: 'p-1',
        displayName: 'Marie D.',
        birthDate: '1992-03-14',
        age: 34,
        archived: false,
      },
    });
    expect(text(el.querySelector('.avatar'))).toBe('MD');
    const name = el.querySelector<HTMLAnchorElement>('a.name')!;
    expect(text(name)).toBe('Marie D.');
    expect(name.getAttribute('href')).toBe('/patients/p-1');
    expect(text(el.querySelector('.meta'))).toBe('34 ans');
    expect(text(el.querySelector('.block h2'))).toBe('Préparer');
  });

  const guest = guestAppointmentOf({
    id: 'a-2',
    startsAt: new Date(2026, 9, 31, 14, 0).toISOString(),
  });

  it('invité : « Prénom Nom » sans lien ni initiales, ni âge, ni Préparer ; pas de contexte lu', async () => {
    const { el, store } = await render(guest);
    expect(store.loadContext).toHaveBeenCalledWith(null);
    expect(store.loadContext).not.toHaveBeenCalledWith('p-1');
    expect(el.querySelector('.avatar')).toBeNull();
    expect(el.querySelector('a.name')).toBeNull();
    expect(el.querySelector('a[href^="/patients"]')).toBeNull();
    expect(text(el.querySelector('.name'))).toBe('Sara Benali');
    // Le téléphone a quitté la ligne « invité » pour le bloc Contact (fiche 15, demandes en ligne).
    expect(text(el.querySelector('.meta'))).toBe('invité');
    expect([...el.querySelectorAll('.contact dt')].map((dt) => text(dt))).toEqual(['Téléphone']);
    expect(el.querySelector('.contact a')!.getAttribute('href')).toBe('tel:+33612345678');
    expect(text(el.querySelector('.contact a'))).toBe('+33 6 12 34 56 78');
    expect(el.querySelector('.online')).toBeNull();
    expect(el.textContent).not.toContain('Préparer');
    expect(el.textContent).not.toContain('suivi depuis');
    expect(el.textContent).not.toContain('Rythme');
    expect(text(el.querySelector('.kicker'))).toBe('Séance planifiée · cabinet');

    TestBed.resetTestingModule();
    const lastNameOnly = await render({
      ...guest,
      guest: guestOf({ firstName: null, phone: null }),
    });
    expect(text(lastNameOnly.el.querySelector('.name'))).toBe('Benali');
    expect(text(lastNameOnly.el.querySelector('.meta'))).toBe('invité');
    expect(lastNameOnly.el.querySelector('.contact')).toBeNull();
  });

  it('invité : Déplacer et Annuler comme pour un patient, pas de Dupliquer', async () => {
    const { fixture, el, button, store, closed } = await render(guest);
    expect([...el.querySelectorAll('.actions button')].map((b) => text(b))).toEqual([
      'Déplacer',
      'Annuler',
    ]);
    button('Déplacer')!.click();
    await settle(fixture);
    const start = el.querySelector<HTMLInputElement>('.inline input.mono')!;
    expect(start.value).toBe('14:00');
    start.value = '15:30';
    start.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('.inline button[type=submit]')!.click();
    await settle(fixture);
    expect(store.move).toHaveBeenCalledWith('a-2', new Date(2026, 9, 31, 15, 30).toISOString(), 50);

    button('Annuler')!.click();
    await settle(fixture);
    button('Annuler le rendez-vous')!.click();
    await settle(fixture);
    expect(store.cancel).toHaveBeenCalledWith('a-2', undefined);
    expect(closed).toHaveBeenCalledWith(guest);
  });

  it('invité purgé : « Invité purgé », sans téléphone, lien ni Préparer', async () => {
    const { el, store } = await render({ ...guest, guest: PURGED_GUEST, status: 'cancelled' });
    expect(store.loadContext).toHaveBeenCalledWith(null);
    expect(text(el.querySelector('.name'))).toBe('Invité purgé');
    expect(el.querySelector('a.name')).toBeNull();
    expect(el.querySelector('.avatar')).toBeNull();
    expect(el.querySelector('.meta')).toBeNull();
    expect(el.querySelector('.contact')).toBeNull();
    expect(el.textContent).not.toContain('Préparer');
    expect(text(el.querySelector('.kicker'))).toBe('Annulé · cabinet');
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

  describe('demande en ligne (origine online)', () => {
    const request = onlineRequestOf({
      id: 'req-1',
      startsAt: new Date(2026, 10, 26, 10, 0).toISOString(),
      durationMin: 60,
    });
    const withdrawn = Promise.resolve({
      ok: false,
      problem: { status: 409, code: 'APPOINTMENT_NOT_ACTIVE', detail: 'Rendez-vous annulé.' },
    });
    const network = Promise.resolve({ ok: false, problem: { status: 0, code: 'NETWORK_ERROR' } });

    it('en attente : pastille « Demande en ligne », invité, Contact (e-mail puis téléphone), Confirmer et Refuser neutre', async () => {
      const { el, button } = await render(request);
      expect(text(el.querySelector('.kicker'))).toBe('À confirmer · cabinet');
      expect(text(el.querySelector('.online .pill'))).toBe('Demande en ligne');
      expect(el.querySelector('.online svg')!.getAttribute('aria-hidden')).toBe('true');
      expect(text(el.querySelector('.name'))).toBe('Sara Benali');
      expect(text(el.querySelector('.meta'))).toBe('invité');
      expect([...el.querySelectorAll('.contact dt')].map((dt) => text(dt))).toEqual([
        'E-mail',
        'Téléphone',
      ]);
      const links = [...el.querySelectorAll('.contact a')];
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        'mailto:sara.benali@example.test',
        'tel:+33612345678',
      ]);
      expect(button('Confirmer le rendez-vous')).toBeDefined();
      expect([...el.querySelectorAll('.actions button')].map((b) => text(b))).toEqual([
        'Déplacer',
        'Refuser',
      ]);
      // « Refuser » est un bouton neutre : pas le style danger d'« Annuler ».
      expect(button('Refuser')!.classList.contains('danger')).toBe(false);
    });

    it('Refuser : formulaire sur place, phrase sur l’e-mail et le motif ; Garder n’envoie rien ; « Refuser la demande » → cancel, toast, fermeture', async () => {
      const { fixture, el, button, store, toasts, closed } = await render(request);
      button('Refuser')!.click();
      await settle(fixture);
      expect(button('Refuser')!.getAttribute('aria-expanded')).toBe('true');
      expect(text(el.querySelector('.inline h2'))).toBe('Refuser cette demande ?');
      const reason = el.querySelector<HTMLTextAreaElement>('.inline textarea')!;
      expect(document.activeElement).toBe(reason);
      const hint = el.querySelector('.inline .hint')!;
      expect(text(hint)).toBe(
        'Le demandeur sera prévenu par e-mail. Le motif reste dans votre agenda : il ne lui est jamais transmis.',
      );
      expect(reason.getAttribute('aria-describedby')).toBe(hint.id);
      const submit = el.querySelector<HTMLButtonElement>('.inline button[type=submit]')!;
      expect(text(submit)).toBe('Refuser la demande');
      expect(submit.classList.contains('danger-fill')).toBe(true);

      button('Garder')!.click();
      await settle(fixture);
      expect(el.querySelector('.inline')).toBeNull();
      expect(store.cancel).not.toHaveBeenCalled();

      button('Refuser')!.click();
      await settle(fixture);
      el.querySelector<HTMLTextAreaElement>('.inline textarea')!.value = 'créneau réservé';
      el.querySelector('.inline textarea')!.dispatchEvent(new Event('input'));
      store.cancel.mockReturnValueOnce(
        ok({ ...request, status: 'cancelled', cancelReason: 'créneau réservé' }) as never,
      );
      button('Refuser la demande')!.click();
      await settle(fixture);
      expect(store.cancel).toHaveBeenCalledWith('req-1', 'créneau réservé');
      expect(toasts.toasts().map((t) => [t.level, t.message])).toEqual([
        ['success', 'Demande refusée. Le demandeur est prévenu par e-mail.'],
      ]);
      expect(closed).toHaveBeenCalledWith(request);
    });

    it('Confirmer : toast qui dit que le demandeur est prévenu', async () => {
      const { fixture, button, store, toasts, closed } = await render(request);
      button('Confirmer le rendez-vous')!.click();
      await settle(fixture);
      expect(store.confirm).toHaveBeenCalledWith('req-1');
      expect(toasts.toasts().map((t) => t.message)).toEqual([
        'Rendez-vous confirmé. Le demandeur est prévenu par e-mail.',
      ]);
      expect(closed).not.toHaveBeenCalled();
    });

    it('Confirmer → 409 APPOINTMENT_NOT_ACTIVE (le demandeur vient d’annuler) : toast d’avertissement, détail fermé', async () => {
      const { fixture, button, store, toasts, closed } = await render(request);
      store.confirm.mockReturnValueOnce(withdrawn as never);
      button('Confirmer le rendez-vous')!.click();
      await settle(fixture);
      expect(toasts.toasts().map((t) => [t.level, t.message])).toEqual([
        ['warning', "Cette demande n'est plus en attente : elle vient d'être annulée."],
      ]);
      expect(closed).toHaveBeenCalledWith(request);
    });

    it('Refuser une demande déjà annulée par le demandeur : 200 idempotent avec un autre motif → toast neutre sans e-mail, détail fermé', async () => {
      const { fixture, el, button, store, toasts, closed } = await render(request);
      // L'API rend le rendez-vous tel qu'il était : annulé, sans le motif que l'on vient d'envoyer.
      store.cancel.mockReturnValueOnce(
        ok({ ...request, status: 'cancelled', cancelReason: null }) as never,
      );
      button('Refuser')!.click();
      await settle(fixture);
      el.querySelector<HTMLTextAreaElement>('.inline textarea')!.value = 'complet';
      el.querySelector('.inline textarea')!.dispatchEvent(new Event('input'));
      button('Refuser la demande')!.click();
      await settle(fixture);
      expect(store.cancel).toHaveBeenCalledWith('req-1', 'complet');
      expect(toasts.toasts().map((t) => [t.level, t.message])).toEqual([
        ['info', 'Cette demande était déjà annulée.'],
      ]);
      expect(toasts.toasts().some((t) => t.message.includes('e-mail'))).toBe(false);
      expect(closed).toHaveBeenCalledWith(request);
    });

    it('Refuser sans motif : motif renvoyé vide ou null = identique → toast du refus', async () => {
      const { fixture, button, store, toasts } = await render(request);
      store.cancel.mockReturnValueOnce(ok({ ...request, status: 'cancelled' }) as never);
      button('Refuser')!.click();
      await settle(fixture);
      button('Refuser la demande')!.click();
      await settle(fixture);
      expect(store.cancel).toHaveBeenCalledWith('req-1', undefined);
      expect(toasts.toasts().map((t) => t.message)).toEqual([
        'Demande refusée. Le demandeur est prévenu par e-mail.',
      ]);
    });

    it('Annuler un rendez-vous en ligne confirmé déjà annulé par le demandeur : toast neutre, détail fermé', async () => {
      const planned = { ...request, status: 'planned' as const };
      const { fixture, el, button, store, toasts, closed } = await render(planned);
      store.cancel.mockReturnValueOnce(
        ok({ ...planned, status: 'cancelled', cancelReason: null }) as never,
      );
      button('Annuler')!.click();
      await settle(fixture);
      el.querySelector<HTMLTextAreaElement>('.inline textarea')!.value = 'empêchement';
      el.querySelector('.inline textarea')!.dispatchEvent(new Event('input'));
      button('Annuler le rendez-vous')!.click();
      await settle(fixture);
      expect(toasts.toasts().map((t) => [t.level, t.message])).toEqual([
        ['info', 'Ce rendez-vous était déjà annulé.'],
      ]);
      expect(closed).toHaveBeenCalledWith(planned);
    });

    it('échec réseau (status 0) sur Confirmer : message, détail ouvert, action rejouable', async () => {
      const { fixture, button, store, toasts, closed } = await render(request);
      store.confirm.mockReturnValueOnce(network as never);
      button('Confirmer le rendez-vous')!.click();
      await settle(fixture);
      expect(toasts.toasts().map((t) => [t.level, t.message])).toEqual([
        ['warning', "L'action n'a pas abouti. Réessayez dans un instant."],
      ]);
      expect(closed).not.toHaveBeenCalled();
      const again = button('Confirmer le rendez-vous')!;
      expect(again.disabled).toBe(false);
      again.click();
      await settle(fixture);
      expect(store.confirm).toHaveBeenCalledTimes(2);
    });

    it('échec réseau (status 0) sur Refuser : message dans le formulaire, formulaire et motif gardés, action rejouable', async () => {
      const { fixture, el, button, store, toasts, closed } = await render(request);
      store.cancel.mockReturnValueOnce(network as never);
      button('Refuser')!.click();
      await settle(fixture);
      el.querySelector<HTMLTextAreaElement>('.inline textarea')!.value = 'complet';
      el.querySelector('.inline textarea')!.dispatchEvent(new Event('input'));
      button('Refuser la demande')!.click();
      await settle(fixture);
      expect(text(el.querySelector('.inline .error'))).toBe(
        "L'action n'a pas abouti. Réessayez dans un instant.",
      );
      expect(el.querySelector<HTMLTextAreaElement>('.inline textarea')!.value).toBe('complet');
      expect(toasts.toasts()).toEqual([]);
      expect(closed).not.toHaveBeenCalled();
      store.cancel.mockReturnValueOnce(
        ok({ ...request, status: 'cancelled', cancelReason: 'complet' }) as never,
      );
      const submit = button('Refuser la demande')!;
      expect(submit.disabled).toBe(false);
      submit.click();
      await settle(fixture);
      expect(store.cancel).toHaveBeenCalledTimes(2);
      expect(toasts.toasts().map((t) => t.message)).toEqual([
        'Demande refusée. Le demandeur est prévenu par e-mail.',
      ]);
      expect(closed).toHaveBeenCalledWith(request);
    });

    it('confirmée (planned) : mention gardée, « Annuler » rouge ; Annuler et Déplacer disent que le demandeur sera prévenu', async () => {
      const { fixture, el, button } = await render({ ...request, status: 'planned' });
      expect(text(el.querySelector('.kicker'))).toBe('Séance planifiée · cabinet');
      expect(text(el.querySelector('.online .pill'))).toBe('Demande en ligne');
      expect(button('Confirmer le rendez-vous')).toBeUndefined();
      expect([...el.querySelectorAll('.actions button')].map((b) => text(b))).toEqual([
        'Déplacer',
        'Annuler',
      ]);
      expect(button('Annuler')!.classList.contains('danger')).toBe(true);

      button('Annuler')!.click();
      await settle(fixture);
      expect(text(el.querySelector('.inline h2'))).toBe('Annuler ce rendez-vous ?');
      expect(text(el.querySelector('.inline .hint'))).toBe(
        'Le demandeur sera prévenu par e-mail. Le motif ne lui est jamais transmis.',
      );
      expect(button('Annuler le rendez-vous')).toBeDefined();
      button('Garder')!.click();
      await settle(fixture);

      button('Déplacer')!.click();
      await settle(fixture);
      expect(text(el.querySelector('.inline .hint'))).toBe('Le demandeur sera prévenu par e-mail.');
    });

    it('invité sans e-mail (purgé ou rattaché) : aucune phrase sur l’e-mail', async () => {
      const silent = { ...request, status: 'planned' as const, guest: guestOf({ email: null }) };
      const { fixture, el, button } = await render(silent);
      expect(text(el.querySelector('.online .pill'))).toBe('Demande en ligne');
      button('Annuler')!.click();
      await settle(fixture);
      expect(el.querySelector('.inline .hint')).toBeNull();
      button('Garder')!.click();
      await settle(fixture);
      button('Déplacer')!.click();
      await settle(fixture);
      expect(el.querySelector('.inline .hint')).toBeNull();
    });

    it('à confirmer posé par le praticien : ni mention, ni « Refuser », ni phrase ; toast habituel', async () => {
      const own = guestAppointmentOf({
        id: 'own',
        startsAt: new Date(2026, 10, 27, 9, 0).toISOString(),
        status: 'tentative',
        guest: guestOf({ email: 'sara.benali@example.test' }),
      });
      const { fixture, el, button, toasts } = await render(own);
      expect(el.querySelector('.online')).toBeNull();
      expect([...el.querySelectorAll('.actions button')].map((b) => text(b))).toEqual([
        'Déplacer',
        'Annuler',
      ]);
      button('Annuler')!.click();
      await settle(fixture);
      expect(text(el.querySelector('.inline h2'))).toBe('Annuler ce rendez-vous ?');
      expect(el.querySelector('.inline .hint')).toBeNull();
      button('Garder')!.click();
      await settle(fixture);
      button('Confirmer le rendez-vous')!.click();
      await settle(fixture);
      expect(toasts.toasts().map((t) => t.message)).toEqual(['Rendez-vous confirmé.']);
    });
  });
});
