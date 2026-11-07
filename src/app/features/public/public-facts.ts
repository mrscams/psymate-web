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
} as const;
