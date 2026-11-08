// Surface publique de features/search (handbook §4, §5) : l'onglet Recherche du dossier (fiche 07)
// et le branchement du champ de la barre d'application sur cette recherche.
// - loadSearchPage : chargement paresseux de la page, pour la route enfant `search` du shell patient
//   (la page reste dans son propre morceau même si app.component importe cet index) ;
// - DossierSearchBar : lu par app.component (query, placeholder ; input, submit de pm-app-bar).
export { DossierSearchBar } from './search-bar';

export const loadSearchPage = () =>
  import('./pages/patient-search.page').then((m) => m.PatientSearchPage);
