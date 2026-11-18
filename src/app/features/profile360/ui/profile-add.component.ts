import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ADD_QUERY_PARAM } from '../data/profile360.model';

/**
 * Bouton « Ajouter au profil » (fiche 30, G Q54) : contour, pas cobalt plein, icône « plus ».
 * Posé par la page du dossier (features/patient-shell) au bout de la ligne des onglets, dans
 * l'emplacement `[pmViewToggle]` de pm-patient-header, sur l'onglet Profil 360 seulement et jamais
 * pour un patient archivé ; la page de l'onglet le pose aussi dans l'état vide. C'est un lien vers
 * `/patients/:id/profile?ajouter=1` : les autres paramètres (dont `rubrique`) sont gardés, et la
 * page ouvre le panneau en création, rubrique affichée préremplie.
 */
@Component({
  selector: 'pm-profile-add',
  imports: [RouterLink],
  template: `
    <a
      class="add"
      [routerLink]="['/patients', patientId(), 'profile']"
      [queryParams]="addParams"
      queryParamsHandling="merge"
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="14" height="14">
        <path d="M8 3.5v9M3.5 8h9" />
      </svg>
      <span i18n="Bouton qui ouvre le panneau Ajouter au profil@@profile360.add"
        >Ajouter au profil</span
      >
    </a>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    /* Maquette 30 .btn : 32 px, contour --border-subtle, rayon 8. */
    .add {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      text-decoration: none;

      &:hover {
        border-color: var(--border-strong);
      }

      &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 1px;
      }
    }

    svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileAddComponent {
  readonly patientId = input.required<string>();

  protected readonly addParams = { [ADD_QUERY_PARAM]: '1' };
}
