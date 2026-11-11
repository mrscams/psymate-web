import { ApiProblem } from '../../../core/http';

/** Message unique pour un code refusé (fiche 18 : sans distinguer la cause). */
export const INVALID_CODE_MESSAGE = $localize`:Code 2FA refusé, message unique@@account.security.code.invalid:Ce code n'est pas valide ou a déjà été utilisé.`;

/** Erreur réseau ou serveur sur une action de l'écran. */
export const UNAVAILABLE_MESSAGE = $localize`:Action de sécurité impossible, serveur ou réseau@@account.security.error.unavailable:Opération impossible pour le moment. Rien n'a été modifié ; réessayez dans un instant.`;

/** Appareil d'une session ou d'une connexion (« Chrome · Windows ») ; null avant M10-06. */
export function deviceLabel(device: string | null): string {
  return (
    device ??
    $localize`:Appareil inconnu d'une session@@account.security.sessions.unknownDevice:Appareil non identifié`
  );
}

/**
 * Après « Déconnecter les autres appareils » : le nombre renvoyé par le serveur (0 compris),
 * annoncé en aria-live (fiche 18 ; résumé des préférences, fiche 14). '' avant tout appel.
 */
export function revokedOthersMessage(count: number | null): string {
  if (count === null) return '';
  if (count === 0) {
    return $localize`:Aucune autre session révoquée@@account.security.sessions.revokedNone:Aucun autre appareil n'était connecté.`;
  }
  return count === 1
    ? $localize`:Une session révoquée@@account.security.sessions.revokedOne:1 appareil déconnecté.`
    : $localize`:Plusieurs sessions révoquées@@account.security.sessions.revokedMany:${count}:count: appareils déconnectés.`;
}

/** Confirmation commune avant « Déconnecter les autres appareils » (fiches 14 et 18). */
export function revokeOthersConfirmation(): {
  title: string;
  description: string;
  confirmLabel: string;
} {
  return {
    title: $localize`:Confirmation avant déconnexion des autres appareils@@account.security.sessions.confirmTitle:Déconnecter les autres appareils ?`,
    description: $localize`:Explication de la confirmation@@account.security.sessions.confirmBody:Cet appareil reste connecté. Les autres devront se reconnecter ; l'opération est consignée côté serveur.`,
    confirmLabel: $localize`:Bouton de la confirmation@@account.security.sessions.confirmButton:Déconnecter`,
  };
}

/** Vrai si le 422 porte une erreur de champ avec ce code (INVALID_CODE, INVALID_PASSWORD…). */
export function hasFieldCode(problem: ApiProblem | null, code: string): boolean {
  return problem?.status === 422 && (problem.errors ?? []).some((e) => e.code === code);
}

/**
 * Message de l'écran pour l'erreur de POST /api/me/2fa/verify ; null quand le verrou (423) ou un
 * champ l'affiche déjà, ou qu'il n'y a pas d'erreur.
 */
export function verifyErrorMessage(problem: ApiProblem | null): string | null {
  if (!problem) return null;
  switch (problem.status) {
    case 422:
      return INVALID_CODE_MESSAGE;
    case 409:
      return problem.code === 'TWO_FACTOR_ALREADY_ENABLED'
        ? $localize`:2FA déjà active au moment de vérifier@@account.security.verify.alreadyEnabled:La double authentification est déjà active sur ce compte.`
        : $localize`:Aucun secret en attente@@account.security.verify.notStarted:Le secret en attente a expiré. Recommencez l'activation depuis le début.`;
    case 423:
      return null;
    default:
      return UNAVAILABLE_MESSAGE;
  }
}
