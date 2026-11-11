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

/**
 * Texte de la jauge (fiches 12 et 26 : jamais la couleur seule). La liste des mots de passe
 * compromis n'est consultée que par le serveur, à l'envoi : le texte le dit au lieu de l'affirmer.
 */
export function strengthText(level: PasswordStrengthLevel, length: number): string {
  switch (level) {
    case 0:
      return $localize`:Jauge de force, vide@@auth.register.strength.empty:12 caractères minimum.`;
    case 1:
      return $localize`:Jauge de force, trop court@@auth.register.strength.short:Trop court · ${length}:length: caractères sur 12.`;
    case 2:
      return $localize`:Jauge de force, faible@@auth.register.strength.weak:Faible · ${length}:length: caractères. Mélangez majuscules, chiffres et signes.`;
    case 3:
      return $localize`:Jauge de force, bon@@auth.register.strength.good:Bon · ${length}:length: caractères. Les fuites connues sont vérifiées à l'envoi.`;
    case 4:
      return $localize`:Jauge de force, fort@@auth.register.strength.strong:Fort · ${length}:length: caractères. Les fuites connues sont vérifiées à l'envoi.`;
  }
}

/** Critères affichés à l'étape 2 du mot de passe oublié (fiche 26) : état de chaque ligne. */
export type CriterionState = 'met' | 'pending' | 'server';

export interface PasswordCriteria {
  length: CriterionState;
  mixedCase: CriterionState;
  /** Liste des mots de passe compromis : seul le serveur la consulte (contrat), à l'envoi. */
  compromised: CriterionState;
  /** Chiffre ou symbole : conseillé, jamais exigé. */
  digitOrSymbol: CriterionState;
}

/** Évaluation de forme, en direct, des critères de la fiche 26 ; le serveur reste juge (422). */
export function passwordCriteria(password: string): PasswordCriteria {
  const state = (ok: boolean): CriterionState => (ok ? 'met' : 'pending');
  return {
    length: state(password.length >= PASSWORD_MIN_LENGTH),
    mixedCase: state(/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password)),
    compromised: 'server',
    digitOrSymbol: state(/[\p{N}\p{P}\p{S}]/u.test(password)),
  };
}
