/** Routes de l'identité et du triage (fiches 00, 11, 18, 25, 27). */
export const AUTH_PATHS = {
  login: '/connexion',
  confirmEmail: '/confirmer-email',
  suspended: '/compte-suspendu',
  firstLogin: '/premiere-connexion',
  home: '/patients',
  admin: '/admin',
} as const;
