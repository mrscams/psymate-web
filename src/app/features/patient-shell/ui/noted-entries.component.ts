import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { EntryIconComponent, entryTitle } from '../../../shared/ui';
import { inGrace, NotedEntry } from '../data/patient-shell.model';
import { LinkSentenceState } from '../data/patient-shell.store';
import { formatClock } from './shell-labels';

/**
 * Lignes « Noté pendant cette séance » (UX-S3, proposition 04b : rangées de 44 px, icône du type,
 * titre de repli entryTitle(), phrase de lien du serveur, heure en mono) : dans l'onglet Séance
 * (avec « modifier » pendant la grâce, « corriger » après) et dans le panneau de clôture (lecture
 * seule). Composant bête : le PatientShellStore le nourrit par la page.
 */
@Component({
  selector: 'pm-noted-entries',
  imports: [EntryIconComponent],
  template: `
    <ul class="entries" [class.compact]="compact()">
      @for (entry of entries(); track entry.id) {
        <li class="entry" [class.fresh]="entry.id === highlightedId()">
          <pm-entry-icon [type]="entry.type" [size]="12" />
          <span class="t">
            <span class="name">{{ name(entry) }}</span>
            @if (scale(entry); as cells) {
              <span class="scale" role="img" [attr.aria-label]="intensityLabel(entry)">
                @for (on of cells; track $index) {
                  <i [class.on]="on"></i>
                }
              </span>
            }
            @if (entry.ongoing) {
              <span
                class="chip"
                i18n="Situation en cours, dans une ligne@@patientShell.noted.ongoing"
                >en cours</span
              >
            }
            @if (entry.status === 'draft') {
              <span class="chip" i18n="Brouillon, dans une ligne@@patientShell.noted.draft"
                >brouillon</span
              >
            }
            @if (sentence(entry); as text) {
              <span class="text">{{ text }}</span>
            }
          </span>
          <span class="when">
            <span class="time">{{ clock(entry) }}</span>
            @if (editable()) {
              <span class="sep" aria-hidden="true">·</span>
              <button type="button" class="edit" (click)="edit.emit(entry.id)">
                @if (grace(entry)) {
                  <ng-container
                    i18n="Modifier une entrée notée, pendant la grâce@@patientShell.noted.edit"
                    >modifier</ng-container
                  >
                } @else {
                  <ng-container
                    i18n="Corriger une entrée notée, après la grâce@@patientShell.noted.correct"
                    >corriger</ng-container
                  >
                }
                <span class="sr-only"> {{ name(entry) }}</span>
              </button>
            }
          </span>
        </li>
      }
    </ul>
  `,
  styles: `
    .entries {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .entry {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 0 4px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 14px;
      color: var(--text-primary);
      transition: background-color 400ms;
    }
    .compact .entry {
      min-height: 38px;
      font-size: 13.5px;
    }
    .entry:last-child {
      border-bottom: 0;
    }
    /* Ligne qui vient d'être notée : teinte de séance, 2 s (proposition 04b, « Enter rules »). */
    .entry.fresh {
      margin: 0 -14px;
      padding: 0 18px;
      background: var(--success-bg);
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
      color: var(--text-secondary);
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .chip {
      flex: none;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: 11.5px;
      font-weight: 600;
    }
    .when {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .edit {
      min-height: 32px;
      padding: 0 2px;
      border: 0;
      background: none;
      color: var(--primary);
      font: inherit;
      cursor: pointer;
    }
    .edit:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
      border-radius: 4px;
    }
    @media (prefers-reduced-motion: reduce) {
      .entry {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotedEntriesComponent {
  readonly entries = input.required<readonly NotedEntry[]>();
  /** Phrase de lien par entrée (store.links). */
  readonly links = input<Readonly<Record<string, LinkSentenceState>>>({});
  /** Code d'émotion → libellé, pour le titre de repli des ressentis. */
  readonly emotionLabels = input<Readonly<Record<string, string>>>({});
  /** Ligne surlignée (entrée qui vient d'être notée). */
  readonly highlightedId = input<string | null>(null);
  /** Lignes avec « modifier » / « corriger » (onglet Séance) ; sans, lecture seule (panneau). */
  readonly editable = input(false);
  /** Lignes plus serrées (panneau de clôture). */
  readonly compact = input(false);
  /** Instant de référence pour la grâce (la page le fait avancer). */
  readonly now = input<Date>(new Date());

  readonly edit = output<string>();

  private readonly locale = inject(LOCALE_ID);
  private readonly today = computed(() => this.now());

  /** Ressenti dont l'émotion est connue : son nom seul, l'échelle dit l'intensité (04b). */
  protected name(entry: NotedEntry): string {
    const emotion = this.emotion(entry);
    if (emotion && entry.type === 'feeling' && !entry.title) return emotion;
    return entryTitle(
      {
        type: entry.type,
        title: entry.title,
        occurred: entry.occurredFrom,
        emotion,
        intensity: entry.intensity,
      },
      this.locale,
      { now: this.today() },
    );
  }

  private emotion(entry: NotedEntry): string | null {
    return entry.emotionCode ? (this.emotionLabels()[entry.emotionCode] ?? null) : null;
  }

  /** Dix cases, les `intensity` premières allumées ; null pour tout autre type. */
  protected scale(entry: NotedEntry): boolean[] | null {
    if (entry.type !== 'feeling' || entry.intensity === null) return null;
    return Array.from({ length: 10 }, (_, i) => i < entry.intensity!);
  }

  protected intensityLabel(entry: NotedEntry): string {
    const value = entry.intensity ?? 0;
    return $localize`:Intensité d'un ressenti lue par le lecteur d'écran@@patientShell.noted.intensity:intensité ${value}:value: sur 10`;
  }

  protected sentence(entry: NotedEntry): string | null {
    return this.links()[entry.id]?.sentence ?? null;
  }

  protected clock(entry: NotedEntry): string {
    return formatClock(entry.recordedAt ?? entry.occurredFrom, this.locale);
  }

  protected grace(entry: NotedEntry): boolean {
    return inGrace(entry.recordedAt, this.now());
  }
}
