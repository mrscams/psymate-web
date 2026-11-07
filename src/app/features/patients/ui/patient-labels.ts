import { FlagKind, Modality, PatientSort, Pronoun, Rhythm } from '../data/patient.model';

// Libellés de features/patients ($localize, français d'abord). Les codes viennent du contrat ou de
// la fiche 16 ; seuls ces libellés changent avec la langue.

export function flagLabel(kind: FlagKind): string {
  switch (kind) {
    case 'watch':
      return $localize`:Drapeau patient@@patients.flag.watch:À surveiller`;
    case 'risk':
      return $localize`:Drapeau patient@@patients.flag.risk:Risque`;
    case 'shared_care':
      return $localize`:Drapeau patient@@patients.flag.sharedCare:Suivi conjoint`;
  }
}

export function pronounLabel(pronoun: Pronoun): string {
  switch (pronoun) {
    case 'elle':
      return $localize`:Pronom du patient@@patients.pronoun.elle:Elle`;
    case 'il':
      return $localize`:Pronom du patient@@patients.pronoun.il:Il`;
    case 'iel':
      return $localize`:Pronom du patient@@patients.pronoun.iel:Iel`;
    case 'neutre':
      return $localize`:Pronom du patient@@patients.pronoun.neutre:Neutre`;
  }
}

export function rhythmLabel(rhythm: Rhythm): string {
  switch (rhythm) {
    case 'weekly':
      return $localize`:Rythme de suivi@@patients.rhythm.weekly:Hebdomadaire`;
    case 'biweekly':
      return $localize`:Rythme de suivi@@patients.rhythm.biweekly:Toutes les 1 à 2 semaines`;
    case 'monthly':
      return $localize`:Rythme de suivi@@patients.rhythm.monthly:Mensuel`;
    case 'irregular':
      return $localize`:Rythme de suivi@@patients.rhythm.irregular:Irrégulier`;
  }
}

export function modalityLabel(modality: Modality): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité de séance@@patients.modality.inPerson:Cabinet`;
    case 'video':
      return $localize`:Modalité de séance@@patients.modality.video:Visio`;
    case 'phone':
      return $localize`:Modalité de séance@@patients.modality.phone:Téléphone`;
  }
}

export function sortLabel(sort: PatientSort): string {
  switch (sort) {
    case 'name':
      return $localize`:Tri de la liste des patients@@patients.sort.name:Nom A → Z`;
    case 'updated':
      return $localize`:Tri de la liste des patients@@patients.sort.updated:Dernière modification`;
    case 'created':
      return $localize`:Tri de la liste des patients@@patients.sort.created:Date de création`;
  }
}

/** Libellé d'un champ de la fiche (historique des versions, résumé d'erreurs). */
export function fieldLabel(field: string): string {
  const labels: Record<string, () => string> = {
    displayName: () =>
      $localize`:Champ de la fiche patient@@patients.field.displayName:Nom affiché`,
    firstName: () => $localize`:Champ de la fiche patient@@patients.field.firstName:Prénom`,
    lastName: () => $localize`:Champ de la fiche patient@@patients.field.lastName:Nom`,
    birthDate: () =>
      $localize`:Champ de la fiche patient@@patients.field.birthDate:Date de naissance`,
    pronoun: () => $localize`:Champ de la fiche patient@@patients.field.pronoun:Pronom / accord`,
    phone: () => $localize`:Champ de la fiche patient@@patients.field.phone:Téléphone`,
    email: () => $localize`:Champ de la fiche patient@@patients.field.email:E-mail`,
    'context.situation': () =>
      $localize`:Champ de la fiche patient@@patients.field.situation:Situation`,
    'context.activity': () =>
      $localize`:Champ de la fiche patient@@patients.field.activity:Activité`,
    'context.referredBy': () =>
      $localize`:Champ de la fiche patient@@patients.field.referredBy:Adressé·e par`,
    'context.initialReason': () =>
      $localize`:Champ de la fiche patient@@patients.field.initialReason:Motif initial`,
    'context.history': () =>
      $localize`:Champ de la fiche patient@@patients.field.history:Histoire et éléments à garder en tête`,
    'followUp.since': () =>
      $localize`:Champ de la fiche patient@@patients.field.since:Suivi·e depuis`,
    'followUp.rhythm': () =>
      $localize`:Champ de la fiche patient@@patients.field.rhythm:Rythme habituel`,
    'followUp.modality': () =>
      $localize`:Champ de la fiche patient@@patients.field.modality:Modalité par défaut`,
    'followUp.durationMin': () =>
      $localize`:Champ de la fiche patient@@patients.field.durationMin:Durée de séance (min)`,
    'followUp.fee': () => $localize`:Champ de la fiche patient@@patients.field.fee:Tarif`,
    'followUp.prescriber': () =>
      $localize`:Champ de la fiche patient@@patients.field.prescriber:Médecin / prescripteur`,
    'flags.watchReason': () =>
      $localize`:Champ de la fiche patient@@patients.field.watchReason:Raison du drapeau`,
  };
  return labels[field]?.() ?? field;
}

/**
 * Toast après archivage (fiche 16 : « Marie D. archivée · Restaurer ») ; l'accord suit le pronom
 * de la fiche, écriture inclusive sinon.
 */
export function archivedMessage(name: string, pronoun: string | null): string {
  switch (pronoun) {
    case 'elle':
      return $localize`:Toast après archivage, accord féminin@@patients.archived.toast.f:${name}:name: archivée`;
    case 'il':
      return $localize`:Toast après archivage, accord masculin@@patients.archived.toast.m:${name}:name: archivé`;
    default:
      return $localize`:Toast après archivage, accord inclusif@@patients.archived.toast.n:${name}:name: archivé·e`;
  }
}

export function restoredMessage(name: string, pronoun: string | null): string {
  switch (pronoun) {
    case 'elle':
      return $localize`:Toast après restauration, accord féminin@@patients.restored.toast.f:${name}:name: restaurée`;
    case 'il':
      return $localize`:Toast après restauration, accord masculin@@patients.restored.toast.m:${name}:name: restauré`;
    default:
      return $localize`:Toast après restauration, accord inclusif@@patients.restored.toast.n:${name}:name: restauré·e`;
  }
}

export const RESTORE_LABEL = (): string =>
  $localize`:Action du toast d'archivage@@patients.archived.restore:Restaurer`;

/** Message d'une erreur d'écriture non rattachée à un champ (5xx, réseau, 409). */
export function writeProblemMessage(code: string | undefined): string {
  switch (code) {
    case 'PATIENT_ARCHIVED':
      return $localize`:Erreur d'écriture, patient archivé@@patients.error.archived:Ce dossier est archivé : restaurez-le avant de le modifier.`;
    case 'FLAG_ALREADY_ACTIVE':
      return $localize`:Erreur d'écriture, drapeau déjà posé@@patients.error.flagActive:Ce drapeau est déjà posé : la fiche a été rechargée.`;
    case 'PATIENT_FORBIDDEN':
    case 'PATIENT_NOT_FOUND':
      return $localize`:Erreur d'écriture, dossier introuvable@@patients.error.notFound:Ce dossier n'existe pas ou ne vous appartient pas.`;
    default:
      return $localize`:Erreur d'écriture générique@@patients.error.generic:L'enregistrement n'a pas abouti. Vos saisies sont conservées : réessayez.`;
  }
}
