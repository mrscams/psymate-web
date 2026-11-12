import { ApiProblem } from '../../../core/http';
import { PatientHeaderInfo } from '../../../shared/ui';
import { CAPTURE_PREFIXES, CaptureEntryType } from '../../capture';
import { FlagKind, ShellPatient } from '../data/patient-shell.model';

// Libellés de features/patient-shell ($localize, français d'abord). Les codes viennent du contrat ;
// seuls ces libellés changent avec la langue.

export function flagLabel(kind: FlagKind): string {
  switch (kind) {
    case 'watch':
      return $localize`:Drapeau dans l'en-tête patient@@patientShell.flag.watch:À surveiller`;
    case 'risk':
      return $localize`:Drapeau dans l'en-tête patient@@patientShell.flag.risk:Risque`;
    case 'shared_care':
      return $localize`:Drapeau dans l'en-tête patient@@patientShell.flag.sharedCare:Suivi conjoint`;
  }
}

/** Le patient du store et le début de suivi retenu (store.followedSince) → pm-patient-header. */
export function toHeaderInfo(
  patient: ShellPatient,
  followedSince: string | null,
): PatientHeaderInfo {
  return {
    id: patient.id,
    displayName: patient.displayName,
    birthDate: patient.birthDate,
    followedSince,
    flags: patient.flags.map((kind) => ({ code: kind, label: flagLabel(kind) })),
  };
}

/**
 * Un dossier qui ne s'ouvrira pas en réessayant (403 PATIENT_FORBIDDEN, 404, 400 sur un :id qui
 * n'est pas un UUID) : titre et message de l'état erreur du shell, sans « Réessayer » ni
 * redirection. Null pour les autres problèmes, que l'en-tête montre avec « Réessayer ».
 */
export function finalLoadError(
  problem: ApiProblem | null,
): { title: string; message: string } | null {
  switch (problem?.code) {
    case 'PATIENT_FORBIDDEN':
      return {
        title: $localize`:Erreur du dossier, patient d'un autre praticien@@patientShell.error.forbidden.title:Ce dossier n'est pas le vôtre`,
        message: $localize`:Erreur du dossier, patient d'un autre praticien@@patientShell.error.forbidden.message:Il appartient à un autre praticien : vous ne pouvez ni le lire ni y écrire.`,
      };
    case 'PATIENT_NOT_FOUND':
    case 'MALFORMED_REQUEST':
      return {
        title: $localize`:Erreur du dossier introuvable@@patientShell.error.notFound.title:Ce dossier n'existe pas`,
        message: $localize`:Erreur du dossier introuvable@@patientShell.error.notFound.message:Le lien est peut-être incomplet ; retrouvez le dossier depuis la liste.`,
      };
    default:
      return null;
  }
}

/** Message d'une action de séance refusée : celui du serveur (déjà dans la langue), sinon générique. */
export function sessionProblemText(problem: ApiProblem | null): string {
  switch (problem?.code) {
    case 'SESSION_ALREADY_OPEN':
      return $localize`:Toast, séance déjà ouverte ailleurs@@patientShell.session.alreadyOpen:Une séance est déjà ouverte pour ce dossier : l'en-tête a été mis à jour.`;
    case 'SESSION_ALREADY_CLOSED':
      return $localize`:Toast, séance déjà clôturée ailleurs@@patientShell.session.alreadyClosed:Cette séance est déjà clôturée : l'en-tête a été mis à jour.`;
    default:
      return (
        problem?.errors?.[0]?.message ||
        problem?.detail ||
        $localize`:Toast, action de séance échouée@@patientShell.session.failed:L'action sur la séance n'a pas abouti. Réessayez.`
      );
  }
}

/** Une rangée de « Raccourcis dans le texte » : les exemples en gras, puis ce qu'ils produisent. */
export interface TextShortcutRow {
  tokens: string[];
  label: string;
}

/**
 * « Raccourcis dans le texte » de la colonne latérale en séance (proposition 04b, état 3) : ce que la
 * grammaire du bloc de saisie reconnaît. Les préfixes viennent du parseur (CAPTURE_PREFIXES).
 */
export function textShortcutRows(): TextShortcutRow[] {
  const prefix = (type: CaptureEntryType): string =>
    CAPTURE_PREFIXES.find((entry) => entry.type === type)?.prefix ?? '';
  return [
    {
      tokens: [
        $localize`:Exemple de ressenti dans la grammaire@@patientShell.ctx.shortcuts.feelingExample:anx 7`,
      ],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.feeling:ressenti`,
    },
    {
      tokens: [prefix('event')],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.event:événement`,
    },
    {
      tokens: [prefix('situation')],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.situation:situation`,
    },
    {
      tokens: [prefix('medication')],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.medication:médicament`,
    },
    { tokens: [prefix('note')], label: '' },
    {
      tokens: [
        $localize`:Exemple de date dans la grammaire@@patientShell.ctx.shortcuts.dateYesterday:hier`,
        $localize`:Exemple de date dans la grammaire@@patientShell.ctx.shortcuts.dateDay:12 mars`,
        $localize`:Exemple de date dans la grammaire@@patientShell.ctx.shortcuts.dateRelative:il y a 3 j`,
      ],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.dates:dates`,
    },
    {
      tokens: [
        $localize`:Exemple de lien dans la grammaire@@patientShell.ctx.shortcuts.linkExample:> cible`,
      ],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.link:lien`,
    },
  ];
}
