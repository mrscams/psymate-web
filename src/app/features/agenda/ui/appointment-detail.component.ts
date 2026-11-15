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

import { formatMonthYear } from '../../../core/i18n';
import { initials, uniqueId } from '../../../shared/util';
import { Appointment } from '../data/agenda.model';
import {
  formatDayMonth,
  formatSpacedTimeRange,
  formatWeekdayDate,
  modalityLabel,
} from './agenda-format';

/**
 * Détail du rendez-vous sélectionné (fiche 15 §5, maquette) : carte de 320 à 360 px à droite de la
 * grille, bande supérieure de la couleur de la modalité, étiquette « Séance planifiée · cabinet »
 * et croix ; patient (initiales, nom lié au dossier, âge, suivi depuis, drapeau) ; date et heures
 * mono ; lieu, numéro de séance, rythme ; « Préparer » (dernière séance, objectif, ce qui s'est
 * passé depuis ; boutons Vue d'ensemble et Timeline) ; note de planification (jamais envoyée à
 * Google) ; bloc Google ; rappel SMS (hors V1 : désactivé) ; pied « Démarrer la séance »,
 * Déplacer, Dupliquer, Annuler, aide clavier. Les actions sont émises à la page ; sans API, elle ne
 * les suit pas encore.
 */
@Component({
  selector: 'pm-appointment-detail',
  imports: [RouterLink],
  templateUrl: './appointment-detail.component.html',
  styleUrl: './appointment-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'complementary',
    '[attr.aria-label]': 'panelLabel',
    '[class]': 'appointment().modality',
  },
})
export class AppointmentDetailComponent {
  readonly appointment = input.required<Appointment>();
  readonly closed = output<void>();
  readonly started = output<Appointment>();
  readonly moved = output<Appointment>();
  readonly duplicated = output<Appointment>();
  readonly cancelled = output<Appointment>();

  private readonly locale = inject(LOCALE_ID);
  protected readonly noteId = uniqueId('agenda-note');
  protected readonly panelLabel = $localize`:Nom de la zone de détail du rendez-vous@@agenda.detail.label:Détail du rendez-vous`;
  protected readonly closeLabel = $localize`:Croix du détail du rendez-vous@@agenda.detail.close:Fermer le détail`;
  protected readonly startLabel = $localize`:Bouton principal du détail@@agenda.detail.start:Démarrer la séance`;
  /** Déplacer, Dupliquer, Annuler : sorties émises, à câbler sur l'API ; inertes d'ici là. */
  protected readonly actions = [
    {
      label: $localize`:Action Déplacer du détail@@agenda.detail.move:Déplacer`,
      danger: false,
      emit: (item: Appointment) => this.moved.emit(item),
    },
    {
      label: $localize`:Action Dupliquer du détail@@agenda.detail.duplicate:Dupliquer`,
      danger: false,
      emit: (item: Appointment) => this.duplicated.emit(item),
    },
    {
      label: $localize`:Action Annuler du détail@@agenda.detail.cancel:Annuler`,
      danger: true,
      emit: (item: Appointment) => this.cancelled.emit(item),
    },
  ];

  /** « Déplacer · à venir » : nom accessible d'une action non câblée. */
  protected laterName(label: string): string {
    return $localize`:Action du détail non encore disponible@@agenda.detail.later:${label}:action: · à venir`;
  }

  /** « Séance planifiée · cabinet », « Contact · téléphone », « À confirmer · cabinet ». */
  protected readonly kicker = computed(() => {
    const item = this.appointment();
    const modality = modalityLabel(item.modality);
    if (item.kind === 'contact') {
      return $localize`:Étiquette du détail, contact téléphonique@@agenda.detail.kicker.contact:Contact · ${modality}:modality:`;
    }
    if (item.status === 'tentative') {
      return $localize`:Étiquette du détail, à confirmer@@agenda.detail.kicker.tentative:À confirmer · ${modality}:modality:`;
    }
    return $localize`:Étiquette du détail, séance planifiée@@agenda.detail.kicker.planned:Séance planifiée · ${modality}:modality:`;
  });

  protected readonly initials = computed(() => initials(this.appointment().patient.displayName));
  protected readonly patientLink = computed(() => ['/patients', this.appointment().patient.id]);

  /** « 34 ans · suivie depuis mars 2025 », sans l'âge inconnu. */
  protected readonly patientMeta = computed(() => {
    const { patient } = this.appointment();
    const since = formatMonthYear(patient.followedSince, this.locale);
    const parts: string[] = [];
    if (patient.age !== null) {
      parts.push(
        $localize`:Âge du patient dans le détail@@agenda.detail.age:${patient.age}:age: ans`,
      );
    }
    parts.push(
      $localize`:Début du suivi dans le détail@@agenda.detail.since:suivi depuis ${since}:month:`,
    );
    return parts.join(' · ');
  });

  protected readonly dateLabel = computed(() =>
    formatWeekdayDate(new Date(this.appointment().startsAt), this.locale),
  );
  protected readonly timeLabel = computed(() =>
    formatSpacedTimeRange(this.appointment().startsAt, this.appointment().endsAt, this.locale),
  );
  protected readonly sessionLabel = computed(
    () =>
      $localize`:Numéro de séance dans le détail@@agenda.detail.sessionNumber:Séance n° ${this.appointment().sessionNumber}:number:`,
  );
  protected readonly rhythmLabel = computed(
    () =>
      $localize`:Rythme du suivi dans le détail@@agenda.detail.rhythm:Rythme : ${this.appointment().patient.rhythm}:rhythm:`,
  );
  protected readonly lastSession = computed(() =>
    formatDayMonth(new Date(this.appointment().preparation.lastSessionAt), this.locale),
  );
  protected readonly feelingsLabel = computed(() => {
    const count = this.appointment().preparation.feelings;
    return count === 1
      ? $localize`:Un ressenti depuis la dernière séance@@agenda.detail.feelings.one:1 ressenti`
      : $localize`:Ressentis depuis la dernière séance@@agenda.detail.feelings.many:${count}:count: ressentis`;
  });
  protected readonly eventsLabel = computed(() => {
    const count = this.appointment().preparation.events;
    return count === 1
      ? $localize`:Un événement depuis la dernière séance@@agenda.detail.events.one:1 événement`
      : $localize`:Événements depuis la dernière séance@@agenda.detail.events.many:${count}:count: événements`;
  });
  protected readonly googleHistory = computed(() => {
    const history = this.appointment().google?.history;
    return history
      ? $localize`:Historique Google du rendez-vous@@agenda.detail.google.history:Créé par PsyMate · ${history}:history:.`
      : $localize`:Historique Google du rendez-vous, sans mouvement@@agenda.detail.google.created:Créé par PsyMate.`;
  });
}
