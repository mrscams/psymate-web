import { ApiProblem } from '../../../core/http';
import { CancelledBy, PublicAppointment } from '../data/booking.models';
import { PUBLIC_FACTS } from '../public-facts';
import { LinkIcon, LinkTone } from './booking-link-badge.component';
import { retryMinutes } from './booking-format';
import { modeSentence } from './booking-mode';

/**
 * Vues des pages par lien (fiche 32, tables « Vues de … ») : une vue par réponse de l'API, avec le
 * pictogramme, le titre, la ou les phrases et l'action de la maquette 32. Les composants de page ne
 * font que les dessiner.
 */

/** Action principale d'une vue. */
export type LinkAction =
  | { kind: 'manage'; token: string; label: string }
  | { kind: 'rebook'; slug: string }
  | { kind: 'directory' }
  | { kind: 'retry' }
  | { kind: 'cancel'; label: string };

export type PillTone = 'info' | 'success' | 'neutral';

export interface LinkView {
  /** Identifiant stable de la vue (tests, focus). */
  key: string;
  tone: LinkTone;
  icon: LinkIcon;
  /** `status` pour un succès (ou un état lu), `alert` pour un refus ou une erreur. */
  role: 'status' | 'alert';
  title: string;
  /** Pastille d'état de la page de gestion. */
  pill: { tone: PillTone; label: string } | null;
  texts: string[];
  /** Phrase de repli, en second (`text-secondary`). */
  secondary: string | null;
  /** Avertissement (`role="alert"`) sous l'en-tête : plafond atteint. */
  warning: string | null;
  /** Détail du rendez-vous, quand la réponse le donne. */
  appointment: PublicAppointment | null;
  action: LinkAction | null;
}

function view(partial: Partial<LinkView> & Pick<LinkView, 'key' | 'tone' | 'icon' | 'title'>) {
  return {
    role: 'alert',
    pill: null,
    texts: [],
    secondary: null,
    warning: null,
    appointment: null,
    action: null,
    ...partial,
  } as LinkView;
}

const DIRECTORY: LinkAction = { kind: 'directory' };
const RETRY: LinkAction = { kind: 'retry' };

const LINK_INVALID = $localize`:Titre, lien plus valable@@public.bookingLink.invalid.title:Ce lien n'est plus valable`;

function rateLimited(problem: ApiProblem | null): string {
  const minutes = retryMinutes(problem?.retryAfterSeconds);
  return $localize`:Plafond atteint (429) sur une page par lien@@public.bookingLink.rateLimited:Trop de tentatives depuis votre connexion. Réessayez dans ${minutes}:minutes: min.`;
}

/** Cause d'une annulation (fiche 32, vue « Annulé »). */
export function cancelCause(cancelledBy: CancelledBy | null): string | null {
  switch (cancelledBy) {
    case 'visitor':
      return $localize`:Cause d'une annulation, le demandeur@@public.bookingLink.cause.visitor:Vous avez annulé ce rendez-vous.`;
    case 'practitioner':
      return $localize`:Cause d'une annulation, le praticien@@public.bookingLink.cause.practitioner:Le praticien a annulé ce rendez-vous.`;
    case 'expired':
      return $localize`:Cause d'une annulation, expiration@@public.bookingLink.cause.expired:La demande a expiré : le praticien n'a pas répondu à temps.`;
    default:
      return null;
  }
}

function rebook(appointment: PublicAppointment): LinkAction | null {
  const slug = appointment.practitioner.slug;
  return slug ? { kind: 'rebook', slug } : null;
}

// ---------------------------------------------------------------------------------------------
// /rendez-vous/confirmer/:token
// ---------------------------------------------------------------------------------------------

/** Vue de la page de vérification pour une réponse 200. */
export function verifiedView(appointment: PublicAppointment): LinkView {
  const fallback = appointment.manageToken
    ? null
    : $localize`:Repli quand le lien de gestion n'est pas renvoyé@@public.bookingLink.verify.manageFallback:Pour suivre ou annuler votre demande, utilisez le lien de l'e-mail que nous vous avons envoyé.`;
  switch (appointment.status) {
    case 'pending':
      return view({
        key: 'verify-pending',
        tone: 'wait',
        icon: 'clock',
        role: 'status',
        title: $localize`:Titre, demande transmise@@public.bookingLink.verify.pending.title:Votre demande est transmise`,
        texts: [modeSentence('manual')],
        secondary: fallback,
        appointment,
        action: appointment.manageToken
          ? {
              kind: 'manage',
              token: appointment.manageToken,
              label: $localize`:Lien vers la gestion d'une demande@@public.bookingLink.verify.manageRequest:Gérer ma demande`,
            }
          : null,
      });
    case 'confirmed':
      return view({
        key: 'verify-confirmed',
        tone: 'ok',
        icon: 'check',
        role: 'status',
        title: $localize`:Titre, rendez-vous confirmé@@public.bookingLink.verify.confirmed.title:Votre rendez-vous est confirmé`,
        texts: [
          $localize`:Texte, rendez-vous confirmé@@public.bookingLink.verify.confirmed.text:Vous recevez un e-mail de confirmation avec le lien pour le gérer.`,
        ],
        secondary: fallback,
        appointment,
        action: appointment.manageToken
          ? {
              kind: 'manage',
              token: appointment.manageToken,
              label: $localize`:Lien vers la gestion d'un rendez-vous@@public.bookingLink.verify.manageAppointment:Gérer mon rendez-vous`,
            }
          : null,
      });
    case 'cancelled': {
      const cause = cancelCause(appointment.cancelledBy);
      return view({
        key: 'verify-cancelled',
        tone: 'muted',
        icon: 'cross',
        role: 'status',
        title: $localize`:Titre, lien rouvert sur un rendez-vous annulé@@public.bookingLink.verify.cancelled.title:Ce rendez-vous est annulé`,
        texts: cause ? [cause] : [],
        appointment,
        action: rebook(appointment),
      });
    }
    case 'past':
      return view({
        key: 'verify-past',
        tone: 'muted',
        icon: 'calendar',
        role: 'status',
        title: $localize`:Titre, lien rouvert sur un rendez-vous passé@@public.bookingLink.verify.past.title:Ce rendez-vous est passé`,
        appointment,
      });
  }
}

/** Vue de la page de vérification pour une erreur de POST …/requests/verify. */
export function verifyFailedView(problem: ApiProblem | null): LinkView {
  const status = problem?.status ?? 0;
  if (status === 410) {
    const minutes = PUBLIC_FACTS.bookingLinkMinutes;
    return view({
      key: 'verify-expired',
      tone: 'warn',
      icon: 'clock',
      title: LINK_INVALID,
      texts: [
        $localize`:Texte, lien de vérification expiré (410)@@public.bookingLink.verify.expired.text:Le lien de vérification est valable ${minutes}:minutes: minutes : celui-ci a expiré. Aucune demande n'a été transmise au praticien.`,
      ],
      action: DIRECTORY,
    });
  }
  if (status === 404 && problem?.code === 'BOOKING_NOT_AVAILABLE') {
    return view({
      key: 'verify-closed',
      tone: 'warn',
      icon: 'alert',
      title: $localize`:Titre, prise de rendez-vous fermée (404 BOOKING_NOT_AVAILABLE)@@public.bookingLink.verify.closed.title:Ce praticien ne propose plus la prise de rendez-vous en ligne`,
      texts: [
        $localize`:Texte, aucun rendez-vous créé@@public.bookingLink.verify.closed.text:Aucun rendez-vous n'a été créé.`,
      ],
      action: DIRECTORY,
    });
  }
  if (status === 404 || status === 422) {
    return view({
      key: 'verify-unknown',
      tone: 'warn',
      icon: 'link-off',
      title: LINK_INVALID,
      texts: [
        $localize`:Texte, lien de vérification inconnu (404, 422)@@public.bookingLink.verify.unknown.text:Nous ne reconnaissons pas ce lien : il est peut-être incomplet, ou la demande a été effacée.`,
      ],
      action: DIRECTORY,
    });
  }
  if (status === 409 && problem?.code === 'BOOKING_ALREADY_ACTIVE') {
    return view({
      key: 'verify-already-active',
      tone: 'wait',
      icon: 'calendar',
      title: $localize`:Titre, rendez-vous déjà actif (409 BOOKING_ALREADY_ACTIVE)@@public.bookingLink.verify.alreadyActive.title:Vous avez déjà un rendez-vous à venir avec ce praticien`,
      texts: [
        $localize`:Texte, rendez-vous déjà actif@@public.bookingLink.verify.alreadyActive.text:Aucune nouvelle demande n'a été créée. Pour suivre ou annuler votre rendez-vous, utilisez le lien du dernier e-mail reçu.`,
      ],
    });
  }
  if (status === 409) {
    return view({
      key: 'verify-slot-taken',
      tone: 'warn',
      icon: 'alert',
      title: $localize`:Titre, créneau plus disponible (409 SLOT_TAKEN)@@public.bookingLink.verify.slotTaken.title:Ce créneau n'est plus disponible`,
      texts: [
        $localize`:Texte, créneau plus disponible@@public.bookingLink.verify.slotTaken.text:Aucun rendez-vous n'a été créé. Choisissez un autre créneau sur la page du praticien.`,
      ],
      action: DIRECTORY,
    });
  }
  const title = $localize`:Titre, vérification en échec@@public.bookingLink.verify.failed.title:La vérification n'a pas abouti`;
  if (status === 429) {
    return view({
      key: 'verify-rate-limited',
      tone: 'warn',
      icon: 'alert',
      title,
      warning: rateLimited(problem),
      action: RETRY,
    });
  }
  return view({
    key: 'verify-error',
    tone: 'warn',
    icon: 'alert',
    title,
    texts: [
      $localize`:Texte, vérification en échec (réseau, 5xx)@@public.bookingLink.verify.error.text:Vérifiez votre connexion, puis réessayez : votre lien reste valable.`,
    ],
    action: RETRY,
  });
}

// ---------------------------------------------------------------------------------------------
// /rendez-vous/gerer/:token
// ---------------------------------------------------------------------------------------------

const MANAGE_TITLE = $localize`:Titre de la page de gestion@@public.bookingLink.manage.title:Votre rendez-vous`;

/** Vue de la page de gestion pour une réponse 200. */
export function managedView(appointment: PublicAppointment): LinkView {
  switch (appointment.status) {
    case 'pending':
      return view({
        key: 'manage-pending',
        tone: 'wait',
        icon: 'clock',
        role: 'status',
        title: $localize`:Titre de la page de gestion, demande en attente@@public.bookingLink.manage.pending.title:Votre demande de rendez-vous`,
        pill: {
          tone: 'info',
          label: $localize`:Pastille, en attente@@public.bookingLink.manage.pending.pill:En attente de réponse`,
        },
        texts: [
          $localize`:Texte, demande en attente@@public.bookingLink.manage.pending.text:Le praticien vous répondra par e-mail.`,
        ],
        appointment,
        action: appointment.canCancel
          ? {
              kind: 'cancel',
              label: $localize`:Bouton d'annulation d'une demande@@public.bookingLink.manage.cancelRequest:Annuler ma demande`,
            }
          : null,
      });
    case 'confirmed':
      return view({
        key: 'manage-confirmed',
        tone: 'ok',
        icon: 'check',
        role: 'status',
        title: MANAGE_TITLE,
        pill: {
          tone: 'success',
          label: $localize`:Pastille, confirmé@@public.bookingLink.manage.confirmed.pill:Confirmé`,
        },
        appointment,
        action: appointment.canCancel
          ? {
              kind: 'cancel',
              label: $localize`:Bouton d'annulation d'un rendez-vous@@public.bookingLink.manage.cancelAppointment:Annuler mon rendez-vous`,
            }
          : null,
      });
    case 'cancelled': {
      const cause = cancelCause(appointment.cancelledBy);
      return view({
        key: 'manage-cancelled',
        tone: 'muted',
        icon: 'cross',
        role: 'status',
        title: MANAGE_TITLE,
        pill: {
          tone: 'neutral',
          label: $localize`:Pastille, annulé@@public.bookingLink.manage.cancelled.pill:Annulé`,
        },
        texts: cause ? [cause] : [],
        appointment,
        action: rebook(appointment),
      });
    }
    case 'past':
      return view({
        key: 'manage-past',
        tone: 'muted',
        icon: 'calendar',
        role: 'status',
        title: MANAGE_TITLE,
        pill: {
          tone: 'neutral',
          label: $localize`:Pastille, passé@@public.bookingLink.manage.past.pill:Passé`,
        },
        appointment,
      });
  }
}

const LAST_EMAIL = $localize`:Renvoi vers le dernier e-mail@@public.bookingLink.manage.lastEmail:Utilisez le lien du dernier e-mail reçu.`;

/** Vue de la page de gestion pour une erreur de POST …/manage. */
export function manageFailedView(problem: ApiProblem | null): LinkView {
  const status = problem?.status ?? 0;
  if (status === 404 || status === 422) {
    return view({
      key: 'manage-unknown',
      tone: 'warn',
      icon: 'link-off',
      title: LINK_INVALID,
      texts: [LAST_EMAIL],
      action: DIRECTORY,
    });
  }
  const title = $localize`:Titre, rendez-vous non chargé@@public.bookingLink.manage.failed.title:Votre rendez-vous n'a pas pu être chargé`;
  if (status === 429) {
    return view({
      key: 'manage-rate-limited',
      tone: 'warn',
      icon: 'alert',
      title,
      warning: rateLimited(problem),
      action: RETRY,
    });
  }
  return view({
    key: 'manage-error',
    tone: 'warn',
    icon: 'alert',
    title,
    texts: [
      $localize`:Texte, rendez-vous non chargé (réseau, 5xx)@@public.bookingLink.manage.error.text:Vérifiez votre connexion, puis réessayez.`,
    ],
    action: RETRY,
  });
}

/** Annulation refusée par un 404 BOOKING_TOKEN_INVALID : le lien a été remplacé entre-temps. */
export function cancelLinkInvalidView(): LinkView {
  return view({
    key: 'manage-cancel-link-invalid',
    tone: 'warn',
    icon: 'link-off',
    title: LINK_INVALID,
    texts: [
      $localize`:Texte, lien remplacé au moment d'annuler@@public.bookingLink.manage.cancelLinkInvalid.text:Votre rendez-vous n'a pas été annulé depuis cette page. Utilisez le lien du dernier e-mail reçu.`,
    ],
    action: DIRECTORY,
  });
}

/** Message sous l'en-tête après une annulation qui n'a pas abouti (état affiché inchangé). */
export function cancelFailureMessage(
  outcome: 'too-late' | 'rate-limited' | 'error',
  problem: ApiProblem | null,
): string {
  switch (outcome) {
    case 'too-late':
      return $localize`:Annulation refusée, rendez-vous commencé (409)@@public.bookingLink.manage.tooLate:Ce rendez-vous a commencé ou est terminé : il ne peut plus être annulé.`;
    case 'rate-limited': {
      const minutes = retryMinutes(problem?.retryAfterSeconds);
      return $localize`:Annulation, plafond atteint (429)@@public.bookingLink.manage.cancelRateLimited:L'annulation n'a pas pu être enregistrée. Trop de tentatives depuis votre connexion : réessayez dans ${minutes}:minutes: min.`;
    }
    case 'error':
      return $localize`:Annulation en échec (réseau, 5xx)@@public.bookingLink.manage.cancelError:L'annulation n'a pas pu être enregistrée.`;
  }
}
