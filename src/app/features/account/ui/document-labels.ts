import { Profession } from '../../../core/auth';
import { DocumentType, ReviewStatus } from '../data/verification.api';

/** Libellé d'un type de justificatif (fiche 13, liste et formulaire). */
export function documentTypeLabel(type: DocumentType): string {
  switch (type) {
    case 'diploma':
      return $localize`:Type de justificatif@@account.verification.type.diploma:Diplôme`;
    case 'registration':
      return $localize`:Type de justificatif@@account.verification.type.registration:Attestation d'inscription (ADELI / RPPS)`;
    case 'certification':
      return $localize`:Type de justificatif@@account.verification.type.certification:Certification (coaching)`;
    case 'professional_card':
      return $localize`:Type de justificatif@@account.verification.type.professionalCard:Carte professionnelle`;
    case 'identity':
      return $localize`:Type de justificatif@@account.verification.type.identity:Pièce d'identité`;
    case 'other':
      return $localize`:Type de justificatif@@account.verification.type.other:Autre`;
  }
}

/** Libellé court pour « Il manque : … » et l'encart conseillé. */
export function documentTypeShort(type: DocumentType): string {
  switch (type) {
    case 'diploma':
      return $localize`:Type de justificatif, court@@account.verification.typeShort.diploma:diplôme`;
    case 'registration':
      return $localize`:Type de justificatif, court@@account.verification.typeShort.registration:attestation ADELI / RPPS`;
    case 'certification':
      return $localize`:Type de justificatif, court@@account.verification.typeShort.certification:certification de coaching`;
    case 'professional_card':
      return $localize`:Type de justificatif, court@@account.verification.typeShort.professionalCard:carte professionnelle`;
    case 'identity':
      return $localize`:Type de justificatif, court@@account.verification.typeShort.identity:pièce d'identité`;
    case 'other':
      return $localize`:Type de justificatif, court@@account.verification.typeShort.other:autre document`;
  }
}

/** Statut de relecture d'un justificatif (fiche 13 : En attente / Conforme / Non conforme). */
export function reviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case 'conform':
      return $localize`:Statut d'un justificatif@@account.verification.review.conform:Conforme`;
    case 'non_conform':
      return $localize`:Statut d'un justificatif@@account.verification.review.nonConform:Non conforme`;
    default:
      return $localize`:Statut d'un justificatif@@account.verification.review.pending:En attente de vérification`;
  }
}

export function professionLabel(profession: Profession | null): string {
  switch (profession) {
    case 'psychologist':
      return $localize`:Profession@@account.profession.psychologist:Psychologue`;
    case 'psychiatrist':
      return $localize`:Profession@@account.profession.psychiatrist:Psychiatre`;
    case 'coach':
      return $localize`:Profession@@account.profession.coach:Coach`;
    default:
      return '';
  }
}

/** « 1,8 Mo », « 420 Ko ». */
export function formatBytes(bytes: number, locale: string): string {
  const mo = bytes / (1024 * 1024);
  if (mo >= 1) {
    return $localize`:Taille de fichier en mégaoctets@@account.verification.size.mo:${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mo)}:size: Mo`;
  }
  return $localize`:Taille de fichier en kilooctets@@account.verification.size.ko:${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1024)}:size: Ko`;
}
