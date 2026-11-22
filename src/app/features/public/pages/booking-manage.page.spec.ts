import { Component, EnvironmentProviders, LOCALE_ID, Provider } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { ConfirmDialogService } from '../../../shared/ui';
import { BookingApi } from '../data/booking.api';
import { PublicAppointment } from '../data/booking.models';
import { appointment, MANAGE_TOKEN } from '../data/booking-link.fixtures';
import { BookingManagePage } from './booking-manage.page';

@Component({ template: 'ailleurs' })
class ElsewhereStub {}

type Mock = Partial<Record<keyof BookingApi, ReturnType<typeof vi.fn>>>;

interface Options {
  api?: Mock;
  /** Réponse du dialogue de confirmation ; absent : le vrai dialogue partagé. */
  confirm?: boolean;
}

async function render({ api = {}, confirm }: Options = {}) {
  const mock = {
    manage: vi.fn().mockResolvedValue(appointment({ status: 'confirmed' })),
    cancel: vi.fn().mockResolvedValue(appointment({ status: 'cancelled' })),
    ...api,
  };
  const dialog = { confirm: vi.fn().mockResolvedValue(confirm) };
  const providers: (Provider | EnvironmentProviders)[] = [
    provideRouter(
      [
        { path: 'rendez-vous/gerer/:token', component: BookingManagePage },
        { path: '**', component: ElsewhereStub },
      ],
      withComponentInputBinding(),
    ),
    { provide: BookingApi, useValue: mock },
    { provide: LOCALE_ID, useValue: 'fr' },
  ];
  if (confirm !== undefined) providers.push({ provide: ConfirmDialogService, useValue: dialog });
  TestBed.configureTestingModule({ providers });
  const harness = await RouterTestingHarness.create(`/rendez-vous/gerer/${MANAGE_TOKEN}`);
  await settle(harness);
  return { harness, el: harness.routeNativeElement as HTMLElement, api: mock, dialog };
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }
}

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const pill = (el: HTMLElement) => text(el.querySelector('.pill'));
const button = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === name);
const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const managed = (patch: Partial<PublicAppointment>) =>
  vi.fn().mockResolvedValue(appointment(patch));

describe('BookingManagePage (fiche 32)', () => {
  afterEach(() => {
    const doc = TestBed.inject(DOCUMENT);
    doc.head.querySelectorAll('[data-pm-public-meta]').forEach((n) => n.remove());
    doc.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('chargement : squelette annoncé « Chargement de votre rendez-vous… », mention d’urgence', async () => {
    const { el } = await render({
      api: { manage: vi.fn().mockReturnValue(new Promise(() => undefined)) },
    });
    expect(el.querySelector('section[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
      'Chargement de votre rendez-vous…',
    );
    expect(el.querySelector('pm-emergency-note')).not.toBeNull();
  });

  it('POST …/manage avec le jeton du chemin ; noindex, referrer no-referrer', async () => {
    const { api } = await render();
    expect(api.manage).toHaveBeenCalledTimes(1);
    expect(api.manage).toHaveBeenCalledWith(MANAGE_TOKEN);
    const doc = TestBed.inject(DOCUMENT);
    expect(doc.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,follow',
    );
    expect(doc.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer',
    );
  });

  it('en attente (pending) : « Votre demande de rendez-vous », pastille, phrase, « Annuler ma demande »', async () => {
    const { el } = await render({ api: { manage: managed({ status: 'pending' }) } });
    expect(text(el.querySelector('h1'))).toBe('Votre demande de rendez-vous');
    expect(TestBed.inject(DOCUMENT).activeElement).toBe(el.querySelector('h1'));
    expect(pill(el)).toBe('En attente de réponse');
    expect(el.querySelector('.pill')?.classList.contains('info')).toBe(true);
    expect(text(el.querySelector('.text'))).toBe('Le praticien vous répondra par e-mail.');
    expect(el.querySelector('.head')?.getAttribute('role')).toBe('status');
    const cancel = button(el, 'Annuler ma demande')!;
    expect(cancel).toBeDefined();
    expect(follows(el.querySelector('pm-emergency-note')!, cancel)).toBe(true);
  });

  it('confirmé : « Votre rendez-vous », pastille « Confirmé », détail, « Annuler mon rendez-vous »', async () => {
    const { el } = await render();
    expect(text(el.querySelector('h1'))).toBe('Votre rendez-vous');
    expect(pill(el)).toBe('Confirmé');
    expect(el.querySelector('.pill')?.classList.contains('success')).toBe(true);
    expect(el.querySelector('.text')).toBeNull();
    expect([...el.querySelectorAll('dt')].map(text)).toEqual([
      'Praticien',
      'Date',
      'Heure',
      'Durée',
      'Modalité',
    ]);
    expect(button(el, 'Annuler mon rendez-vous')).toBeDefined();
  });

  it.each([
    ['visitor', 'Vous avez annulé ce rendez-vous.'],
    ['practitioner', 'Le praticien a annulé ce rendez-vous.'],
    ['expired', "La demande a expiré : le praticien n'a pas répondu à temps."],
  ] as const)(
    'annulé (%s) : pastille « Annulé », cause, « Choisir un autre créneau », pas de bouton d’annulation',
    async (cancelledBy, cause) => {
      const { el } = await render({
        api: { manage: managed({ status: 'cancelled', cancelledBy, canCancel: false }) },
      });
      expect(text(el.querySelector('h1'))).toBe('Votre rendez-vous');
      expect(pill(el)).toBe('Annulé');
      expect(el.querySelector('.pill')?.classList.contains('neutral')).toBe(true);
      expect(text(el.querySelector('.text'))).toBe(cause);
      const rebook = [...el.querySelectorAll('.actions a')][0];
      expect(text(rebook)).toBe('Choisir un autre créneau');
      expect(rebook.getAttribute('href')).toBe('/praticiens/claire-martin/rendez-vous');
      expect(rebook.getAttribute('rel')).toBe('noreferrer');
      expect(el.querySelectorAll('.actions button')).toHaveLength(0);
    },
  );

  it('passé : pastille « Passé », aucune action', async () => {
    const { el } = await render({
      api: { manage: managed({ status: 'past', canCancel: false }) },
    });
    expect(pill(el)).toBe('Passé');
    expect(el.querySelector('.actions')).toBeNull();
  });

  it('confirmé mais déjà commencé (canCancel false) : pas de bouton d’annulation', async () => {
    const { el } = await render({
      api: { manage: managed({ status: 'confirmed', canCancel: false }) },
    });
    expect(pill(el)).toBe('Confirmé');
    expect(el.querySelector('.actions')).toBeNull();
  });

  it('fiche dépubliée (slug null) : détail sans ligne Praticien ni lien vers une fiche', async () => {
    const { el } = await render({
      api: {
        manage: managed({ status: 'confirmed', practitioner: { slug: null, displayName: null } }),
      },
    });
    expect([...el.querySelectorAll('dt')].map(text)).toEqual([
      'Date',
      'Heure',
      'Durée',
      'Modalité',
    ]);
    expect(el.querySelector('a[href*="/praticiens/"]')).toBeNull();
    expect(button(el, 'Annuler mon rendez-vous')).toBeDefined();
  });

  it.each([
    [404, 'BOOKING_TOKEN_INVALID'],
    [422, 'VALIDATION_FAILED'],
  ])(
    'lien inconnu (%i %s) : « Ce lien n’est plus valable », jamais « expiré »',
    async (status, code) => {
      const { el } = await render({ api: { manage: vi.fn().mockRejectedValue({ status, code }) } });
      expect(text(el.querySelector('h1'))).toBe("Ce lien n'est plus valable");
      expect(text(el.querySelector('.text'))).toBe('Utilisez le lien du dernier e-mail reçu.');
      expect(el.querySelector('.head')?.getAttribute('role')).toBe('alert');
      expect(text(el)).not.toMatch(/expiré/);
      const link = el.querySelector('.actions a')!;
      expect(text(link)).toBe("Retrouver le praticien dans l'annuaire");
      expect(link.getAttribute('href')).toBe('/annuaire');
      expect(link.getAttribute('rel')).toBe('noreferrer');
    },
  );

  it('429 : « Votre rendez-vous n’a pas pu être chargé », délai en minutes, « Réessayer »', async () => {
    const { el } = await render({
      api: {
        manage: vi
          .fn()
          .mockRejectedValue({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 90 }),
      },
    });
    expect(text(el.querySelector('h1'))).toBe("Votre rendez-vous n'a pas pu être chargé");
    expect(text(el.querySelector('pm-booking-bar [role="alert"]'))).toBe(
      'Trop de tentatives depuis votre connexion. Réessayez dans 2 min.',
    );
    expect(button(el, 'Réessayer')).toBeDefined();
  });

  it('erreur réseau : message et « Réessayer » qui relit l’état', async () => {
    const manage = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValueOnce(appointment({ status: 'confirmed' }));
    const { el, harness } = await render({ api: { manage } });
    expect(text(el.querySelector('h1'))).toBe("Votre rendez-vous n'a pas pu être chargé");
    expect(text(el.querySelector('.text'))).toBe('Vérifiez votre connexion, puis réessayez.');
    button(el, 'Réessayer')!.click();
    await settle(harness);
    expect(manage).toHaveBeenCalledTimes(2);
    expect(pill(el)).toBe('Confirmé');
  });

  it('dialogue partagé : titre, texte, « Garder » et « Annuler le rendez-vous » (danger), aucun motif ; Garder n’envoie rien', async () => {
    const { el, api, harness } = await render();
    button(el, 'Annuler mon rendez-vous')!.click();
    await settle(harness);
    const box = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!found) throw new Error('dialogue absent');
      return found;
    });
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(text(box.querySelector('h2'))).toBe('Annuler ce rendez-vous ?');
    expect(text(box)).toContain(
      'Le praticien sera prévenu par e-mail. Pour un autre créneau, il faudra refaire une demande.',
    );
    expect(box.querySelector('input, textarea, select')).toBeNull();
    expect(text(box.querySelector('button.cancel'))).toBe('Garder');
    const confirm = box.querySelector('button.confirm')!;
    expect(text(confirm)).toBe('Annuler le rendez-vous');
    expect(confirm.classList.contains('danger')).toBe(true);
    box.querySelector<HTMLButtonElement>('button.cancel')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await settle(harness);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.manage).toHaveBeenCalledTimes(1);
    expect(pill(el)).toBe('Confirmé');
  });

  it('demande en attente : « Annuler cette demande ? » et « Annuler la demande »', async () => {
    const { el, dialog, harness } = await render({
      api: { manage: managed({ status: 'pending' }) },
      confirm: false,
    });
    button(el, 'Annuler ma demande')!.click();
    await settle(harness);
    expect(dialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Annuler cette demande ?',
        confirmLabel: 'Annuler la demande',
        cancelLabel: 'Garder',
        destructive: true,
      }),
    );
  });

  it('confirmer : POST …/manage/cancel puis POST …/manage ; la pastille devient « Annulé », focus sur le h1', async () => {
    const manage = vi
      .fn()
      .mockResolvedValueOnce(appointment({ status: 'confirmed' }))
      .mockResolvedValueOnce(
        appointment({ status: 'cancelled', cancelledBy: 'visitor', canCancel: false }),
      );
    const { el, api, harness } = await render({ api: { manage }, confirm: true });
    button(el, 'Annuler mon rendez-vous')!.click();
    await settle(harness);
    await settle(harness);
    expect(api.cancel).toHaveBeenCalledWith(MANAGE_TOKEN);
    expect(manage).toHaveBeenCalledTimes(2);
    expect(api.cancel.mock.invocationCallOrder[0]).toBeLessThan(manage.mock.invocationCallOrder[1]);
    expect(pill(el)).toBe('Annulé');
    expect(text(el.querySelector('.text'))).toBe('Vous avez annulé ce rendez-vous.');
    expect(button(el, 'Annuler mon rendez-vous')).toBeUndefined();
    expect(TestBed.inject(DOCUMENT).activeElement).toBe(el.querySelector('h1'));
  });

  it('409 APPOINTMENT_NOT_ACTIVE : message role="alert", puis état relu (sans bouton d’annulation)', async () => {
    const manage = vi
      .fn()
      .mockResolvedValueOnce(appointment({ status: 'confirmed' }))
      .mockResolvedValueOnce(appointment({ status: 'confirmed', canCancel: false }));
    const { el, harness } = await render({
      api: {
        manage,
        cancel: vi.fn().mockRejectedValue({ status: 409, code: 'APPOINTMENT_NOT_ACTIVE' }),
      },
      confirm: true,
    });
    button(el, 'Annuler mon rendez-vous')!.click();
    await settle(harness);
    await settle(harness);
    expect(manage).toHaveBeenCalledTimes(2);
    const alert = el.querySelector('.alerts [role="alert"]');
    expect(text(alert)).toBe(
      'Ce rendez-vous a commencé ou est terminé : il ne peut plus être annulé.',
    );
    expect(follows(alert!, el.querySelector('dl')!)).toBe(true);
    expect(pill(el)).toBe('Confirmé');
    expect(el.querySelector('.actions')).toBeNull();
  });

  it('échec réseau ou 5xx de l’annulation : état inchangé, message, « Réessayer » renvoie l’annulation sans dialogue', async () => {
    const cancel = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(appointment({ status: 'cancelled' }));
    const manage = vi
      .fn()
      .mockResolvedValueOnce(appointment({ status: 'confirmed' }))
      .mockResolvedValueOnce(
        appointment({ status: 'cancelled', cancelledBy: 'visitor', canCancel: false }),
      );
    const { el, dialog, harness } = await render({ api: { manage, cancel }, confirm: true });
    button(el, 'Annuler mon rendez-vous')!.click();
    await settle(harness);
    const alert = el.querySelector('.alerts [role="alert"]')!;
    expect(text(alert)).toBe("L'annulation n'a pas pu être enregistrée. Réessayer");
    expect(el.querySelector('.alerts pm-booking-bar .danger')).not.toBeNull();
    expect(pill(el)).toBe('Confirmé');
    expect(button(el, 'Annuler mon rendez-vous')).toBeDefined();
    expect(manage).toHaveBeenCalledTimes(1);
    alert.querySelector('button')!.click();
    await settle(harness);
    await settle(harness);
    expect(dialog.confirm).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(pill(el)).toBe('Annulé');
    expect(el.querySelector('.alerts [role="alert"]')).toBeNull();
  });

  it('429 sur l’annulation : même début de phrase et délai en minutes ; le bouton d’annulation reste', async () => {
    const { el, harness } = await render({
      api: {
        cancel: vi
          .fn()
          .mockRejectedValue({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 45 }),
      },
      confirm: true,
    });
    button(el, 'Annuler mon rendez-vous')!.click();
    await settle(harness);
    expect(text(el.querySelector('.alerts [role="alert"]'))).toBe(
      "L'annulation n'a pas pu être enregistrée. Trop de tentatives depuis votre connexion : réessayez dans 1 min.",
    );
    expect(pill(el)).toBe('Confirmé');
    expect(button(el, 'Annuler mon rendez-vous')).toBeDefined();
  });

  it('404 BOOKING_TOKEN_INVALID sur l’annulation : « Ce lien n’est plus valable », rien n’est annulé', async () => {
    const { el, harness } = await render({
      api: {
        cancel: vi.fn().mockRejectedValue({ status: 404, code: 'BOOKING_TOKEN_INVALID' }),
      },
      confirm: true,
    });
    button(el, 'Annuler mon rendez-vous')!.click();
    await settle(harness);
    expect(text(el.querySelector('h1'))).toBe("Ce lien n'est plus valable");
    expect(text(el.querySelector('.text'))).toBe(
      "Votre rendez-vous n'a pas été annulé depuis cette page. Utilisez le lien du dernier e-mail reçu.",
    );
    expect(el.querySelector('dl')).toBeNull();
    expect(text(el.querySelector('.actions a'))).toBe("Retrouver le praticien dans l'annuaire");
  });

  it('ni modification du rendez-vous, ni motif d’annulation', async () => {
    const { el } = await render();
    expect(text(el)).not.toMatch(/modifier|déplacer|motif/i);
    expect(el.querySelector('input, textarea, select')).toBeNull();
  });
});
