/**
 * Chiffres affichés par « Comment ça marche » (fiche 24), mêmes valeurs que la configuration de
 * psymate-api : vérification sous 2 jours ouvrés (G Q14, fiche 24), lien de confirmation valable
 * 24 h, justificatifs purgés 90 jours après la décision, demandes de contact purgées après 30 jours
 * (contrat, POST …/contact). Le contrat ne les expose pas encore : ils sont réunis ici, en un seul
 * endroit, à aligner sur le backend s'ils changent (écart noté, fiche 24).
 */
export const PUBLIC_FACTS = {
  verificationBusinessDays: 2,
  emailConfirmationHours: 24,
  documentsPurgeDays: 90,
  contactRetentionDays: 30,
  /** Validité du lien de vérification d'une demande de rendez-vous (contrat 0.15.0, K10). */
  bookingLinkMinutes: 30,
} as const;

/**
 * Numéros de la mention d'urgence des pages de prise de rendez-vous (G Q63, fiche 31) : 112
 * (urgences, Europe) et 3114 (prévention du suicide, France). Liste par pays à valider (K10) ; les
 * libellés sont dans $localize, les numéros seulement ici.
 */
export const EMERGENCY_NUMBERS = {
  emergency: '112',
  suicidePrevention: '3114',
} as const;
