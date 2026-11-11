import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { EntryIconComponent, entryTitle, EntryType } from '../../../shared/ui';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { OverviewView } from '../data/overview.model';
import { formatDay, formatRecorded } from './overview-labels';

/** Une ligne d'« Activité récente », prête à afficher. */
export interface ActivityRow {
  entryId: string;
  type: EntryType;
  title: string;
  draft: boolean;
  /** « v3 » : seulement au-delà de la première version. */
  version: number | null;
  /** « il y a 6 min », « hier », « 12 sept. ». */
  when: string;
  /** Date complète, pour l'infobulle et les lecteurs d'écran. */
  whenFull: string;
}

/**
 * Le texte qui nomme une entrée récente, tiré de la même synthèse : RecentActivityItemDto n'a ni
 * texte ni émotion, mais le ressenti est dans feelings.points (émotion, intensité), la séance dans
 * recentSessions (première ligne du compte rendu), le médicament dans facts.medications. Le reste
 * retombe sur le titre de repli partagé (« Note · 24 oct. », UX-A5).
 */
export function activityRows(view: OverviewView, locale: string, now = new Date()): ActivityRow[] {
  const feelings = new Map(view.feelings.points.map((p) => [p.entryId, p]));
  const labels = new Map(view.feelings.series.map((s) => [s.emotionCode, s.label]));
  const sessions = new Map(view.recentSessions.map((s) => [s.entryId, s]));
  const medications = new Map(view.facts.medications.map((m) => [m.entryId, m]));
  return view.recentActivity.map((item) => {
    const feeling = item.type === 'feeling' ? feelings.get(item.entryId) : undefined;
    const session = item.type === 'session' ? sessions.get(item.entryId) : undefined;
    const medication = item.type === 'medication' ? medications.get(item.entryId) : undefined;
    const text =
      session?.summaryFirstLine ??
      (medication ? [medication.molecule, medication.dosage].filter(Boolean).join(' ') : null);
    const title = entryTitle(
      {
        type: item.type,
        title: item.title,
        text,
        occurred: item.occurredFrom,
        emotion: feeling ? (labels.get(feeling.emotionCode) ?? feeling.emotionCode) : null,
        intensity: feeling?.intensity ?? null,
      },
      locale,
      { now },
    );
    const at = item.recordedAt ?? item.occurredFrom;
    return {
      entryId: item.entryId,
      type: item.type,
      title,
      draft: item.status === 'draft',
      version: item.version > 1 ? item.version : null,
      when: at ? formatRecorded(at, locale, now) : '—',
      whenFull: at ? formatDay(at, locale) : '',
    };
  });
}

/**
 * Activité récente de la vue complète (maquette 02, UX-B4) : deux colonnes, icône du type, titre
 * de l'entrée (titre, sinon début du texte connu, sinon titre de repli partagé), badge « brouillon »
 * ou « v2 » seulement au-delà de la première version, moment de saisie relatif à droite. Chaque
 * ligne ouvre l'entrée dans l'éditeur (?entry=).
 */
@Component({
  selector: 'pm-overview-activity',
  imports: [EntryIconComponent, RouterLink],
  template: `
    <ul class="activity">
      @for (row of rows(); track row.entryId) {
        <li class="item">
          <pm-entry-icon [type]="row.type" [size]="12" [labelled]="true" />
          <a
            class="title"
            [routerLink]="[]"
            [queryParams]="entryParams(row.entryId)"
            queryParamsHandling="merge"
            >{{ row.title }}</a
          >
          @if (row.draft) {
            <span class="badge draft" i18n="Entrée en brouillon@@overview.activity.draft"
              >brouillon</span
            >
          } @else if (row.version) {
            <span class="badge" i18n="Version d'une entrée@@overview.activity.version"
              >v{{ row.version }}</span
            >
          }
          <span class="when" [attr.title]="row.whenFull">{{ row.when }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .activity {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 24px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    @media (max-width: 760px) {
      .activity {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      min-height: 36px;
      border-bottom: 1px solid var(--surface-sunken);
      font-size: 13px;
      line-height: 1.4;
    }
    .title {
      flex: 1 1 auto;
      min-width: 0;
      padding: 4px 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-primary);
      text-decoration: none;
    }
    .title:hover {
      text-decoration: underline;
    }
    .title:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .badge {
      flex: 0 0 auto;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--surface-sunken);
      color: var(--text-primary);
      font-size: 11px;
      line-height: 16px;
    }
    .badge.draft {
      background: var(--warning-bg);
      color: var(--warning);
    }
    .when {
      flex: 0 0 auto;
      min-width: 72px;
      text-align: right;
      font-size: 12px;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewActivityComponent {
  readonly view = input.required<OverviewView>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = computed(() => activityRows(this.view(), this.locale));

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_QUERY_PARAM]: entryId };
  }
}
