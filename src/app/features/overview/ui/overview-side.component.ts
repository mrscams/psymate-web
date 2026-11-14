import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { sessionModalityLabel } from '../../../shared/ui';
import { Loadable, StateKind } from '../../../shared/util';
import { ShellPatient } from '../../patient-shell';
import {
  blockState,
  EmotionFamily,
  followedSinceOf,
  GRAPH_ROOT_PARAM,
  isEmotionsEmpty,
  isFrameEmpty,
  isMedicationsEmpty,
  isSituationsEmpty,
  isTodoEmpty,
  OverviewView,
  TIMELINE_PARAMS,
} from '../data/overview.model';
import {
  deltaText,
  flagLabel,
  formatComputedAt,
  formatDelta,
  formatMonth,
  formatShortDay,
  windowLongLabel,
} from './overview-labels';
import { OverviewSectionComponent } from './overview-section.component';

type SideBlock = 'frame' | 'medications' | 'situations' | 'emotions' | 'todo';

const EMPTY: Record<SideBlock, (view: OverviewView) => boolean> = {
  frame: isFrameEmpty,
  medications: isMedicationsEmpty,
  situations: isSituationsEmpty,
  emotions: isEmotionsEmpty,
  todo: isTodoEmpty,
};

/**
 * Colonne latérale de la vue d'ensemble (UX-S6, proposition 02 `.side`) : le cadre du suivi, sans
 * boîtes, des blocs séparés par un filet, titres 13/650 secondaires. Cadre du suivi (début du
 * suivi, modalité et durée habituelles de la fiche, drapeaux et « modifier ») ; traitement en
 * cours ; situations en cours (→ graphe centré) ; émotions de la fenêtre (compte, variation, barre) ;
 * à compléter (brouillons, séance non clôturée) ; heure du calcul de la synthèse. Chaque bloc a ses
 * trois états.
 */
@Component({
  selector: 'pm-overview-side',
  imports: [OverviewSectionComponent, RouterLink],
  template: `
    <pm-overview-section
      variant="side"
      heading="Cadre du suivi"
      i18n-heading="Titre du bloc cadre du suivi@@overview.simple.frame.heading"
      [state]="state('frame')"
      emptyTitle="Cadre non renseigné"
      i18n-emptyTitle="Bloc cadre du suivi vide@@overview.simple.frame.empty.title"
      emptyMessage="Le début du suivi et les drapeaux du dossier apparaîtront ici."
      i18n-emptyMessage="Bloc cadre du suivi vide@@overview.side.frame.empty.message"
      errorTitle="Cadre indisponible"
      i18n-errorTitle="Erreur du bloc cadre du suivi@@overview.simple.frame.error"
      [refreshing]="refreshing()"
      (retry)="retry.emit()"
    >
      @if (view(); as v) {
        @if (followUp(); as text) {
          <div class="line">
            <span class="k" i18n="Clé de la ligne début du suivi@@overview.side.frame.followUp"
              >Suivi</span
            >&ngsp;
            <span>{{ text }}</span>
          </div>
        }
        @for (flag of v.facts.flags; track $index) {
          <div class="line">
            <span class="k" i18n="Clé de la ligne drapeau@@overview.side.frame.flag">Drapeau</span
            >&ngsp;
            <span>
              <span class="chip flag">{{ flagLabel(flag.kind) }}</span>
              @if (flagDetail(flag.setAt, flag.reason); as detail) {
                &ngsp;<span class="muted">{{ detail }}</span>
              }
              ·
              <a
                [routerLink]="['/patients', patientId(), 'fiche']"
                i18n="Lien de modification d'un drapeau vers la fiche@@overview.side.frame.edit"
                >modifier</a
              >
            </span>
          </div>
        }
        <!-- La fiche reste à un clic depuis la vue d'ensemble, drapeau ou non (flux 2 de B3). -->
        <div class="line">
          <span class="k" i18n="Clé de la ligne fiche du patient@@overview.side.frame.sheet"
            >Fiche</span
          >&ngsp;
          <a
            class="pm-link-target"
            [routerLink]="['/patients', patientId(), 'fiche']"
            i18n="
              Lien vers la fiche du patient depuis le cadre du suivi@@overview.side.frame.sheetLink"
            >Modifier la fiche</a
          >
        </div>
      }
    </pm-overview-section>

    <pm-overview-section
      variant="side"
      heading="Traitement en cours"
      i18n-heading="Titre du bloc traitement en cours@@overview.side.medications.heading"
      [state]="state('medications')"
      emptyTitle="Aucun traitement en cours"
      i18n-emptyTitle="Bloc traitement vide@@overview.medications.empty.title"
      emptyMessage="Les médicaments notés dans le dossier, sans date de fin passée, apparaîtront ici."
      i18n-emptyMessage="Bloc traitement vide@@overview.medications.empty.message"
      errorTitle="Traitement indisponible"
      i18n-errorTitle="Erreur du bloc traitement@@overview.medications.error"
      [refreshing]="refreshing()"
      (retry)="retry.emit()"
    >
      @if (view(); as v) {
        @for (medication of v.facts.medications; track medication.entryId) {
          <div class="line">
            <i class="dot medication" aria-hidden="true"></i>
            <span
              ><b>{{ medication.molecule }}</b>
              @if (medication.dosage) {
                {{ medication.dosage }}
              }
              @if (medication.frequency) {
                {{ medication.frequency }}
              }
              @if (medication.periodFrom ?? medication.since; as from) {
                <span class="muted" i18n="Début d'un médicament@@overview.side.medications.since"
                  >· depuis le {{ day(from) }}</span
                >
              }
              @if (medication.prescriber) {
                <span class="muted"> · {{ medication.prescriber }}</span>
              }
            </span>
          </div>
        }
      }
    </pm-overview-section>

    <pm-overview-section
      variant="side"
      heading="Situations en cours"
      i18n-heading="Titre du bloc situations de la vue simple@@overview.simple.situations.heading"
      [state]="state('situations')"
      emptyTitle="Aucune situation en cours"
      i18n-emptyTitle="Bloc situations vide@@overview.situations.empty.title"
      emptyMessage="Les situations sans fin connue apparaîtront ici, avec leurs ressentis liés."
      i18n-emptyMessage="Bloc situations vide@@overview.situations.empty.message"
      errorTitle="Situations indisponibles"
      i18n-errorTitle="Erreur du bloc situations@@overview.situations.error"
      [refreshing]="refreshing()"
      (retry)="retry.emit()"
    >
      @if (view()?.situations?.length; as count) {
        <span sectTitleCount class="title-count"> · {{ count }}</span>
      }
      @if (view(); as v) {
        @for (situation of v.situations; track situation.entryId) {
          <div class="sit">
            <span class="t"
              ><i class="dot situation" aria-hidden="true"></i
              >{{ situation.title ?? untitledSituation }}</span
            >
            @if (situation.since) {
              <span class="r" i18n="Début d'une situation en cours@@overview.side.situations.since"
                >depuis {{ month(situation.since) }}</span
              >
            }
            <span class="m"
              ><span
                i18n="Ressentis liés à une situation@@overview.side.situations.feelings"
                >{situation.linkedFeelingCount, plural,
                  =0 {aucun ressenti lié}
                  =1 {1 ressenti lié}
                  other {{{situation.linkedFeelingCount}} ressentis liés}
                }</span
              >
              ·
              <a
                [routerLink]="['/patients', patientId(), 'graph']"
                [queryParams]="graphParams(situation.entryId)"
                i18n="
                  Lien d'une situation vers le graphe centré sur
                  elle@@overview.side.situations.graph"
                >voir dans le graphe<span class="sr-only">
                  : {{ situation.title ?? untitledSituation }}</span
                ></a
              ></span
            >
          </div>
        }
      }
    </pm-overview-section>

    <pm-overview-section
      variant="side"
      [heading]="emotionsHeading()"
      [state]="state('emotions')"
      emptyTitle="Aucune émotion sur la période"
      i18n-emptyTitle="Bloc émotions vide@@overview.emotions.empty.title"
      emptyMessage="Les émotions des ressentis de la période apparaîtront ici."
      i18n-emptyMessage="Bloc émotions vide@@overview.side.emotions.empty.message"
      errorTitle="Émotions indisponibles"
      i18n-errorTitle="Erreur du bloc émotions@@overview.emotions.error"
      [refreshing]="refreshing()"
      (retry)="retry.emit()"
    >
      @if (view(); as v) {
        <ul class="emotions">
          @for (emotion of v.emotions; track emotion.code) {
            <li class="emorow">
              <i class="emo" [style.background]="familyColor(emotion.code)" aria-hidden="true"></i>
              <span>{{ emotion.label }}</span
              >&ngsp; <b>{{ emotion.count }}</b
              >&ngsp;
              <span class="delta"
                ><span aria-hidden="true">{{ delta(emotion.delta) }}</span
                ><span class="sr-only">{{ deltaText(emotion.delta) }}</span></span
              >
              <span class="bar" aria-hidden="true"
                ><i
                  [style.width.%]="share(emotion.count)"
                  [style.background]="familyColor(emotion.code)"
                ></i
              ></span>
            </li>
          }
        </ul>
      }
    </pm-overview-section>

    <pm-overview-section
      variant="side"
      heading="À compléter"
      i18n-heading="Titre du bloc à compléter@@overview.simple.todo.heading"
      [state]="state('todo')"
      emptyTitle="Rien à compléter"
      i18n-emptyTitle="Bloc à compléter vide@@overview.simple.todo.empty.title"
      emptyMessage="Les brouillons et les séances non clôturées apparaîtront ici."
      i18n-emptyMessage="Bloc à compléter vide@@overview.simple.todo.empty.message"
      errorTitle="À compléter indisponible"
      i18n-errorTitle="Erreur du bloc à compléter@@overview.simple.todo.error"
      [refreshing]="refreshing()"
      (retry)="retry.emit()"
    >
      @if (view(); as v) {
        <div class="todo">
          @if (v.drafts.count) {
            <a [routerLink]="['/patients', patientId(), 'timeline']" [queryParams]="draftParams">
              <span aria-hidden="true">✎</span>&ngsp;
              <span
                i18n="Brouillons, vers la timeline filtrée@@overview.simple.todo.drafts"
                >{v.drafts.count, plural,
                  =1 {1 brouillon à relire}
                  other {{{v.drafts.count}} brouillons à relire}
                }</span
              >&ngsp;
              <span class="r" i18n="Action d'une ligne à compléter@@overview.side.todo.open"
                >ouvrir</span
              >
            </a>
          }
          @if (v.drafts.openSession; as open) {
            <a
              [routerLink]="['/patients', patientId(), 'timeline']"
              [queryParams]="sessionParams(open.entryId)"
            >
              <span aria-hidden="true">✎</span>&ngsp;
              <span i18n="Séance à clôturer, vers la timeline@@overview.simple.todo.openSession"
                >Séance du {{ day(open.startedAt) }} à clôturer</span
              >&ngsp;
              <span class="r" i18n="Action d'une ligne à compléter@@overview.side.todo.open"
                >ouvrir</span
              >
            </a>
          }
        </div>
      }
    </pm-overview-section>

    <!-- Région d'état permanente : seul son contenu change (annoncé par les lecteurs d'écran). -->
    <p class="foot" role="status">
      @if (refreshing()) {
        <span i18n="Synthèse en cours de relecture@@overview.updating"
          >Mise à jour de la synthèse…</span
        >
      } @else if (updatedAt(); as at) {
        <span i18n="Heure de calcul de la synthèse@@overview.side.updated"
          >Synthèse calculée par le serveur · mise à jour {{ at }}</span
        >
      }
    </p>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      font-size: 13.5px;
    }
    pm-overview-section {
      padding: 14px 0;
      border-top: 1px solid var(--border-subtle);
    }
    pm-overview-section:first-child {
      padding-top: 0;
      border-top: 0;
    }
    a {
      color: var(--primary);
    }
    b {
      font-weight: 600;
    }
    .muted,
    .title-count {
      color: var(--text-secondary);
    }
    .title-count {
      font-weight: 500;
    }
    .line {
      display: flex;
      gap: 10px;
      align-items: baseline;
      padding: 4px 0;
      color: var(--text-primary);
    }
    .line .k {
      flex: none;
      width: 88px;
      font-size: 12.5px;
      color: var(--text-secondary);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .chip.flag {
      background: var(--flag-bg);
      color: var(--warning);
    }
    .chip.flag::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 2px;
      background: var(--flag);
    }
    .dot {
      display: inline-block;
      flex: none;
    }
    .dot.medication {
      align-self: center;
      width: 12px;
      height: 7px;
      border-radius: 4px;
      background: var(--entry-medication);
    }
    .dot.situation {
      width: 12px;
      height: 7px;
      border-radius: 2px;
      background: var(--entry-situation);
    }
    .sit {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sit:last-child {
      border-bottom: 0;
    }
    .sit .t {
      grid-column: 1;
      grid-row: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .sit .r {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
      white-space: nowrap;
      font-size: 12.5px;
      color: var(--text-secondary);
    }
    .sit .m {
      grid-column: 1;
      font-size: 12.5px;
      color: var(--text-secondary);
    }
    .emotions {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .emorow {
      display: grid;
      grid-template-columns: 10px 1fr auto auto;
      gap: 8px;
      align-items: center;
      padding: 4px 0;
      color: var(--text-primary);
    }
    .emo {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 50%;
    }
    .delta {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .bar {
      grid-column: 1 / -1;
      height: 4px;
      border-radius: 2px;
      background: var(--surface-sunken);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
    }
    .todo {
      display: grid;
      gap: 6px;
    }
    .todo a {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--flag-bg);
      color: var(--warning);
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
    }
    .todo a:hover .r {
      text-decoration: underline;
    }
    .todo .r {
      margin-left: auto;
      font-weight: 600;
    }
    a:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .foot {
      margin: 10px 0 0;
      font-size: 12px;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewSideComponent {
  /** La synthèse du store (gardée pendant une relecture). */
  readonly overview = input.required<Loadable<OverviewView>>();
  readonly patientId = input.required<string>();
  /** Le patient de l'en-tête (fiche) : modalité et durée habituelles du suivi. */
  readonly patient = input<ShellPatient | null>(null);
  /**
   * Début du suivi que l'en-tête affiche (PatientShellStore.followedSince : followUp.since de la
   * fiche, sauf si une séance le précède) : le cadre dit la même chose que l'en-tête.
   */
  readonly headerSince = input<string | null>(null);
  readonly refreshing = input(false);
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly view = computed(() => this.overview().data);
  protected readonly flagLabel = flagLabel;
  protected readonly untitledSituation = $localize`:Situation sans titre@@overview.situations.untitled:Situation sans titre`;

  /**
   * « sept. 2026 » : le début du suivi de l'en-tête, sinon celui de la synthèse ou la première
   * séance connue (followedSinceOf).
   */
  private readonly followedSince = computed(() => {
    const view = this.view();
    if (!view) return null;
    const since = this.headerSince() ?? followedSinceOf(view)?.date ?? null;
    return since ? formatMonth(since, this.locale) : null;
  });

  /** « cabinet, 50 min » : modalité et durée habituelles de la fiche (followUp), si renseignée. */
  private readonly habits = computed(() => {
    const patient = this.patient();
    if (!patient) return null;
    const modality = sessionModalityLabel(patient.sessionModality);
    const duration = patient.plannedDurationMin;
    return duration === null
      ? modality
      : $localize`:Modalité et durée habituelles du suivi (« cabinet, 50 min »)@@overview.side.frame.habits:${modality}:modality:, ${duration}:minutes: min`;
  });

  /** « depuis sept. 2026 · cabinet, 50 min ». */
  protected readonly followUp = computed(() => {
    const since = this.followedSince();
    if (!since) return null;
    const text = $localize`:Début du suivi dans le cadre du suivi (« depuis sept. 2026 »)@@overview.side.frame.since:depuis ${since}:date:`;
    const habits = this.habits();
    return habits ? `${text} · ${habits}` : text;
  });

  protected readonly emotionsHeading = computed(
    () =>
      $localize`:Titre du bloc émotions de la colonne latérale@@overview.side.emotions.heading:Émotions · ${windowLongLabel(this.view()?.window ?? '90d')}:period:`,
  );

  /** Heure du calcul de la synthèse (computedAt). */
  protected readonly updatedAt = computed(() => {
    const at = this.view()?.computedAt;
    return at ? formatComputedAt(at, this.locale) : null;
  });

  /** Code d'émotion → famille (séries du serveur) : couleur des émotions. */
  private readonly families = computed(() => {
    const map = new Map<string, EmotionFamily | null>();
    for (const series of this.view()?.feelings.series ?? []) {
      map.set(series.emotionCode, series.family);
    }
    return map;
  });

  /** Plus grand nombre parmi les émotions : longueur des barres. */
  private readonly topCount = computed(() =>
    Math.max(1, ...(this.view()?.emotions.map((e) => e.count) ?? [])),
  );

  protected readonly draftParams = { [TIMELINE_PARAMS.drafts]: '1' };

  protected state(block: SideBlock): StateKind | null {
    return blockState(this.overview(), EMPTY[block]);
  }

  protected day(value: string | null): string {
    return value ? formatShortDay(value, this.locale) : '—';
  }

  protected month(value: string): string {
    return formatMonth(value, this.locale, true);
  }

  /** « depuis le 12 nov. · sommeil très dégradé » : date de pose et raison du drapeau. */
  protected flagDetail(setAt: string | null, reason: string | null): string | null {
    const parts: string[] = [];
    if (setAt) {
      const date = this.day(setAt);
      parts.push(
        $localize`:Date de pose d'un drapeau, dans le cadre du suivi@@overview.side.frame.flagSince:depuis le ${date}:date:`,
      );
    }
    if (reason) parts.push(reason);
    return parts.length ? parts.join(' · ') : null;
  }

  protected familyColor(code: string): string {
    const family = this.families().get(code);
    return family ? `var(--emotion-${family})` : 'var(--feeling)';
  }

  /** Part d'une émotion par rapport à la plus notée (barre sous la ligne). */
  protected share(count: number): number {
    return Math.round((count / this.topCount()) * 100);
  }

  protected delta(value: number): string {
    return formatDelta(value);
  }

  protected deltaText(value: number): string {
    return deltaText(value, this.view()?.window ?? '90d');
  }

  protected graphParams(entryId: string): Record<string, string> {
    return { [GRAPH_ROOT_PARAM]: entryId };
  }

  protected sessionParams(entryId: string): Record<string, string> {
    return { [TIMELINE_PARAMS.mode]: 'session', [TIMELINE_PARAMS.focus]: entryId };
  }
}
