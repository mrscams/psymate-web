import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CALENDAR_KEYS, CalendarKey } from '../data/agenda.model';
import { calendarLabel } from './agenda-format';

/**
 * Carte « Mes agendas » du rail gauche (fiche 15 §3, maquette) : trois cases pour les séances au
 * cabinet, en visio et par téléphone, avec la pastille de leur couleur ; puis « Google Agenda · à
 * venir » en text-secondary (texte et non contrôle : le contraste AA s'applique) : pas d'intégration
 * en V1 (jalon M12). Sous la carte, la légende (« À confirmer » pointillé).
 */
@Component({
  selector: 'pm-agenda-calendars',
  template: `
    <div class="card">
      <h2 i18n="Titre de la carte des agendas@@agenda.calendars.mine">Mes agendas</h2>
      @for (key of mine; track key) {
        <label class="row">
          <input
            type="checkbox"
            [class]="'accent-' + key"
            [checked]="!hidden().includes(key)"
            (change)="toggled.emit(key)"
          />
          <span class="swatch" [class]="'swatch ' + key" aria-hidden="true"></span>
          {{ label(key) }}
        </label>
      }
      <div class="divider" role="presentation"></div>
      <p class="google">
        <ng-container i18n="Titre de la section Google Agenda du rail@@agenda.calendars.google"
          >Google Agenda</ng-container
        >{{ ' '
        }}<span class="later" i18n="Google Agenda, intégration à venir@@agenda.calendars.later"
          >à venir</span
        >
      </p>
    </div>
    <ul class="legend" [attr.aria-label]="legendLabel">
      <li>
        <span class="key dashed" aria-hidden="true"></span>
        <ng-container i18n="Légende de l'agenda, à confirmer@@agenda.legend.tentative"
          >À confirmer</ng-container
        >
      </li>
    </ul>
  `,
  styleUrl: './agenda-calendars.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaCalendarsComponent {
  readonly hidden = input.required<readonly CalendarKey[]>();
  readonly toggled = output<CalendarKey>();

  protected readonly mine = CALENDAR_KEYS;
  protected readonly legendLabel = $localize`:Nom de la légende de l'agenda@@agenda.legend.label:Légende`;
  protected readonly label = calendarLabel;
}
