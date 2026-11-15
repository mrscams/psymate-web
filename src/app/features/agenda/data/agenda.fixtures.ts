import {
  addDays,
  AgendaData,
  AgendaRange,
  Appointment,
  AppointmentModality,
  AppointmentPatient,
  AppointmentStatus,
  BusyBlock,
  daysOf,
  GoogleCalendar,
  startOfWeek,
  toIsoDay,
} from './agenda.model';

/**
 * Données de démonstration de l'agenda, en attendant le module `scheduling` : la semaine de la
 * maquette 15 (26 octobre – 1er novembre 2026, 14 séances, trois blocs Google) répétée sur toute
 * semaine demandée. Déterministes : un même rendez-vous garde son identifiant d'une lecture à
 * l'autre (`rdv-<jour>-<n>`), ce dont dépendent la sélection et l'URL `/agenda/rdv/:id`.
 */

interface WeeklySlot {
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  start: string;
  durationMin: number;
  patient: string;
  modality: AppointmentModality;
  status?: AppointmentStatus;
  kind?: 'session' | 'contact';
}

interface WeeklyBusy {
  weekday: number;
  start: string;
  end: string;
  calendar: GoogleCalendar;
}

/** Les quatorze séances de la maquette, du lundi au samedi. */
const WEEKLY_SLOTS: readonly WeeklySlot[] = [
  { weekday: 0, start: '09:00', durationMin: 50, patient: 'Omar B.', modality: 'in_person' },
  { weekday: 0, start: '11:00', durationMin: 50, patient: 'Léa T.', modality: 'video' },
  { weekday: 0, start: '17:00', durationMin: 50, patient: 'Julie M.', modality: 'in_person' },
  { weekday: 1, start: '09:00', durationMin: 50, patient: 'Samira K.', modality: 'in_person' },
  { weekday: 1, start: '10:00', durationMin: 50, patient: 'Nathan R.', modality: 'in_person' },
  {
    weekday: 1,
    start: '15:00',
    durationMin: 15,
    patient: 'Inès V.',
    modality: 'phone',
    kind: 'contact',
  },
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

/** Les blocs « Occupé · Google » de la maquette. */
const WEEKLY_BUSY: readonly WeeklyBusy[] = [
  { weekday: 0, start: '14:00', end: '16:00', calendar: 'pro' },
  { weekday: 2, start: '13:00', end: '14:00', calendar: 'perso' },
  { weekday: 4, start: '11:00', end: '13:00', calendar: 'pro' },
];

/** Adresse du cabinet de démonstration (fiche 15 : « Cabinet · 12 rue Vendôme »). */
export const DEMO_PLACE = 'Cabinet · 12 rue Vendôme';

/** Fiche de Marie D. telle que la maquette 15 la détaille ; les autres suivent le même gabarit. */
const PATIENTS: Record<string, Omit<AppointmentPatient, 'id' | 'displayName'>> = {
  'Marie D.': {
    age: 34,
    followedSince: '2025-03-01',
    flag: 'à surveiller',
    rhythm: 'toutes les 1 à 2 semaines',
  },
};

const DEFAULT_PATIENT = {
  age: 41,
  followedSince: '2025-09-01',
  flag: null,
  rhythm: 'toutes les 2 semaines',
};

function patientId(name: string): string {
  return `demo-${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '')}`;
}

function at(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

function appointment(day: Date, index: number, slot: WeeklySlot): Appointment {
  const start = at(day, slot.start);
  const end = new Date(start.getTime() + slot.durationMin * 60_000);
  const details = PATIENTS[slot.patient] ?? DEFAULT_PATIENT;
  const initials = slot.patient
    .split(' ')
    .map((part) => part[0])
    .join('. ');
  const lastSession = addDays(start, -14);
  return {
    id: `rdv-${toIsoDay(day)}-${index + 1}`,
    patient: { id: patientId(slot.patient), displayName: slot.patient, ...details },
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    modality: slot.modality,
    status: slot.status ?? 'planned',
    kind: slot.kind ?? 'session',
    sessionNumber: 32,
    place: slot.modality === 'in_person' ? DEMO_PLACE : null,
    planningNote:
      slot.patient === 'Marie D.' ? "Reprendre l'entretien du 18 et le carnet du soir." : '',
    google:
      slot.kind === 'contact'
        ? null
        : {
            summary: `Séance · ${initials}.`,
            history:
              slot.patient === 'Marie D.'
                ? 'déplacé depuis Google le 22 oct. (9:00 → 10:00), répercuté ici'
                : null,
          },
    preparation: {
      lastSessionAt: lastSession.toISOString(),
      objective: "noter chaque soir l'intensité de l'anxiété",
      feelings: 2,
      feelingValues: '8/10 et 9/10',
      events: 1,
      eventLabel: "entretien d'évaluation",
    },
  };
}

function busyBlock(day: Date, index: number, busy: WeeklyBusy): BusyBlock {
  return {
    id: `busy-${toIsoDay(day)}-${index + 1}`,
    calendar: busy.calendar,
    startsAt: at(day, busy.start).toISOString(),
    endsAt: at(day, busy.end).toISOString(),
  };
}

/** Les rendez-vous et blocs Google d'une plage (début inclus, fin exclue). */
export function demoAgenda(range: AgendaRange): AgendaData {
  const appointments: Appointment[] = [];
  const busy: BusyBlock[] = [];
  for (const day of daysOf(range)) {
    const weekday = (day.getDay() + 6) % 7;
    const monday = startOfWeek(day);
    WEEKLY_SLOTS.forEach((slot, index) => {
      if (slot.weekday === weekday) appointments.push(appointment(day, index, slot));
    });
    WEEKLY_BUSY.forEach((block, index) => {
      if (block.weekday === weekday) busy.push(busyBlock(addDays(monday, weekday), index, block));
    });
  }
  return { appointments, busy };
}
