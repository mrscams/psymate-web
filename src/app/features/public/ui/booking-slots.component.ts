import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { StateAction, StateComponent } from '../../../shared/ui';
import { Loadable, stateKind } from '../../../shared/util';
import { BookingSlot, SlotList, SlotWindow } from '../data/booking.models';
import { groupByDay, periodLabel, retryMinutes, windowZoneLabel } from './booking-format';

/**
 * Étape 1 de la prise de rendez-vous (fiche 31, maquette vues 2, 10 à 14) : période affichée et
 * fuseau nommé, « Semaines précédentes » / « Semaines suivantes », puis les créneaux reçus, groupés
 * par jour, dans l'ordre de l'API ; ou l'un des trois états du bloc (chargement, aucun créneau,
 * erreur). N'affiche que les créneaux reçus, n'en calcule aucun. Composant de présentation.
 */
@Component({
  selector: 'pm-booking-slots',
  imports: [MatButtonModule, RouterLink, StateComponent],
  templateUrl: './booking-slots.component.html',
  styleUrl: './booking-slots.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingSlotsComponent {
  readonly slots = input.required<Loadable<SlotList>>();
  /** Fenêtre affichée (connue avant la réponse). */
  readonly window = input.required<SlotWindow>();
  /** Fuseau du praticien (réglages publics). */
  readonly timezone = input.required<string>();
  readonly canPrevious = input(false);
  readonly canNext = input(false);
  /** Lien « Prendre contact » de l'état vide : la fiche du praticien. */
  readonly practitionerLink = input.required<string>();

  readonly previous = output<void>();
  readonly next = output<void>();
  readonly pick = output<BookingSlot>();
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly period = computed(() => periodLabel(this.window(), this.locale));
  protected readonly zone = computed(() =>
    windowZoneLabel(this.zoneOf(), this.locale, this.window()),
  );
  protected readonly kind = computed(() =>
    stateKind(this.slots(), (list) => list.slots.length === 0),
  );
  protected readonly days = computed(() => {
    const list = this.slots().data;
    return list ? groupByDay(list.slots, this.zoneOf(), this.locale) : [];
  });

  protected readonly errorMessage = computed(() => {
    const problem = this.slots().problem;
    return problem?.status === 429
      ? $localize`:Créneaux, 429@@public.booking.slots.rateLimited:Trop de requêtes depuis votre connexion. Réessayez dans ${retryMinutes(problem.retryAfterSeconds)}:minutes: min.`
      : $localize`:Créneaux, erreur de chargement@@public.booking.slots.error.message:Vérifiez votre connexion, puis réessayez.`;
  });

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton Réessayer des créneaux@@public.booking.slots.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };

  /** Le fuseau de la réponse fait foi ; celui des réglages en attendant. */
  private zoneOf(): string {
    return this.slots().data?.timezone || this.timezone();
  }
}
