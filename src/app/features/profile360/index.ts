// Surface publique de features/profile360 (handbook §4, §5 ; fiche 30, G Q52) :
// - loadProfile360Page : chargement paresseux de l'onglet 4 « Profil 360 » du dossier, pour la route
//   enfant `profile` du shell patient. Import dynamique : la page reste dans son propre morceau, même
//   si le shell importe cet index.
// - ProfileAddComponent (`pm-profile-add`, M13-07, G Q54) : le bouton « Ajouter au profil », que la
//   page du dossier pose au bout de la ligne des onglets (emplacement [pmViewToggle] de
//   pm-patient-header), sur l'onglet Profil 360 seulement et jamais pour un patient archivé. Un lien
//   vers /patients/:id/profile?ajouter=1 ; léger, il n'entraîne pas la page dans le morceau du shell.
// L'onglet se lit depuis M13-06 (un seul GET …/profile-items) ; il s'écrit depuis M13-07 (panneau
// latéral : ajouter, modifier, retirer, puis relecture). features/admin n'importe jamais cette
// feature (PATIENT_FEATURES, eslint).
export const loadProfile360Page = () =>
  import('./pages/profile360.page').then((m) => m.Profile360Page);
export { ProfileAddComponent } from './ui/profile-add.component';
