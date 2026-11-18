// Données de test de features/profile360 (Vitest seulement) : un profil dans l'ordre que le serveur
// renvoie (rubrique, puis année et création dans history, création ailleurs). Les années de history
// ne sont volontairement pas croissantes entre deux informations datées de la même année et de celles
// sans année : le client ne doit rien retrier.
import { ProfileCategory, ProfileItem } from './profile360.model';

let next = 0;

export function profileItem(
  category: ProfileCategory,
  title: string,
  extra: Partial<ProfileItem> = {},
): ProfileItem {
  next += 1;
  return {
    id: `item-${next}`,
    category,
    title,
    detail: null,
    periodLabel: null,
    periodYear: null,
    ...extra,
  };
}

/** Profil complet : 3 informations d'histoire (dont une sans année, en dernier), 2, 1 et 1. */
export function fullProfile(): ProfileItem[] {
  return [
    profileItem('history', 'Enfance à Nantes', {
      detail: '« Sage, première de classe »',
      periodLabel: '1991 – 2002',
      periodYear: 1991,
    }),
    profileItem('history', 'Divorce des parents', { periodLabel: '2002', periodYear: 2002 }),
    profileItem('history', "L'odeur du tilleul", { detail: 'Souvenir sans date' }),
    profileItem('family', 'Thomas, compagnon', { detail: 'Vie commune depuis 2020' }),
    profileItem('family', '« Hélène », sa mère'),
    profileItem('health', 'Migraines', { detail: "Depuis l'adolescence" }),
    profileItem('values_goals', 'Reprendre le piano'),
  ];
}
