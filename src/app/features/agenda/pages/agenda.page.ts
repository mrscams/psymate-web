import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  LOCALE_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { PreferencesStore } from '../../../core/preferences';
import { ShortcutService } from '../../../core/shortcuts';
import { SidePanelService, StateComponent, ToastService } from '../../../shared/ui';
import { stateKind, uniqueId } from '../../../shared/util';
import {
  addDays,
  AGENDA_VIEWS,
  AgendaHours,
  AgendaView,
  Appointment,
  CreatedAppointments,
  fromIsoDay,
  inRange,
  isAgendaView,
  PatientOption,
  sameDay,
  startOfDay,
  toIsoDay,
} from '../data/agenda.model';
import { AgendaStore } from '../data/agenda.store';
import {
  NewAppointmentData,
  NewAppointmentPanel,
  NewAppointmentResult,
} from '../panels/new-appointment.panel';
import { AgendaCalendarComponent, Rescheduled } from '../ui/agenda-calendar.component';
import { AgendaCalendarsComponent } from '../ui/agenda-calendars.component';
import {
  conflictMessage,
  periodLabel,
  rangeSegments,
  sessionCountLabel,
} from '../ui/agenda-format';
import { AppointmentDetailComponent, problemText } from '../ui/appointment-detail.component';
import { MiniMonthComponent } from '../ui/mini-month.component';
import { OnlineRequestsComponent } from '../ui/online-requests.component';

/** Paramètres de l'URL (fiche 15) : `?view=day|week|month|list&date=yyyy-MM-dd`, `/agenda/rdv/:id`. */
export const VIEW_PARAM = 'view';
export const DATE_PARAM = 'date';
export const APPOINTMENT_PARAM = 'id';

/** Heure proposée par « + Rendez-vous » quand aucun créneau n'a été cliqué. */
export const NEW_APPOINTMENT_HOUR = 10;

/** Rafraîchissement de la ligne de l'heure courante. */
export const CLOCK_TICK_MS = 60_000;

/** Le toast « n rendez-vous planifiés · Annuler » reste 10 s (fiche 15b). */
export const UNDO_TOAST_MS = 10_000;

/**
 * /agenda (fiche 15, maquette 15-agenda.html, en V1 depuis le 15 novembre 2026) : barre d'outils
 * (Aujourd'hui, ‹ ›, plage, « semaine 44 · 14 séances », Jour / Semaine / Mois / Liste,
 * + Rendez-vous), rail gauche (mini-mois, Mes agendas, légende), la vue (grille semaine ou jour,
 * mois, liste) et, à droite, le détail du rendez-vous ouvert. La vue et sa date vivent dans l'URL
 * (sans `?view=`, la préférence `agenda.defaultView`) ; le rendez-vous ouvert dans
 * `/agenda/rdv/:id`. Clavier : Échap ferme le détail, ↑ ↓ passent au rendez-vous précédent /
 * suivant du jour ; double-clic → dossier patient. Glisser-déposer et étirement → `PATCH` puis
 * relecture ; la création (panneau 15b) relit la plage et ouvre la première occurrence.
 * « Demandes » (fiche 15, demandes en ligne) : entrée de la barre d'outils avec le compteur renvoyé
 * par `GET /api/agenda/requests` ; elle ouvre, à la place du détail, le panneau des demandes en
 * attente ; choisir une demande amène la grille à sa date et ouvre son détail.
 */
@Component({
  selector: 'pm-agenda-page',
  imports: [
    StateComponent,
    MiniMonthComponent,
    AgendaCalendarsComponent,
    AgendaCalendarComponent,
    AppointmentDetailComponent,
    OnlineRequestsComponent,
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
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly preferences = inject(PreferencesStore);
  private readonly toasts = inject(ToastService);
  protected readonly locale = inject(LOCALE_ID);

  /** Bornes de la grille et jours travaillés (préférences `agenda.*`, lues seulement). */
  protected readonly hours = computed<AgendaHours>(() => {
    const { dayStartHour, dayEndHour, workingDays } = this.preferences.agenda();
    return { dayStartHour, dayEndHour, workingDays };
  });
  /** Vue par défaut seule : l'URL n'est relue que si elle change. */
  private readonly defaultView = computed(() => this.preferences.agenda().defaultView);

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

  /** Panneau « Demandes en ligne » ouvert (état d'écran) ; un détail ouvert prend sa place. */
  protected readonly requestsOpen = signal(false);
  protected readonly requestsIds = {
    panel: uniqueId('agenda-requests'),
    title: uniqueId('agenda-requests-title'),
  };
  private readonly requestsButton = viewChild<ElementRef<HTMLButtonElement>>('requestsButton');

  constructor() {
    effect(() => {
      const { view, date, id } = this.location();
      // Sans `?view=`, la vue par défaut du compte (préférence `agenda.defaultView`).
      const fallback = this.defaultView();
      untracked(() => {
        void this.store.show(view ?? fallback, date);
        this.store.select(id);
        // Un rendez-vous ouvert prend la colonne de droite : le panneau des demandes se ferme.
        if (id !== null) this.requestsOpen.set(false);
      });
    });

    const destroy = inject(DestroyRef);
    const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    destroy.onDestroy(() => clearInterval(timer));

    // Les raccourcis du détail ne valent que détail ouvert : ailleurs, ↑ ↓ font défiler la page.
    effect((onCleanup) => {
      if (this.store.detailState() === 'none') return;
      const releases = [
        this.shortcuts.register('Escape', () => void this.closeDetail(), this.escapeHelp),
        this.shortcuts.register('ArrowDown', () => this.selectSibling(1), this.arrowsHelp),
        this.shortcuts.register('ArrowUp', () => this.selectSibling(-1)),
      ];
      onCleanup(() => releases.forEach((release) => release()));
    });

    // Panneau des demandes ouvert (sans détail) : Échap le ferme et rend le focus à l'entrée.
    effect((onCleanup) => {
      if (!this.requestsShown()) return;
      const release = this.shortcuts.register(
        'Escape',
        () => this.closeRequests(),
        this.requestsCloseHelp,
      );
      onCleanup(release);
    });
  }

  // --- Barre d'outils -------------------------------------------------------------------------

  protected readonly requestsLabel = $localize`:Entrée Demandes de la barre d'outils de l'agenda@@agenda.toolbar.requests:Demandes`;
  private readonly requestsCloseHelp = $localize`:Croix du panneau des demandes en ligne@@agenda.requests.close:Fermer les demandes`;
  /** Le panneau est visible : ouvert, et aucun détail ne prend sa place. */
  protected readonly requestsShown = computed(
    () => this.requestsOpen() && this.store.detailState() === 'none',
  );
  /** Nom accessible de l'entrée : « Demandes en ligne, 2 en attente » (le compteur de l'API). */
  protected readonly requestsName = computed(() => {
    const count = this.store.requestCount();
    if (count === null) {
      return $localize`:Nom accessible de l'entrée Demandes, compteur pas encore lu@@agenda.toolbar.requestsName:Demandes en ligne`;
    }
    return count === 0
      ? $localize`:Nom accessible de l'entrée Demandes, aucune demande@@agenda.toolbar.requestsNone:Demandes en ligne, aucune en attente`
      : $localize`:Nom accessible de l'entrée Demandes, avec le compteur@@agenda.toolbar.requestsCount:Demandes en ligne, ${count}:count: en attente`;
  });

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
    stateKind(
      this.store.data(),
      () => this.store.view() === 'list' && this.store.appointments().length === 0,
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

  /** Changer de vue ou de date ferme le détail : l'URL ne garde pas `/rdv/:id`. */
  protected setView(view: AgendaView): void {
    void this.router.navigate(['/agenda'], {
      queryParams: { [VIEW_PARAM]: view, [DATE_PARAM]: this.store.date() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goTo(date: Date, view: AgendaView = this.store.view()): void {
    void this.router.navigate(['/agenda'], {
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

  /** Ferme le détail et rend le focus au rendez-vous dans la grille. */
  /**
   * Ferme le détail et rend le focus au rendez-vous dans la grille ; s'il n'y est plus (annulé),
   * au premier rendez-vous visible du même jour, sinon à la zone de la vue.
   */
  protected async closeDetail(from: Appointment | null = this.store.selected()): Promise<void> {
    const id = this.store.selectedId();
    if (!id) return;
    const day = from ? new Date(from.startsAt) : null;
    await this.router.navigate(['/agenda'], { queryParamsHandling: 'preserve' });
    afterNextRender(() => this.restoreFocus(id, day), { injector: this.injector });
  }

  private restoreFocus(id: string, day: Date | null): void {
    if (this.focusEvent(id)) return;
    const sibling = day
      ? this.store.appointments().find((item) => sameDay(new Date(item.startsAt), day))
      : undefined;
    if (sibling && this.focusEvent(sibling.id)) return;
    this.host.nativeElement.querySelector<HTMLElement>('section.view')?.focus();
  }

  private focusEvent(id: string): boolean {
    const selector = `a.fc-event[href$="/rdv/${CSS.escape(id)}"], a.fc-event[href*="/rdv/${CSS.escape(id)}?"]`;
    const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
    target?.focus();
    return target !== null;
  }

  /** ↑ ↓ : le rendez-vous précédent / suivant du même jour, dans l'ordre de la grille. */
  protected selectSibling(direction: 1 | -1): void {
    const current = this.store.selectedId();
    if (!current) return;
    const siblings = this.store.selectedDaySiblings();
    const index = siblings.findIndex((item) => item.id === current);
    if (index < 0) return;
    const next = siblings[index + direction];
    if (!next) return;
    void this.router.navigate(['/agenda', 'rdv', next.id], { queryParamsHandling: 'preserve' });
  }

  /**
   * Glisser-déposer ou étirement : `PATCH { startsAt, durationMin }` tout de suite, puis relecture.
   * Un chevauchement est signalé (jamais bloquant) ; en erreur, la relecture remet le rendez-vous
   * à sa place et le toast dit pourquoi.
   */
  protected async onRescheduled(change: Rescheduled): Promise<void> {
    const durationMin = Math.round(
      (new Date(change.endsAt).getTime() - new Date(change.startsAt).getTime()) / 60_000,
    );
    const result = await this.store.move(change.id, change.startsAt, durationMin);
    if (!result.ok) {
      this.toasts.warning(problemText(result.problem));
      return;
    }
    const conflicts = conflictMessage(result.conflicts, this.locale);
    if (conflicts) this.toasts.info(conflicts);
  }

  // --- Demandes en ligne ----------------------------------------------------------------------

  /** « Demandes » : ouvre le panneau à la place du détail (qui se ferme), ou le referme. */
  protected toggleRequests(): void {
    if (this.requestsShown()) {
      this.requestsOpen.set(false);
      return;
    }
    this.requestsOpen.set(true);
    if (this.store.selectedId()) {
      void this.router.navigate(['/agenda'], { queryParamsHandling: 'preserve' });
    }
  }

  protected closeRequests(): void {
    this.requestsOpen.set(false);
    afterNextRender(() => this.requestsButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /**
   * Une demande choisie : la grille va à sa date (même vue) et son détail s'ouvre à la place du
   * panneau ; le focus passe au détail. Les demandes hors de la plage affichée sont atteignables.
   */
  protected async pickRequest(request: Appointment): Promise<void> {
    this.requestsOpen.set(false);
    await this.router.navigate(['/agenda', 'rdv', request.id], {
      queryParams: {
        [VIEW_PARAM]: this.store.view(),
        [DATE_PARAM]: toIsoDay(new Date(request.startsAt)),
      },
    });
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('pm-appointment-detail')?.focus(),
      { injector: this.injector },
    );
  }

  /** Double-clic sur un rendez-vous : le dossier du patient ; un invité n'en a pas. */
  protected openPatient(appointment: Appointment): void {
    if (!appointment.patient) return;
    void this.router.navigate(['/patients', appointment.patient.id]);
  }

  /** Clic sur un créneau vide, ou « + Rendez-vous » : le panneau 15b (520 px, maquette). */
  protected newAppointment(slot?: Date): void {
    const selected = this.store.selected();
    this.openPanel({
      slot: slot ?? this.defaultSlot(),
      patient: !slot && selected ? this.optionOf(selected) : null,
    });
  }

  /**
   * « Dupliquer » : le panneau prérempli, même créneau une semaine plus tard. Le détail ne propose
   * pas « Dupliquer » pour un invité (le panneau ne sait pas créer d'invité).
   */
  protected duplicate(appointment: Appointment): void {
    this.openPanel({
      slot: addDays(new Date(appointment.startsAt), 7),
      patient: this.optionOf(appointment),
      prefill: {
        modality: appointment.modality,
        durationMin: appointment.durationMin,
        planningNote: appointment.planningNote,
      },
    });
  }

  /** Le patient du rendez-vous pour le panneau 15b ; null pour un invité. */
  private optionOf(appointment: Appointment): PatientOption | null {
    if (!appointment.patient) return null;
    const { id, displayName, age } = appointment.patient;
    return { id, displayName, age };
  }

  /**
   * Le panneau prévient la page dès que la création réussit (`onCreated`), même s'il a été fermé
   * pendant l'envoi : la plage est relue et le toast proposé dans tous les cas.
   */
  private openPanel(data: Omit<NewAppointmentData, 'onCreated'>): void {
    this.panels.open<NewAppointmentPanel, NewAppointmentData, NewAppointmentResult>(
      NewAppointmentPanel,
      { data: { ...data, onCreated: (created) => void this.afterCreate(created) }, width: 520 },
    );
  }

  /**
   * Après une création : relecture (ou navigation vers la plage de la première occurrence si elle
   * n'est pas affichée), première occurrence ouverte, toast « n rendez-vous planifiés · Annuler »
   * (10 s) dont l'action annule la série, ou le rendez-vous seul, puis relit.
   */
  private async afterCreate(created: CreatedAppointments): Promise<void> {
    const first = created.appointments[0];
    if (!first) return;
    const start = new Date(first.startsAt);
    if (inRange(this.store.range(), start)) {
      await this.store.refresh();
      await this.router.navigate(['/agenda', 'rdv', first.id], { queryParamsHandling: 'preserve' });
    } else {
      await this.router.navigate(['/agenda', 'rdv', first.id], {
        queryParams: { [VIEW_PARAM]: this.store.view(), [DATE_PARAM]: toIsoDay(start) },
      });
    }
    this.toasts.show({
      level: 'success',
      message: this.createdMessage(created),
      durationMs: UNDO_TOAST_MS,
      action: {
        label: $localize`:Action Annuler du toast de création@@agenda.toast.undo:Annuler`,
        handler: () => void this.undoCreate(created),
      },
    });
  }

  /** « 4 rendez-vous planifiés », « Rendez-vous planifié », « …, 1 chevauchement ». */
  private createdMessage(created: CreatedAppointments): string {
    const count = created.appointments.length;
    const base =
      count > 1
        ? $localize`:Toast après une création, plusieurs rendez-vous@@agenda.toast.createdMany:${count}:count: rendez-vous planifiés`
        : $localize`:Toast après une création, un rendez-vous@@agenda.toast.createdOne:Rendez-vous planifié`;
    const overlaps = new Set(created.conflicts.map((item) => item.appointmentId)).size;
    if (overlaps === 0) return base;
    return overlaps > 1
      ? $localize`:Toast après une création avec chevauchements@@agenda.toast.createdOverlaps:${base}:base:, ${overlaps}:count: chevauchements`
      : $localize`:Toast après une création avec un chevauchement@@agenda.toast.createdOverlap:${base}:base:, 1 chevauchement`;
  }

  private async undoCreate(created: CreatedAppointments): Promise<void> {
    const first = created.appointments[0];
    const result = first.seriesId
      ? await this.store.cancelSeries(first.seriesId)
      : await this.store.cancel(first.id);
    if (result.ok) {
      this.toasts.info(
        $localize`:Toast après l'annulation d'une création@@agenda.toast.undone:Planification annulée.`,
      );
    } else {
      this.toasts.warning(problemText(result.problem));
    }
  }

  private defaultSlot(): Date {
    const slot = new Date(this.store.anchor());
    slot.setHours(NEW_APPOINTMENT_HOUR, 0, 0, 0);
    return slot;
  }

  /** Vue (null sans `?view=` valide : la préférence décide), date et rendez-vous de l'URL. */
  private readUrl(): { view: AgendaView | null; date: Date; id: string | null } {
    const query = this.route.snapshot.queryParamMap;
    const view = query.get(VIEW_PARAM);
    const date = fromIsoDay(query.get(DATE_PARAM)) ?? startOfDay(new Date());
    const id = this.route.snapshot.firstChild?.paramMap.get(APPOINTMENT_PARAM) ?? null;
    return { view: isAgendaView(view) ? view : null, date, id };
  }
}
