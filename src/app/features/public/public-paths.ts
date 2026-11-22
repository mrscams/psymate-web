import { PUBLIC_PATHS } from '../../shared/ui';

/**
 * Routes de features/public (fiches 08, 09, 24). L'annuaire et « Comment ça marche » sont posés en
 * constantes par shared/ui (PUBLIC_PATHS, bandeau public) ; la fiche et l'inscription s'y ajoutent.
 */
export const PUBLIC_FEATURE_PATHS = {
  directory: PUBLIC_PATHS.directory,
  howItWorks: PUBLIC_PATHS.howItWorks,
  login: PUBLIC_PATHS.login,
  privacy: PUBLIC_PATHS.privacy,
  register: '/inscription',
  practitioners: '/praticiens',
} as const;

/** /praticiens/{slug} (fiche 09). */
export function practitionerPath(slug: string): string {
  return `${PUBLIC_FEATURE_PATHS.practitioners}/${encodeURIComponent(slug)}`;
}

/** Segment de la prise de rendez-vous sous la fiche (fiche 31) : /praticiens/{slug}/rendez-vous. */
export const BOOKING_SEGMENT = 'rendez-vous';

/** /praticiens/{slug}/rendez-vous (fiche 31). */
export function bookingPath(slug: string): string {
  return `${practitionerPath(slug)}/${BOOKING_SEGMENT}`;
}
