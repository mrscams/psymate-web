import {
  AgendaData,
  AgendaRange,
  Appointment,
  AppointmentModality,
  AppointmentStatus,
  daysOf,
  toIsoDay,
} from '../data/agenda.model';

/**
 * Données des tests Vitest de l'agenda (jamais servies par le code de production) : la semaine de
 * la maquette 15 (14 rendez-vous du lundi au samedi) répétée sur toute plage demandée, comme le
 * renverrait `GET /api/agenda`. Identifiants stables `rdv-<jour>-<n>`.
 */

interface WeeklySlot {
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  start: string;
  durationMin: number;
  patient: string;
  modality: AppointmentModality;
  status?: AppointmentStatus;
}

const WEEKLY_SLOTS: readonly WeeklySlot[] = [
  { weekday: 0, start: '09:00', durationMin: 50, patient: 'Omar B.', modality: 'in_person' },
  { weekday: 0, start: '11:00', durationMin: 50, patient: 'Léa T.', modality: 'video' },
  { weekday: 0, start: '17:00', durationMin: 50, patient: 'Julie M.', modality: 'in_person' },
  { weekday: 1, start: '09:00', durationMin: 50, patient: 'Samira K.', modality: 'in_person' },
  { weekday: 1, start: '10:00', durationMin: 50, patient: 'Nathan R.', modality: 'in_person' },
  { weekday: 1, start: '15:00', durationMin: 15, patient: 'Inès V.', modality: 'phone' },
  { weekday: 2, start: '09:30', durationMin: 50, patient: 'Adam D.', modality: 'video' },
  { weekday: 2, start: '16:00', durationMin: 50, patient: 'Paul L.', modality: 'in_person' },
  { weekday: 3, start: '10:00', durationMin: 50, patient: 'Chloé F.', modality: 'in_person' },
  {
    weekday: 3,
    start: '11:00',
    durationMin: 50,
    patient: 'Yanis M.',
    modality: 'in_person',
    status: 'tentative',
  },
  { weekday: 3, start: '14:00', durationMin: 50, patient: 'Sofia R.', modality: 'video' },
  { weekday: 4, start: '09:00', durationMin: 50, patient: 'Hugo P.', modality: 'in_person' },
  { weekday: 5, start: '10:00', durationMin: 50, patient: 'Marie D.', modality: 'in_person' },
  { weekday: 5, start: '11:30', durationMin: 50, patient: 'Théo B.', modality: 'in_person' },
];

export function patientIdOf(name: string): string {
  return `p-${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '')}`;
}

/** Un rendez-vous complet, à compléter par les champs donnés. */
export function appointmentOf(partial: Partial<Appointment> & { startsAt: string }): Appointment {
  const durationMin = partial.durationMin ?? 50;
  return {
    id: 'rdv-1',
    patient: {
      id: 'p-1',
      displayName: 'Marie D.',
      birthDate: null,
      age: null,
      archived: false,
    },
    seriesId: null,
    endsAt: new Date(new Date(partial.startsAt).getTime() + durationMin * 60_000).toISOString(),
    durationMin,
    modality: 'in_person',
    status: 'planned',
    planningNote: null,
    cancelReason: null,
    cancelledAt: null,
    sessionEntryId: null,
    ...partial,
  };
}

function at(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

/** Les rendez-vous d'une plage (début inclus, fin exclue), comme `GET /api/agenda`. */
export function weekAgenda(range: AgendaRange): AgendaData {
  const appointments: Appointment[] = [];
  for (const day of daysOf(range)) {
    const weekday = (day.getDay() + 6) % 7;
    WEEKLY_SLOTS.forEach((slot, index) => {
      if (slot.weekday !== weekday) return;
      appointments.push(
        appointmentOf({
          id: `rdv-${toIsoDay(day)}-${index + 1}`,
          patient: {
            id: patientIdOf(slot.patient),
            displayName: slot.patient,
            birthDate: slot.patient === 'Marie D.' ? '1992-03-14' : null,
            age: slot.patient === 'Marie D.' ? 34 : null,
            archived: false,
          },
          startsAt: at(day, slot.start).toISOString(),
          durationMin: slot.durationMin,
          modality: slot.modality,
          status: slot.status ?? 'planned',
          planningNote:
            slot.patient === 'Marie D.'
              ? "Reprendre l'entretien du 18 et le carnet du soir."
              : null,
        }),
      );
    });
  }
  return { appointments, busy: [] };
}
