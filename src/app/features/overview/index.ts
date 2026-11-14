// Surface publique de features/overview (handbook §4, §5) :
// - loadOverviewPage : chargement paresseux de l'onglet Vue d'ensemble du dossier (fiche 02, UX-S6),
//   pour la route enfant '' du shell patient. Import dynamique : la page (et ECharts, en @defer dans
//   la page) reste dans son propre morceau, même si le shell importe cet index ;
// - le sélecteur « Fenêtre : 30 j · 90 j · 1 an » (UX-S6), que le shell pose dans l'emplacement
//   `[pmViewToggle]` de l'en-tête patient sur cet onglet.
export { OverviewWindowComponent } from './ui/overview-window.component';

export const loadOverviewPage = () => import('./pages/overview.page').then((m) => m.OverviewPage);
