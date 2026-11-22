import { Component, LOCALE_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { BookingApi } from '../data/booking.api';
import { appointment, MANAGE_TOKEN, VERIFY_TOKEN } from '../data/booking-link.fixtures';
import { appointmentDetail } from '../ui/booking-link-format';
import { BookingVerifyPage } from './booking-verify.page';

@Component({ template: 'ailleurs' })
class ElsewhereStub {}

type Mock = Partial<Record<keyof BookingApi, ReturnType<typeof vi.fn>>>;

async function render(api: Mock = {}) {
  const mock = {
    verify: vi.fn().mockResolvedValue(appointment({ manageToken: MANAGE_TOKEN })),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'rendez-vous/confirmer/:token', component: BookingVerifyPage },
          { path: '**', component: ElsewhereStub },
        ],
        withComponentInputBinding(),
      ),
      { provide: BookingApi, useValue: mock },
      { provide: LOCALE_ID, useValue: 'fr' },
    ],
  });
  const harness = await RouterTestingHarness.create(`/rendez-vous/confirmer/${VERIFY_TOKEN}`);
  await settle(harness);
  return { harness, el: harness.routeNativeElement as HTMLElement, api: mock };
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }
}

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const head = (el: HTMLElement) => el.querySelector('.head');
const actions = (el: HTMLElement) => [...el.querySelectorAll('.actions a, .actions button')];
const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('BookingVerifyPage (fiche 32)', () => {
  afterEach(() => {
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll('[data-pm-public-meta]')
      .forEach((n) => n.remove());
  });

  it('vérification en cours : squelette annoncé « Vérification de votre adresse… », mention d’urgence', async () => {
    const { el } = await render({ verify: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    expect(el.querySelector('section[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
      'Vérification de votre adresse…',
    );
    expect(text(el.querySelector('.sr-only'))).toBe('Vérification de votre adresse…');
    expect(el.querySelector('pm-emergency-note')).not.toBeNull();
    expect(el.querySelector('h1')).toBeNull();
  });

  it('le jeton du chemin part une seule fois, dans le corps (service), sans geste ; noindex et referrer no-referrer', async () => {
    const { api } = await render();
    expect(api.verify).toHaveBeenCalledTimes(1);
    expect(api.verify).toHaveBeenCalledWith(VERIFY_TOKEN);
    const doc = TestBed.inject(DOCUMENT);
    expect(doc.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,follow',
    );
    expect(doc.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer',
    );
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(VERIFY_TOKEN);
  });

  it('la balise referrer disparaît une fois la page quittée', async () => {
    const { harness } = await render();
    const doc = TestBed.inject(DOCUMENT);
    expect(doc.head.querySelector('meta[name="referrer"]')).not.toBeNull();
    await harness.navigateByUrl('/annuaire');
    expect(doc.head.querySelector('meta[name="referrer"]')).toBeNull();
    expect(doc.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('politique strict-origin du document (index.html) : remplacée par no-referrer sur la page, rétablie en la quittant', async () => {
    // Le document de TestBed est le document global : la balise d'index.html y est posée avant.
    const doc = document;
    const base = doc.createElement('meta');
    base.setAttribute('name', 'referrer');
    base.setAttribute('content', 'strict-origin');
    doc.head.appendChild(base);
    try {
      const { harness } = await render();
      const tags = () =>
        [...doc.head.querySelectorAll('meta[name="referrer"]')].map((n) =>
          n.getAttribute('content'),
        );
      expect(tags()).toEqual(['no-referrer']);
      await harness.navigateByUrl('/annuaire');
      expect(tags()).toEqual(['strict-origin']);
    } finally {
      doc.head.querySelectorAll('meta[name="referrer"]').forEach((n) => n.remove());
    }
  });

  it('demande transmise (pending) : titre, phrase du mode manuel, détail, urgence puis « Gérer ma demande » ; focus sur le h1', async () => {
    const { el } = await render();
    const title = el.querySelector('h1')!;
    expect(text(title)).toBe('Votre demande est transmise');
    expect(TestBed.inject(DOCUMENT).activeElement).toBe(title);
    expect(head(el)?.getAttribute('role')).toBe('status');
    expect(text(el.querySelector('.text'))).toBe(
      "Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous.",
    );
    expect(el.querySelector('pm-booking-link-badge')?.classList.contains('wait')).toBe(true);
    const terms = [...el.querySelectorAll('dt')].map(text);
    expect(terms).toEqual(['Praticien', 'Date', 'Heure', 'Durée', 'Modalité']);
    const detail = appointmentDetail(appointment(), 'fr');
    expect([...el.querySelectorAll('dd')].map(text)).toEqual([
      'Claire Martin',
      detail.day,
      `${detail.hours}${detail.zone}`,
      '60 min',
      'Au cabinet',
    ]);
    expect(text(el.querySelector('dd .tz'))).toMatch(/^heure de votre appareil, .+/);
    const practitioner = el.querySelector('dd a')!;
    expect(practitioner.getAttribute('href')).toBe('/praticiens/claire-martin');
    expect(practitioner.getAttribute('rel')).toBe('noreferrer');
    const [manage] = actions(el);
    expect(text(manage)).toBe('Gérer ma demande');
    expect(manage.getAttribute('href')).toBe(`/rendez-vous/gerer/${MANAGE_TOKEN}`);
    expect(manage.getAttribute('rel')).toBe('noreferrer');
    expect(follows(el.querySelector('pm-emergency-note')!, manage)).toBe(true);
    expect(follows(el.querySelector('dl')!, el.querySelector('pm-emergency-note')!)).toBe(true);
  });

  it('rendez-vous confirmé (confirmed) : « Votre rendez-vous est confirmé » et « Gérer mon rendez-vous »', async () => {
    const { el } = await render({
      verify: vi
        .fn()
        .mockResolvedValue(appointment({ status: 'confirmed', manageToken: MANAGE_TOKEN })),
    });
    expect(text(el.querySelector('h1'))).toBe('Votre rendez-vous est confirmé');
    expect(text(el.querySelector('.text'))).toBe(
      'Vous recevez un e-mail de confirmation avec le lien pour le gérer.',
    );
    expect(el.querySelector('pm-booking-link-badge')?.classList.contains('ok')).toBe(true);
    expect(actions(el).map(text)).toEqual(['Gérer mon rendez-vous']);
  });

  it.each(['pending', 'confirmed'] as const)(
    'page rechargée (%s, manageToken null) : même état, phrase de repli, aucun lien de gestion',
    async (status) => {
      const { el } = await render({
        verify: vi.fn().mockResolvedValue(appointment({ status, manageToken: null })),
      });
      expect(text(el.querySelector('.secondary'))).toBe(
        "Pour suivre ou annuler votre demande, utilisez le lien de l'e-mail que nous vous avons envoyé.",
      );
      expect(el.querySelector('.actions')).toBeNull();
      expect(el.querySelector('a[href*="/rendez-vous/gerer/"]')).toBeNull();
    },
  );

  it.each([
    ['visitor', 'Vous avez annulé ce rendez-vous.'],
    ['practitioner', 'Le praticien a annulé ce rendez-vous.'],
    ['expired', "La demande a expiré : le praticien n'a pas répondu à temps."],
  ] as const)(
    'lien rouvert sur un rendez-vous annulé (%s) : cet état, pas « lien expiré »',
    async (cancelledBy, cause) => {
      const { el } = await render({
        verify: vi
          .fn()
          .mockResolvedValue(appointment({ status: 'cancelled', cancelledBy, canCancel: false })),
      });
      expect(text(el.querySelector('h1'))).toBe('Ce rendez-vous est annulé');
      expect(text(el.querySelector('.text'))).toBe(cause);
      expect(text(el)).not.toContain("Ce lien n'est plus valable");
      expect(el.querySelector('pm-booking-link-badge')?.classList.contains('muted')).toBe(true);
      const [rebook] = actions(el);
      expect(text(rebook)).toBe('Choisir un autre créneau');
      expect(rebook.getAttribute('href')).toBe('/praticiens/claire-martin/rendez-vous');
      expect(rebook.getAttribute('rel')).toBe('noreferrer');
    },
  );

  it('lien rouvert sur un rendez-vous passé : « Ce rendez-vous est passé », détail, aucune action', async () => {
    const { el } = await render({
      verify: vi.fn().mockResolvedValue(appointment({ status: 'past', canCancel: false })),
    });
    expect(text(el.querySelector('h1'))).toBe('Ce rendez-vous est passé');
    expect(el.querySelector('.text')).toBeNull();
    expect(el.querySelector('dl')).not.toBeNull();
    expect(el.querySelector('.actions')).toBeNull();
  });

  it('fiche dépubliée (slug null) : ni ligne Praticien, ni lien vers une fiche, ni « Choisir un autre créneau »', async () => {
    const { el } = await render({
      verify: vi.fn().mockResolvedValue(
        appointment({
          status: 'cancelled',
          cancelledBy: 'practitioner',
          practitioner: { slug: null, displayName: null },
        }),
      ),
    });
    expect([...el.querySelectorAll('dt')].map(text)).toEqual([
      'Date',
      'Heure',
      'Durée',
      'Modalité',
    ]);
    expect(el.querySelector('a[href*="/praticiens/"]')).toBeNull();
    expect(text(el)).not.toContain('Choisir un autre créneau');
  });

  const annuaire = "Retrouver le praticien dans l'annuaire";
  it.each([
    [
      410,
      'BOOKING_TOKEN_EXPIRED',
      "Ce lien n'est plus valable",
      "Le lien de vérification est valable 30 minutes : celui-ci a expiré. Aucune demande n'a été transmise au praticien.",
      annuaire,
    ],
    [
      404,
      'BOOKING_TOKEN_INVALID',
      "Ce lien n'est plus valable",
      'Nous ne reconnaissons pas ce lien : il est peut-être incomplet, ou la demande a été effacée.',
      annuaire,
    ],
    [
      422,
      'VALIDATION_FAILED',
      "Ce lien n'est plus valable",
      'Nous ne reconnaissons pas ce lien : il est peut-être incomplet, ou la demande a été effacée.',
      annuaire,
    ],
    [
      409,
      'SLOT_TAKEN',
      "Ce créneau n'est plus disponible",
      "Aucun rendez-vous n'a été créé. Choisissez un autre créneau sur la page du praticien.",
      annuaire,
    ],
    [
      409,
      'BOOKING_ALREADY_ACTIVE',
      'Vous avez déjà un rendez-vous à venir avec ce praticien',
      "Aucune nouvelle demande n'a été créée. Pour suivre ou annuler votre rendez-vous, utilisez le lien du dernier e-mail reçu.",
      null,
    ],
    [
      404,
      'BOOKING_NOT_AVAILABLE',
      'Ce praticien ne propose plus la prise de rendez-vous en ligne',
      "Aucun rendez-vous n'a été créé.",
      annuaire,
    ],
    [
      0,
      'NETWORK_ERROR',
      "La vérification n'a pas abouti",
      'Vérifiez votre connexion, puis réessayez : votre lien reste valable.',
      'Réessayer',
    ],
    [
      503,
      'INTERNAL_ERROR',
      "La vérification n'a pas abouti",
      'Vérifiez votre connexion, puis réessayez : votre lien reste valable.',
      'Réessayer',
    ],
  ])('verify %i %s : sa vue, role="alert", urgence avant l’action', async (...args) => {
    const [status, code, title, message, action] = args;
    const { el } = await render({ verify: vi.fn().mockRejectedValue({ status, code }) });
    expect(text(el.querySelector('h1'))).toBe(title);
    expect(TestBed.inject(DOCUMENT).activeElement).toBe(el.querySelector('h1'));
    expect(text(el.querySelector('.text'))).toBe(message);
    expect(head(el)?.getAttribute('role')).toBe('alert');
    expect(el.querySelector('dl')).toBeNull();
    // Jamais rouge : avertissement ou information.
    const badge = el.querySelector('pm-booking-link-badge')!;
    expect(badge.classList.contains('warn') || badge.classList.contains('wait')).toBe(true);
    if (action === null) {
      expect(el.querySelector('.actions')).toBeNull();
      return;
    }
    const [link] = actions(el);
    expect(text(link)).toBe(action);
    if (action === annuaire) {
      expect(link.getAttribute('href')).toBe('/annuaire');
      expect(link.getAttribute('rel')).toBe('noreferrer');
    }
    expect(follows(el.querySelector('pm-emergency-note')!, link)).toBe(true);
  });

  it('429 : « La vérification n’a pas abouti », avertissement avec le délai arrondi à la minute, « Réessayer »', async () => {
    const { el } = await render({
      verify: vi
        .fn()
        .mockRejectedValue({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 61 }),
    });
    expect(text(el.querySelector('h1'))).toBe("La vérification n'a pas abouti");
    const warning = el.querySelector('pm-booking-bar [role="alert"]');
    expect(text(warning)).toBe('Trop de tentatives depuis votre connexion. Réessayez dans 2 min.');
    expect(actions(el).map(text)).toEqual(['Réessayer']);
  });

  it('« Réessayer » renvoie le même appel, puis affiche la réponse', async () => {
    const verify = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValueOnce(appointment({ status: 'confirmed', manageToken: MANAGE_TOKEN }));
    const { el, harness } = await render({ verify });
    (actions(el)[0] as HTMLButtonElement).click();
    await settle(harness);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[1][0]).toBe(VERIFY_TOKEN);
    expect(text(el.querySelector('h1'))).toBe('Votre rendez-vous est confirmé');
  });

  it('aucune page ne propose de modifier le rendez-vous', async () => {
    const { el } = await render();
    expect(text(el)).not.toMatch(/modifier|déplacer/i);
  });
});
