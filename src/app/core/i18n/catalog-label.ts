import { AppLocale } from './locales';

/** Élément de catalogue servi par l'API : libellé français toujours, anglais et arabe s'ils existent. */
export interface CatalogLabels {
  labelFr: string;
  labelEn?: string | null;
  labelAr?: string | null;
}

/**
 * Libellé d'un élément de catalogue dans la langue du bundle (Q78) : l'arabe s'il existe, sinon le
 * français ; l'anglais s'il existe, sinon le français. Un libellé vide compte comme absent.
 */
export function catalogLabel(item: CatalogLabels, locale: AppLocale): string {
  const translated = locale === 'ar' ? item.labelAr : locale === 'en' ? item.labelEn : null;
  return translated ? translated : item.labelFr;
}
