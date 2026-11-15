import { sessionModalityLabel } from '../../../shared/ui';
import {
  AgendaRange,
  AgendaView,
  AppointmentModality,
  AppointmentStatus,
  CalendarKey,
  Conflict,
  isoWeek,
  LIST_DAYS,
} from '../data/agenda.model';

/** Un morceau de libellé de date ; `sup` pour l'ordinal français (« 1<sup>er</sup> novembre »). */
export interface DateSegment {
  text: string;
  sup?: boolean;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** « 09:00 » : heure sur 24 h, deux chiffres (JetBrains Mono dans la grille). */
export function formatTime(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** « 09:00–09:50 » (tiret demi-cadratin sans espaces, comme la maquette). */
export function formatTimeRange(startsAt: string, endsAt: string, locale: string): string {
  return `${formatTime(startsAt, locale)}–${formatTime(endsAt, locale)}`;
}

/** « 10:00 – 10:50 » (détail et blocs Google : tiret espacé). */
export function formatSpacedTimeRange(startsAt: string, endsAt: string, locale: string): string {
  return `${formatTime(startsAt, locale)} – ${formatTime(endsAt, locale)}`;
}

/**
 * Jour et mois en segments (« 26 octobre », « 1er novembre » avec « er » en exposant en français),
 * avec l'année si demandée.
 */
export function dateSegments(date: Date, locale: string, withYear: boolean): DateSegment[] {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: withYear ? 'numeric' : undefined,
  }).formatToParts(date);
  const segments: DateSegment[] = [];
  for (const part of parts) {
    if (part.type === 'day' && part.value === '1' && locale.startsWith('fr')) {
      segments.push({ text: '1' }, { text: 'er', sup: true });
    } else {
      segments.push({ text: part.value });
    }
  }
  return segments;
}

/** « Samedi 31 octobre », « samedi 7 novembre » : jour de la semaine en toutes lettres. */
export function formatWeekdayDate(date: Date, locale: string, capital = true): string {
  const text = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return capital ? capitalize(text) : text;
}

/** « 31 oct. », « 19 déc. » : date courte sans année. */
export function formatDayMonth(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

/** « Octobre 2026 » (mini-mois, vue mois). */
export function formatMonthTitle(date: Date, locale: string): string {
  return capitalize(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date),
  );
}

/** « lun. » : jour de la semaine abrégé (en-têtes de colonnes). */
export function formatWeekdayShort(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
}

/** « L M M J V S D » : initiales des jours, du lundi au dimanche (mini-mois). */
export function weekdayInitials(locale: string): string[] {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(day);
  });
}

/**
 * Plage de la barre d'outils (fiche 15 §2) : « 26 octobre – 1er novembre 2026 » pour la semaine
 * et la liste (« 2 – 8 novembre 2026 » dans un même mois, chaque borne datée si l'année change),
 * « lundi 26 octobre 2026 » pour le jour, « Octobre 2026 » pour le mois.
 */
export function rangeSegments(view: AgendaView, range: AgendaRange, locale: string): DateSegment[] {
  const from = range.from;
  const last = new Date(range.to.getTime() - 1);
  switch (view) {
    case 'day':
      return [
        {
          text: capitalize(
            new Intl.DateTimeFormat(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(from),
          ),
        },
      ];
    case 'month':
      // La plage du mois commence au lundi de sa première semaine : le milieu est dans le mois.
      return [{ text: formatMonthTitle(new Date((from.getTime() + last.getTime()) / 2), locale) }];
    default: {
      const sameYear = from.getFullYear() === last.getFullYear();
      const sameMonth = sameYear && from.getMonth() === last.getMonth();
      const start = sameMonth
        ? [{ text: String(from.getDate()) }]
        : dateSegments(from, locale, !sameYear);
      return [...start, { text: ' – ' }, ...dateSegments(last, locale, true)];
    }
  }
}

/** « semaine 44 » pour la vue semaine, « 30 prochains jours » pour la liste, rien sinon. */
export function periodLabel(view: AgendaView, range: AgendaRange): string | null {
  switch (view) {
    case 'week':
      return $localize`:Numéro de semaine ISO dans la barre d'outils de l'agenda@@agenda.toolbar.week:semaine ${isoWeek(range.from)}:week:`;
    case 'list':
      return $localize`:Vue liste de l'agenda, période couverte@@agenda.toolbar.listPeriod:${LIST_DAYS}:days: prochains jours`;
    default:
      return null;
  }
}

/** « 14 séances », « 1 séance », « aucune séance » : compte de la plage affichée. */
export function sessionCountLabel(count: number): string {
  if (count === 0) {
    return $localize`:Aucune séance dans la plage affichée@@agenda.toolbar.sessions.none:aucune séance`;
  }
  if (count === 1) {
    return $localize`:Une séance dans la plage affichée@@agenda.toolbar.sessions.one:1 séance`;
  }
  return $localize`:Nombre de séances de la plage affichée@@agenda.toolbar.sessions.many:${count}:count: séances`;
}

/** Libellé d'une modalité en minuscules (« cabinet », « visio », « téléphone »), celui de l'en-tête patient. */
export function modalityLabel(modality: AppointmentModality): string {
  return sessionModalityLabel(modality);
}

/** « Cabinet », « Visio », « Téléphone » : segments du panneau 15b. */
export function modalityTitle(modality: AppointmentModality): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Segment de modalité, cabinet@@agenda.modality.inPerson:Cabinet`;
    case 'video':
      return $localize`:Segment de modalité, visio@@agenda.modality.video:Visio`;
    case 'phone':
      return $localize`:Segment de modalité, téléphone@@agenda.modality.phone:Téléphone`;
  }
}

/** « à confirmer » (statut tentative), null pour les autres statuts. */
export function statusLabel(status: AppointmentStatus): string | null {
  switch (status) {
    case 'tentative':
      return $localize`:Rendez-vous à confirmer, après le nom@@agenda.status.tentative:à confirmer`;
    case 'cancelled':
      return $localize`:Rendez-vous annulé@@agenda.status.cancelled:annulé`;
    case 'done':
      return $localize`:Rendez-vous fait (séance démarrée)@@agenda.status.done:fait`;
    default:
      return null;
  }
}

/** Libellé d'une case du rail gauche (fiche 15 §3). */
export function calendarLabel(key: CalendarKey): string {
  switch (key) {
    case 'in_person':
      return $localize`:Case du rail de l'agenda@@agenda.calendars.inPerson:Séances au cabinet`;
    case 'video':
      return $localize`:Case du rail de l'agenda@@agenda.calendars.video:Séances en visio`;
    case 'phone':
      return $localize`:Case du rail de l'agenda@@agenda.calendars.phone:Contacts (appels)`;
  }
}

/** Nom accessible d'une indisponibilité externe : « Indisponible de 14:00 à 16:00, agenda Google Pro ». */
export function busyName(
  startsAt: string,
  endsAt: string,
  calendar: string,
  locale: string,
): string {
  const from = formatTime(startsAt, locale);
  const to = formatTime(endsAt, locale);
  return $localize`:Nom accessible d'un bloc occupé externe@@agenda.busy.name:Indisponible de ${from}:from: à ${to}:to:, agenda ${calendar}:calendar:`;
}

/**
 * Chevauchements signalés après une écriture (fiche 15b : jamais bloquants) : « Chevauche le
 * rendez-vous de Théo B. à 11:30 », puis « et n autres » ; null sans chevauchement.
 */
export function conflictMessage(conflicts: readonly Conflict[], locale: string): string | null {
  const first = conflicts[0];
  if (!first) return null;
  const name = first.patientDisplayName;
  const at = formatTime(first.startsAt, locale);
  const others = conflicts.length - 1;
  return others > 0
    ? $localize`:Toast, plusieurs chevauchements@@agenda.conflict.many:Chevauche le rendez-vous de ${name}:name: à ${at}:time: et ${others}:count: autre(s).`
    : $localize`:Toast, un chevauchement@@agenda.conflict.one:Chevauche le rendez-vous de ${name}:name: à ${at}:time:.`;
}
