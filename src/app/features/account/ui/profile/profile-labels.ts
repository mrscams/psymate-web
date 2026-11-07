import { AppLocale } from '../../../../core/i18n';
import { Availability, DirectoryVocabulary, VocabularyItem } from '../../data/profile.api';
import { MissingItem } from '../../data/profile.store';
import { ChipOption } from './chip-picker.component';

/** Libellé d'une entrée de la liste fermée dans la langue de l'écran (anglais absent : français). */
export function itemLabel(item: VocabularyItem, locale: AppLocale): string {
  return locale === 'en' && item.labelEn ? item.labelEn : item.labelFr;
}

export function chipOptions(items: readonly VocabularyItem[], locale: AppLocale): ChipOption[] {
  return items.map((item) => ({ code: item.code, label: itemLabel(item, locale) }));
}

/** Libellés de codes d'une liste (un code inconnu reste affiché tel quel). */
export function labelsOf(
  codes: readonly string[],
  items: readonly VocabularyItem[] | undefined,
  locale: AppLocale,
): string[] {
  const byCode = new Map((items ?? []).map((item) => [item.code, itemLabel(item, locale)]));
  return codes.map((code) => byCode.get(code) ?? code);
}

export type VocabularyKind = keyof DirectoryVocabulary;

export function availabilityLabel(availability: Availability): string {
  switch (availability) {
    case 'accepting':
      return $localize`:Disponibilité@@profile.availability.accepting:Accepte de nouveaux patients`;
    case 'waitlist':
      return $localize`:Disponibilité@@profile.availability.waitlist:Liste d'attente`;
    case 'closed':
      return $localize`:Disponibilité@@profile.availability.closed:Complet`;
    case 'unknown':
      return $localize`:Disponibilité non renseignée@@profile.availability.unknown:Non précisée`;
  }
}

/** Ligne à corriger pour un élément de missing[] (409 PROFILE_INCOMPLETE). */
export function missingLabel(item: MissingItem): string {
  switch (item) {
    case 'verification':
      return $localize`:Publication refusée, dossier non approuvé@@profile.missing.verification:Votre dossier professionnel doit être approuvé.`;
    case 'displayName':
      return $localize`:Publication refusée, nom affiché@@profile.missing.displayName:Renseignez le nom affiché.`;
    case 'profession':
      return $localize`:Publication refusée, profession@@profile.missing.profession:La profession de votre compte est manquante.`;
    case 'city':
      return $localize`:Publication refusée, ville@@profile.missing.city:Renseignez la ville du cabinet.`;
    case 'contact':
      return $localize`:Publication refusée, aucun contact affiché@@profile.missing.contact:Affichez au moins un moyen de contact renseigné (téléphone, e-mail ou adresse).`;
    case 'specialties':
      return $localize`:Publication refusée, spécialité retirée de la liste@@profile.missing.specialties:Une spécialité choisie n'est plus proposée : retirez-la.`;
    case 'audiences':
      return $localize`:Publication refusée, public retiré de la liste@@profile.missing.audiences:Un public choisi n'est plus proposé : retirez-le.`;
  }
}

/** Délais de réponse proposés (texte libre côté contrat, 60 caractères ; vide = ne pas afficher). */
export function responseDelayOptions(): string[] {
  return [
    $localize`:Délai de réponse proposé@@profile.responseDelay.day:Sous 24 h`,
    $localize`:Délai de réponse proposé@@profile.responseDelay.twoDays:Sous 48 h en général`,
    $localize`:Délai de réponse proposé@@profile.responseDelay.week:Sous une semaine`,
  ];
}

/** Initiales du nom affiché (« Claire Martin » → « CM »), à défaut de photo. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/^(dr|pr|m|mme)\.?\s+/i, '')
    .split(/[\s-]+/)
    .filter((word) => /\p{L}/u.test(word));
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return letters.map((word) => (word.match(/\p{L}/u)?.[0] ?? '').toUpperCase()).join('') || '?';
}
