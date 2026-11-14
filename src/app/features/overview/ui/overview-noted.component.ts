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

import { EntryIconComponent, entryTypeLabel } from '../../../shared/ui';
import { Loadable, StateKind } from '../../../shared/util';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { blockState, isSinceEmpty, notedEntries, OverviewView } from '../data/overview.model';
import { formatShortDateTime } from './overview-labels';
import { OverviewSectionComponent } from './overview-section.component';

/** Les dix cases de l'échelle d'intensité (`.scale.sm`). */
const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * « Noté depuis la dernière séance » (UX-S6, proposition 02 `.entries`) : les entrées notées après
 * la dernière séance clôturée (sinceLastSession), dix au plus (décision 3), sans boîte. Une ligne
 * par entrée : icône du type ; pour un ressenti, l'émotion et l'échelle à dix cases (jamais le mot
 * « Ressenti »), son titre en extrait ; sinon le titre, ou le nom du type ; puce « brouillon » ;
 * la date à droite en mono. Un clic ouvre l'entrée (panneau de l'éditeur, ?entry=). Sans séance
 * passée : « Noté depuis l'ouverture du dossier ».
 */
@Component({
  selector: 'pm-overview-noted',
  imports: [EntryIconComponent, OverviewSectionComponent, RouterLink],
  template: `
    <pm-overview-section
      [heading]="heading()"
      [state]="state()"
      emptyTitle="Rien de noté depuis"
      i18n-emptyTitle="Bloc depuis la dernière séance vide@@overview.simple.since.empty.title"
      emptyMessage="Les entrées notées après la dernière séance clôturée apparaîtront ici."
      i18n-emptyMessage="Bloc depuis la dernière séance vide@@overview.simple.since.empty.message"
      errorTitle="Entrées indisponibles"
      i18n-errorTitle="Erreur du bloc depuis la dernière séance@@overview.simple.since.error"
      [refreshing]="refreshing()"
      [lines]="4"
      (retry)="retry.emit()"
    >
      @if (view()) {
        <span sectCount i18n="Compteur de la section noté depuis la séance@@overview.noted.count"
          >{total(), plural, =1 {1 entrée} other {{{total()}} entrées}} ·
          {drafts(), plural,
            =0 {aucun brouillon}
            =1 {1 brouillon}
            other {{{drafts()}} brouillons}
          }</span
        >
      }
      @if (view()) {
        <a
          sectLink
          [routerLink]="['/patients', patientId(), 'timeline']"
          i18n="Lien de la section noté depuis la séance vers la timeline@@overview.noted.all"
          >Tout dans la timeline</a
        >
      }
      @if (view()) {
        <ul class="entries">
          @for (entry of entries(); track entry.entryId) {
            <li>
              <a
                class="entry"
                [routerLink]="[]"
                [queryParams]="entryParams(entry.entryId)"
                queryParamsHandling="merge"
              >
                <span class="icon"><pm-entry-icon [type]="entry.type" [size]="14" /></span>
                <span class="t">
                  @if (entry.feeling; as feeling) {
                    <span class="name">{{ feeling.label }}</span
                    >&ngsp;
                    <span class="scale" aria-hidden="true">
                      @for (cell of scale; track cell) {
                        <i [class.on]="cell <= feeling.intensity"></i>
                      }
                    </span>
                    <span class="value">{{ feeling.intensity }}/10</span>
                    @if (entry.title) {
                      &ngsp;<span class="text">{{ entry.title }}</span>
                    }
                  } @else {
                    <span class="name">{{ entry.title ?? typeLabel(entry.type) }}</span>
                  }
                  @if (entry.draft) {
                    &ngsp;<span
                      class="chip draft"
                      i18n="Entrée en brouillon@@overview.activity.draft"
                      >brouillon</span
                    >
                  }</span
                >&ngsp;
                <span class="when">{{ when(entry.occurredFrom) }}</span>
              </a>
            </li>
          }
        </ul>
      }
    </pm-overview-section>
  `,
  styles: `
    :host {
      display: block;
    }
    a {
      color: var(--primary);
    }
    /* Lien de l'en-tête de section (maquette .sect-head .right) : souligné au survol seulement. */
    a[sectLink] {
      text-decoration: none;
    }
    a[sectLink]:hover {
      text-decoration: underline;
    }
    .entries {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .entries li {
      border-bottom: 1px solid var(--border-subtle);
    }
    .entries li:last-child {
      border-bottom: 0;
    }
    .entry {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 9px 4px;
      font-size: 13.5px;
      color: var(--text-primary);
      text-decoration: none;
      border-radius: 6px;
    }
    .entry:hover {
      background: var(--surface-sunken);
    }
    .entry:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }
    .icon {
      display: inline-flex;
      justify-content: center;
    }
    .t {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-weight: 500;
    }
    .name {
      flex: none;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-secondary);
      font-weight: 400;
    }
    .scale {
      display: inline-flex;
      flex: none;
      gap: 2px;
    }
    .scale i {
      width: 5px;
      height: 8px;
      border-radius: 2px;
      background: var(--surface-sunken);
    }
    .scale i.on {
      background: var(--feeling);
    }
    /* L'intensité en chiffres pour les lecteurs d'écran ; affichée à la place de l'échelle sur mobile. */
    .value {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .chip {
      display: inline-flex;
      flex: none;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .chip.draft {
      background: var(--surface-sunken);
      color: var(--text-secondary);
    }
    .when {
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 12px;
      white-space: nowrap;
    }
    /* Mobile (maquette .phone) : « Anxiété 7/10 », l'extrait sur sa propre ligne, sans date. */
    @media (max-width: 600px) {
      .entry {
        grid-template-columns: 14px minmax(0, 1fr);
      }
      .t {
        flex-wrap: wrap;
      }
      .scale,
      .when {
        display: none;
      }
      .value {
        position: static;
        width: auto;
        height: auto;
        clip-path: none;
      }
      .text {
        width: 100%;
        white-space: normal;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewNotedComponent {
  /** La synthèse du store (gardée pendant une relecture). */
  readonly overview = input.required<Loadable<OverviewView>>();
  readonly patientId = input.required<string>();
  readonly refreshing = input(false);
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly scale = SCALE;
  protected readonly typeLabel = entryTypeLabel;
  protected readonly view = computed(() => this.overview().data);
  protected readonly state = computed<StateKind | null>(() =>
    blockState(this.overview(), isSinceEmpty),
  );
  protected readonly entries = computed(() => {
    const view = this.view();
    return view ? notedEntries(view) : [];
  });
  /** Entrées servies depuis la séance, et brouillons parmi elles (« 4 entrées · 1 brouillon »). */
  protected readonly total = computed(() => this.view()?.sinceLastSession.entries.length ?? 0);
  protected readonly drafts = computed(
    () =>
      this.view()?.sinceLastSession.entries.filter((entry) => entry.status === 'draft').length ?? 0,
  );

  protected readonly heading = computed(() =>
    this.view() && !this.view()?.sinceLastSession.lastSessionAt
      ? $localize`:Titre de la section des entrées, sans séance passée@@overview.noted.headingOpening:Noté depuis l'ouverture du dossier`
      : $localize`:Titre de la section des entrées notées depuis la dernière séance@@overview.noted.heading:Noté depuis la dernière séance`,
  );

  protected when(value: string | null): string {
    return value ? formatShortDateTime(value, this.locale) : '';
  }

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_QUERY_PARAM]: entryId };
  }
}
