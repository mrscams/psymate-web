// Modèles de vue de features/patient-shell (handbook §2, couche 4 → 3) : ce que l'en-tête patient
// affiche, préparé depuis les DTO par data/patient-shell.api.ts.

/** Les onglets du dossier dont l'état est mémorisé (B2) ; search remplace le contenu de l'onglet. */
export type ShellTab = 'overview' | 'timeline' | 'graph' | 'search';

export const SHELL_TABS: readonly ShellTab[] = ['overview', 'timeline', 'graph', 'search'];

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
  /** Modalité (cabinet, visio, téléphone, e-mail) ; null si le contrat ne la donne pas. */
  modality: SessionModality | null;
  closedAt: string | null;
  durationMin: number | null;
  summary: string | null;
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
