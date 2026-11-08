// Modèles de vue de features/entries (handbook §2, couche 4 → 3) : ce que l'éditeur d'entrée et
// l'historique des versions manipulent, préparé depuis les DTO par data/entries.api.ts, et les
// fonctions pures qui transforment la saisie en corps de requête (POST, PATCH). Aucun corps ne
// porte authorType ni submissionId (A11) : ils ne figurent dans aucun type ci-dessous.

import { EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';

export type EntryStatus = 'draft' | 'final';
export type EntryVisibility = 'private' | 'clinical';
export type SessionModality = 'in_person' | 'video' | 'phone' | 'email';
export type EmotionFamily =
  'joy' | 'trust' | 'fear' | 'surprise' | 'sadness' | 'disgust' | 'anger' | 'anticipation';

export const EMOTION_FAMILIES: readonly EmotionFamily[] = [
  'joy',
  'trust',
  'fear',
  'surprise',
  'sadness',
  'disgust',
  'anger',
  'anticipation',
];

export const SESSION_MODALITIES: readonly SessionModality[] = [
  'in_person',
  'video',
  'phone',
  'email',
];

/** Fenêtre de grâce (G Q31, versioning.grace-period = 75m) : correction en place, sans version. */
export const GRACE_PERIOD_MS = 75 * 60_000;

/** Intensité d'un ressenti (contrat : 0 à 10). */
export const INTENSITY_MIN = 0;
export const INTENSITY_MAX = 10;

/** Une émotion du vocabulaire (GET /api/vocabulary/emotions) : globale ou personnalisée. */
export interface Emotion {
  code: string;
  label: string;
  family: EmotionFamily | null;
  custom: boolean;
}

/** Une séance du patient, pour le bloc Séance. */
export interface SessionOption {
  id: string;
  /** Début, UTC ISO 8601. */
  startedAt: string;
  /** Séance ouverte (« en cours ») : seule la séance courante le sait. */
  open: boolean;
}

/** Moment d'une entrée, tel que le contrat le porte (EntryOccurredDto). */
export interface OccurredValue {
  from: string | null;
  to: string | null;
  precision: OccurredPrecision;
  label: string | null;
}

/** Une entrée lue (GET /api/entries/{id}), réduite à ce que l'éditeur corrige. */
export interface EntryView {
  id: string;
  patientId: string;
  type: EntryType;
  status: EntryStatus;
  visibility: EntryVisibility;
  title: string | null;
  body: string | null;
  occurred: OccurredValue;
  recordedAt: string | null;
  sessionId: string | null;
  version: number;
  tags: string[];
  linkCount: number;
  feeling: { emotionCode: string | null; intensity: number | null } | null;
  medication: { molecule: string | null; dosage: string | null } | null;
  session: {
    modality: SessionModality | null;
    durationMin: number | null;
    closedAt: string | null;
  } | null;
  archived: boolean;
}

/** Une version (GET /api/entries/{id}/versions), la plus récente en premier. */
export interface EntryVersion {
  version: number;
  title: string | null;
  body: string | null;
  reason: string | null;
  authorId: string | null;
  createdAt: string | null;
}

/**
 * Le bloc « Quand » du formulaire. Les champs `from` et `to` gardent la valeur des contrôles HTML
 * selon la précision : exact = « AAAA-MM-JJTHH:mm » local, day = « AAAA-MM-JJ », month = « AAAA-MM »,
 * year = « AAAA », period = deux jours « AAAA-MM-JJ » (fin incluse), life_phase = libellé seul.
 */
export interface OccurredDraft {
  /** « Maintenant » : le serveur prend l'instant de saisie (sauf situation, qui exige un début). */
  now: boolean;
  precision: OccurredPrecision;
  from: string;
  to: string;
  label: string;
  /** Situation en cours (sans fin). */
  ongoing: boolean;
}

/** La saisie complète du panneau ; c'est aussi le brouillon conservé à Échap. */
export interface EntryDraft {
  type: EntryType;
  title: string;
  body: string;
  feeling: { emotionCode: string | null; intensity: number | null };
  medication: { molecule: string; dosage: string };
  session: { modality: SessionModality | null; durationMin: number | null };
  occurred: OccurredDraft;
  /** Séance de rattachement ; vide : la séance courante du serveur (SESSION_REQUIRED s'il n'y en a aucune). */
  sessionId: string;
  visibility: EntryVisibility;
  tags: string[];
  /** Motif de la correction (PATCH reason). */
  reason: string;
}

/** Corps de POST /api/patients/{id}/entries (CreateEntryRequest, sans authorType ni submissionId). */
export interface CreateEntryBody {
  type: EntryType;
  title?: string;
  body?: string;
  feeling?: { emotionCode?: string; intensity?: number };
  medication?: { molecule?: string; dosage?: string };
  session?: { modality?: SessionModality; durationMin?: number };
  occurred?: OccurredBody;
  sessionId?: string;
  status?: EntryStatus;
  visibility?: EntryVisibility;
  tags?: string[];
}

/** Corps de PATCH /api/entries/{id} (PatchEntryRequest) : seules les clés modifiées. */
export interface PatchEntryBody {
  title?: string;
  body?: string;
  feeling?: { emotionCode?: string; intensity?: number };
  medication?: { molecule?: string; dosage?: string };
  session?: { modality?: SessionModality; durationMin?: number };
  occurred?: OccurredBody;
  status?: EntryStatus;
  visibility?: EntryVisibility;
  tags?: string[];
  reason?: string;
}

export interface OccurredBody {
  from?: string;
  to?: string;
  precision: OccurredPrecision;
  label?: string;
}

/** Une ligne de différence de l'historique (titre, texte). */
export interface VersionChange {
  field: 'title' | 'body';
  before: string | null;
  after: string | null;
}

/** Une version et ce qu'elle change par rapport à la précédente. */
export interface VersionDiff extends EntryVersion {
  changes: VersionChange[];
  unchanged: ('title' | 'body')[];
}

export function emptyDraft(
  type: EntryType,
  visibility: EntryVisibility,
  sessionId = '',
): EntryDraft {
  return {
    type,
    title: '',
    body: '',
    feeling: { emotionCode: null, intensity: null },
    medication: { molecule: '', dosage: '' },
    session: { modality: type === 'session' ? 'in_person' : null, durationMin: null },
    occurred: { now: true, precision: 'exact', from: '', to: '', label: '', ongoing: true },
    sessionId,
    visibility,
    tags: [],
    reason: '',
  };
}

/** Le brouillon d'une entrée existante : ses valeurs courantes dans les champs du panneau. */
export function draftFromEntry(entry: EntryView): EntryDraft {
  return {
    type: entry.type,
    title: entry.title ?? '',
    body: entry.body ?? '',
    feeling: {
      emotionCode: entry.feeling?.emotionCode ?? null,
      intensity: entry.feeling?.intensity ?? null,
    },
    medication: {
      molecule: entry.medication?.molecule ?? '',
      dosage: entry.medication?.dosage ?? '',
    },
    session: {
      modality: entry.session?.modality ?? null,
      durationMin: entry.session?.durationMin ?? null,
    },
    occurred: occurredDraft(entry.occurred),
    sessionId: entry.sessionId ?? '',
    visibility: entry.visibility,
    tags: [...entry.tags],
    reason: '',
  };
}

const trim = (value: string | null | undefined): string => (value ?? '').trim();

/**
 * La saisie → corps du POST. Seuls les champs du type choisi partent ; une séance n'a ni titre, ni
 * texte, ni tags, ni sessionId, ni durée (NOT_ALLOWED_ON_CREATE, SESSION_NOT_ALLOWED). Le serveur
 * reste juge des règles (champ obligatoire, intensité) : le client ne fait que mettre en forme.
 */
export function toCreateBody(draft: EntryDraft, status: EntryStatus = 'final'): CreateEntryBody {
  const body: CreateEntryBody = { type: draft.type, visibility: draft.visibility };
  const title = trim(draft.title);
  const text = trim(draft.body);
  switch (draft.type) {
    case 'note':
      if (text) body.body = text;
      if (title) body.title = title;
      break;
    case 'event':
    case 'situation':
      if (title) body.title = title;
      if (text) body.body = text;
      break;
    case 'feeling': {
      const feeling: CreateEntryBody['feeling'] = {};
      if (draft.feeling.emotionCode) feeling.emotionCode = draft.feeling.emotionCode;
      if (draft.feeling.intensity !== null) feeling.intensity = draft.feeling.intensity;
      body.feeling = feeling;
      if (text) body.body = text;
      break;
    }
    case 'medication': {
      const medication: CreateEntryBody['medication'] = {};
      const molecule = trim(draft.medication.molecule);
      const dosage = trim(draft.medication.dosage);
      if (molecule) medication.molecule = molecule;
      if (dosage) medication.dosage = dosage;
      body.medication = medication;
      if (text) body.body = text;
      break;
    }
    case 'session':
      body.session = draft.session.modality ? { modality: draft.session.modality } : {};
      break;
  }
  const occurred = toOccurredBody(draft.occurred, draft.type);
  if (occurred) body.occurred = occurred;
  if (draft.type !== 'session') {
    body.status = status;
    if (draft.sessionId) body.sessionId = draft.sessionId;
    if (draft.tags.length > 0) body.tags = [...draft.tags];
  }
  return body;
}

/**
 * La saisie comparée à l'entrée lue → corps du PATCH : seules les clés modifiées (champ absent =
 * inchangé) ; occurred et tags remplacés en entier ; le détail fusionné champ par champ côté
 * serveur ; `status` passe le brouillon en définitif (⏎) ou l'y garde (Ctrl+S). null quand rien
 * n'a changé (pas de requête).
 */
export function toPatchBody(
  entry: EntryView,
  draft: EntryDraft,
  status?: EntryStatus,
): PatchEntryBody | null {
  const original = draftFromEntry(entry);
  const body: PatchEntryBody = {};
  if (trim(draft.title) !== trim(original.title)) body.title = trim(draft.title);
  if (trim(draft.body) !== trim(original.body)) body.body = trim(draft.body);
  switch (entry.type) {
    case 'feeling': {
      const feeling: PatchEntryBody['feeling'] = {};
      if (draft.feeling.emotionCode && draft.feeling.emotionCode !== original.feeling.emotionCode)
        feeling.emotionCode = draft.feeling.emotionCode;
      if (
        draft.feeling.intensity !== null &&
        draft.feeling.intensity !== original.feeling.intensity
      )
        feeling.intensity = draft.feeling.intensity;
      if (Object.keys(feeling).length > 0) body.feeling = feeling;
      break;
    }
    case 'medication': {
      const medication: PatchEntryBody['medication'] = {};
      if (trim(draft.medication.molecule) !== trim(original.medication.molecule))
        medication.molecule = trim(draft.medication.molecule);
      if (trim(draft.medication.dosage) !== trim(original.medication.dosage))
        medication.dosage = trim(draft.medication.dosage);
      if (Object.keys(medication).length > 0) body.medication = medication;
      break;
    }
    case 'session': {
      const session: PatchEntryBody['session'] = {};
      if (draft.session.modality && draft.session.modality !== original.session.modality)
        session.modality = draft.session.modality;
      if (
        draft.session.durationMin !== null &&
        draft.session.durationMin !== original.session.durationMin
      )
        session.durationMin = draft.session.durationMin;
      if (Object.keys(session).length > 0) body.session = session;
      break;
    }
    default:
      break;
  }
  if (!sameOccurred(draft.occurred, original.occurred)) {
    const occurred = toOccurredBody(draft.occurred, entry.type);
    if (occurred) body.occurred = occurred;
  }
  if (draft.visibility !== original.visibility) body.visibility = draft.visibility;
  if (!sameList(draft.tags, original.tags)) body.tags = [...draft.tags];
  // Un brouillon enregistré par ⏎ devient définitif (Ctrl+S le garde en brouillon).
  if (status && status !== entry.status) body.status = status;
  if (Object.keys(body).length === 0) return null;
  const reason = trim(draft.reason);
  if (reason) body.reason = reason;
  return body;
}

/** Le bloc « Quand » → occurred du contrat (UTC ISO 8601), ou undefined pour « Maintenant ». */
export function toOccurredBody(
  draft: OccurredDraft,
  type: EntryType,
  now: Date = new Date(),
): OccurredBody | undefined {
  if (draft.now) {
    // Une situation exige un début : « Maintenant » devient l'instant présent, en cours ou finie.
    if (type !== 'situation') return undefined;
    const body: OccurredBody = { from: now.toISOString(), precision: 'exact' };
    if (!draft.ongoing) {
      const to = endIso('exact', draft.to);
      if (to) body.to = to;
    }
    return body;
  }
  const precision = draft.precision;
  const label = draft.label.trim();
  const body: OccurredBody = { precision };
  if (precision === 'life_phase') {
    if (label) body.label = label;
    return body;
  }
  const from = startIso(precision, draft.from);
  if (from) body.from = from;
  if (precision === 'period') {
    if (label) body.label = label;
    const to = endIso('day', draft.to);
    if (to) body.to = to;
  } else if (type === 'situation' && !draft.ongoing) {
    const to = endIso(precision, draft.to);
    if (to) body.to = to;
  }
  return body;
}

/** Début d'une précision (valeur d'un contrôle HTML) → instant UTC ; null si illisible. */
export function startIso(precision: OccurredPrecision, value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  switch (precision) {
    case 'exact': {
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    case 'day':
    case 'period':
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : null;
    case 'month':
      return /^\d{4}-\d{2}$/.test(text) ? `${text}-01T00:00:00Z` : null;
    case 'year':
      return /^\d{4}$/.test(text) ? `${text}-01-01T00:00:00Z` : null;
    case 'life_phase':
      return null;
  }
}

/**
 * Fin saisie (incluse) → borne de fin du contrat, exclusive pour les précisions en jours entiers :
 * le jour, le mois ou l'année qui suit (formatOccurred recule d'une milliseconde à l'affichage).
 */
export function endIso(precision: OccurredPrecision, value: string): string | null {
  const start = startIso(precision, value);
  if (!start || precision === 'exact') return start;
  const date = new Date(start);
  if (precision === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  else if (precision === 'year') date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().replace('.000Z', 'Z');
}

/** occurred lu → bloc « Quand » (valeurs des contrôles HTML), l'inverse de toOccurredBody. */
export function occurredDraft(occurred: OccurredValue): OccurredDraft {
  const precision = occurred.precision;
  const from = occurred.from ? new Date(occurred.from) : null;
  const to = occurred.to ? new Date(new Date(occurred.to).getTime() - 1) : null;
  const valid = (date: Date | null): date is Date => !!date && !Number.isNaN(date.getTime());
  const iso = (date: Date): string => date.toISOString();
  let fromText = '';
  let toText = '';
  switch (precision) {
    case 'exact':
      if (valid(from)) fromText = localDateTime(from);
      if (occurred.to && occurred.to !== occurred.from) {
        const end = new Date(occurred.to);
        if (valid(end)) toText = localDateTime(end);
      }
      break;
    case 'day':
    case 'period':
      if (valid(from)) fromText = iso(from).slice(0, 10);
      if (valid(to)) toText = iso(to).slice(0, 10);
      break;
    case 'month':
      if (valid(from)) fromText = iso(from).slice(0, 7);
      if (valid(to)) toText = iso(to).slice(0, 7);
      break;
    case 'year':
      if (valid(from)) fromText = iso(from).slice(0, 4);
      if (valid(to)) toText = iso(to).slice(0, 4);
      break;
    case 'life_phase':
      break;
  }
  return {
    now: false,
    precision,
    from: fromText,
    to: toText,
    label: occurred.label ?? '',
    ongoing: occurred.to === null,
  };
}

/** « AAAA-MM-JJTHH:mm » dans le fuseau du navigateur (valeur d'un input datetime-local). */
export function localDateTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function sameOccurred(a: OccurredDraft, b: OccurredDraft): boolean {
  const sameEnd = a.ongoing === b.ongoing && (a.ongoing || a.to === b.to);
  if (a.now !== b.now) return false;
  if (a.now) return sameEnd;
  return (
    a.precision === b.precision && a.from === b.from && a.label.trim() === b.label.trim() && sameEnd
  );
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = (list: string[]): string[] => [...list].map((x) => x.toLowerCase()).sort();
  const left = sorted(a);
  const right = sorted(b);
  return left.every((value, index) => value === right[index]);
}

/** Correction : en place (grâce) ou nouvelle version, et l'échéance de la grâce. */
export interface GraceInfo {
  /** createdAt de la version 1 + 75 min ; null si inconnu. */
  deadline: string | null;
  inGrace: boolean;
  /** Numéro de la version que la correction créera (hors grâce), ou 1 (en place). */
  nextVersion: number;
  /** Dernière modification (createdAt de la version courante). */
  lastChangedAt: string | null;
}

/**
 * Règle de grâce (G Q31) telle que le client peut l'annoncer : moins de 1 h 15 après la création
 * (createdAt de la version 1, sinon recordedAt), même auteur, sans lien ni autre version. Le serveur
 * reste juge : le bandeau n'est qu'une annonce, le numéro réel vient de la réponse du PATCH.
 */
export function graceInfo(
  entry: EntryView,
  versions: EntryVersion[],
  me: string | null,
  now: Date = new Date(),
): GraceInfo {
  const first = versions.find((version) => version.version === 1) ?? null;
  const created = first?.createdAt ?? entry.recordedAt;
  const deadline = created
    ? new Date(new Date(created).getTime() + GRACE_PERIOD_MS).toISOString()
    : null;
  const sameAuthor = !first?.authorId || !me || first.authorId === me;
  const inGrace =
    !!deadline &&
    now.getTime() < new Date(deadline).getTime() &&
    entry.version === 1 &&
    versions.length <= 1 &&
    entry.linkCount === 0 &&
    sameAuthor;
  const latest = versions[0] ?? null;
  return {
    deadline,
    inGrace,
    nextVersion: inGrace ? entry.version : entry.version + 1,
    lastChangedAt: latest?.createdAt ?? created ?? null,
  };
}

/** Versions (plus récente en premier) → différences champ par champ avec la version précédente. */
export function versionDiffs(versions: EntryVersion[]): VersionDiff[] {
  const fields: ('title' | 'body')[] = ['title', 'body'];
  return versions.map((version, index) => {
    const previous = versions[index + 1] ?? null;
    if (!previous) return { ...version, changes: [], unchanged: [] };
    const changes: VersionChange[] = [];
    const unchanged: ('title' | 'body')[] = [];
    for (const field of fields) {
      const before = previous[field] ?? null;
      const after = version[field] ?? null;
      if ((before ?? '') === (after ?? '')) unchanged.push(field);
      else changes.push({ field, before, after });
    }
    return { ...version, changes, unchanged };
  });
}

/** Comparaison sans casse ni accents, pour l'autocomplétion des émotions et des tags. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Émotions dont un mot du libellé (ou le code) commence par la saisie ; toutes si la saisie est vide. */
export function filterEmotions(emotions: Emotion[], query: string): Emotion[] {
  const q = normalize(query);
  if (!q) return emotions;
  return emotions.filter((emotion) => {
    const label = normalize(emotion.label);
    return (
      label.startsWith(q) ||
      label.split(/[\s'’-]+/).some((word) => word.startsWith(q)) ||
      normalize(emotion.code).startsWith(q)
    );
  });
}

/** Un libellé déjà porté par une émotion (sans casse ni accents) : pas de proposition de création. */
export function hasEmotionLabel(emotions: Emotion[], label: string): boolean {
  const q = normalize(label);
  return !!q && emotions.some((emotion) => normalize(emotion.label) === q);
}
