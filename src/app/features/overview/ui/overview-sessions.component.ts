import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { EntryIconComponent } from '../../../shared/ui';
import { RecentSession, TIMELINE_PARAMS } from '../data/overview.model';
import { formatLongDay, modalityLabel, sessionKindLabel } from './overview-labels';

/**
 * Dernières séances (fiche 02, B3 flux 6 : « un clic sur la dernière séance déplie ce qui y a été
 * dit ») : chaque séance se déplie (date, durée, modalité, nombre d'entrées ; compte rendu entier
 * pour la plus récente, première ligne pour les autres) et mène à la timeline par séance, dépliée
 * sur elle (`timeline?mode=session&focus=<id>`).
 */
@Component({
  selector: 'pm-overview-sessions',
  imports: [EntryIconComponent, RouterLink],
  template: `
    <ul class="sessions">
      @for (session of sessions(); track session.entryId; let first = $first) {
        @let open = expanded().includes(session.entryId);
        <li class="session" [class.open]="open">
          <button
            type="button"
            class="toggle"
            [attr.aria-expanded]="open"
            [attr.aria-controls]="'overview-session-' + session.entryId"
            (click)="toggle(session.entryId)"
          >
            <svg class="chevron" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
              <path d="M3 2l4 3-4 3" />
            </svg>
            <pm-entry-icon type="session" [size]="12" />
            <span class="title">{{ heading(session) }}</span>
            <span
              class="count"
              i18n="Nombre d'entrées d'une séance@@overview.sessions.entryCount"
              >{session.entryCount, plural,
                =0 {aucune entrée}
                =1 {1 entrée}
                other {{{session.entryCount}} entrées}
              }</span
            >
          </button>
          @if (open) {
            <div class="details" [id]="'overview-session-' + session.entryId">
              @if (!session.closedAt) {
                <p class="status" i18n="Séance non clôturée@@overview.sessions.open">
                  Séance en cours, non clôturée.
                </p>
              }
              @if (first && session.summary) {
                <p class="summary">{{ session.summary }}</p>
              } @else if (session.summaryFirstLine) {
                <p class="summary">{{ session.summaryFirstLine }}</p>
              } @else {
                <p class="none" i18n="Séance sans compte rendu@@overview.sessions.noSummary">
                  Pas de compte rendu.
                </p>
              }
              <a
                [routerLink]="['/patients', patientId(), 'timeline']"
                [queryParams]="timelineParams(session.entryId)"
                i18n="Lien d'une séance vers la timeline par séance@@overview.sessions.inTimeline"
                >Voir la séance dans la timeline</a
              >
            </div>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .sessions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .session {
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      overflow: hidden;
    }
    .toggle {
      width: 100%;
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border: 0;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
      text-align: left;
      cursor: pointer;
    }
    .open .toggle {
      background: var(--surface-ground);
    }
    .toggle:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }
    .chevron {
      width: 10px;
      height: 10px;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      transition: transform 150ms;
    }
    .open .chevron {
      transform: rotate(90deg);
    }
    .title {
      flex: 1 1 auto;
      font-weight: 600;
    }
    .count,
    .none,
    .status {
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .details {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 12px 12px;
      font: var(--mat-sys-body-medium);
      color: var(--text-primary);
    }
    .details p {
      margin: 0;
    }
    .summary {
      white-space: pre-line;
    }
    a {
      color: var(--primary);
      font: var(--mat-sys-label-large);
    }
    @media (prefers-reduced-motion: reduce) {
      .chevron {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewSessionsComponent {
  readonly sessions = input.required<RecentSession[]>();
  readonly patientId = input.required<string>();
  /** Séances dépliées (identifiants). */
  readonly expanded = input.required<string[]>();
  readonly expandedChange = output<string[]>();

  private readonly locale = inject(LOCALE_ID);

  protected heading(session: RecentSession): string {
    const parts: string[] = [];
    parts.push(session.occurredFrom ? formatLongDay(session.occurredFrom, this.locale) : '—');
    if (session.kind !== 'session') parts.push(sessionKindLabel(session.kind));
    if (session.durationMin !== null) {
      parts.push(
        $localize`:Durée d'une séance@@overview.sessions.duration:${session.durationMin}:minutes: min`,
      );
    }
    if (session.modality) parts.push(modalityLabel(session.modality));
    return parts.join(' · ');
  }

  protected toggle(id: string): void {
    const list = this.expanded();
    this.expandedChange.emit(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  protected timelineParams(id: string): Record<string, string> {
    return { [TIMELINE_PARAMS.mode]: 'session', [TIMELINE_PARAMS.focus]: id };
  }
}
