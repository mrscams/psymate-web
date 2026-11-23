import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { StateAction, StateComponent } from '../../../shared/ui';
import { Loadable, stateKind } from '../../../shared/util';
import { Appointment } from '../data/agenda.model';
import {
  appointmentName,
  formatShortWeekdayDate,
  formatTimeRange,
  modalityTitle,
} from './agenda-format';

/** Une ligne de la liste : « jeu. 26 nov. », « 10:00–11:00 », « Sara Benali », « Cabinet ». */
interface RequestRow {
  appointment: Appointment;
  date: string;
  time: string;
  /** Nom de l'invité (saisi par le demandeur : `dir="auto"` dans le gabarit). */
  name: string;
  modality: string;
}

/**
 * Panneau « Demandes en ligne » (fiche 15, demandes en ligne ; maquette
 * 15-agenda-demandes-en-ligne.html, vues 2, 12, 13, 14) : il s'ouvre à la place du détail, dans la
 * colonne de droite. En-tête (titre, qui reçoit le focus à l'ouverture, et croix), phrase du
 * compteur (`role="status"`), puis la liste des demandes en attente dans l'ordre de l'API, chacune un
 * bouton sur deux lignes (date courte et heures ; nom de l'invité et modalité). Trois états par
 * shared/ui/state. Le panneau ne lit rien : la page lui donne la liste du store.
 */
@Component({
  selector: 'pm-online-requests',
  imports: [StateComponent],
  templateUrl: './online-requests.component.html',
  styleUrl: './online-requests.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'complementary',
    '[attr.aria-labelledby]': 'titleId()',
  },
})
export class OnlineRequestsComponent {
  /** Demandes en attente (`GET /api/agenda/requests`), avec leur état de lecture. */
  readonly requests = input.required<Loadable<Appointment[]>>();
  /** Identifiant du titre (la page le pose pour `aria-controls` de l'entrée « Demandes »). */
  readonly titleId = input.required<string>();
  readonly closed = output<void>();
  /** Une demande choisie : la page amène la grille à sa date et ouvre son détail. */
  readonly picked = output<Appointment>();
  /** « Réessayer » de l'état erreur. */
  readonly retried = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly title = $localize`:Titre du panneau des demandes de rendez-vous en ligne@@agenda.requests.title:Demandes en ligne`;
  protected readonly closeLabel = $localize`:Croix du panneau des demandes en ligne@@agenda.requests.close:Fermer les demandes`;
  protected readonly emptyTitle = $localize`:État vide du panneau des demandes en ligne@@agenda.requests.emptyTitle:Aucune demande en attente`;
  protected readonly emptyMessage = $localize`:État vide du panneau des demandes en ligne, explication@@agenda.requests.emptyMessage:Les demandes faites depuis votre page de rendez-vous arrivent ici.`;
  protected readonly errorTitle = $localize`:État erreur du panneau des demandes en ligne@@agenda.requests.errorTitle:Les demandes n'ont pas pu être chargées.`;
  protected readonly retry: StateAction = {
    label: $localize`:Bouton Réessayer du panneau des demandes en ligne@@agenda.requests.retry:Réessayer`,
    handler: () => this.retried.emit(),
  };

  /**
   * État du bloc (shared/util stateKind), sauf pendant une relecture d'une liste vide : l'état
   * vide reste affiché au lieu de repasser par le squelette (la liste est relue après chaque
   * écriture de l'agenda).
   */
  protected readonly kind = computed(() => {
    const requests = this.requests();
    if (requests.status === 'loading' && requests.data?.length === 0) return 'empty';
    return stateKind(requests);
  });

  /**
   * Nombre de demandes en attente : le gabarit écrit « 2 demandes attendent votre réponse. »,
   * « 1 demande attend votre réponse. » (pluriel ICU, six formes en arabe) ; rien sans demande.
   */
  protected readonly count = computed(() => this.requests().data?.length ?? 0);

  protected readonly rows = computed<RequestRow[]>(() =>
    (this.requests().data ?? []).map((appointment) => ({
      appointment,
      date: formatShortWeekdayDate(new Date(appointment.startsAt), this.locale),
      time: formatTimeRange(appointment.startsAt, appointment.endsAt, this.locale),
      name: appointmentName(appointment),
      modality: modalityTitle(appointment.modality),
    })),
  );

  constructor() {
    // À l'ouverture, le titre reçoit le focus (ce qui amène le panneau dans la vue sous 900 px).
    const injector = inject(Injector);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('h2')?.focus(), {
      injector,
    });
  }
}
