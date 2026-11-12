import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ChronologieService,
  EntreesService,
  EntryDto,
  LiensService,
  OverviewDto,
  PatientDto,
  PatientsService,
  RecordContactRequestModalityEnum,
  SeancesService,
  StartSessionRequestModalityEnum,
  TimelineItemDto,
  VocabulaireService,
  VueDensembleService,
} from '../../../api';
import { isApiProblem } from '../../../core/http';
import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import {
  CloseSessionInput,
  ContactInput,
  FlagKind,
  NotedEntry,
  PreviousSession,
  SessionModality,
  SessionReminders,
  ShellPatient,
  ShellSession,
} from './patient-shell.model';

/** Fenêtre de la chronologie lue pour les entrées de la séance (limit maximal du contrat). */
const PAGE_SIZE = 200;
/** Au plus trois fenêtres : une séance ne compte jamais des centaines d'entrées. */
const SESSION_PAGES = 3;

/**
 * Service de données de features/patient-shell (handbook §2, couche 4) : le seul fichier de la
 * feature qui importe le client généré (Patients pour l'en-tête ; Séances ; Chronologie pour l'indice
 * de première entrée, le mois de la première séance et les entrées de la séance ouverte ; Entrées,
 * Liens, Vue d'ensemble et Vocabulaire pour l'onglet Séance, UX-S3). Traduit les DTO en modèles de
 * vue ; les erreurs arrivent déjà en ApiProblem (core/http).
 */
@Injectable({ providedIn: 'root' })
export class PatientShellApi {
  private readonly patients = inject(PatientsService);
  private readonly sessions = inject(SeancesService);
  private readonly timeline = inject(ChronologieService);
  private readonly entries = inject(EntreesService);
  private readonly links = inject(LiensService);
  private readonly overview = inject(VueDensembleService);
  private readonly vocabulary = inject(VocabulaireService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  /** GET /api/patients/{id} (403 PATIENT_FORBIDDEN, 404 PATIENT_NOT_FOUND pour l'écran). */
  async patient(id: string): Promise<ShellPatient> {
    return toPatient(await firstValueFrom(this.patients.getPatient(id)));
  }

  /**
   * GET /api/patients/{id}/sessions/current : séance ouverte, sinon dernière séance ou dernier
   * contact clôturé, sinon accueil. 404 NO_CURRENT_SESSION (aucune séance, l'accueil arrive en
   * différé) → null.
   */
  async current(patientId: string): Promise<ShellSession | null> {
    try {
      return toSession(await firstValueFrom(this.sessions.getCurrentSession(patientId)));
    } catch (error) {
      if (isApiProblem(error) && error.code === 'NO_CURRENT_SESSION') return null;
      throw error;
    }
  }

  /**
   * Le dossier a-t-il au moins une entrée saisie (hors séances, dont l'accueil créé avec le
   * patient) ? GET /api/patients/{id}/timeline/summary par année (un agrégat léger, sans
   * pagination), brouillons et entrées privées compris (M7-03 : indice « première entrée »). La
   * chronologie elle-même n'est pas lue : son chargement reste celui de l'onglet Timeline.
   */
  async hasEntries(patientId: string): Promise<boolean> {
    const summary = await firstValueFrom(
      this.timeline.getTimelineSummary(patientId, 'year', undefined, undefined, true),
    );
    return (summary.periods ?? []).some((period) =>
      Object.entries(period.counts ?? {}).some(([type, count]) => type !== 'session' && count > 0),
    );
  }

  /**
   * Mois (AAAA-MM, UTC) de la plus ancienne séance du dossier, accueil et contacts compris, ou null
   * s'il n'y en a aucune : GET /api/patients/{id}/timeline/summary par mois, sans fenêtre, privées
   * comprises (UX-G2c). Sert à ne pas afficher dans l'en-tête un « suivi·e depuis » (follow_up.since
   * ou, à défaut, création du dossier) que les séances contredisent.
   */
  async firstSessionMonth(patientId: string): Promise<string | null> {
    const summary = await firstValueFrom(
      this.timeline.getTimelineSummary(patientId, 'month', undefined, undefined, true),
    );
    const first = (summary.periods ?? []).find((period) => (period.counts?.['session'] ?? 0) > 0);
    return first ? monthOf(first) : null;
  }

  /** POST /api/patients/{id}/sessions/start → 201, la séance ouverte (409 SESSION_ALREADY_OPEN). */
  async start(patientId: string, modality: SessionModality): Promise<ShellSession> {
    const dto = await firstValueFrom(
      this.sessions.startSession(patientId, {
        modality: modality as StartSessionRequestModalityEnum,
      }),
    );
    return toSession(dto);
  }

  /** POST /api/sessions/{id}/close → 200, la séance clôturée (409 SESSION_ALREADY_CLOSED, 422). */
  async close(sessionId: string, input: CloseSessionInput): Promise<ShellSession> {
    const body: CloseSessionInput = {};
    if (input.durationMin !== undefined) body.durationMin = input.durationMin;
    if (input.summary) body.summary = input.summary;
    return toSession(await firstValueFrom(this.sessions.closeSession(sessionId, body)));
  }

  /** POST /api/patients/{id}/sessions/contact → 201, le contact (séance déjà clôturée). */
  async contact(patientId: string, input: ContactInput): Promise<ShellSession> {
    const dto = await firstValueFrom(
      this.sessions.recordContact(patientId, {
        ...input,
        modality: input.modality as RecordContactRequestModalityEnum,
      }),
    );
    return toSession(dto);
  }

  // ---------------------------------------------------------------- onglet Séance (UX-S3)

  /**
   * Les entrées rattachées à la séance (« Noté pendant cette séance ») : GET /api/patients/{id}/timeline
   * sans fenêtre (une entrée notée en séance peut dater d'hier), brouillons compris, privées exclues
   * comme partout, filtrée ici sur sessionId (le contrat n'a pas ce filtre sur la chronologie) ;
   * trois fenêtres de 200 au plus. De la plus récemment enregistrée à la plus ancienne.
   */
  async sessionEntries(patientId: string, sessionId: string): Promise<NotedEntry[]> {
    const found: NotedEntry[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < SESSION_PAGES; page++) {
      const dto = await firstValueFrom(
        this.timeline.getTimeline(
          patientId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          cursor,
          PAGE_SIZE,
        ),
      );
      for (const item of dto.items ?? []) {
        if (item.id && item.sessionId === sessionId && item.type !== 'session') {
          found.push(toNoted(item));
        }
      }
      if (!dto.nextCursor) break;
      cursor = dto.nextCursor;
    }
    return found.sort((a, b) => stamp(b) - stamp(a));
  }

  /**
   * GET /api/entries/{id}/links : la phrase du premier lien, vue depuis l'entrée (« Anxiété
   * déclenchée par Réorganisation du service »), et le nombre de liens ; null sans lien.
   */
  async linkSentence(entryId: string): Promise<{ sentence: string; count: number } | null> {
    const list = await firstValueFrom(this.links.listEntryLinks(entryId));
    const first = list.find((link) => !!link.sentence);
    return first ? { sentence: first.sentence!, count: list.length } : null;
  }

  /**
   * La séance qui précède la séance ouverte : GET …/timeline?types=session (de la plus récente à
   * la plus ancienne, dix au plus), puis GET /api/entries/{id} des candidates autres que
   * `currentId` jusqu'à la première séance ordinaire clôturée (ni l'accueil, créé avec le dossier
   * et souvent plus récent, ni un contact : le « Prochaine fois » est celui d'une séance). Null si
   * le dossier n'en a pas.
   */
  async previousSession(patientId: string, currentId: string): Promise<PreviousSession | null> {
    const dto = await firstValueFrom(
      this.timeline.getTimeline(
        patientId,
        undefined,
        undefined,
        ['session'],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        10,
      ),
    );
    for (const candidate of dto.items ?? []) {
      if (!candidate.id || candidate.id === currentId) continue;
      const entry = await firstValueFrom(this.entries.getEntry(candidate.id));
      const kind = entry.session?.kind ?? 'session';
      if (kind !== 'session' || !entry.session?.closedAt) continue;
      return {
        id: entry.id ?? candidate.id,
        kind,
        startedAt: entry.occurred?.from ?? candidate.occurred?.from ?? null,
        durationMin: entry.session?.durationMin ?? null,
        modality: toModality(entry.session?.modality, null),
        summary: entry.body?.trim() || null,
      };
    }
    return null;
  }

  /**
   * « À garder en tête » et « Depuis la séance du … » : la projection de la vue d'ensemble
   * (GET /api/patients/{id}/overview, fenêtre 90 j), jamais recalculée ici.
   */
  async reminders(patientId: string): Promise<SessionReminders> {
    return toReminders(await firstValueFrom(this.overview.getPatientOverview(patientId, '90d')));
  }

  /** GET /api/vocabulary/emotions : code → libellé dans la langue de l'interface. */
  async emotionLabels(): Promise<Record<string, string>> {
    const list = await firstValueFrom(this.vocabulary.emotions());
    const labels: Record<string, string> = {};
    for (const emotion of list) {
      if (!emotion.code) continue;
      labels[emotion.code] =
        (this.english ? emotion.labelEn : null) || emotion.labelFr || emotion.code;
    }
    return labels;
  }
}

function toPatient(dto: PatientDto): ShellPatient {
  const since = dto.followUp?.['since'];
  const duration = Number(dto.followUp?.['durationMin']);
  return {
    id: dto.id ?? '',
    displayName: dto.displayName ?? '',
    birthDate: dto.birthDate ?? null,
    followedSince: typeof since === 'string' && since ? since : (dto.createdAt ?? null),
    flags: (dto.flags ?? [])
      .map((flag) => flag.kind as FlagKind | undefined)
      .filter((kind): kind is FlagKind => !!kind),
    sessionModality: toModality(dto.followUp?.['modality'], 'in_person'),
    plannedDurationMin: Number.isInteger(duration) && duration > 0 ? duration : null,
  };
}

/** AAAA-MM d'une période mensuelle : le libellé, sinon le début de la période (UTC). */
function monthOf(period: { period?: string; from?: string }): string | null {
  const value = period.period ?? period.from ?? '';
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : null;
}

const SESSION_MODALITIES: readonly SessionModality[] = ['in_person', 'video', 'phone', 'email'];

/** Une modalité de séance si la valeur en est une (followUp.modality est un texte libre), sinon `fallback`. */
function toModality<F extends SessionModality | null>(
  value: unknown,
  fallback: F,
): SessionModality | F {
  return SESSION_MODALITIES.find((modality) => modality === value) ?? fallback;
}

function toSession(dto: EntryDto): ShellSession {
  return {
    id: dto.id ?? '',
    kind: dto.session?.kind ?? 'session',
    startedAt: dto.occurred?.from ?? dto.recordedAt ?? '',
    closedAt: dto.session?.closedAt ?? null,
    durationMin: dto.session?.durationMin ?? null,
    summary: dto.body ?? null,
    modality: toModality(dto.session?.modality, null),
  };
}

function entryType(value: string | undefined): EntryType {
  return ENTRY_TYPES.includes(value as EntryType) ? (value as EntryType) : 'note';
}

function toNoted(item: TimelineItemDto): NotedEntry {
  return {
    id: item.id ?? '',
    type: entryType(item.type),
    title: item.title?.trim() || null,
    status: item.status === 'draft' ? 'draft' : 'final',
    recordedAt: item.recordedAt ?? null,
    occurredFrom: item.occurred?.from ?? null,
    emotionCode: item.emotion?.code ?? null,
    intensity: item.intensity ?? null,
    linkCount: item.linkCount ?? 0,
    ongoing: item.ongoing === true,
  };
}

/** Instant de tri d'une ligne : l'enregistrement, sinon l'occurrence. */
function stamp(entry: NotedEntry): number {
  const value = entry.recordedAt ?? entry.occurredFrom;
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

const FLAG_KINDS: readonly FlagKind[] = ['watch', 'risk', 'shared_care'];

function toReminders(dto: OverviewDto): SessionReminders {
  return {
    flags: (dto.facts?.flags ?? [])
      .filter((flag) => FLAG_KINDS.includes(flag.kind as FlagKind))
      .map((flag) => ({ kind: flag.kind as FlagKind, reason: flag.reason ?? null })),
    medications: (dto.facts?.activeMedications ?? [])
      .filter((m) => !!m.entryId)
      .map((m) => ({
        entryId: m.entryId!,
        molecule: m.molecule ?? '',
        dosage: m.dosage ?? null,
        since: m.periodFrom ?? m.since ?? null,
      })),
    situations: (dto.activeSituations ?? [])
      .filter((s) => !!s.entryId)
      .map((s) => ({ entryId: s.entryId!, title: s.title ?? null, since: s.since ?? null })),
    since: {
      lastSessionAt: dto.sinceLastSession?.lastSessionAt ?? null,
      entries: (dto.sinceLastSession?.entries ?? [])
        .filter((e) => !!e.entryId)
        .map((e) => ({
          entryId: e.entryId!,
          type: entryType(e.type),
          title: e.title ?? null,
          occurredFrom: e.occurredFrom ?? null,
        })),
    },
  };
}
