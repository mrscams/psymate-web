import {
  ageOf,
  atLocal,
  daysOf,
  fromIsoDay,
  inRange,
  isoWeek,
  MAX_OCCURRENCES,
  occurrencesOf,
  parseTime,
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

  it('inRange : début inclus, fin exclue', () => {
    const week = rangeFor('week', d('2026-10-28'));
    expect(inRange(week, new Date(2026, 9, 26, 0, 0))).toBe(true);
    expect(inRange(week, new Date(2026, 10, 1, 23, 59))).toBe(true);
    expect(inRange(week, new Date(2026, 10, 2, 0, 0))).toBe(false);
  });
});

describe('agenda.model : saisie et calculs', () => {
  it('parseTime / atLocal : HH:MM en heure locale, saisies invalides refusées', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('9:05')).toBe(545);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('10h')).toBeNull();
    const date = atLocal('2026-11-07', '10:00')!;
    expect([date.getDate(), date.getHours(), date.getMinutes()]).toEqual([7, 10, 0]);
    expect(atLocal('2026-02-30', '10:00')).toBeNull();
  });

  it('ageOf : âge révolu, anniversaire compris ; date inconnue → null', () => {
    const today = new Date(2026, 10, 15);
    expect(ageOf('1992-03-14', today)).toBe(34);
    expect(ageOf('1992-11-15', today)).toBe(34);
    expect(ageOf('1992-11-16', today)).toBe(33);
    expect(ageOf(null, today)).toBeNull();
    expect(ageOf('2030-01-01', today)).toBeNull();
  });

  it('occurrencesOf : n fois toutes les 2 semaines, jusqu’à une date incluse, borné à 26 + 1', () => {
    const start = new Date(2026, 10, 7, 10, 0);
    expect(occurrencesOf(start, null)).toEqual([start]);
    const three = occurrencesOf(start, { everyWeeks: 2, count: 3 });
    expect(three.map(toIsoDay)).toEqual(['2026-11-07', '2026-11-21', '2026-12-05']);
    expect(three[2].getHours()).toBe(10);
    const until = occurrencesOf(start, { everyWeeks: 1, until: '2026-11-28' });
    expect(until.map(toIsoDay)).toEqual(['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28']);
    expect(occurrencesOf(start, { everyWeeks: 1, until: '2028-01-01' })).toHaveLength(
      MAX_OCCURRENCES + 1,
    );
  });
});
