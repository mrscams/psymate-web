import { AppLocale } from '../../../core/i18n';
import { Availability, DirectoryVocabulary, VocabularyItem } from '../data/directory.models';

/** Libellé d'une profession (fiche 09 : « Coach », jamais « personal coach »). */
export function professionLabel(code: string): string {
  switch (code) {
    case 'psychologist':
      return $localize`:Profession@@public.profession.psychologist:Psychologue`;
    case 'psychiatrist':
      return $localize`:Profession@@public.profession.psychiatrist:Psychiatre`;
    case 'coach':
      return $localize`:Profession@@public.profession.coach:Coach`;
    default:
      return code;
  }
}

/** Profession au pluriel (fil d'Ariane de la fiche : Annuaire › Psychologues › Ville). */
export function professionPlural(code: string): string {
  switch (code) {
    case 'psychologist':
      return $localize`:Profession au pluriel@@public.profession.psychologist.plural:Psychologues`;
    case 'psychiatrist':
      return $localize`:Profession au pluriel@@public.profession.psychiatrist.plural:Psychiatres`;
    case 'coach':
      return $localize`:Profession au pluriel@@public.profession.coach.plural:Coachs`;
    default:
      return code;
  }
}

/** Disponibilité ; `unknown` n'est jamais rendu (fiche 08). */
export function availabilityLabel(availability: Availability): string | null {
  switch (availability) {
    case 'accepting':
      return $localize`:Disponibilité d'un praticien@@public.availability.accepting:Accepte de nouveaux patients`;
    case 'waitlist':
      return $localize`:Disponibilité d'un praticien@@public.availability.waitlist:Liste d'attente`;
    case 'closed':
      return $localize`:Disponibilité d'un praticien@@public.availability.closed:Complet`;
    default:
      return null;
  }
}

/** Modalités : libellés de secours tant que le vocabulaire n'est pas arrivé. */
function modalityFallback(code: string): string {
  switch (code) {
    case 'in_person':
      return $localize`:Modalité de consultation@@public.modality.inPerson:Au cabinet`;
    case 'video':
      return $localize`:Modalité de consultation@@public.modality.video:En visio`;
    case 'home':
      return $localize`:Modalité de consultation@@public.modality.home:À domicile`;
    default:
      return code;
  }
}

export type VocabularyKind = keyof DirectoryVocabulary;

/**
 * Libellé d'un code de liste fermée dans la langue de l'interface : libellé du vocabulaire
 * (l'anglais retombe sur le français s'il manque), sinon un secours (modalités : texte de
 * l'interface ; langues : Intl.DisplayNames ; autres : le code).
 */
export function vocabularyLabel(
  vocabulary: DirectoryVocabulary | null,
  kind: VocabularyKind,
  code: string,
  locale: AppLocale,
): string {
  const item = vocabulary?.[kind].find((candidate) => candidate.code === code);
  if (item) return itemLabel(item, locale);
  if (kind === 'modalities') return modalityFallback(code);
  if (kind === 'languages') return languageName(code, locale);
  return code;
}

export function itemLabel(item: VocabularyItem, locale: AppLocale): string {
  return locale === 'en' && item.labelEn ? item.labelEn : item.labelFr;
}

function languageName(code: string, locale: AppLocale): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : code;
  } catch {
    return code;
  }
}
