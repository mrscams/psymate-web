import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ProfileIcon } from '../data/profile360.model';

/**
 * Icône d'une rubrique du Profil 360 (fiche 30 : horloge, personnes, cœur, boussole) : SVG inline,
 * tracés de la maquette 30-profil-360.html, trait `currentColor` (la couleur vient du parent).
 * Toujours décorative : le libellé de la rubrique est écrit à côté.
 */
@Component({
  selector: 'pm-profile-icon',
  template: `
    @switch (icon()) {
      @case ('clock') {
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 20 20"
          [attr.width]="size()"
          [attr.height]="size()"
        >
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l2.8 1.7" />
        </svg>
      }
      @case ('people') {
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 20 20"
          [attr.width]="size()"
          [attr.height]="size()"
        >
          <circle cx="7.5" cy="7" r="2.6" />
          <path d="M2.5 16c.5-2.8 2.4-4.3 5-4.3s4.5 1.5 5 4.3" />
          <circle cx="14" cy="6.5" r="2" />
          <path d="M13.8 11.3c2.1.1 3.3 1.5 3.7 3.7" />
        </svg>
      }
      @case ('heart') {
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 20 20"
          [attr.width]="size()"
          [attr.height]="size()"
        >
          <path d="M10 16.5s-6-3.6-6-8a3.5 3.5 0 0 1 6-2.3 3.5 3.5 0 0 1 6 2.3c0 4.4-6 8-6 8z" />
        </svg>
      }
      @case ('compass') {
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 20 20"
          [attr.width]="size()"
          [attr.height]="size()"
        >
          <circle cx="10" cy="10" r="7" />
          <path d="M12.8 7.2l-1.6 4-4 1.6 1.6-4z" />
        </svg>
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileIconComponent {
  readonly icon = input.required<ProfileIcon>();
  readonly size = input(18);
}
