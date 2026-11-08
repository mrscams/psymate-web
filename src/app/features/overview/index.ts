// Surface publique de features/overview (handbook §4, §5) :
// - loadOverviewPage : chargement paresseux de l'onglet 1 du dossier (fiche 02, M4-05), pour la
//   route enfant '' du shell patient. Import dynamique : la page (et ECharts, en @defer dans la
//   page) reste dans son propre morceau, même si le shell importe cet index ;
// - la bascule « Vue : Simple · Complète » (B8), que le shell pose dans l'emplacement
//   `[pmViewToggle]` de l'en-tête patient.
export { OverviewViewToggleComponent } from './ui/overview-view-toggle.component';

export const loadOverviewPage = () => import('./pages/overview.page').then((m) => m.OverviewPage);
