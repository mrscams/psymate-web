import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';

import { Occurred } from '../../../shared/util';
import { TimelineZoom } from '../data/timeline.model';
import { anchorLabel } from './timeline-labels';

/**
 * Ancre d'un jour du flux (proposition 03, `.day .date`, UX-S9) : le jour écrit une fois, à gauche
 * de l'axe, aligné à droite (« Jeudi 12 » en 600/13,5, dessous « aujourd'hui », « hier », « séance »
 * ou « il y a 4 j » en 12 secondaire). Sur téléphone (`narrow`), un en-tête au-dessus des lignes,
 * en capitales 12/600 (« JEUDI 12 · AUJOURD'HUI »). Zoom semaine ou mois : la semaine ou le mois ;
 * date moins précise : sa propre forme (mois, année, période).
 */
@Component({
  selector: 'pm-timeline-day',
  template: `
    @if (narrow()) {
      <p class="day-head">
        {{ label().main }}
        @if (label().sub) {
          <span aria-hidden="true">·</span> {{ label().sub }}
        }
      </p>
    } @else {
      <p class="date" [attr.title]="label().main">
        <b>{{ label().main }}</b>
        @if (label().sub) {
          <span>{{ label().sub }}</span>
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    p {
      margin: 0;
    }

    .date {
      padding-top: 12px;
      text-align: right;

      b,
      span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      b {
        font-size: 13.5px;
        font-weight: 600;
        line-height: 18px;
      }

      span {
        color: var(--text-secondary);
        font-size: 12px;
        line-height: 16px;
      }
    }

    .day-head {
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      line-height: 16px;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineDayComponent {
  readonly occurred = input.required<Occurred>();
  readonly zoom = input<TimelineZoom>('day');
  /** Le jour commence par une séance : « séance » sous la date. */
  readonly session = input(false);
  readonly today = input<Date>(new Date());
  readonly narrow = input(false);

  private readonly locale = inject(LOCALE_ID);

  protected readonly label = computed(() =>
    anchorLabel(this.occurred(), this.zoom(), this.locale, this.today(), this.session()),
  );
}
