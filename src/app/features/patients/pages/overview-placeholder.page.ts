import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * /patients/:id/overview provisoire (M1-06) : la destination de « après création → vue
 * d'ensemble » existe pour que la redirection aboutisse. M1-07 pose le shell /patients/:id et
 * M4-05 la vraie vue d'ensemble ; cette page et sa route disparaissent alors.
 */
@Component({
  selector: 'pm-overview-placeholder-page',
  imports: [RouterLink],
  template: `
    <h1 i18n="Titre provisoire de la vue d'ensemble@@patients.overview.title">Vue d'ensemble</h1>
    <p i18n="Texte provisoire de la vue d'ensemble@@patients.overview.placeholder">
      La vue d'ensemble du dossier s'affichera ici.
    </p>
    <p class="links">
      <a
        [routerLink]="['/patients', id(), 'fiche']"
        i18n="Lien vers la fiche@@patients.overview.sheetLink"
        >Modifier la fiche</a
      >
      <a routerLink="/patients" i18n="Lien vers la liste@@patients.overview.listLink"
        >Retour à la liste</a
      >
    </p>
  `,
  styles: `
    h1 {
      margin-top: 0;
      font: var(--mat-sys-headline-small);
      color: var(--text-primary);
    }
    p {
      color: var(--text-secondary);
    }
    .links {
      display: flex;
      gap: 16px;
    }
    a {
      color: var(--primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPlaceholderPage {
  readonly id = input.required<string>();
}
