import { monthLabel, nodeDate } from './graph-labels';

describe('graph-labels · dates par la locale de formatage (Q73, M16-18)', () => {
  const now = new Date(2026, 10, 23);

  it('/fr/ : rendu inchangé', () => {
    expect(nodeDate('2026-10-24T09:00:00Z', 'fr', now)).toBe(
      new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' }).format(
        new Date('2026-10-24T09:00:00Z'),
      ),
    );
    expect(monthLabel('2026-10', 'fr')).toBe(
      new Intl.DateTimeFormat('fr', { month: 'short', year: 'numeric' }).format(
        new Date(2026, 9, 1),
      ),
    );
  });

  it('/ar/ : chiffres latins, calendrier grégorien', () => {
    const date = nodeDate('2025-10-24T09:00:00Z', 'ar', now);
    expect(date).toContain('2025');
    expect(date).toMatch(/24/);
    expect(date).not.toMatch(/[٠-٩]/);
    const month = monthLabel('2026-10', 'ar');
    expect(month).toContain('2026');
    expect(month).not.toMatch(/[٠-٩]/);
  });
});
