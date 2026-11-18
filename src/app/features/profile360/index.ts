// Surface publique de features/profile360 (handbook §4, §5 ; fiche 30, G Q52) :
// - loadProfile360Page : chargement paresseux de l'onglet 4 « Profil 360 » du dossier, pour la route
//   enfant `profile` du shell patient. Import dynamique : la page reste dans son propre morceau, même
//   si le shell importe cet index.
// L'onglet se lit depuis M13-06 (un seul GET …/profile-items) ; le panneau « Ajouter au profil »
// arrive avec M13-07. features/admin n'importe jamais cette feature (PATIENT_FEATURES, eslint).
export const loadProfile360Page = () =>
  import('./pages/profile360.page').then((m) => m.Profile360Page);
