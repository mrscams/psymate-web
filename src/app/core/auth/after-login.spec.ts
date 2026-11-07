import { afterLogin, safeNext, statusRedirect } from './after-login';
import { SessionUser, VerificationStatus } from './session.model';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'claire@example.test',
    displayName: 'Claire Martin',
    profession: 'psychologist',
    verificationStatus: 'approved',
    role: 'practitioner',
    twoFactorEnabled: false,
    passwordChangeRequired: false,
    ...overrides,
  };
}

describe('afterLogin() : triage après connexion', () => {
  // [cas, compte, next, destination attendue]
  const cases: [string, Partial<SessionUser>, string | null, string][] = [
    // Chaque statut de vérification, praticien, sans next.
    [
      'email_pending → confirmer l’e-mail',
      { verificationStatus: 'email_pending' },
      null,
      '/confirmer-email',
    ],
    [
      'docs_pending → patients (bandeau)',
      { verificationStatus: 'docs_pending' },
      null,
      '/patients',
    ],
    [
      'under_review → patients (bandeau)',
      { verificationStatus: 'under_review' },
      null,
      '/patients',
    ],
    ['needs_more → patients (bandeau)', { verificationStatus: 'needs_more' }, null, '/patients'],
    ['approved → patients', { verificationStatus: 'approved' }, null, '/patients'],
    ['rejected → compte suspendu', { verificationStatus: 'rejected' }, null, '/compte-suspendu'],
    ['suspended → compte suspendu', { verificationStatus: 'suspended' }, null, '/compte-suspendu'],
    ['closed → compte suspendu', { verificationStatus: 'closed' }, null, '/compte-suspendu'],
    ['statut inconnu (null) → patients', { verificationStatus: null }, null, '/patients'],
    // Mot de passe à changer : prime sur tout le reste (G Q5).
    [
      'passwordChangeRequired → première connexion',
      { passwordChangeRequired: true, role: 'admin', twoFactorEnabled: true },
      '/admin',
      '/premiere-connexion',
    ],
    [
      'passwordChangeRequired prime sur email_pending',
      { passwordChangeRequired: true, verificationStatus: 'email_pending' },
      null,
      '/premiere-connexion',
    ],
    // Administrateur.
    ['admin sans 2FA → première connexion', { role: 'admin' }, null, '/premiere-connexion'],
    ['admin sans 2FA, next ignoré', { role: 'admin' }, '/admin/journal', '/premiere-connexion'],
    ['admin avec 2FA → /admin', { role: 'admin', twoFactorEnabled: true }, null, '/admin'],
    [
      'admin avec 2FA, next suivi',
      { role: 'admin', twoFactorEnabled: true },
      '/admin/journal',
      '/admin/journal',
    ],
    // next.
    [
      'next interne suivi',
      {},
      '/patients/42/timeline?mode=list',
      '/patients/42/timeline?mode=list',
    ],
    [
      'next suivi même en docs_pending',
      { verificationStatus: 'docs_pending' },
      '/mon-compte',
      '/mon-compte',
    ],
    [
      'next ignoré si statut bloquant',
      { verificationStatus: 'suspended' },
      '/patients',
      '/compte-suspendu',
    ],
    ['next externe ignoré', {}, 'https://exemple.test/piege', '/patients'],
    ['next //hôte ignoré', {}, '//exemple.test', '/patients'],
    ['next /\\hôte ignoré', {}, '/\\exemple.test', '/patients'],
    ['next vers /connexion ignoré', {}, '/connexion?next=/patients', '/patients'],
    ['next vide ignoré', {}, '', '/patients'],
  ];

  it.each(cases)('%s', (_label, overrides, next, expected) => {
    expect(afterLogin(user(overrides), next)).toBe(expected);
  });

  it('next absent : accueil du rôle', () => {
    expect(afterLogin(user())).toBe('/patients');
  });
});

describe('statusRedirect()', () => {
  const statuses: [VerificationStatus, string | null][] = [
    ['email_pending', '/confirmer-email'],
    ['docs_pending', null],
    ['under_review', null],
    ['approved', null],
    ['needs_more', null],
    ['rejected', '/compte-suspendu'],
    ['suspended', '/compte-suspendu'],
    ['closed', '/compte-suspendu'],
  ];

  it.each(statuses)('%s → %s', (verificationStatus, expected) => {
    expect(statusRedirect(user({ verificationStatus }))).toBe(expected);
  });
});

describe('safeNext()', () => {
  it('refuse les caractères de contrôle et les URL trop longues', () => {
    expect(safeNext('/patients\n')).toBeNull();
    expect(safeNext(`/${'a'.repeat(2001)}`)).toBeNull();
  });

  it('accepte /connexion-xyz (autre route que /connexion)', () => {
    expect(safeNext('/connexionnaire')).toBe('/connexionnaire');
  });
});
