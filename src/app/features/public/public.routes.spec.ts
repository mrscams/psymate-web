import { PUBLIC_ROUTES } from './public.routes';

function dataOf(path: string): Record<string, unknown> {
  const route = PUBLIC_ROUTES.find((r) => r.path === path);
  expect(route).toBeDefined();
  return (route?.data ?? {}) as Record<string, unknown>;
}

describe('routes publiques : largeur du contenu (UX-A9c)', () => {
  it('annuaire : contentWidth wide (1 280 px du layout public, maquette 08)', () => {
    expect(dataOf('annuaire')['contentWidth']).toBe('wide');
  });

  it.each([
    'praticiens/:slug',
    'praticiens/:slug/rendez-vous',
    'comment-ca-marche',
    'mentions-legales',
    'confidentialite',
    'accessibilite',
  ])('%s : largeur par défaut gardée (data.wide, sans contentWidth)', (path) => {
    const data = dataOf(path);
    expect(data['wide']).toBe(true);
    expect(data['contentWidth']).toBeUndefined();
  });
});

describe('prise de rendez-vous (fiche 31)', () => {
  it('route chargée à la demande, titre « Prendre rendez-vous · PsyMate »', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === 'praticiens/:slug/rendez-vous');
    expect(route?.loadComponent).toBeDefined();
    expect(route?.component).toBeUndefined();
    expect(route?.title).toBe('Prendre rendez-vous · PsyMate');
  });
});
