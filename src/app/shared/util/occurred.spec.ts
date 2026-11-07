import { formatOccurred } from './occurred';

describe('formatOccurred', () => {
  it('exact : date et heure dans le fuseau donné, plage si la fin diffère', () => {
    const one = formatOccurred({ from: '2026-10-20T19:00:00Z', precision: 'exact' }, 'fr', {
      timeZone: 'Europe/Paris',
    });
    expect(one).toMatch(/20 oct\. 2026/);
    expect(one).toMatch(/21:00/);

    const two = formatOccurred(
      { from: '2026-10-20T19:00:00Z', to: '2026-10-20T20:00:00Z', precision: 'exact' },
      'fr',
      { timeZone: 'Europe/Paris' },
    );
    expect(two).toMatch(/21:00/);
    expect(two).toMatch(/22:00/);
  });

  it('day : jour entier lu en UTC, jamais décalé par le fuseau', () => {
    const day = formatOccurred(
      { from: '2026-10-20T00:00:00Z', to: '2026-10-21T00:00:00Z', precision: 'day' },
      'fr',
    );
    expect(day).toBe('20 oct. 2026');
    expect(
      formatOccurred(
        { from: '2026-10-20T00:00:00Z', to: '2026-10-23T00:00:00Z', precision: 'day' },
        'fr',
      ),
    ).toMatch(/20.*22 oct\. 2026/);
  });

  it('month et year', () => {
    expect(
      formatOccurred(
        { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z', precision: 'month' },
        'fr',
      ),
    ).toBe('octobre 2026');
    expect(
      formatOccurred(
        { from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z', precision: 'year' },
        'en',
      ),
    ).toBe('2026');
  });

  it('period : libellé puis bornes ; life_phase : libellé seul', () => {
    expect(
      formatOccurred(
        {
          from: '2024-03-01T00:00:00Z',
          to: '2024-06-01T00:00:00Z',
          precision: 'period',
          label: 'printemps 2024',
        },
        'fr',
      ),
    ).toMatch(/^printemps 2024 \(mars.*mai 2024\)$/);
    expect(
      formatOccurred(
        { from: '1996-01-01T00:00:00Z', to: '2008-01-01T00:00:00Z', precision: 'life_phase' },
        'fr',
      ),
    ).toMatch(/1996.*2007/);
    expect(formatOccurred({ from: null, precision: 'life_phase', label: 'enfance' }, 'fr')).toBe(
      'enfance',
    );
  });

  it('sans date ni précision : chaîne vide, et une date illisible ne jette pas', () => {
    expect(formatOccurred({}, 'fr')).toBe('');
    expect(formatOccurred({ from: 'hier', precision: 'exact' }, 'fr')).toBe('');
  });
});
