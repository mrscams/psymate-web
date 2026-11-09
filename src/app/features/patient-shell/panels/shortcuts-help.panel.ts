import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SidePanelComponent } from '../../../shared/ui';
import { HelpRow } from '../ui/shortcuts-help.model';

export interface ShortcutsHelpData {
  rows: HelpRow[];
}

/**
 * Aide des raccourcis (planche 29 §6, M7-03) dans le panneau latéral : `role="dialog"`, titre
 * « Raccourcis clavier », focus piégé, Échap et la croix ferment, le focus revient au déclencheur
 * (shared/ui/side-panel). Un vrai tableau (légende, en-têtes de colonne et de ligne) ; une touche
 * sans objet ici reste lisible (contraste conservé) et le dit en toutes lettres, « indisponible
 * ici », sans compter sur la couleur.
 */
@Component({
  selector: 'pm-shortcuts-help-panel',
  imports: [SidePanelComponent],
  template: `
    <pm-side-panel [title]="title">
      <table class="shortcuts">
        <caption
          class="sr-only"
          i18n="Légende du tableau des raccourcis@@patientShell.help.caption"
        >
          Raccourcis disponibles et leur effet
        </caption>
        <thead>
          <tr>
            <th scope="col" i18n="Colonne du tableau des raccourcis@@patientShell.help.key">
              Touche
            </th>
            <th scope="col" i18n="Colonne du tableau des raccourcis@@patientShell.help.effect">
              Effet
            </th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows; track row.keys.join('+')) {
            <tr [class.unavailable]="!row.available">
              <th scope="row" class="keys">
                @for (key of row.keys; track $index) {
                  @if ($index > 0 && row.combo) {
                    <span class="plus">+</span>
                  }
                  <kbd>{{ key }}</kbd>
                }
              </th>
              <td>
                {{ row.label }}
                @if (!row.available) {
                  <span
                    class="off"
                    i18n="Raccourci sans objet sur l'écran courant@@patientShell.help.unavailable"
                    >indisponible ici</span
                  >
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
      <p class="note" i18n="Règle des raccourcis à une lettre@@patientShell.help.note">
        Les raccourcis à une lettre sont inactifs dans un champ de saisie. Sur Mac, Ctrl devient ⌘.
      </p>
    </pm-side-panel>
  `,
  styles: `
    .shortcuts {
      width: 100%;
      border-collapse: collapse;
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
    }

    th,
    td {
      padding: 8px 0;
      border-bottom: 1px solid var(--border-subtle);
      text-align: left;
      vertical-align: top;
    }

    thead th {
      color: var(--text-secondary);
      font: var(--mat-sys-label-medium);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .keys {
      width: 132px;
      padding-right: 12px;
      font-weight: 400;
      white-space: nowrap;
    }

    kbd + kbd,
    .plus + kbd {
      margin-left: 4px;
    }

    .plus {
      margin-left: 4px;
      color: var(--text-secondary);
    }

    .unavailable td {
      color: var(--text-secondary);
    }

    .off {
      display: block;
      font: var(--mat-sys-body-small);
      font-style: italic;
    }

    .note {
      margin: 16px 0 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShortcutsHelpPanel {
  protected readonly title = $localize`:Titre du panneau d'aide des raccourcis@@patientShell.help.title:Raccourcis clavier`;
  protected readonly rows = inject<ShortcutsHelpData>(DIALOG_DATA).rows;
}
