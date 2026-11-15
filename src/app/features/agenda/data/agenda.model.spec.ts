import { demoAgenda } from './agenda.fixtures';
import {
  calendarOf,
  daysOf,
  fromIsoDay,
  gridTop,
  isoWeek,
  offHours,
  rangeFor,
  startOfWeek,
  stepDate,
  toIsoDay,
} from './agenda.model';

const d = (iso: string) => fromIsoDay(iso)!;

describe('agenda.model : dates et plages', () => {
  it('toIsoDay / fromIsoDay : aller-retour en heure locale, valeurs invalides refusées', () => {
    expect(toIsoDay(new Date(2026, 9, 26, 23, 59))).toBe('2026-10-26');
    expect(fromIsoDay('2026-10-26')?.getDate()).toBe(26);
    expect(fromIsoDay('2026-02-30')).toBeNull();
    expect(fromIsoDay('26/10/2026')).toBeNull();
    expect(fromIsoDay(null)).toBeNull();
  });

  it('startOfWeek : le lundi, même un dimanche ; isoWeek : semaine 44 pour la maquette', () => {
    expect(toIsoDay(startOfWeek(d('2026-11-01')))).toBe('2026-10-26');
    expect(toIsoDay(startOfWeek(d('2026-10-26')))).toBe('2026-10-26');
    expect(isoWeek(d('2026-10-26'))).toBe(44);
    expect(isoWeek(d('2027-01-01'))).toBe(53);
  });

  it('rangeFor : jour, semaine du lundi, mois en semaines entières, liste de 30 jours', () => {
    const day = rangeFor('day', d('2026-10-28'));
    expect([toIsoDay(day.from), toIsoDay(day.to)]).toEqual(['2026-10-28', '2026-10-29']);
    const week = rangeFor('week', d('2026-10-28'));
    expect([toIsoDay(week.from), toIsoDay(week.to)]).toEqual(['2026-10-26', '2026-11-02']);
    const month = rangeFor('month', d('2026-10-15'));
    expect([toIsoDay(month.from), toIsoDay(month.to)]).toEqual(['2026-09-28', '2026-11-02']);
    expect(daysOf(month)).toHaveLength(35);
    const list = rangeFor('list', d('2026-10-26'));
    expect(toIsoDay(list.to)).toBe('2026-11-25');
    expect(daysOf(list)).toHaveLength(30);
  });

  it('stepDate : ‹ › avancent d’un jour, d’une semaine, d’un mois, de 30 jours', () => {
    expect(toIsoDay(stepDate('day', d('2026-10-31'), 1))).toBe('2026-11-01');
    expect(toIsoDay(stepDate('week', d('2026-10-28'), -1))).toBe('2026-10-21');
    expect(toIsoDay(stepDate('month', d('2026-10-28'), 1))).toBe('2026-11-01');
    expect(toIsoDay(stepDate('list', d('2026-10-26'), 1))).toBe('2026-11-25');
  });

  it('gridTop : 52 px par heure depuis 8 h, borné à la grille', () => {
    expect(gridTop(new Date(2026, 9, 26, 9, 0))).toBe(52);
    expect(gridTop(new Date(2026, 9, 26, 10, 30))).toBe(130);
    expect(gridTop(new Date(2026, 9, 26, 6, 0))).toBe(0);
    expect(gridTop(new Date(2026, 9, 26, 22, 0))).toBe(11 * 52);
  });

  it('offHours : dimanche entier, vendredi et samedi après 13 h, rien les autres jours', () => {
    expect(offHours(d('2026-11-01'))).toEqual({ fromMinutes: 480, toMinutes: 1140 });
    expect(offHours(d('2026-10-30'))).toEqual({ fromMinutes: 780, toMinutes: 1140 });
    expect(offHours(d('2026-10-31'))?.fromMinutes).toBe(780);
    expect(offHours(d('2026-10-28'))).toBeNull();
  });
});

describe('agenda.fixtures : la semaine de la maquette', () => {
  const week = demoAgenda(rangeFor('week', d('2026-10-26')));

  it('14 séances et 3 blocs Google, identifiants stables, Marie D. le samedi à 10 h', () => {
    expect(week.appointments).toHaveLength(14);
    expect(week.busy).toHaveLength(3);
    const marie = week.appointments.find((item) => item.patient.displayName === 'Marie D.')!;
    expect(marie.id).toBe('rdv-2026-10-31-13');
    expect(new Date(marie.startsAt).getHours()).toBe(10);
    expect(marie.status).toBe('planned');
    expect(marie.google?.history).toContain('déplacé depuis Google');
    expect(demoAgenda(rangeFor('day', d('2026-10-31'))).appointments.map((a) => a.id)).toEqual([
      'rdv-2026-10-31-13',
      'rdv-2026-10-31-14',
    ]);
  });

  it('statuts et genres de la maquette : Yanis à confirmer, Inès en contact téléphonique', () => {
    const yanis = week.appointments.find((item) => item.patient.displayName === 'Yanis M.')!;
    expect(yanis.status).toBe('tentative');
    const ines = week.appointments.find((item) => item.patient.displayName === 'Inès V.')!;
    expect(ines.kind).toBe('contact');
    expect(ines.modality).toBe('phone');
    expect(calendarOf(ines)).toBe('phone');
    expect(calendarOf(week.busy[0])).toBe('google-pro');
  });

  it('une plage vide (dimanche) ne contient rien', () => {
    expect(demoAgenda(rangeFor('day', d('2026-11-01')))).toEqual({ appointments: [], busy: [] });
  });
});
