/**
 * Modèles de vue de features/patients (handbook §8) : ce que les stores et les écrans manipulent,
 * indépendamment du client généré. PatientApi traduit les DTO vers ces types.
 */

/** Natures de drapeau du contrat (FlagDto.kind) : à surveiller, risque, suivi partagé. */
export type FlagKind = 'watch' | 'risk' | 'shared_care';
export const FLAG_KINDS: readonly FlagKind[] = ['watch', 'risk', 'shared_care'];

/** Pronoms admis par l'API (G Q47) ; '' = non renseigné. */
export type Pronoun = 'elle' | 'il' | 'iel' | 'neutre';
export const PRONOUNS: readonly Pronoun[] = ['elle', 'il', 'iel', 'neutre'];

/** Rythme habituel (fiche 16) : codes choisis par le client, stockés dans followUp.rhythm. */
export type Rhythm = 'weekly' | 'biweekly' | 'monthly' | 'irregular';
export const RHYTHMS: readonly Rhythm[] = ['weekly', 'biweekly', 'monthly', 'irregular'];

/** Modalité par défaut : mêmes codes que la séance (in_person, video, phone). */
export type Modality = 'in_person' | 'video' | 'phone';
export const MODALITIES: readonly Modality[] = ['in_person', 'video', 'phone'];

/** Tri accepté par GET /api/patients (paramètre sort du contrat). */
export type ApiPatientSort = 'name' | 'updated' | 'created';

/**
 * Tri de la liste (fiche 01, UX-B1). « Dernière séance » et « Flags d'abord » n'existent pas dans le
 * contrat : la page est demandée triée par `updated` (resp. `name`) puis réordonnée dans le client
 * avec le résumé d'activité (dernière séance) ou les drapeaux de la fiche.
 */
export type PatientSort = 'lastSession' | 'name' | 'flags' | 'updated' | 'created';
export const PATIENT_SORTS: readonly PatientSort[] = [
  'lastSession',
  'name',
  'flags',
  'updated',
  'created',
];
/** Tri par défaut (audit UX-B1 : « Dernière séance ↓ »). */
export const DEFAULT_SORT: PatientSort = 'lastSession';

/** Paramètre sort envoyé à l'API pour un tri de la liste. */
export function apiSort(sort: PatientSort): ApiPatientSort {
  switch (sort) {
    case 'lastSession':
      return 'updated';
    case 'flags':
      return 'name';
    default:
      return sort;
  }
}

/** Filtres rapides de la liste (maquette 01) : appliqués dans le client à la page lue. */
export type QuickFilter = 'all' | 'today' | 'flags' | 'drafts';
export const QUICK_FILTERS: readonly QuickFilter[] = ['all', 'today', 'flags', 'drafts'];

/**
 * Nombre maximal de patients dont la liste lit le résumé (GET /api/patients/{id}/overview, un appel
 * par ligne) : au-delà, les colonnes de séance, d'émotions et de situations restent vides.
 */
export const ACTIVITY_LIMIT = 20;

/** Les huit familles d'émotions (étude couleurs §4), une couleur chacune (--emotion-*). */
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

/** Modalité d'une séance (RecentSessionDto.modality). */
export type SessionModality = 'in_person' | 'video' | 'phone' | 'email';
export const SESSION_MODALITIES: readonly SessionModality[] = [
  'in_person',
  'video',
  'phone',
  'email',
];

/** Une émotion dominante sur 30 jours, avec sa variation par rapport aux 30 jours précédents. */
export interface DominantEmotion {
  code: string;
  label: string;
  family: EmotionFamily | null;
  count: number;
  delta: number;
}

/**
 * Résumé d'activité d'un patient pour la liste, lu dans la projection vue d'ensemble (fenêtre 30 j) :
 * la liste du contrat ne porte ni séance, ni émotion, ni situation (écart noté dans la PR UX-B1).
 */
export interface PatientActivity {
  /** Séance la plus récente (ouverte ou non) ; null si aucune. */
  lastSession: { at: string; modality: SessionModality | null } | null;
  /** Début de la séance non clôturée la plus récente ; null s'il n'y en a pas. */
  openSessionAt: string | null;
  /** Trois émotions dominantes au plus, de la plus fréquente à la moins fréquente. */
  emotions: DominantEmotion[];
  /** Nombre de ressentis de la fenêtre portés par les émotions dominantes (5 au plus). */
  feelingCount: number;
  situations: { count: number; first: string | null };
  drafts: number;
  /** Début du suivi AAAA-MM-JJ (fiche, sinon création du dossier). */
  followedSince: string | null;
}

/** Longueur maximale des noms (G Q47). */
export const NAME_MAX_LENGTH = 120;

export interface PatientFlagView {
  kind: FlagKind;
  reason: string | null;
  setAt: string | null;
}

export interface PatientTag {
  id: string;
  label: string;
}

/** Contexte de vie (fiche 16) : clés de patient.context côté serveur. */
export interface PatientContext {
  situation: string | null;
  activity: string | null;
  referredBy: string | null;
  initialReason: string | null;
  history: string | null;
}

/** Cadre du suivi (fiche 16) : clés de patient.follow_up ; since en AAAA-MM-JJ. */
export interface PatientFollowUp {
  since: string | null;
  rhythm: string | null;
  modality: string | null;
  durationMin: number | null;
  fee: string | null;
  prescriber: string | null;
}

export const CONTEXT_KEYS = [
  'situation',
  'activity',
  'referredBy',
  'initialReason',
  'history',
] as const satisfies readonly (keyof PatientContext)[];

export const FOLLOW_UP_KEYS = [
  'since',
  'rhythm',
  'modality',
  'durationMin',
  'fee',
  'prescriber',
] as const satisfies readonly (keyof PatientFollowUp)[];

/** Fiche d'un patient telle que l'écran la lit (PatientDto). */
export interface PatientView {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  pronoun: string | null;
  phone: string | null;
  email: string | null;
  context: PatientContext;
  followUp: PatientFollowUp;
  flags: PatientFlagView[];
  tags: PatientTag[];
  currentVersion: number;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Tag du praticien (GET /api/tags), pour l'autocomplétion. */
export interface PractitionerTag {
  id: string;
  label: string;
  normalizedLabel: string;
}

/** Une version de la fiche (GET /api/patients/{id}/versions) : instantané après modification. */
export interface PatientVersion {
  version: number;
  createdAt: string | null;
  reason: string | null;
  snapshot: Record<string, unknown>;
}

/** Filtres de la liste, tels qu'envoyés à GET /api/patients. */
export interface PatientListQuery {
  q: string;
  archived: boolean;
  tag: string | null;
  sort: ApiPatientSort;
  cursor?: string | null;
}

/**
 * Valeur du formulaire de la fiche 16 (chaînes vides = non renseigné). since est un mois
 * AAAA-MM ; durationMin une chaîne pour accepter le champ vide.
 */
export interface PatientFormValue {
  displayName: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  pronoun: string;
  phone: string;
  email: string;
  context: Record<(typeof CONTEXT_KEYS)[number], string>;
  followUp: {
    since: string;
    rhythm: string;
    modality: string;
    durationMin: string;
    fee: string;
    prescriber: string;
  };
  flags: {
    watch: boolean;
    watchReason: string;
    risk: boolean;
    sharedCare: boolean;
  };
}

/** Drapeau à poser (POST /flags ou à la création). */
export interface FlagInput {
  kind: FlagKind;
  reason?: string;
}

/** Corps de POST /api/patients, sans les clés vides. */
export interface PatientCreateInput {
  displayName: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  pronoun?: Pronoun;
  phone?: string;
  email?: string;
  context?: Record<string, string | number>;
  followUp?: Record<string, string | number>;
  flags?: FlagInput[];
  tags?: string[];
}

/** Ce qu'il faut envoyer pour passer de la fiche lue à la fiche saisie (PATCH, flags, tags). */
export interface PatientChanges {
  /** Corps du PATCH, null s'il n'y a rien à modifier (aucune version créée). */
  patch: Record<string, unknown> | null;
  flagsToClear: FlagKind[];
  flagsToSet: FlagInput[];
  /** Liste complète des tags pour PUT /tags, null si inchangée. */
  tags: string[] | null;
}

/** Une différence entre deux versions, champ par champ. */
export interface FieldChange {
  /** Chemin du champ : displayName, followUp.rhythm… */
  field: string;
  /** Valeur avant ; undefined quand la version précédente n'est pas connue (création). */
  before: unknown;
  after: unknown;
}

export interface VersionDiff {
  version: number;
  createdAt: string | null;
  reason: string | null;
  /** La version précédente n'a pas d'instantané (création) : seules les valeurs après sont sûres. */
  baseUnknown: boolean;
  changes: FieldChange[];
}

/** Champs comparés d'un instantané de version, dans l'ordre de la fiche. */
export const VERSION_FIELDS: readonly string[] = [
  'displayName',
  'firstName',
  'lastName',
  'birthDate',
  'pronoun',
  'phone',
  'email',
  ...CONTEXT_KEYS.map((key) => `context.${key}`),
  ...FOLLOW_UP_KEYS.map((key) => `followUp.${key}`),
];

const emptyText = (value: string | null | undefined): string => value ?? '';

/** Formulaire vide de la création ; durée de séance = préférence (fiche 16). */
export function emptyForm(defaultDurationMin: number | null): PatientFormValue {
  return {
    displayName: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    pronoun: '',
    phone: '',
    email: '',
    context: { situation: '', activity: '', referredBy: '', initialReason: '', history: '' },
    followUp: {
      since: '',
      rhythm: '',
      modality: '',
      durationMin: defaultDurationMin === null ? '' : String(defaultDurationMin),
      fee: '',
      prescriber: '',
    },
    flags: { watch: false, watchReason: '', risk: false, sharedCare: false },
  };
}

/** Fiche lue → valeur du formulaire de modification. */
export function toFormValue(patient: PatientView): PatientFormValue {
  const watch = patient.flags.find((flag) => flag.kind === 'watch');
  return {
    displayName: patient.displayName,
    firstName: emptyText(patient.firstName),
    lastName: emptyText(patient.lastName),
    birthDate: emptyText(patient.birthDate),
    pronoun: emptyText(patient.pronoun),
    phone: emptyText(patient.phone),
    email: emptyText(patient.email),
    context: {
      situation: emptyText(patient.context.situation),
      activity: emptyText(patient.context.activity),
      referredBy: emptyText(patient.context.referredBy),
      initialReason: emptyText(patient.context.initialReason),
      history: emptyText(patient.context.history),
    },
    followUp: {
      since: patient.followUp.since ? patient.followUp.since.slice(0, 7) : '',
      rhythm: emptyText(patient.followUp.rhythm),
      modality: emptyText(patient.followUp.modality),
      durationMin:
        patient.followUp.durationMin === null ? '' : String(patient.followUp.durationMin),
      fee: emptyText(patient.followUp.fee),
      prescriber: emptyText(patient.followUp.prescriber),
    },
    flags: {
      watch: !!watch,
      watchReason: emptyText(watch?.reason),
      risk: patient.flags.some((flag) => flag.kind === 'risk'),
      sharedCare: patient.flags.some((flag) => flag.kind === 'shared_care'),
    },
  };
}

/** Mois AAAA-MM du formulaire → date AAAA-MM-01 de followUp.since (lue par la vue d'ensemble). */
export function monthToDate(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month;
}

function followUpValue(key: (typeof FOLLOW_UP_KEYS)[number], raw: string): string | number {
  if (key === 'since') return monthToDate(raw);
  if (key === 'durationMin') {
    const minutes = Number(raw);
    return Number.isFinite(minutes) ? minutes : raw;
  }
  return raw;
}

/** Drapeaux cochés du formulaire. */
export function formFlags(value: PatientFormValue['flags']): FlagInput[] {
  const flags: FlagInput[] = [];
  if (value.watch) flags.push({ kind: 'watch', reason: value.watchReason.trim() });
  if (value.risk) flags.push({ kind: 'risk' });
  if (value.sharedCare) flags.push({ kind: 'shared_care' });
  return flags;
}

/** Formulaire de création → corps de POST /api/patients (les champs vides sont omis). */
export function toCreateInput(value: PatientFormValue, tags: string[]): PatientCreateInput {
  const input: PatientCreateInput = { displayName: value.displayName.trim() };
  const texts = ['firstName', 'lastName', 'birthDate', 'phone', 'email'] as const;
  for (const key of texts) {
    const text = value[key].trim();
    if (text) input[key] = text;
  }
  if (value.pronoun) input.pronoun = value.pronoun as Pronoun;
  const context: Record<string, string> = {};
  for (const key of CONTEXT_KEYS) {
    const text = value.context[key].trim();
    if (text) context[key] = text;
  }
  if (Object.keys(context).length > 0) input.context = context;
  const followUp: Record<string, string | number> = {};
  for (const key of FOLLOW_UP_KEYS) {
    const text = value.followUp[key].trim();
    if (text) followUp[key] = followUpValue(key, text);
  }
  if (Object.keys(followUp).length > 0) input.followUp = followUp;
  const flags = formFlags(value.flags);
  if (flags.length > 0) input.flags = flags;
  if (tags.length > 0) input.tags = tags;
  return input;
}

/**
 * Ce qui a changé entre la fiche lue et la saisie : un PATCH partiel (une valeur vidée part en
 * null, le serveur efface le champ ; context et followUp clé à clé), les drapeaux à lever et à
 * poser (changer la raison de « à surveiller » = lever puis reposer), la liste des tags si elle
 * diffère. Rien d'inchangé n'est envoyé : un PATCH vide créerait une version pour rien.
 */
export function diffPatient(
  patient: PatientView,
  value: PatientFormValue,
  tags: string[],
): PatientChanges {
  const before = toFormValue(patient);
  const patch: Record<string, unknown> = {};
  const texts = [
    'displayName',
    'firstName',
    'lastName',
    'birthDate',
    'pronoun',
    'phone',
    'email',
  ] as const;
  for (const key of texts) {
    const next = value[key].trim();
    if (next !== before[key].trim()) patch[key] = next === '' ? null : next;
  }
  const context: Record<string, unknown> = {};
  for (const key of CONTEXT_KEYS) {
    const next = value.context[key].trim();
    if (next !== before.context[key].trim()) context[key] = next === '' ? null : next;
  }
  if (Object.keys(context).length > 0) patch['context'] = context;
  const followUp: Record<string, unknown> = {};
  for (const key of FOLLOW_UP_KEYS) {
    const next = value.followUp[key].trim();
    if (next !== before.followUp[key].trim()) {
      followUp[key] = next === '' ? null : followUpValue(key, next);
    }
  }
  if (Object.keys(followUp).length > 0) patch['followUp'] = followUp;

  const wanted = formFlags(value.flags);
  const flagsToClear: FlagKind[] = [];
  const flagsToSet: FlagInput[] = [];
  for (const kind of FLAG_KINDS) {
    const current = patient.flags.find((flag) => flag.kind === kind);
    const next = wanted.find((flag) => flag.kind === kind);
    const reasonChanged =
      kind === 'watch' && !!current && !!next && (current.reason ?? '') !== (next.reason ?? '');
    if (current && (!next || reasonChanged)) flagsToClear.push(kind);
    if (next && (!current || reasonChanged)) flagsToSet.push(next);
  }

  const currentTags = patient.tags.map((tag) => tag.label);
  const sameTags =
    currentTags.length === tags.length && currentTags.every((label, i) => label === tags[i]);

  return {
    patch: Object.keys(patch).length > 0 ? patch : null,
    flagsToClear,
    flagsToSet,
    tags: sameTags ? null : tags,
  };
}

/** Valeur d'un champ pointé (followUp.rhythm) dans un instantané. */
function pick(snapshot: Record<string, unknown> | null, path: string): unknown {
  if (!snapshot) return undefined;
  const [head, tail] = path.split('.');
  const value = snapshot[head];
  if (tail === undefined) return value ?? null;
  return typeof value === 'object' && value !== null
    ? ((value as Record<string, unknown>)[tail] ?? null)
    : null;
}

function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === undefined || v === null || v === '' ? null : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * Historique champ par champ (fiche 16) : chaque version comparée à la précédente. La création
 * (version 1) n'a pas d'instantané (contrat) : pour la plus ancienne version listée, si c'est la 2,
 * on ne connaît pas l'état d'avant et on montre les valeurs renseignées après la modification.
 * Ordre rendu : de la plus récente à la plus ancienne.
 */
export function versionDiffs(versions: PatientVersion[]): VersionDiff[] {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  const diffs = sorted.map((current, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const baseUnknown = previous === null || previous.version !== current.version - 1;
    const changes: FieldChange[] = [];
    for (const field of VERSION_FIELDS) {
      const after = pick(current.snapshot, field);
      if (baseUnknown) {
        if (!same(after, null)) changes.push({ field, before: undefined, after });
        continue;
      }
      const before = pick(previous.snapshot, field);
      if (!same(before, after)) changes.push({ field, before, after });
    }
    return {
      version: current.version,
      createdAt: current.createdAt,
      reason: current.reason,
      baseUnknown,
      changes,
    };
  });
  return diffs.reverse();
}

/**
 * Minuscules sans accents, espaces réduits : la même normalisation que le filtre q de l'API
 * (insensible à la casse et aux accents), pour surligner ce qui correspond.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * Préfixe du patient de démonstration (G Q22) : l'outil de seed de l'API le pose sur le nom affiché
 * (« DEMO · Camille R. ») ; le contrat n'a aucun champ « démo », le nom est le seul indice.
 */
export const DEMO_PREFIX = 'DEMO · ';

/**
 * Patient de démonstration : nom affiché qui commence exactement par « DEMO · » (format de l'outil
 * de seed, `Scenario.DEMO_PREFIX`), suivi d'un nom. « DEMO-Tristan » ou « Démo … » n'en sont pas.
 */
export function isDemoPatient(patient: Pick<PatientView, 'displayName'>): boolean {
  const name = patient.displayName;
  return name.startsWith(DEMO_PREFIX) && name.length > DEMO_PREFIX.length;
}

/** Nom affiché sans le préfixe « DEMO · » (la liste le remplace par un badge). */
export function demoDisplayName(patient: Pick<PatientView, 'displayName'>): string {
  return isDemoPatient(patient)
    ? patient.displayName.slice(DEMO_PREFIX.length)
    : patient.displayName;
}

/** Même jour civil, dans le fuseau du navigateur. */
export function isSameLocalDay(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** Une séance du patient a eu lieu ou a commencé aujourd'hui (filtre « Aujourd'hui »). */
export function hasSessionToday(activity: PatientActivity | null, now: Date): boolean {
  if (!activity) return false;
  return (
    isSameLocalDay(activity.lastSession?.at, now) || isSameLocalDay(activity.openSessionAt, now)
  );
}

/** Le patient porte au moins un drapeau posé par le praticien. */
export function hasFlags(patient: Pick<PatientView, 'flags'>): boolean {
  return patient.flags.length > 0;
}

/**
 * Tri client de la page lue (fiche 01) : « Dernière séance » = séance la plus récente d'abord, les
 * patients sans résumé ou sans séance ensuite dans l'ordre de l'API ; « Flags d'abord » = patients
 * avec drapeau d'abord, ordre de l'API (nom) conservé dans chaque groupe. Les autres tris sont ceux
 * du serveur, la page reste dans son ordre.
 */
export function sortRows<T extends { patient: PatientView; activity: PatientActivity | null }>(
  rows: readonly T[],
  sort: PatientSort,
): T[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  if (sort === 'lastSession') {
    const time = (row: T): number => {
      const at = row.activity?.lastSession?.at;
      const ms = at ? new Date(at).getTime() : NaN;
      return Number.isNaN(ms) ? -Infinity : ms;
    };
    indexed.sort((a, b) => time(b.row) - time(a.row) || a.index - b.index);
  } else if (sort === 'flags') {
    const rank = (row: T): number => (hasFlags(row.patient) ? 0 : 1);
    indexed.sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index);
  }
  return indexed.map((entry) => entry.row);
}
