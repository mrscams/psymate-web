import { Component, LOCALE_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { BookingApi } from '../data/booking.api';
import { CLAIRE_BOOKING, KARIM_BOOKING, NO_SLOTS, SLOTS } from '../data/booking.fixtures';
import { BookingRequest } from '../data/booking.models';
import { BookingPage } from './booking.page';

@Component({ template: 'fiche' })
class PractitionerStub {}

type Mock = Record<keyof BookingApi, ReturnType<typeof vi.fn>>;

async function render(api: Partial<Mock> = {}) {
  const mock: Mock = {
    settings: vi.fn().mockResolvedValue(CLAIRE_BOOKING),
    slots: vi.fn().mockResolvedValue(SLOTS),
    request: vi.fn().mockResolvedValue(undefined),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'praticiens/:slug/rendez-vous', component: BookingPage },
          { path: 'praticiens/:slug', component: PractitionerStub },
        ],
        withComponentInputBinding(),
      ),
      { provide: BookingApi, useValue: mock },
      { provide: LOCALE_ID, useValue: 'fr' },
    ],
  });
  const harness = await RouterTestingHarness.create('/praticiens/claire-martin/rendez-vous');
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
const buttons = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll('button')].filter((b) => text(b) === name);
const slotButtons = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('button.slot')];

function type(el: HTMLElement, id: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function fill(el: HTMLElement, harness: RouterTestingHarness): Promise<void> {
  type(el, 'field-firstName', 'Sara');
  type(el, 'field-lastName', 'Benali');
  type(el, 'field-email', 'sara.benali@example.test');
  el.querySelector<HTMLInputElement>('#field-modality input[value="video"]')?.click();
  el.querySelector<HTMLInputElement>('#field-consent input[type="checkbox"]')?.click();
  await settle(harness);
}

/** L'API ignore un envoi en moins de 3 s : on avance l'horloge (Date seulement) avant d'envoyer. */
async function submit(el: HTMLElement, harness: RouterTestingHarness): Promise<void> {
  vi.setSystemTime(Date.now() + 10_000);
  el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  await settle(harness);
  await settle(harness);
}

const sentBody = (api: Mock, call = 0) => api.request.mock.calls[call][1] as BookingRequest;

describe('BookingPage (fiche 31)', () => {
  // Horloge seule (pas les minuteries) : lundi 23 novembre 2026, 9 h à Paris.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll('[data-pm-public-meta]')
      .forEach((n) => n.remove());
  });

  it('chargement : squelette de la carte d’en-tête et des créneaux, aria-busy', async () => {
    const { el } = await render({
      settings: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    expect(el.querySelector('.booking')?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.head-card.skeleton')).not.toBeNull();
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('pm-emergency-note')).not.toBeNull();
  });

  it('étape 1 : en-tête, phrase du mode manuel, créneaux de l’API groupés par jour, fuseau nommé, noindex', async () => {
    const { el, api } = await render();
    expect(api.settings).toHaveBeenCalledWith('claire-martin');
    expect(text(el.querySelector('h1'))).toBe('Prendre rendez-vous avec Claire Martin');
    expect([...el.querySelectorAll('.facts li')].map(text)).toEqual([
      'Créneaux de 60 min',
      'Au cabinet ou en visio',
    ]);
    expect(text(el.querySelector('.head-card pm-booking-bar'))).toBe(
      "Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous.",
    );
    expect([...el.querySelectorAll('.crumbs li')].map(text)).toEqual([
      'Annuaire',
      'Claire Martin',
      'Prendre rendez-vous',
    ]);
    expect(text(el.querySelector('.step-kicker'))).toBe('Étape 1 sur 2');
    expect(text(el.querySelector('.period-text strong'))).toBe(
      'Du lundi 23 novembre au dimanche 6 décembre 2026',
    );
    expect(text(el.querySelector('.period-text span'))).toMatch(
      /^Heures du praticien : Europe\/Paris \(heure normale d.Europe centrale\)$/,
    );
    // Exactement les créneaux reçus, dans l'ordre, groupés par jour, à l'heure de Paris.
    expect([...el.querySelectorAll('.day h3')].map(text)).toEqual([
      'mardi 24 novembre',
      'mercredi 25 novembre',
    ]);
    expect(slotButtons(el).map(text)).toEqual(['16:00', '17:00', '09:00']);
    expect(slotButtons(el)[0].getAttribute('aria-label')).toBe('mardi 24 novembre, 16:00 à 17:00');
    const head = TestBed.inject(DOCUMENT).head;
    expect(head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,follow',
    );
  });

  it('heures dans le fuseau du praticien, quel que soit celui du navigateur', async () => {
    const { el } = await render({
      settings: vi.fn().mockResolvedValue({ ...CLAIRE_BOOKING, timezone: 'America/Montreal' }),
      slots: vi.fn().mockResolvedValue({ ...SLOTS, timezone: 'America/Montreal' }),
    });
    expect(slotButtons(el).map(text)).toEqual(['10:00', '11:00', '03:00']);
    expect(text(el.querySelector('.period-text span'))).toContain('America/Montreal');
  });

  it('la mention d’urgence (112, 3114) précède les créneaux dans le document', async () => {
    const { el } = await render();
    const note = el.querySelector('pm-emergency-note')!;
    expect(text(note)).toContain("PsyMate n'est pas un service d'urgence.");
    expect(note.querySelector('a[href="tel:112"]')).not.toBeNull();
    expect(note.querySelector('a[href="tel:3114"]')).not.toBeNull();
    expect(note.querySelector('[role="note"]')).not.toBeNull();
    expect(
      note.compareDocumentPosition(slotButtons(el)[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('fenêtres : « précédentes » inactif d’abord ; « suivantes » avance de 14 jours puis s’arrête à l’horizon', async () => {
    const { el, api, harness } = await render();
    const [previous] = buttons(el, 'Semaines précédentes');
    const [next] = buttons(el, 'Semaines suivantes');
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    const firstWindow = api.slots.mock.calls[0][1];
    next.click();
    await settle(harness);
    expect(api.slots.mock.calls[1][1]).toEqual({
      from: addDays(firstWindow.from, 14),
      to: addDays(firstWindow.from, 27),
    });
    expect(buttons(el, 'Semaines précédentes')[0].disabled).toBe(false);
    buttons(el, 'Semaines suivantes')[0].click();
    await settle(harness);
    // Horizon 28 : la fenêtre suivante commencerait à J+42.
    expect(buttons(el, 'Semaines suivantes')[0].disabled).toBe(true);
    buttons(el, 'Semaines précédentes')[0].click();
    await settle(harness);
    expect(api.slots.mock.calls[3][1]).toEqual(api.slots.mock.calls[1][1]);
  });

  it('aucun créneau : message et lien « Prendre contact » vers la fiche #contact', async () => {
    const { el } = await render({ slots: vi.fn().mockResolvedValue(NO_SLOTS) });
    expect(text(el)).toContain("Aucun créneau disponible pour l'instant");
    expect(text(el)).toContain("Vous pouvez écrire au praticien pour convenir d'un rendez-vous.");
    const link = [...el.querySelectorAll('a')].find((a) => text(a) === 'Prendre contact');
    expect(link?.getAttribute('href')).toBe('/praticiens/claire-martin#contact');
    expect(buttons(el, 'Semaines suivantes')).toHaveLength(1);
  });

  it('erreur de chargement des créneaux : message et « Réessayer » qui relit la fenêtre', async () => {
    const slots = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(SLOTS);
    const { el, harness } = await render({ slots });
    expect(text(el.querySelector('pm-state [role="alert"]'))).toContain(
      "Les créneaux n'ont pas pu être chargés.",
    );
    expect(text(el)).toContain('Vérifiez votre connexion, puis réessayez.');
    buttons(el, 'Réessayer')[0].click();
    await settle(harness);
    expect(slots.mock.calls[1][1]).toEqual(slots.mock.calls[0][1]);
    expect(slotButtons(el)).toHaveLength(3);
  });

  it('429 sur les créneaux : message avec le délai en minutes et « Réessayer »', async () => {
    const { el } = await render({
      slots: vi
        .fn()
        .mockRejectedValue({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 61 }),
    });
    const alert = el.querySelector('pm-state [role="alert"]');
    expect(text(alert)).toContain("Les créneaux n'ont pas pu être chargés.");
    expect(text(alert)).toContain('Trop de requêtes depuis votre connexion. Réessayez dans 2 min.');
    expect(buttons(el, 'Réessayer')).toHaveLength(1);
  });

  it('429 sur les réglages : titre h1 « La prise de rendez-vous n’a pas pu être chargée. », sans carte d’en-tête', async () => {
    const { el } = await render({
      settings: vi
        .fn()
        .mockRejectedValue({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 30 }),
    });
    expect(text(el.querySelector('h1'))).toBe("La prise de rendez-vous n'a pas pu être chargée.");
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('.head-card')).toBeNull();
    expect(text(el)).toContain('Réessayez dans 1 min.');
    expect([...el.querySelectorAll('.crumbs li')].map(text)).toEqual([
      'Annuaire',
      'Prendre rendez-vous',
    ]);
    const note = el.querySelector('pm-emergency-note')!;
    const retry = buttons(el, 'Réessayer')[0];
    expect(note.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('404 BOOKING_NOT_AVAILABLE : redirection vers la fiche du praticien', async () => {
    const { harness } = await render({
      settings: vi.fn().mockRejectedValue({ status: 404, code: 'BOOKING_NOT_AVAILABLE' }),
    });
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/praticiens/claire-martin');
  });

  it('choisir un créneau : étape 2, focus sur « Vos coordonnées », rappel, aucun champ libre', async () => {
    const { el, harness } = await render();
    slotButtons(el)[0].click();
    await settle(harness);
    const title = el.querySelector('#booking-step-details');
    expect(text(title)).toBe('Vos coordonnées');
    expect(TestBed.inject(DOCUMENT).activeElement).toBe(title);
    expect(text(el.querySelector('.recap strong'))).toBe('mardi 24 novembre 2026 · 16:00 – 17:00');
    expect(buttons(el, 'Changer de créneau')).toHaveLength(1);
    // Prénom, nom, e-mail, téléphone, pot de miel ; deux modalités ; consentement ; pas de zone libre.
    expect(el.querySelectorAll('form input[type="text"], form input:not([type])').length).toBe(3);
    expect(el.querySelectorAll('form input[type="email"]').length).toBe(1);
    expect(el.querySelectorAll('form input[type="tel"]').length).toBe(1);
    expect(el.querySelectorAll('form input[type="radio"]').length).toBe(2);
    expect(el.querySelectorAll('form input[type="checkbox"]').length).toBe(1);
    expect(el.querySelectorAll('form textarea, form select, form mat-select').length).toBe(0);
    expect(text(el.querySelector('form'))).not.toMatch(/motif/i);
    expect(text(el.querySelector('form pm-booking-bar'))).toContain(
      "Votre demande n'est pas encore un rendez-vous.",
    );
    expect(text(el.querySelector('button[type="submit"]'))).toBe('Envoyer ma demande');
    // La mention d'urgence précède le bouton d'envoi.
    expect(
      el
        .querySelector('pm-emergency-note')!
        .compareDocumentPosition(el.querySelector('button[type="submit"]')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('forme invalide : aucune requête, messages sous les champs, focus sur le premier champ en erreur', async () => {
    const { el, api, harness } = await render();
    slotButtons(el)[0].click();
    await settle(harness);
    type(el, 'field-firstName', 'Sara');
    type(el, 'field-email', 'sara.benali');
    await submit(el, harness);
    expect(api.request).not.toHaveBeenCalled();
    expect(TestBed.inject(DOCUMENT).activeElement?.id).toBe('field-lastName');
    const page = text(el);
    expect(page).toContain('Ce champ est obligatoire.');
    expect(page).toContain('Adresse e-mail invalide.');
    expect(page).toContain('Choisissez une modalité.');
    expect(page).toContain('Cochez cette case pour envoyer votre demande.');
  });

  it('consentement seul manquant : aucune requête, focus sur la case', async () => {
    const { el, api, harness } = await render();
    slotButtons(el)[0].click();
    await settle(harness);
    await fill(el, harness);
    el.querySelector<HTMLInputElement>('#field-consent input[type="checkbox"]')?.click();
    await settle(harness);
    await submit(el, harness);
    expect(api.request).not.toHaveBeenCalled();
    expect(TestBed.inject(DOCUMENT).activeElement?.getAttribute('type')).toBe('checkbox');
  });

  it('envoi complet : corps du contrat, écran d’attente, focus sur son titre, ni nom ni adresse', async () => {
    const { el, api, harness } = await render();
    slotButtons(el)[1].click();
    await settle(harness);
    await fill(el, harness);
    await submit(el, harness);
    expect(api.request).toHaveBeenCalledTimes(1);
    const body = sentBody(api);
    expect(api.request.mock.calls[0][0]).toBe('claire-martin');
    expect(body).toMatchObject({
      startsAt: SLOTS.slots[1].startsAt,
      modality: 'video',
      firstName: 'Sara',
      lastName: 'Benali',
      email: 'sara.benali@example.test',
      phone: '',
      consent: true,
      website: '',
      locale: 'fr',
    });
    expect(Date.parse(body.formShownAt)).not.toBeNaN();
    const title = el.querySelector('h1');
    expect(text(title)).toBe('Consultez votre boîte mail');
    expect(TestBed.inject(DOCUMENT).activeElement).toBe(title);
    expect(text(el)).toContain('Le lien est valable 30 minutes.');
    expect(text(el.querySelector('.recap strong'))).toBe(
      'mardi 24 novembre 2026 · 17:00 – 18:00 · en visio',
    );
    expect(text(el)).not.toContain('Sara');
    expect(text(el)).not.toContain('sara.benali@example.test');
    const back = [...el.querySelectorAll('a')].find(
      (a) => text(a) === 'Revenir à la fiche de Claire Martin',
    );
    expect(back?.getAttribute('href')).toBe('/praticiens/claire-martin');
    expect(
      el.querySelector('pm-emergency-note')!.compareDocumentPosition(back!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('409 puis « Changer de créneau » : étape 1, alerte, créneaux relus, saisie et formShownAt conservés', async () => {
    const fresh = { ...SLOTS, slots: SLOTS.slots.slice(1) };
    const slots = vi.fn().mockResolvedValueOnce(SLOTS).mockResolvedValue(fresh);
    const request = vi
      .fn()
      .mockRejectedValueOnce({ status: 409, code: 'SLOT_NOT_AVAILABLE' })
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(undefined);
    const { el, api, harness } = await render({ slots, request });
    slotButtons(el)[0].click();
    await settle(harness);
    await fill(el, harness);
    await submit(el, harness);

    // 409 : retour à l'étape 1, avertissement, nouveau GET, créneau perdu absent.
    expect(text(el.querySelector('#booking-step-slots'))).toBe('Choisissez un créneau');
    expect(text(el.querySelector('[role="alert"]'))).toBe(
      "Ce créneau n'est plus disponible. Choisissez-en un autre : vos coordonnées sont conservées.",
    );
    expect(slots).toHaveBeenCalledTimes(2);
    expect(slotButtons(el).map(text)).toEqual(['17:00', '09:00']);

    // Saisie retrouvée à l'étape 2.
    slotButtons(el)[0].click();
    await settle(harness);
    expect(el.querySelector<HTMLInputElement>('#field-firstName')?.value).toBe('Sara');
    expect(el.querySelector<HTMLInputElement>('#field-email')?.value).toBe(
      'sara.benali@example.test',
    );
    await submit(el, harness);
    expect(text(el)).toContain(
      "La demande n'a pas pu être envoyée. Votre saisie est conservée : réessayez dans un instant.",
    );

    // « Changer de créneau », puis un autre créneau et un nouvel envoi.
    buttons(el, 'Changer de créneau')[0].click();
    await settle(harness);
    expect(TestBed.inject(DOCUMENT).activeElement?.id).toBe('booking-step-slots');
    slotButtons(el)[1].click();
    await settle(harness);
    await submit(el, harness);

    expect(api.request).toHaveBeenCalledTimes(3);
    const shown = [0, 1, 2].map((call) => sentBody(api, call).formShownAt);
    expect(new Set(shown).size).toBe(1);
    expect(sentBody(api, 2).startsAt).toBe(fresh.slots[1].startsAt);
  });

  it('422 sur email : message sous le champ et résumé en tête qui reçoit le focus', async () => {
    const { el, harness } = await render({
      request: vi.fn().mockRejectedValue({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [
          {
            field: 'email',
            code: 'INVALID_FORMAT',
            message: 'E-mail invalide : une adresse de la forme nom@domaine.fr est attendue.',
          },
        ],
      }),
    });
    slotButtons(el)[0].click();
    await settle(harness);
    await fill(el, harness);
    await submit(el, harness);
    const summary = el.querySelector('pm-form-errors [role="alert"]');
    expect(text(summary)).toContain('1 champ à corriger.');
    expect(text(summary)).toContain('E-mail');
    expect(TestBed.inject(DOCUMENT).activeElement).toBe(summary);
    const field = el.querySelector('#field-email')!.closest('mat-form-field');
    expect(text(field)).toContain(
      'E-mail invalide : une adresse de la forme nom@domaine.fr est attendue.',
    );
  });

  it('429 à l’envoi : message avec le délai, saisie conservée', async () => {
    const { el, harness } = await render({
      request: vi
        .fn()
        .mockRejectedValue({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 2500 }),
    });
    slotButtons(el)[0].click();
    await settle(harness);
    await fill(el, harness);
    await submit(el, harness);
    expect(text(el.querySelector('form [role="alert"]'))).toBe(
      'Trop de demandes envoyées depuis votre connexion. Réessayez dans 42 min.',
    );
    expect(el.querySelector<HTMLInputElement>('#field-lastName')?.value).toBe('Benali');
  });

  it('mode automatique, une seule modalité : phrase auto, « Réserver ce créneau », modalité envoyée', async () => {
    const { el, api, harness } = await render({
      settings: vi.fn().mockResolvedValue(KARIM_BOOKING),
    });
    expect(text(el.querySelector('.head-card pm-booking-bar'))).toBe(
      'Votre rendez-vous sera confirmé dès que vous aurez validé votre adresse e-mail.',
    );
    expect([...el.querySelectorAll('.facts li')].map(text)).toEqual([
      'Créneaux de 45 min',
      'Au cabinet',
    ]);
    slotButtons(el)[0].click();
    await settle(harness);
    expect(el.querySelectorAll('form input[type="radio"]').length).toBe(0);
    expect(text(el.querySelector('form p.wide:not(.hint)'))).toBe('Modalité : au cabinet');
    expect(text(el.querySelector('button[type="submit"]'))).toBe('Réserver ce créneau');
    type(el, 'field-firstName', 'Sara');
    type(el, 'field-lastName', 'Benali');
    type(el, 'field-email', 'sara.benali@example.test');
    el.querySelector<HTMLInputElement>('#field-consent input[type="checkbox"]')?.click();
    await settle(harness);
    await submit(el, harness);
    expect(sentBody(api).modality).toBe('in_person');
  });
});

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
