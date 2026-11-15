import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { AgendaApi } from './agenda.api';
import {
  AgendaData,
  AgendaView,
  Appointment,
  BusyBlock,
  byStart,
  calendarOf,
  CalendarKey,
  DEFAULT_VIEW,
  fromIsoDay,
  rangeFor,
  sameDay,
  startOfDay,
  stepDate,
  SyncStatus,
  toIsoDay,
} from './agenda.model';

interface AgendaState {
  view: AgendaView;
  /** Date d'ancrage de la vue, `yyyy-MM-dd` (heure locale). */
  date: string;
  data: Loadable<AgendaData>;
  /** Cases décochées du rail gauche (tout est visible au départ). */
  hidden: CalendarKey[];
  /** Rendez-vous ouvert dans le détail (`/agenda/rdv/:id`), null quand le détail est fermé. */
  selectedId: string | null;
  sync: SyncStatus | null;
}

const initialState: AgendaState = {
  view: DEFAULT_VIEW,
  date: toIsoDay(new Date()),
  data: idle(),
  hidden: [],
  selectedId: null,
  sync: null,
};

/**
 * État serveur de l'agenda (fiche 15) : la vue et sa date d'ancrage, la plage lue, les rendez-vous
 * et blocs Google de cette plage, les agendas masqués, le rendez-vous sélectionné. Une réponse
 * arrivée après un changement de plage est ignorée. Fourni par la page : rien ne survit à la
 * sortie de l'agenda (la liste des patients a d'autres raisons de vivre à la racine).
 */
export const AgendaStore = signalStore(
  withState(initialState),
  withComputed(({ view, date, data, hidden, selectedId }) => {
    const anchor = computed(() => fromIsoDay(date()) ?? startOfDay(new Date()));
    const range = computed(() => rangeFor(view(), anchor()));
    const appointments = computed<Appointment[]>(() => {
      const list = data().data?.appointments ?? [];
      const off = new Set(hidden());
      return list.filter((item) => !off.has(calendarOf(item))).sort(byStart);
    });
    const busy = computed<BusyBlock[]>(() => {
      const list = data().data?.busy ?? [];
      const off = new Set(hidden());
      return list.filter((item) => !off.has(calendarOf(item))).sort(byStart);
    });
    return {
      anchor,
      range,
      appointments,
      busy,
      /** « 14 séances » de la barre d'outils : les séances visibles de la plage, contacts compris. */
      sessionCount: computed(() => appointments().length),
      selected: computed(
        () => data().data?.appointments.find((item) => item.id === selectedId()) ?? null,
      ),
      /** Les rendez-vous visibles du jour du rendez-vous sélectionné (↑ ↓ passent de l'un à l'autre). */
      selectedDaySiblings: computed(() => {
        const current = data().data?.appointments.find((item) => item.id === selectedId());
        if (!current) return [];
        const day = new Date(current.startsAt);
        return appointments().filter((item) => sameDay(new Date(item.startsAt), day));
      }),
    };
  }),
  withMethods((store, api = inject(AgendaApi)) => {
    let request = 0;

    async function load(): Promise<void> {
      const ticket = ++request;
      const range = store.range();
      patchState(store, { data: loading(store.data()) });
      try {
        const data = await api.load(range);
        if (ticket !== request) return;
        patchState(store, { data: loaded(data) });
      } catch (error) {
        if (ticket !== request) return;
        patchState(store, { data: failed(asProblem(error), store.data()) });
      }
    }

    return {
      /**
       * Montre une vue à une date (depuis l'URL ou la barre d'outils) et relit la plage si elle a
       * changé ; la première fois, lit aussi l'état de synchronisation.
       */
      async show(view: AgendaView, date: Date): Promise<void> {
        const next = { view, date: toIsoDay(date) };
        const unchanged = next.view === store.view() && next.date === store.date();
        const first = store.data().status === 'idle';
        if (unchanged && !first) return;
        const before = store.range();
        patchState(store, next);
        const after = store.range();
        const sameRange =
          before.from.getTime() === after.from.getTime() &&
          before.to.getTime() === after.to.getTime();
        if (first) void this.loadSync();
        if (first || !sameRange) await load();
      },
      reload: load,
      async loadSync(): Promise<void> {
        try {
          patchState(store, { sync: await api.syncStatus() });
        } catch {
          patchState(store, { sync: { state: 'error', minutesAgo: 0 } });
        }
      },
      /** Date d'ancrage après ‹ › dans la vue courante. */
      stepped(direction: 1 | -1): Date {
        return stepDate(store.view(), store.anchor(), direction);
      },
      select(id: string | null): void {
        patchState(store, { selectedId: id });
      },
      /**
       * Rendez-vous déplacé ou étiré dans la grille : nouvelles bornes dans la plage lue. Sans
       * module scheduling, le changement reste local à la visite ; il deviendra
       * `PATCH /api/appointments/{id}` suivi d'une relecture de la plage.
       */
      reschedule(id: string, startsAt: string, endsAt: string): void {
        const data = store.data().data;
        if (!data) return;
        patchState(store, {
          data: loaded({
            ...data,
            appointments: data.appointments.map((item) =>
              item.id === id ? { ...item, startsAt, endsAt } : item,
            ),
          }),
        });
      },
      toggleCalendar(key: CalendarKey): void {
        const hidden = store.hidden();
        patchState(store, {
          hidden: hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key],
        });
      },
      isVisible(key: CalendarKey): boolean {
        return !store.hidden().includes(key);
      },
    };
  }),
);
