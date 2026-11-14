import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { minutesBetween } from '../../../core/i18n';
import { initials } from '../../../shared/util';
import { demoDisplayName } from '../data/patient.model';
import { TodayRow } from '../data/patient-list.store';
import { clockTime, modalityText, reportText } from './patient-row';

interface TodayCard {
  id: string;
  initials: string;
  name: string;
  /** « en séance · 12 min » quand la séance est ouverte. */
  live: string | null;
  /** « cabinet · 2 entrées notées », « visio · clôturée à 09:45 · compte rendu à écrire ». */
  sub: string;
  action: { label: string; link: string[]; session: boolean };
}

/**
 * Bande « Aujourd'hui » de la liste (maquette 01 `.sect` + `.today`, UX-S7) : une carte par patient
 * de la page dont une séance est ouverte (« Reprendre », onglet Séance) ou dont la séance la plus
 * récente a été clôturée aujourd'hui (« Compte rendu » si le compte rendu est vide, sinon
 * « Ouvrir »). Pas de compteur dans le titre (décision 4 du 14 novembre 2026). La page ne la montre
 * que si au moins un patient de la page est concerné.
 */
@Component({
  selector: 'pm-patient-today',
  imports: [RouterLink],
  template: `
    <section class="sect" aria-labelledby="patients-today-title">
      <div class="sect-head">
        <h2 id="patients-today-title" i18n="Titre de la bande du jour@@patients.today.title">
          Aujourd'hui
        </h2>
      </div>
      <ul class="today">
        @for (card of cards(); track card.id) {
          <li class="tcard">
            <span class="av" aria-hidden="true">{{ card.initials }}</span>
            <span class="nm"
              >{{ card.name }}
              @if (card.live) {
                <span class="chip live">{{ card.live }}</span>
              }
            </span>
            <span class="sub">{{ card.sub }}</span>
            <a
              class="btn"
              [class.session]="card.action.session"
              [routerLink]="card.action.link"
              [attr.aria-label]="card.action.label + ' : ' + card.name"
              >{{ card.action.label }}</a
            >
          </li>
        }
      </ul>
    </section>
  `,
  styleUrl: './patient-today.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientTodayComponent {
  readonly rows = input.required<TodayRow[]>();
  readonly now = input<Date>(new Date());

  private readonly locale = inject(LOCALE_ID);

  protected readonly cards = computed<TodayCard[]>(() =>
    this.rows().map((row) => this.toCard(row, this.now())),
  );

  private toCard(row: TodayRow, now: Date): TodayCard {
    const name = demoDisplayName(row.patient);
    const activity = row.activity;
    const modality = modalityText(activity);
    const session = ['/patients', row.patient.id, 'session'];
    const parts = modality ? [modality] : [];
    if (row.status === 'open') {
      const minutes = minutesBetween(activity.openSessionAt!, now);
      const count = activity.lastSession?.entryCount ?? 0;
      if (count > 0) parts.push(notedEntries(count));
      return {
        id: row.patient.id,
        initials: initials(name),
        name,
        live: $localize`:Puce d'une séance ouverte, bande du jour@@patients.today.live:en séance · ${minutes}:minutes: min`,
        sub: parts.join(' · '),
        action: {
          label: $localize`:Bouton de la bande du jour, séance ouverte@@patients.today.resume:Reprendre`,
          link: session,
          session: true,
        },
      };
    }
    const closed = clockTime(activity.lastSession!.closedAt!, this.locale);
    parts.push(
      $localize`:Heure de clôture, bande du jour@@patients.today.closedAt:clôturée à ${closed}:time:`,
    );
    const report = activity.lastSession!.reportMissing;
    if (report) {
      parts.push(reportText());
    }
    return {
      id: row.patient.id,
      initials: initials(name),
      name,
      live: null,
      sub: parts.join(' · '),
      action: report
        ? {
            label: $localize`:Bouton de la bande du jour, compte rendu à écrire@@patients.today.report:Compte rendu`,
            link: session,
            session: false,
          }
        : {
            label: $localize`:Bouton de la bande du jour, séance clôturée@@patients.today.open:Ouvrir`,
            link: ['/patients', row.patient.id],
            session: false,
          },
    };
  }
}

function notedEntries(count: number): string {
  return count === 1
    ? $localize`:Entrées de la séance ouverte, bande du jour, une@@patients.today.entryOne:1 entrée notée`
    : $localize`:Entrées de la séance ouverte, bande du jour, plusieurs@@patients.today.entries:${count}:count: entrées notées`;
}
