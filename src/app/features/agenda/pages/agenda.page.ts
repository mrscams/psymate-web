import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';
import { SidePanelService, StateComponent } from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { AgendaStore } from '../data/agenda.store';
import {
  AGENDA_VIEWS,
  AgendaView,
  Appointment,
  DEFAULT_VIEW,
  fromIsoDay,
  isAgendaView,
  startOfDay,
  toIsoDay,
} from '../data/agenda.model';
import { NewAppointmentData, NewAppointmentPanel } from '../panels/new-appointment.panel';
import { AgendaCalendarsComponent } from '../ui/agenda-calendars.component';
import {
  minutesAgoLabel,
  periodLabel,
  rangeSegments,
  sessionCountLabel,
} from '../ui/agenda-format';
import { AgendaCalendarComponent, Rescheduled } from '../ui/agenda-calendar.component';
import { AppointmentDetailComponent } from '../ui/appointment-detail.component';
import { MiniMonthComponent } from '../ui/mini-month.component';

/** Paramètres de l'URL (fiche 15) : `?view=day|week|month|list&date=yyyy-MM-dd`, `/agenda/rdv/:id`. */
export const VIEW_PARAM = 'view';
export const DATE_PARAM = 'date';
export const APPOINTMENT_PARAM = 'id';

/** Heure proposée par « + Rendez-vous » quand aucun créneau n'a été cliqué. */
export const NEW_APPOINTMENT_HOUR = 10;

/** Rafraîchissement de la ligne de l'heure courante. */
export const CLOCK_TICK_MS = 60_000;

/**
 * /agenda (fiche 15, maquette 15-agenda.html, hors V1 repris le 15 novembre 2026) : barre d'outils
 * (Aujourd'hui, ‹ ›, plage, « semaine 44 · 14 séances », Jour / Semaine / Mois / Liste, état de
 * synchronisation Google, + Rendez-vous), rail gauche (mini-mois, Mes agendas, légende), la vue
 * (grille semaine ou jour, mois, liste) et, à droite, le détail du rendez-vous ouvert. La vue et sa
 * date vivent dans l'URL ; le rendez-vous ouvert dans `/agenda/rdv/:id`. Clavier : Échap ferme le
 * détail, ↑ ↓ passent au rendez-vous précédent / suivant du jour ; double-clic → dossier patient.
 * Sans module `scheduling` (G Q25), les données viennent de agenda.api.ts (démonstration) et les
 * actions du détail (démarrer, déplacer, dupliquer, annuler) attendent l'API : rien n'est écrit.
 */
@Component({
  selector: 'pm-agenda-page',
  imports: [
    StateComponent,
    MiniMonthComponent,
    AgendaCalendarsComponent,
    AgendaCalendarComponent,
    AppointmentDetailComponent,
  ],
  providers: [AgendaStore],
  templateUrl: './agenda.page.html',
  styleUrl: './agenda.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaPage {
  protected readonly store = inject(AgendaStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly panels = inject(SidePanelService);
  private readonly shortcuts = inject(ShortcutService);
  protected readonly locale = inject(LOCALE_ID);

  protected readonly views = AGENDA_VIEWS;
  /** Instant courant, avancé chaque minute (ligne de l'heure, « aujourd'hui »). */
  protected readonly now = signal(new Date());

  /** Vue, date et rendez-vous lus dans l'URL à chaque navigation. */
  private readonly location = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.readUrl()),
    ),
    { initialValue: this.readUrl() },
  );

  constructor() {
    effect(() => {
      const { view, date, id } = this.location();
      untracked(() => {
        void this.store.show(view, date);
        this.store.select(id);
      });
    });

    const destroy = inject(DestroyRef);
    const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    destroy.onDestroy(() => clearInterval(timer));

    const releases = [
      this.shortcuts.register('Escape', () => this.closeDetail(), this.escapeHelp),
      this.shortcuts.register('ArrowDown', () => this.selectSibling(1), this.arrowsHelp),
      this.shortcuts.register('ArrowUp', () => this.selectSibling(-1)),
    ];
    destroy.onDestroy(() => releases.forEach((release) => release()));
  }

  // --- Barre d'outils -------------------------------------------------------------------------

  protected readonly title = $localize`:Titre de la page Agenda@@agenda.title:Agenda`;
  protected readonly todayLabel = $localize`:Bouton Aujourd'hui de l'agenda@@agenda.toolbar.today:Aujourd'hui`;
  protected readonly newLabel = $localize`:Bouton + Rendez-vous@@agenda.toolbar.new:+ Rendez-vous`;
  protected readonly viewsLabel = $localize`:Nom du groupe de vues@@agenda.toolbar.views:Vue`;
  protected readonly railLabel = $localize`:Nom du rail gauche de l'agenda@@agenda.rail.label:Navigation de l'agenda`;
  private readonly escapeHelp = $localize`:Aide des raccourcis, Échap dans l'agenda@@agenda.shortcut.escape:Fermer le détail du rendez-vous`;
  private readonly arrowsHelp = $localize`:Aide des raccourcis, flèches dans l'agenda@@agenda.shortcut.arrows:Rendez-vous précédent / suivant du jour`;

  protected readonly rangeSegments = computed(() =>
    rangeSegments(this.store.view(), this.store.range(), this.locale),
  );
  /** « · semaine 44 · 14 séances » (vue semaine), « · 14 séances » (jour, mois)… */
  protected readonly meta = computed(() => {
    const parts = [periodLabel(this.store.view(), this.store.range())].filter(
      (part): part is string => part !== null,
    );
    if (this.store.data().status !== 'idle')
      parts.push(sessionCountLabel(this.store.sessionCount()));
    return parts.map((part) => `· ${part}`).join(' ');
  });
  protected readonly stepLabels = computed(() => {
    switch (this.store.view()) {
      case 'day':
        return {
          prev: $localize`:Bouton ‹ en vue jour@@agenda.toolbar.prevDay:Jour précédent`,
          next: $localize`:Bouton › en vue jour@@agenda.toolbar.nextDay:Jour suivant`,
        };
      case 'month':
        return {
          prev: $localize`:Bouton ‹ en vue mois@@agenda.toolbar.prevMonth:Mois précédent`,
          next: $localize`:Bouton › en vue mois@@agenda.toolbar.nextMonth:Mois suivant`,
        };
      case 'list':
        return {
          prev: $localize`:Bouton ‹ en vue liste@@agenda.toolbar.prevPeriod:Période précédente`,
          next: $localize`:Bouton › en vue liste@@agenda.toolbar.nextPeriod:Période suivante`,
        };
      default:
        return {
          prev: $localize`:Bouton ‹ en vue semaine@@agenda.toolbar.prevWeek:Semaine précédente`,
          next: $localize`:Bouton › en vue semaine@@agenda.toolbar.nextWeek:Semaine suivante`,
        };
    }
  });
  /** État de synchronisation : texte et niveau, jamais la couleur seule (fiche 15 §2). */
  protected readonly sync = computed(() => {
    const sync = this.store.sync();
    if (!sync) return null;
    switch (sync.state) {
      case 'ok': {
        const ago = minutesAgoLabel(sync.minutesAgo, this.locale);
        return {
          level: 'ok' as const,
          text: $localize`:État de synchronisation Google, à jour@@agenda.sync.ok:Google Agenda synchronisé · ${ago}:ago:`,
        };
      }
      case 'pending':
        return {
          level: 'pending' as const,
          text: $localize`:État de synchronisation Google, en attente@@agenda.sync.pending:Google Agenda · synchronisation en attente`,
        };
      default:
        return {
          level: 'error' as const,
          text: $localize`:État de synchronisation Google, erreur@@agenda.sync.error:Google Agenda · erreur, reconnecter`,
        };
    }
  });

  protected viewLabel(view: AgendaView): string {
    switch (view) {
      case 'day':
        return $localize`:Vue Jour@@agenda.view.day:Jour`;
      case 'week':
        return $localize`:Vue Semaine@@agenda.view.week:Semaine`;
      case 'month':
        return $localize`:Vue Mois@@agenda.view.month:Mois`;
      case 'list':
        return $localize`:Vue Liste@@agenda.view.list:Liste`;
    }
  }

  // --- Vue ------------------------------------------------------------------------------------

  protected readonly kind = computed(() =>
    stateKind(this.store.data(), (data) =>
      this.store.view() === 'list' ? data.appointments.length === 0 : false,
    ),
  );
  /** La grille s'affiche vide quand il n'y a rien ; la liste montre l'état vide. */
  protected readonly emptyTitle = $localize`:Titre de l'état vide de la vue liste@@agenda.list.emptyTitle:Aucun rendez-vous dans les 30 prochains jours`;
  protected readonly emptyMessage = $localize`:Phrase de l'état vide de la vue liste@@agenda.list.emptyMessage:Cliquez sur un créneau de la semaine ou sur « + Rendez-vous » pour en planifier un.`;
  protected readonly retry = {
    label: $localize`:Bouton Réessayer de l'agenda@@agenda.retry:Réessayer`,
    handler: () => void this.store.reload(),
  };
  protected readonly viewName = computed(() => {
    const segments = this.rangeSegments()
      .map((segment) => segment.text)
      .join('');
    return `${this.viewLabel(this.store.view())} · ${segments}`;
  });

  // --- Navigation -----------------------------------------------------------------------------

  protected setView(view: AgendaView): void {
    void this.router.navigate([], {
      queryParams: { [VIEW_PARAM]: view, [DATE_PARAM]: this.store.date() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goTo(date: Date, view: AgendaView = this.store.view()): void {
    void this.router.navigate([], {
      queryParams: { [VIEW_PARAM]: view, [DATE_PARAM]: toIsoDay(date) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected today(): void {
    this.goTo(startOfDay(this.now()));
  }

  protected step(direction: 1 | -1): void {
    this.goTo(this.store.stepped(direction));
  }

  /** Vue Mois : un numéro de jour ouvre la vue Jour. */
  protected openDay(date: Date): void {
    this.goTo(date, 'day');
  }

  protected closeDetail(): void {
    if (!this.store.selectedId()) return;
    void this.router.navigate(['/agenda'], { queryParamsHandling: 'preserve' });
  }

  /** ↑ ↓ : le rendez-vous précédent / suivant du même jour, dans l'ordre de la grille. */
  protected selectSibling(direction: 1 | -1): void {
    const current = this.store.selectedId();
    if (!current) return;
    const siblings = this.store.selectedDaySiblings();
    const index = siblings.findIndex((item) => item.id === current);
    const next = siblings[index + direction];
    if (!next) return;
    void this.router.navigate(['/agenda', 'rdv', next.id], { queryParamsHandling: 'preserve' });
  }

  /** Glisser-déposer ou redimensionnement dans la grille : le store garde les nouvelles bornes. */
  protected onRescheduled(change: Rescheduled): void {
    this.store.reschedule(change.id, change.startsAt, change.endsAt);
  }

  /** Double-clic sur un rendez-vous : le dossier du patient. */
  protected openPatient(appointment: Appointment): void {
    void this.router.navigate(['/patients', appointment.patient.id]);
  }

  /** Clic sur un créneau vide, ou « + Rendez-vous » : le panneau 15b (520 px, maquette). */
  protected newAppointment(slot?: Date): void {
    const start = slot ?? this.defaultSlot();
    const selected = this.store.selected();
    const data: NewAppointmentData = {
      slot: start,
      patient: selected?.patient ?? null,
      lastSessionAt: selected?.preparation.lastSessionAt ?? null,
      appointments: this.store.appointments(),
      busy: this.store.busy(),
    };
    this.panels.open(NewAppointmentPanel, { data, width: 520 });
  }

  private defaultSlot(): Date {
    const slot = new Date(this.store.anchor());
    slot.setHours(NEW_APPOINTMENT_HOUR, 0, 0, 0);
    return slot;
  }

  private readUrl(): { view: AgendaView; date: Date; id: string | null } {
    const query = this.route.snapshot.queryParamMap;
    const view = query.get(VIEW_PARAM);
    const date = fromIsoDay(query.get(DATE_PARAM)) ?? startOfDay(new Date());
    const id = this.route.snapshot.firstChild?.paramMap.get(APPOINTMENT_PARAM) ?? null;
    return { view: isAgendaView(view) ? view : DEFAULT_VIEW, date, id };
  }
}
