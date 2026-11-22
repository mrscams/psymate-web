import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { AgendaApi } from './agenda.api';
import {
  AgendaData,
  AgendaView,
  Appointment,
  AppointmentPatch,
  AppointmentPreparation,
  BusyBlock,
  byStart,
  calendarOf,
  CalendarKey,
  Conflict,
  DEFAULT_VIEW,
  fromIsoDay,
  rangeFor,
  sameDay,
  startOfDay,
  stepDate,
  toIsoDay,
} from './agenda.model';

/** Rendez-vous ouvert hors de la plage lue (lien direct) : lu à part par `GET /api/appointments/{id}`. */
interface Fetched {
  id: string;
  status: 'loading' | 'loaded' | 'missing' | 'error';
  appointment: Appointment | null;
}

/** Ce qui entoure le patient du rendez-vous ouvert : bloc « Préparer » et rythme du suivi. */
interface PatientContext {
  patientId: string;
  preparation: Loadable<AppointmentPreparation>;
  /** Rythme du suivi (`defaults.rhythm`), null s'il n'est pas renseigné ou pas encore lu. */
  rhythm: string | null;
}

/** Issue d'une écriture : les chevauchements signalés, ou le problème. */
export type WriteResult<T = void> =
  { ok: true; value: T; conflicts: Conflict[] } | { ok: false; problem: ApiProblem };

/** État du détail : rien d'ouvert, en lecture, introuvable (404), erreur, ou prêt. */
export type DetailState = 'none' | 'loading' | 'missing' | 'error' | 'ready';

interface AgendaState {
  view: AgendaView;
  /** Date d'ancrage de la vue, `yyyy-MM-dd` (heure locale). */
  date: string;
  data: Loadable<AgendaData>;
  /** Cases décochées du rail gauche (tout est visible au départ). */
  hidden: CalendarKey[];
  /** Rendez-vous ouvert dans le détail (`/agenda/rdv/:id`), null quand le détail est fermé. */
  selectedId: string | null;
  fetched: Fetched | null;
  context: PatientContext | null;
  /**
   * Demandes en ligne en attente (`GET /api/agenda/requests`), même hors de la plage affichée,
   * dans l'ordre de l'API. Leur nombre est le compteur de « Demandes » ; relues à chaque lecture de
   * la plage, donc après chaque écriture.
   */
  requests: Loadable<Appointment[]>;
}

const initialState: AgendaState = {
  view: DEFAULT_VIEW,
  date: toIsoDay(new Date()),
  data: idle(),
  hidden: [],
  selectedId: null,
  fetched: null,
  context: null,
  requests: idle(),
};

/**
 * État serveur de l'agenda (fiche 15) : la vue et sa date d'ancrage, la plage lue
 * (`GET /api/agenda`), les agendas masqués, le rendez-vous ouvert (lu à part s'il n'est pas dans la
 * plage) et le contexte de son patient (aucun pour un invité). Après toute écriture (déplacer, annuler, confirmer, note),
 * la plage est relue : rien n'est recalculé localement. Une réponse arrivée après un changement de
 * plage est ignorée. Fourni par la page : rien ne survit à la sortie de l'agenda.
 */
export const AgendaStore = signalStore(
  withState(initialState),
  withComputed(({ view, date, data, hidden, selectedId, fetched, requests }) => {
    const anchor = computed(() => fromIsoDay(date()) ?? startOfDay(new Date()));
    const range = computed(() => rangeFor(view(), anchor()));
    const appointments = computed<Appointment[]>(() => {
      const list = data().data?.appointments ?? [];
      const off = new Set(hidden());
      return list.filter((item) => !off.has(calendarOf(item))).sort(byStart);
    });
    const busy = computed<BusyBlock[]>(() => [...(data().data?.busy ?? [])].sort(byStart));
    /** Le rendez-vous ouvert est-il dans la plage lue (visible ou masqué) ? */
    const inWindow = computed(() => {
      const id = selectedId();
      return id !== null && (data().data?.appointments ?? []).some((item) => item.id === id);
    });
    const selected = computed<Appointment | null>(() => {
      const id = selectedId();
      if (!id) return null;
      if (inWindow()) return appointments().find((item) => item.id === id) ?? null;
      const other = fetched();
      return other?.id === id ? other.appointment : null;
    });
    return {
      anchor,
      range,
      appointments,
      busy,
      /** « 14 séances » de la barre d'outils : les rendez-vous visibles de la plage. */
      sessionCount: computed(() => appointments().length),
      /** Le rendez-vous ouvert, s'il est visible : masquer son agenda ferme le détail. */
      selected,
      detailState: computed<DetailState>(() => {
        const id = selectedId();
        if (!id) return 'none';
        if (selected()) return 'ready';
        if (inWindow()) return 'none';
        const other = fetched();
        if (other?.id !== id) return 'loading';
        return other.status === 'loaded' ? 'none' : other.status;
      }),
      /**
       * Compteur de « Demandes » : la longueur de la liste renvoyée par l'API, jamais un comptage de
       * la plage affichée ; null tant que la liste n'a pas été lue.
       */
      requestCount: computed<number | null>(() => requests().data?.length ?? null),
      /** Les rendez-vous visibles du jour du rendez-vous ouvert (↑ ↓ passent de l'un à l'autre). */
      selectedDaySiblings: computed(() => {
        const current = appointments().find((item) => item.id === selectedId());
        if (!current) return [];
        const day = new Date(current.startsAt);
        return appointments().filter((item) => sameDay(new Date(item.startsAt), day));
      }),
    };
  }),
  withMethods((store, api = inject(AgendaApi)) => {
    let request = 0;
    let fetchTicket = 0;
    let contextTicket = 0;
    let requestsTicket = 0;

    /**
     * Relit les demandes en attente ; la liste affichée reste pendant la relecture (le compteur ne
     * clignote pas). Seule la dernière lecture lancée compte.
     */
    async function loadRequests(): Promise<void> {
      const ticket = ++requestsTicket;
      patchState(store, { requests: loading(store.requests()) });
      try {
        const list = await api.requests();
        if (ticket !== requestsTicket) return;
        patchState(store, { requests: loaded(list) });
      } catch (error) {
        if (ticket !== requestsTicket) return;
        patchState(store, { requests: failed(asProblem(error), store.requests()) });
      }
    }

    /**
     * Le rendez-vous ouvert n'est pas dans la plage lue (lien direct, autre plage) : lecture à part.
     * `force` relit même s'il est déjà connu (après une écriture).
     */
    async function ensureSelected(force = false): Promise<void> {
      const id = store.selectedId();
      if (!id || store.data().status !== 'loaded') return;
      if ((store.data().data?.appointments ?? []).some((item) => item.id === id)) return;
      const current = store.fetched();
      if (!force && current?.id === id && current.status !== 'error') return;
      const ticket = ++fetchTicket;
      if (current?.id !== id || current.status !== 'loaded')
        patchState(store, { fetched: { id, status: 'loading', appointment: null } });
      try {
        const appointment = await api.get(id);
        if (ticket !== fetchTicket) return;
        patchState(store, { fetched: { id, status: 'loaded', appointment } });
      } catch (error) {
        if (ticket !== fetchTicket) return;
        const problem = asProblem(error);
        const status = problem.status === 404 ? 'missing' : 'error';
        patchState(store, { fetched: { id, status, appointment: null } });
      }
    }

    /**
     * Lit la plage courante et, en même temps, les demandes en attente (fiche 15 : relues à chaque
     * rechargement de la fenêtre). `keep` garde la donnée affichée pendant la relecture (Réessayer,
     * après une écriture) ; une autre plage repart de zéro, pour que l'erreur et le compte ne
     * portent jamais sur l'ancienne plage.
     */
    async function load(keep: boolean): Promise<void> {
      await Promise.all([loadWindow(keep), loadRequests()]);
    }

    async function loadWindow(keep: boolean): Promise<void> {
      const ticket = ++request;
      const range = store.range();
      patchState(store, { data: keep ? loading(store.data()) : loading() });
      try {
        const data = await api.load(range);
        if (ticket !== request) return;
        patchState(store, { data: loaded(data) });
        void ensureSelected();
      } catch (error) {
        if (ticket !== request) return;
        patchState(store, { data: failed(asProblem(error), store.data()) });
      }
    }

    /** Après une écriture : la plage relue, et le rendez-vous lu à part s'il y en a un. */
    async function refresh(): Promise<void> {
      await load(true);
      await ensureSelected(true);
    }

    /** Exécute une écriture, relit la plage dans tous les cas (succès : nouvel état ; échec : retour). */
    async function write<T>(
      action: () => Promise<{ value: T; conflicts: Conflict[] }>,
    ): Promise<WriteResult<T>> {
      try {
        const { value, conflicts } = await action();
        await refresh();
        return { ok: true, value, conflicts };
      } catch (error) {
        const problem = asProblem(error);
        await refresh();
        return { ok: false, problem };
      }
    }

    return {
      /** Montre une vue à une date (depuis l'URL ou la barre d'outils) ; relit si la plage change. */
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
        if (first || !sameRange) await load(false);
      },
      reload: () => load(true),
      refresh,
      /** « Réessayer » du panneau « Demandes en ligne » : relit la liste seule. */
      reloadRequests: () => loadRequests(),
      /** Date d'ancrage après ‹ › dans la vue courante. */
      stepped(direction: 1 | -1): Date {
        return stepDate(store.view(), store.anchor(), direction);
      },
      select(id: string | null): void {
        patchState(store, { selectedId: id });
        void ensureSelected();
      },
      /** « Réessayer » du détail en erreur : relit le rendez-vous ouvert hors de la plage. */
      retrySelected: () => ensureSelected(true),
      toggleCalendar(key: CalendarKey): void {
        const hidden = store.hidden();
        patchState(store, {
          hidden: hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key],
        });
      },
      isVisible(key: CalendarKey): boolean {
        return !store.hidden().includes(key);
      },

      /**
       * Contexte du patient du rendez-vous ouvert : vue d'ensemble (bloc « Préparer ») et rythme
       * (`defaults.rhythm`). N'empêche jamais l'ouverture du détail ; une erreur laisse les liens.
       * `null` : rendez-vous invité, sans dossier donc sans contexte ; le contexte précédent est
       * effacé et une lecture encore en cours pour un patient est ignorée.
       */
      async loadContext(patientId: string | null): Promise<void> {
        if (patientId === null) {
          contextTicket++;
          patchState(store, { context: null });
          return;
        }
        if (store.context()?.patientId === patientId) return;
        const ticket = ++contextTicket;
        patchState(store, {
          context: { patientId, preparation: loading<AppointmentPreparation>(), rhythm: null },
        });
        const update = (partial: Partial<PatientContext>) => {
          const context = store.context();
          if (ticket !== contextTicket || !context) return;
          patchState(store, { context: { ...context, ...partial } });
        };
        await Promise.all([
          api.preparation(patientId).then(
            (value) => update({ preparation: loaded(value) }),
            (error) => update({ preparation: failed<AppointmentPreparation>(asProblem(error)) }),
          ),
          api.patientAppointments(patientId).then(
            (value) => update({ rhythm: value.defaults.rhythm }),
            () => undefined,
          ),
        ]);
      },

      /** Glisser-déposer, étirement ou « Déplacer » : `PATCH { startsAt, durationMin }`. */
      move(id: string, startsAt: string, durationMin: number): Promise<WriteResult<Appointment>> {
        return write(async () => {
          const { appointment, conflicts } = await api.update(id, { startsAt, durationMin });
          return { value: appointment, conflicts };
        });
      },
      /** Note de planification : `PATCH { planningNote }`, null l'efface. */
      saveNote(id: string, planningNote: string | null): Promise<WriteResult<Appointment>> {
        const patch: AppointmentPatch = { planningNote };
        return write(async () => {
          const { appointment, conflicts } = await api.update(id, patch);
          return { value: appointment, conflicts };
        });
      },
      cancel(id: string, reason?: string): Promise<WriteResult<Appointment>> {
        return write(async () => ({ value: await api.cancel(id, reason), conflicts: [] }));
      },
      confirm(id: string): Promise<WriteResult<Appointment>> {
        return write(async () => ({ value: await api.confirm(id), conflicts: [] }));
      },
      /**
       * « Rattacher à un patient » : `POST …/attach-patient`, puis relecture de la plage et des
       * demandes (le détail montre alors le patient) ; rien n'est corrigé localement.
       */
      attachPatient(
        id: string,
        patientId: string,
        includeSameGuest: boolean,
      ): Promise<WriteResult<Appointment[]>> {
        return write(async () => ({
          value: await api.attachPatient(id, patientId, includeSameGuest),
          conflicts: [],
        }));
      },
      cancelSeries(seriesId: string): Promise<WriteResult<Appointment[]>> {
        return write(async () => ({ value: await api.cancelSeries(seriesId), conflicts: [] }));
      },
    };
  }),
);
