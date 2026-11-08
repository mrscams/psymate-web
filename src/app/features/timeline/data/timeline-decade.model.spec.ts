import {
  clinicalStart,
  DECADE_THRESHOLD_MONTHS,
  decideView,
  exceedsDecade,
  monthDays,
  monthIndexOf,
  monthKey,
  NO_RANGE,
  outsideCount,
  periodMonth,
  plageMonths,
  plageMonthsOf,
  plageOf,
} from './timeline-decade.model';
import { monthlySummary, timelinePeriod } from './timeline.fixtures';

const m = (period: string) => periodMonth(period)!;

describe('timeline-decade.model', () => {
  it('mois : rang UTC d’un instant et d’un libellé AAAA-MM, aller-retour', () => {
    expect(monthIndexOf('2026-03-31T23:30:00Z')).toBe(2026 * 12 + 2);
    expect(monthIndexOf('2026-04-01T00:00:00+02:00')).toBe(2026 * 12 + 2);
    expect(monthIndexOf('n’importe quoi')).toBeNull();
    expect(periodMonth('2025-03')).toBe(2025 * 12 + 2);
    expect(periodMonth('2025-13')).toBeNull();
    expect(periodMonth('2025')).toBeNull();
    expect(monthKey(m('2024-12'))).toBe('2024-12');
  });

  it('monthDays : premier et dernier jour du mois (années bissextiles)', () => {
    expect(monthDays(m('2024-02'))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthDays(m('2025-02'))).toEqual({ from: '2025-02-01', to: '2025-02-28' });
    expect(monthDays(m('2026-12'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('début clinique : le plus ancien du début du suivi et de la première séance', () => {
    const periods = [
      timelinePeriod('1990-01', { event: 1 }), // enfance (phase de vie)
      timelinePeriod('2014-01', { event: 1 }), // année 2014
      timelinePeriod('2022-05', { session: 1, note: 2 }),
      timelinePeriod('2026-10', { session: 1 }),
    ];
    // Dossier créé aujourd'hui (pas de followUp.since) : la première séance l'emporte.
    expect(clinicalStart(periods, '2026-11-08')).toBe(m('2022-05'));
    // Suivi déclaré plus tôt que la première séance saisie : il l'emporte.
    expect(clinicalStart(periods, '2021-01-15')).toBe(m('2021-01'));
    // Sans séance ni début du suivi : le premier mois non vide.
    expect(clinicalStart([timelinePeriod('2019-07')], null)).toBe(m('2019-07'));
    expect(clinicalStart([], null)).toBeNull();
  });

  it('plage : période des filtres, sinon début clinique → dernier mois non vide', () => {
    const periods = [
      timelinePeriod('2008-09', { situation: 1 }),
      timelinePeriod('2022-05', { session: 1 }),
      timelinePeriod('2026-10', { note: 1 }),
    ];
    expect(plageOf(NO_RANGE, periods, null)).toEqual({ start: m('2022-05'), end: m('2026-10') });
    // Les jours du praticien font foi (minuit du 1er novembre à Paris est le 31 octobre en UTC).
    const year = {
      from: '2025-10-31T23:00:00.000Z',
      to: '2026-10-31T23:00:00.000Z',
      fromDay: '2025-11-01',
      toDay: '2026-10-31',
    };
    expect(plageOf(year, periods, null)).toEqual({ start: m('2025-11'), end: m('2026-10') });
    const since = { ...NO_RANGE, from: '2025-12-31T23:00:00.000Z', fromDay: '2026-01-01' };
    expect(plageOf(since, [], null)).toEqual({ start: m('2026-01'), end: m('2026-01') });
    expect(plageOf(since, periods, null)).toEqual({ start: m('2026-01'), end: m('2026-10') });
    expect(plageOf(NO_RANGE, [], null)).toBeNull();
  });

  it('bascule : au-delà de 36 mois couverts (3 ans), pas avant', () => {
    expect(DECADE_THRESHOLD_MONTHS).toBe(36);
    const three = { start: m('2023-11'), end: m('2026-10') };
    expect(plageMonths(three)).toBe(36);
    expect(exceedsDecade(three)).toBe(false);
    const more = { start: m('2023-10'), end: m('2026-10') };
    expect(plageMonths(more)).toBe(37);
    expect(exceedsDecade(more)).toBe(true);
    expect(exceedsDecade(null)).toBe(false);
  });

  it('decideView : choix explicite, puis mois ouvert, puis préférence forcée, puis plage', () => {
    const long = { start: m('2016-01'), end: m('2026-10') };
    const short = { start: m('2026-01'), end: m('2026-10') };
    const base = { manual: null, drilled: false, forced: false };
    expect(decideView({ ...base, plage: long })).toBe('decade');
    expect(decideView({ ...base, plage: short })).toBe('detail');
    expect(decideView({ ...base, plage: null })).toBe('detail');
    expect(decideView({ ...base, forced: true, plage: short })).toBe('decade');
    expect(decideView({ ...base, forced: true, drilled: true, plage: short })).toBe('detail');
    expect(decideView({ ...base, manual: 'detail', plage: long })).toBe('detail');
    expect(decideView({ ...base, manual: 'decade', drilled: true, plage: short })).toBe('decade');
  });

  it('mois de la plage : vides compris, et entrées hors plage', () => {
    const periods = [timelinePeriod('2014-01', { event: 3 }), ...monthlySummary(3, '2026-10')];
    const plage = { start: m('2026-07'), end: m('2026-10') };
    const months = plageMonthsOf(plage, periods);
    expect(months.map((month) => month.key)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(months[0].period).toBeNull();
    expect(months[1].period?.total).toBe(4);
    expect(outsideCount(plage, periods)).toBe(3);
  });
});
