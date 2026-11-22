import { windowZoneLabel } from './booking-format';

describe('nom du fuseau d’une fenêtre (fiche 31)', () => {
  it('même décalage sur toute la fenêtre : le nom du jour', () => {
    expect(windowZoneLabel('Europe/Paris', 'fr', { from: '2026-11-23', to: '2026-12-06' })).toBe(
      'Europe/Paris (heure normale d’Europe centrale)',
    );
  });

  it('changement d’heure dans la fenêtre (fin mars) : le nom générique', () => {
    const label = windowZoneLabel('Europe/Paris', 'fr', { from: '2027-03-22', to: '2027-04-04' });
    expect(label).toBe('Europe/Paris (heure d’Europe centrale)');
    expect(label).not.toMatch(/normale|été/);
  });
});
