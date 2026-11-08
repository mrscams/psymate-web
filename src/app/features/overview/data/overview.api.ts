import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ActiveMedicationDto,
  ActiveSituationDto,
  FeelingPointDto,
  FeelingSeriesDto,
  OverviewDto,
  RecentActivityItemDto,
  RecentSessionDto,
  TopEmotionDto,
  TrendMarkerDto,
  VueDensembleService,
} from '../../../api';
import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import {
  ActiveSituation,
  ActivityItem,
  EMOTION_FAMILIES,
  EmotionFamily,
  FeelingPoint,
  FeelingSeries,
  FlagKind,
  OVERVIEW_WINDOWS,
  OverviewMedication,
  OverviewView,
  OverviewWindow,
  RecentSession,
  SessionKind,
  SessionModality,
  TopEmotion,
  TrendMarker,
} from './overview.model';

/**
 * Service de données de la vue d'ensemble (handbook §2, couche 4) : GET
 * /api/patients/{id}/overview?window=, traduit en modèle de vue. Les erreurs arrivent déjà en
 * ApiProblem (core/http) : 400 OVERVIEW_BAD_REQUEST, 403 PATIENT_FORBIDDEN, 404 PATIENT_NOT_FOUND.
 */
@Injectable({ providedIn: 'root' })
export class OverviewApi {
  private readonly api = inject(VueDensembleService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  async overview(patientId: string, window: OverviewWindow): Promise<OverviewView> {
    const dto = await firstValueFrom(this.api.getPatientOverview(patientId, window));
    return toView(dto, window, this.english);
  }
}

const SESSION_KINDS: readonly SessionKind[] = ['intake', 'session', 'contact'];
const MODALITIES: readonly SessionModality[] = ['in_person', 'video', 'phone', 'email'];
const FLAG_KINDS: readonly FlagKind[] = ['watch', 'risk', 'shared_care'];

function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function family(value: string | null | undefined): EmotionFamily | null {
  return oneOf(value, EMOTION_FAMILIES);
}

export function toView(dto: OverviewDto, requested: OverviewWindow, english = false): OverviewView {
  const facts = dto.facts ?? {};
  return {
    window: oneOf(dto.window, OVERVIEW_WINDOWS) ?? requested,
    computedAt: dto.computedAt ?? null,
    sourceRev: dto.sourceRev ?? null,
    facts: {
      age: facts.age ?? null,
      followedSince: facts.followedSince ?? null,
      sessionCount: facts.sessionCount ?? 0,
      flags: (facts.flags ?? [])
        .filter((flag) => oneOf(flag.kind, FLAG_KINDS))
        .map((flag) => ({
          kind: flag.kind as FlagKind,
          reason: flag.reason ?? null,
          setAt: flag.setAt ?? null,
        })),
      medications: (facts.activeMedications ?? []).filter((m) => !!m.entryId).map(toMedication),
    },
    situations: (dto.activeSituations ?? []).filter((s) => !!s.entryId).map(toSituation),
    trend: {
      points: (dto.trend?.points ?? [])
        .filter((p) => !!p.date)
        .map((p) => ({ date: p.date!, average: p.averageIntensity ?? null })),
      markers: toMarkers(dto.trend?.markers),
    },
    feelings: {
      points: (dto.feelings?.points ?? []).filter((p) => !!p.entryId && !!p.date).map(toPoint),
      series: (dto.feelings?.series ?? [])
        .filter((s) => !!s.emotionCode)
        .map((s) => toSeries(s, english)),
      markers: toMarkers(dto.feelings?.markers),
      ticks: dto.feelings?.ticks ?? [],
    },
    emotions: (dto.emotions?.top ?? [])
      .filter((e) => !!e.code)
      .map((e) => toEmotion(e, english ? englishLabels(dto.feelings?.series) : null)),
    drafts: {
      count: dto.drafts?.count ?? 0,
      openSession: dto.drafts?.openSession?.entryId
        ? {
            entryId: dto.drafts.openSession.entryId,
            startedAt: dto.drafts.openSession.startedAt ?? null,
          }
        : null,
    },
    recentSessions: (dto.recentSessions ?? []).filter((s) => !!s.entryId).map(toSession),
    recentActivity: (dto.recentActivity ?? []).filter((a) => !!a.entryId).map(toActivity),
    narrative: {
      sentences: dto.narrative?.sentences ?? [],
      attention: dto.narrative?.attention ?? null,
    },
    sinceLastSession: {
      lastSessionId: dto.sinceLastSession?.lastSessionId ?? null,
      lastSessionAt: dto.sinceLastSession?.lastSessionAt ?? null,
      entries: (dto.sinceLastSession?.entries ?? [])
        .filter((e) => !!e.entryId)
        .map((e) => ({
          entryId: e.entryId!,
          type: entryType(e.type),
          title: e.title ?? null,
          status: e.status === 'draft' ? 'draft' : 'final',
          occurredFrom: e.occurredFrom ?? null,
        })),
    },
  };
}

function entryType(value: string | undefined): EntryType {
  return ENTRY_TYPES.includes(value as EntryType) ? (value as EntryType) : 'note';
}

function toMedication(dto: ActiveMedicationDto): OverviewMedication {
  return {
    entryId: dto.entryId!,
    molecule: dto.molecule ?? '',
    dosage: dto.dosage ?? null,
    frequency: dto.frequency ?? null,
    prescriber: dto.prescriber ?? null,
    periodFrom: dto.periodFrom ?? null,
    since: dto.since ?? null,
  };
}

function toSituation(dto: ActiveSituationDto): ActiveSituation {
  return {
    entryId: dto.entryId!,
    title: dto.title ?? null,
    since: dto.since ?? null,
    linkCount: dto.linkCount ?? 0,
    linkedFeelingCount: dto.linkedFeelingCount ?? 0,
    averageIntensity: dto.averageIntensity ?? null,
  };
}

function toMarkers(list: TrendMarkerDto[] | undefined): TrendMarker[] {
  return (list ?? [])
    .filter((m) => !!m.entryId && !!m.date && (m.kind === 'session' || m.kind === 'medication'))
    .map((m) => ({
      entryId: m.entryId!,
      date: m.date!,
      kind: m.kind as 'session' | 'medication',
      change: m.change === 'start' || m.change === 'end' ? m.change : null,
      label: m.label ?? null,
      sessionKind: oneOf(m.sessionKind, SESSION_KINDS),
    }));
}

function toPoint(dto: FeelingPointDto): FeelingPoint {
  return {
    entryId: dto.entryId!,
    date: dto.date!,
    emotionCode: dto.emotionCode ?? '',
    family: family(dto.family),
    intensity: dto.intensity ?? 0,
    sessionId: dto.sessionId ?? null,
  };
}

function toSeries(dto: FeelingSeriesDto, english: boolean): FeelingSeries {
  return {
    emotionCode: dto.emotionCode!,
    family: family(dto.family),
    label: (english ? dto.labelEn : null) || dto.label || dto.emotionCode!,
    count: dto.count ?? 0,
  };
}

/** Code → libellé anglais, tiré des séries de ressentis (TopEmotionDto n'a que le français). */
function englishLabels(series: FeelingSeriesDto[] | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  for (const item of series ?? []) {
    if (item.emotionCode && item.labelEn) labels.set(item.emotionCode, item.labelEn);
  }
  return labels;
}

function toEmotion(dto: TopEmotionDto, english: Map<string, string> | null): TopEmotion {
  return {
    code: dto.code!,
    label: english?.get(dto.code!) || dto.label || dto.code!,
    count: dto.count ?? 0,
    previousCount: dto.previousCount ?? 0,
    delta: dto.delta ?? 0,
  };
}

function toSession(dto: RecentSessionDto): RecentSession {
  return {
    entryId: dto.entryId!,
    occurredFrom: dto.occurredFrom ?? null,
    closedAt: dto.closedAt ?? null,
    durationMin: dto.durationMin ?? null,
    entryCount: dto.entryCount ?? 0,
    kind: oneOf(dto.kind, SESSION_KINDS) ?? 'session',
    modality: oneOf(dto.modality, MODALITIES),
    title: dto.title ?? null,
    summary: dto.summary ?? null,
    summaryFirstLine: dto.summaryFirstLine ?? null,
  };
}

function toActivity(dto: RecentActivityItemDto): ActivityItem {
  return {
    entryId: dto.entryId!,
    type: entryType(dto.type),
    title: dto.title ?? null,
    status: dto.status === 'draft' ? 'draft' : 'final',
    visibility: dto.visibility === 'private' ? 'private' : 'clinical',
    recordedAt: dto.recordedAt ?? null,
    occurredFrom: dto.occurredFrom ?? null,
    version: dto.version ?? 1,
  };
}
