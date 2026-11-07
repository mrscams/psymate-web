import { PASSWORD_MIN_LENGTH } from '../../../shared/forms';

/** Force affichée en quatre barres (fiche 12) : 0 = vide, 1 = trop court, 2 = faible, 3 = bon, 4 = fort. */
export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  level: PasswordStrengthLevel;
  /** Nombre de caractères, repris dans le texte (« Bon · 14 caractères »). */
  length: number;
}

/**
 * Estimation de forme, côté client seulement (CLAUDE.md : le serveur reste juge ; il vérifie la
 * liste des mots de passe compromis et les données personnelles). Longueur d'abord : sous 12
 * caractères, jamais plus d'une barre ; puis variété (minuscules, majuscules, chiffres, autres) et
 * longueur confortable.
 */
export function passwordStrength(password: string): PasswordStrength {
  const length = password.length;
  if (length === 0) return { level: 0, length };
  if (length < PASSWORD_MIN_LENGTH) return { level: 1, length };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(password)).length;
  const repeated = /(.)\1{3,}/.test(password);
  let score = 2;
  if (classes >= 3 && !repeated) score = 3;
  if (classes >= 3 && length >= 16 && !repeated) score = 4;
  if (classes === 4 && length >= 14 && !repeated) score = 4;
  return { level: score as PasswordStrengthLevel, length };
}
