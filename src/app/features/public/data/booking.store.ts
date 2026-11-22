import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { BookingApi } from './booking.api';
import { BookingRequest, PublicBooking, SlotList, SlotWindow } from './booking.models';
import { todayIn, windowAt } from './booking-window';

/**
 * Délai minimal entre le premier affichage du formulaire et l'envoi : l'API ignore en silence, sous
 * un 202, une demande envoyée moins de 3 s après `formShownAt`. Un visiteur très rapide n'est pas
 * perdu : l'envoi attend la fin du délai, avec une marge pour l'écart d'horloge (comme le contact).
 */
export const BOOKING_MIN_DELAY_MS = 3500;

/**
 * Issue d'un envoi, pour l'écran (l'état de l'envoi est de l'état d'écran, fiche 31) :
 * `sent` : 202 (enregistrée ou ignorée en silence, rien ne le distingue) ; `slot-gone` : 409, les
 * créneaux sont relus ; `invalid` : 422, errors[] à poser sur les champs ; `rate-limited` : 429 ;
 * `not-available` : 404, l'écran renvoie vers la fiche ; `error` : réseau, 5xx, 400.
 */
export type BookingOutcome =
  'sent' | 'slot-gone' | 'invalid' | 'rate-limited' | 'not-available' | 'error';

export interface BookingResult {
  outcome: BookingOutcome;
  problem: ApiProblem | null;
}

interface BookingState {
  slug: string | null;
  /** Date du jour dans le fuseau du praticien, posée au chargement des réglages. */
  today: string | null;
  settings: Loadable<PublicBooking>;
  /** Créneaux de la fenêtre affichée. */
  slots: Loadable<SlotList>;
  /** Fenêtre demandée en dernier (relue après un 409 ou par « Réessayer »). */
  window: SlotWindow | null;
}

const initialState: BookingState = {
  slug: null,
  today: null,
  settings: idle<PublicBooking>(),
  slots: idle<SlotList>(),
  window: null,
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isNotAvailable = (problem: ApiProblem | null) =>
  problem?.status === 404 || problem?.code === 'BOOKING_NOT_AVAILABLE';

/**
 * Prise de rendez-vous publique d'un praticien (fiche 31, « BookingStore ») : réglages publics et
 * créneaux de la fenêtre affichée, chacun avec ses trois états, et l'envoi d'une demande. Les
 * créneaux ne sont jamais corrigés localement : après un 409, ils sont relus. Rien du visiteur n'est
 * gardé ici (G Q62) : la saisie vit dans le composant. Fourni par la page.
 */
export const BookingStore = signalStore(
  withState(initialState),
  withComputed(({ settings, slots }) => ({
    /** 404 BOOKING_NOT_AVAILABLE sur les réglages ou les créneaux : l'écran renvoie vers la fiche. */
    notAvailable: computed(
      () => isNotAvailable(settings().problem) || isNotAvailable(slots().problem),
    ),
  })),
  withMethods((store, api = inject(BookingApi)) => {
    let slotsRequest = 0;

    async function fetchSlots(window: SlotWindow): Promise<void> {
      const slug = store.slug();
      if (!slug) return;
      const request = ++slotsRequest;
      patchState(store, { window, slots: loading<SlotList>() });
      try {
        const list = await api.slots(slug, window);
        if (request !== slotsRequest) return;
        patchState(store, { slots: loaded(list) });
      } catch (error) {
        if (request !== slotsRequest) return;
        patchState(store, { slots: failed<SlotList>(asProblem(error)) });
      }
    }

    return {
      /** GET …/practitioners/{slug}, puis la première fenêtre de créneaux (aujourd'hui + 13 j). */
      async load(slug: string, now: Date = new Date()): Promise<void> {
        slotsRequest++;
        patchState(store, {
          slug,
          today: null,
          settings: loading<PublicBooking>(),
          slots: idle<SlotList>(),
          window: null,
        });
        try {
          const settings = await api.settings(slug);
          if (store.slug() !== slug) return;
          const today = todayIn(settings.timezone, now);
          patchState(store, { settings: loaded(settings), today });
          await fetchSlots(windowAt(today, 0));
        } catch (error) {
          if (store.slug() !== slug) return;
          patchState(store, { settings: failed<PublicBooking>(asProblem(error)) });
        }
      },

      /** GET …/slots?from&to pour une fenêtre de deux semaines (changement de fenêtre). */
      loadSlots(window: SlotWindow): Promise<void> {
        return fetchSlots(window);
      },

      /** Relit la fenêtre affichée (« Réessayer », après un 409). */
      reloadSlots(): Promise<void> {
        const window = store.window();
        return window ? fetchSlots(window) : Promise.resolve();
      },

      /**
       * POST …/requests. Attend, s'il le faut, 3,5 s après `formShownAt`. Sur un 409, relit les
       * créneaux de la fenêtre affichée avant de rendre la main.
       */
      async send(request: BookingRequest, now = Date.now()): Promise<BookingResult> {
        const slug = store.slug();
        if (!slug) return { outcome: 'error', problem: null };
        const elapsed = now - Date.parse(request.formShownAt);
        if (elapsed < BOOKING_MIN_DELAY_MS) await wait(BOOKING_MIN_DELAY_MS - elapsed);
        try {
          await api.request(slug, request);
          return { outcome: 'sent', problem: null };
        } catch (error) {
          const problem = asProblem(error);
          if (problem.status === 409) {
            const window = store.window();
            if (window) await fetchSlots(window);
            return { outcome: 'slot-gone', problem };
          }
          const outcome: BookingOutcome =
            problem.status === 422
              ? 'invalid'
              : problem.status === 429
                ? 'rate-limited'
                : problem.status === 404
                  ? 'not-available'
                  : 'error';
          return { outcome, problem };
        }
      },
    };
  }),
);
