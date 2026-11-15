import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ACCOUNT_PATHS } from '../../../shared/ui';
import { CalendarKey } from '../data/agenda.model';
import { calendarLabel } from './agenda-format';

/**
 * Carte « Mes agendas » du rail gauche (fiche 15 §3, maquette) : trois cases pour les séances au
 * cabinet, en visio et les contacts, avec la pastille de leur couleur ; puis « Google Agenda ·
 * connecté », les deux agendas en lecture (vignette hachurée, « · lecture ») et la phrase sur le
 * niveau de détail avec le lien « Régler » vers les préférences. Sous la carte, la légende
 * (« À confirmer » pointillé, « Indisponible (Google) » hachuré).
 */
@Component({
  selector: 'pm-agenda-calendars',
  imports: [RouterLink],
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
      <h2 class="google">
        <ng-container i18n="Titre de la section Google Agenda du rail@@agenda.calendars.google"
          >Google Agenda</ng-container
        >
        <span class="connected" i18n="État de l'intégration Google@@agenda.calendars.connected"
          >connecté</span
        >
      </h2>
      @for (key of google; track key) {
        <label class="row">
          <input
            type="checkbox"
            class="accent-google"
            [checked]="!hidden().includes(key)"
            (change)="toggled.emit(key)"
          />
          <span class="swatch hatched" aria-hidden="true"></span>
          {{ label(key) }}
          <span class="read" i18n="Agenda Google en lecture seule@@agenda.calendars.readOnly"
            >· lecture</span
          >
        </label>
      }
      <p class="detail">
        <ng-container i18n="Niveau de détail copié dans Google@@agenda.calendars.detail"
          >Vos séances sont copiées dans l'agenda Google « PsyMate » sous la forme « Séance · M. D.
          ».</ng-container
        >
        <a [routerLink]="preferences" i18n="Lien vers les préférences@@agenda.calendars.settings"
          >Régler</a
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
      <li>
        <span class="key hatched" aria-hidden="true"></span>
        <ng-container i18n="Légende de l'agenda, indisponible@@agenda.legend.busy"
          >Indisponible (Google)</ng-container
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

  protected readonly mine: readonly CalendarKey[] = ['in_person', 'video', 'phone'];
  protected readonly google: readonly CalendarKey[] = ['google-pro', 'google-perso'];
  protected readonly preferences = ACCOUNT_PATHS.preferences;
  protected readonly legendLabel = $localize`:Nom de la légende de l'agenda@@agenda.legend.label:Légende`;
  protected readonly label = calendarLabel;
}
