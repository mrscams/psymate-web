import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { sessionModalityLabel } from '../../../shared/ui';
import { Loadable, StateKind } from '../../../shared/util';
import {
  blockState,
  isSessionsEmpty,
  OverviewView,
  RecentSession,
  TIMELINE_PARAMS,
  windowSessionCount,
} from '../data/overview.model';
import { sessionLine, windowLongLabel } from './overview-labels';
import { OverviewSectionComponent } from './overview-section.component';

/**
 * « Dernières séances » (UX-S6, proposition 02 `.sess`) : compteur « 2 sur 90 jours · 2 au total »
 * et « Toutes les séances » (timeline groupée par séance) ; une ligne par séance récente du serveur
 * (cinq au plus) : « Jeudi 5 novembre · cabinet · 50 min » (vers la séance dans la timeline), le
 * nombre d'entrées en secondaire, le compte rendu sur deux lignes au plus (entier pour la plus
 * récente, sa première ligne pour les autres : c'est ce que sert le contrat).
 */
@Component({
  selector: 'pm-overview-sessions',
  imports: [OverviewSectionComponent, RouterLink],
  template: `
    <pm-overview-section
      heading="Dernières séances"
      i18n-heading="Titre de la section des dernières séances@@overview.sessions.heading"
      [state]="state()"
      emptyTitle="Aucune séance"
      i18n-emptyTitle="Bloc dernière séance vide@@overview.simple.lastSession.empty.title"
      emptyMessage="La dernière séance et son compte rendu apparaîtront ici dès la première, démarrée depuis l'en-tête."
      i18n-emptyMessage="Bloc dernière séance vide@@overview.simple.lastSession.empty.message"
      errorTitle="Séances indisponibles"
      i18n-errorTitle="Erreur de la section des dernières séances@@overview.sessions.error"
      [refreshing]="refreshing()"
      (retry)="retry.emit()"
    >
      @if (view(); as v) {
        <span sectCount i18n="Compteur de la section des dernières séances@@overview.sessions.count"
          >{{ inWindow() }} sur {{ period() }} · {{ v.facts.sessionCount }} au total</span
        >
      }
      @if (view()) {
        <a
          sectLink
          [routerLink]="['/patients', patientId(), 'timeline']"
          [queryParams]="sessionsParams"
          i18n="Lien de la section des séances vers la timeline par séance@@overview.sessions.all"
          >Toutes les séances</a
        >
      }
      @if (view(); as v) {
        @for (session of v.recentSessions; track session.entryId) {
          <div class="sess">
            <a
              class="t"
              [routerLink]="['/patients', patientId(), 'timeline']"
              [queryParams]="sessionParams(session.entryId)"
            >
              <i class="dot" aria-hidden="true"></i>{{ line(session) }} </a
            >&ngsp;
            <span
              class="n"
              i18n="Nombre d'entrées d'une séance récente@@overview.sessions.entryCount"
              >{session.entryCount, plural,
                =0 {aucune entrée}
                =1 {1 entrée}
                other {{{session.entryCount}} entrées}
              }</span
            >
            @if (session.summary ?? session.summaryFirstLine; as summary) {
              <p class="s">{{ summary }}</p>
            }
          </div>
        }
      }
    </pm-overview-section>
  `,
  styles: `
    :host {
      display: block;
    }
    a {
      color: var(--primary);
    }
    /* Lien de l'en-tête de section (maquette .sect-head .right) : souligné au survol seulement. */
    a[sectLink] {
      text-decoration: none;
    }
    a[sectLink]:hover {
      text-decoration: underline;
    }
    .sess {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sess:last-child {
      border-bottom: 0;
    }
    .t {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      text-decoration: none;
    }
    .t:hover {
      text-decoration: underline;
    }
    .t:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .dot {
      display: inline-block;
      flex: none;
      width: 9px;
      height: 9px;
      box-sizing: border-box;
      border: 2px solid var(--entry-session);
      border-radius: 2px;
    }
    .n {
      font-size: 12.5px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .s {
      grid-column: 1 / -1;
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-secondary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewSessionsComponent {
  /** La synthèse du store (gardée pendant une relecture). */
  readonly overview = input.required<Loadable<OverviewView>>();
  readonly patientId = input.required<string>();
  readonly refreshing = input(false);
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly view = computed(() => this.overview().data);
  protected readonly state = computed<StateKind | null>(() =>
    blockState(this.overview(), isSessionsEmpty),
  );
  protected readonly period = computed(() => windowLongLabel(this.view()?.window ?? '90d'));
  protected readonly inWindow = computed(() => {
    const view = this.view();
    return view ? windowSessionCount(view) : 0;
  });

  protected readonly sessionsParams = { [TIMELINE_PARAMS.mode]: 'session' };

  protected sessionParams(entryId: string): Record<string, string> {
    return { [TIMELINE_PARAMS.mode]: 'session', [TIMELINE_PARAMS.focus]: entryId };
  }

  protected line(session: RecentSession): string {
    return sessionLine(session, this.locale, sessionModalityLabel);
  }
}
