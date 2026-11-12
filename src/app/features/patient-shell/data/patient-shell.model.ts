// Modèles de vue de features/patient-shell (handbook §2, couche 4 → 3) : ce que l'en-tête patient
// et l'onglet Séance (UX-S3) affichent, préparé depuis les DTO par data/patient-shell.api.ts.

import { EntryType } from '../../../shared/ui';

/**
 * Les onglets du dossier dont l'état est mémorisé (B2) ; search remplace le contenu de l'onglet ;
 * session est l'onglet « Séance » (UX-S3), affiché à la place de la vue d'ensemble tant qu'une
 * séance est ouverte.
 */
export type ShellTab = 'overview' | 'session' | 'timeline' | 'graph' | 'search';

export const SHELL_TABS: readonly ShellTab[] = [
  'overview',
  'session',
  'timeline',
  'graph',
  'search',
];

export type FlagKind = 'watch' | 'risk' | 'shared_care';

export type SessionModality = 'in_person' | 'video' | 'phone' | 'email';

export type ContactModality = 'phone' | 'email';

/** Le patient tel que l'en-tête le montre (GET /api/patients/{id}). */
export interface ShellPatient {
  id: string;
  displayName: string;
  /** AAAA-MM-JJ ou null. */
  birthDate: string | null;
  /** Début du suivi : followUp.since (fiche 16), sinon la création du dossier. */
  followedSince: string | null;
  flags: FlagKind[];
  /** Modalité habituelle (followUp.modality, fiche 16) : celle des séances démarrées ici. */
  sessionModality: SessionModality;
  /** Durée habituelle d'une séance (followUp.durationMin, fiche 16) ; null si non renseignée. */
  plannedDurationMin: number | null;
}

/**
 * Une séance (entrée de type session) : `open` tant qu'elle n'est pas clôturée. La séance d'accueil
 * (intake, créée avec le patient) n'est ni « en cours » ni « dernière séance » : `kind` la distingue.
 */
export interface ShellSession {
  id: string;
  kind: 'intake' | 'session' | 'contact';
  /** Début (occurred.from), UTC ISO 8601. */
  startedAt: string;
  closedAt: string | null;
  durationMin: number | null;
  summary: string | null;
  /** Modalité (session.modality) ; null si le contrat ne la donne pas. */
  modality: SessionModality | null;
}

/** Ce que la clôture envoie (POST /api/sessions/{id}/close). */
export interface CloseSessionInput {
  /** 1 à 600 ; absente : la durée par défaut des préférences. */
  durationMin?: number;
  summary?: string;
}

/** Contact hors rendez-vous (POST /api/patients/{id}/sessions/contact), consigné déjà clôturé. */
export interface ContactInput {
  modality: ContactModality;
  occurredFrom: string;
  body: string;
}

/** Une séance ordinaire non clôturée : celle que l'en-tête montre « en cours ». */
export function isOpen(session: ShellSession | null): boolean {
  return !!session && session.kind !== 'intake' && session.closedAt === null;
}

/** Une séance ordinaire ou un contact clôturé : « Dernière séance ». */
export function isClosed(session: ShellSession | null): boolean {
  return !!session && session.kind !== 'intake' && session.closedAt !== null;
}

// ---------------------------------------------------------------- onglet Séance (UX-S3)

/**
 * Une entrée notée pendant la séance ouverte (« Noté pendant cette séance », proposition 04b) :
 * une ligne de la chronologie (TimelineItemDto) rattachée à la séance courante. La chronologie ne
 * porte pas d'extrait du texte (index des propositions, « What would need the backend ») : la ligne
 * se nomme par le titre de repli partagé entryTitle().
 */
export interface NotedEntry {
  id: string;
  type: EntryType;
  title: string | null;
  status: 'draft' | 'final';
  /** Instant d'enregistrement (l'heure de la ligne), UTC ISO 8601 ; null si inconnu. */
  recordedAt: string | null;
  occurredFrom: string | null;
  emotionCode: string | null;
  intensity: number | null;
  /** Nombre de liens acceptés : la phrase de lien n'est lue que s'il y en a. */
  linkCount: number;
  /** Situation sans fin, toujours en cours. */
  ongoing: boolean;
}

/** La séance précédente (GET /api/entries/{id} de la séance qui précède la séance ouverte). */
export interface PreviousSession {
  id: string;
  kind: 'intake' | 'session' | 'contact';
  startedAt: string | null;
  durationMin: number | null;
  modality: SessionModality | null;
  /** Compte rendu entier ; null s'il n'y en a pas. */
  summary: string | null;
}

/** « À garder en tête » : drapeaux, médicaments en cours, situations en cours (vue d'ensemble). */
export interface SessionReminders {
  flags: { kind: FlagKind; reason: string | null }[];
  medications: { entryId: string; molecule: string; dosage: string | null; since: string | null }[];
  situations: { entryId: string; title: string | null; since: string | null }[];
  /** « Depuis la séance du … » : entrées entre les séances (sinceLastSession de la vue d'ensemble). */
  since: {
    lastSessionAt: string | null;
    entries: {
      entryId: string;
      type: EntryType;
      title: string | null;
      occurredFrom: string | null;
    }[];
  };
}

/** Le contexte de l'onglet Séance, lu une fois par séance ouverte : séance précédente et rappels. */
export interface SessionContext {
  previous: PreviousSession | null;
  reminders: SessionReminders;
  /** Code d'émotion → libellé dans la langue de l'interface (titre de repli des ressentis). */
  emotionLabels: Record<string, string>;
}

/** Brouillon du panneau de clôture, gardé quand Échap ou le voile le ferment (fiche 00 §6). */
export interface CloseDraft {
  sessionId: string;
  durationMin: string;
  summary: string;
  nextTime: string[];
}

/**
 * Fenêtre de grâce (G Q31, versioning.grace-period = 75 min) : une entrée notée il y a moins de
 * 75 minutes se corrige en place (« modifier ») ; au-delà, sa correction crée une version
 * (« corriger »). Le serveur reste juge ; le libellé seul change ici.
 */
export const EDIT_GRACE_MS = 75 * 60_000;

export function inGrace(recordedAt: string | null, now: Date): boolean {
  if (!recordedAt) return false;
  const recorded = Date.parse(recordedAt);
  return !Number.isNaN(recorded) && now.getTime() - recorded < EDIT_GRACE_MS;
}

/** Minutes écoulées depuis le début de la séance, jamais négatives. */
export function elapsedMinutes(startedAt: string, now: Date): number {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 60_000));
}

/** Minutes au-delà de la durée prévue (0 tant qu'elle n'est pas atteinte). */
export function overtimeMinutes(elapsed: number, plannedMin: number): number {
  return Math.max(0, elapsed - plannedMin);
}

/** Bornes du contrat (CloseSessionRequest.durationMin). */
export const CLOSE_DURATION_MIN = 1;
export const CLOSE_DURATION_MAX = 600;

/**
 * Durée proposée à la clôture (proposition 04b, état 5) : le temps écoulé arrondi à 5 minutes, au
 * moins 1 ; passé le seuil « non clôturée » (3 h), la durée prévue (la séance n'a visiblement pas
 * duré trois heures), bornée par le contrat.
 */
export function proposedDuration(
  elapsed: number,
  plannedMin: number,
  unclosedAfterMin: number,
): number {
  const base = elapsed > unclosedAfterMin ? plannedMin : Math.round(elapsed / 5) * 5;
  return Math.min(CLOSE_DURATION_MAX, Math.max(CLOSE_DURATION_MIN, base));
}
