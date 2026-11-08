import { ApiProblem } from '../../../core/http';
import { PatientHeaderInfo } from '../../../shared/ui';
import { FlagKind, ShellPatient, ShellTab } from '../data/patient-shell.model';

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

/** Le patient du store → ce que pm-patient-header affiche. */
export function toHeaderInfo(patient: ShellPatient): PatientHeaderInfo {
  return {
    id: patient.id,
    displayName: patient.displayName,
    birthDate: patient.birthDate,
    followedSince: patient.followedSince,
    flags: patient.flags.map((kind) => ({ code: kind, label: flagLabel(kind) })),
  };
}

export function tabLabel(tab: ShellTab): string {
  switch (tab) {
    case 'overview':
      return $localize`:Onglet du dossier@@patientShell.tab.overview:Vue d'ensemble`;
    case 'timeline':
      return $localize`:Onglet du dossier@@patientShell.tab.timeline:Timeline`;
    case 'graph':
      return $localize`:Onglet du dossier@@patientShell.tab.graph:Graphe`;
    case 'search':
      return $localize`:Recherche dans le dossier@@patientShell.tab.search:Recherche`;
  }
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
