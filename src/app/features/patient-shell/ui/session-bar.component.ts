import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { formatDate } from '../../../core/i18n';
import { elapsedMinutes, overtimeMinutes, ShellSession } from '../data/patient-shell.model';
import { formatClock, formatTimer, modalityLabel } from './shell-labels';

/** Les trois états de la barre (proposition 04b, état 4 : seuils). */
export type SessionBarMode = 'running' | 'overtime' | 'unclosed';

/**
 * Barre de séance (UX-S3, propositions 04 et 04b) : tant qu'une séance est ouverte, une barre teintée
 * au-dessus de l'en-tête : point pulsé, « Séance en cours · cabinet · démarrée à 09:08 », minuterie
 * en mono, « sur 50 min prévues », et à droite le nombre d'entrées notées et « Clôturer la séance ».
 * Passé la durée prévue : teinte warning, « 8 min au-delà des 50 prévues », le bouton devient plein
 * (ambre, jamais rouge). Passé 3 h : la barre grise « Séance du 12 nov. · démarrée à 09:08 · non
 * clôturée », sans pulsation, « Clôturer maintenant » et « Reprendre ». Rien ne se ferme seul, rien
 * ne sonne. Composant bête : la page du shell le nourrit (store, horloge).
 */
@Component({
  selector: 'pm-session-bar',
  template: `
    <div
      class="session-bar"
      [class.overtime]="mode() === 'overtime'"
      [class.unclosed]="mode() === 'unclosed'"
    >
      <span class="pulse" aria-hidden="true"></span>
      <span class="who">
        @if (mode() === 'unclosed') {
          <strong i18n="Barre de séance, séance de plus de 3 h@@patientShell.bar.sessionOf"
            >Séance du {{ day() }}</strong
          >
        } @else {
          <strong i18n="Barre de séance, séance en cours@@patientShell.bar.running"
            >Séance en cours</strong
          >
          @if (where(); as text) {
            <span aria-hidden="true"> · </span><span>{{ text }}</span>
          }
        }
        @if (startedAtText(); as at) {
          <span aria-hidden="true"> · </span>
          <span i18n="Heure de début dans la barre de séance@@patientShell.bar.startedAt"
            >démarrée à {{ at }}</span
          >
        }
        @if (mode() === 'unclosed') {
          <span aria-hidden="true"> · </span>
          <strong i18n="Barre de séance, non clôturée@@patientShell.bar.unclosed"
            >non clôturée</strong
          >
        }
      </span>
      @if (mode() !== 'unclosed') {
        <span class="timer" aria-hidden="true">{{ timer() }}</span>
        <span
          class="sr-only"
          i18n="Temps écoulé lu par le lecteur d'écran@@patientShell.bar.elapsed"
          >{{ elapsed() }} min écoulées</span
        >
        @if (mode() === 'overtime') {
          <span class="plan" i18n="Dépassement dans la barre de séance@@patientShell.bar.overtime"
            ><b>{{ overtime() }} min</b> au-delà des {{ planned() }} prévues</span
          >
        } @else {
          <span class="plan" i18n="Durée prévue dans la barre de séance@@patientShell.bar.planned"
            >sur {{ planned() }} min prévues</span
          >
        }
      }
      <span class="right">
        @if (notedCount() !== null) {
          <span class="count">
            @if (mode() === 'unclosed') {
              <ng-container i18n="Nombre d'entrées dans la barre grise@@patientShell.bar.entries">
                {notedCount(), plural,
                  =0 {aucune entrée}
                  =1 {1 entrée}
                  other {{{notedCount()}} entrées}
                }
              </ng-container>
            } @else {
              <ng-container
                i18n="Nombre d'entrées notées dans la barre de séance@@patientShell.bar.noted"
              >
                {notedCount(), plural,
                  =0 {rien de noté encore}
                  =1 {1 entrée notée}
                  other {{{notedCount()}} entrées notées}
                }
              </ng-container>
            }
          </span>
        }
        @if (mode() === 'unclosed') {
          <button
            type="button"
            class="btn outline"
            [disabled]="busy()"
            (click)="closeRequested.emit()"
          >
            <ng-container i18n="Bouton de la barre grise@@patientShell.bar.closeNow"
              >Clôturer maintenant</ng-container
            >
          </button>
          <button type="button" class="btn ghost" (click)="resumeRequested.emit()">
            <ng-container i18n="Bouton de la barre grise@@patientShell.bar.resume"
              >Reprendre</ng-container
            >
          </button>
        } @else {
          <button
            type="button"
            class="btn"
            [class.outline]="mode() === 'running'"
            [class.filled]="mode() === 'overtime'"
            [disabled]="busy()"
            (click)="closeRequested.emit()"
          >
            <ng-container i18n="Bouton de la barre de séance@@patientShell.bar.close"
              >Clôturer la séance</ng-container
            >
          </button>
        }
      </span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .session-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 14px;
      min-height: 44px;
      padding: 8px 28px;
      border-bottom: 1px solid var(--entry-session);
      background: var(--success-bg);
      color: var(--success);
      font-size: 13.5px;
    }
    .pulse {
      width: 9px;
      height: 9px;
      flex: none;
      border-radius: 50%;
      background: var(--entry-session);
      box-shadow: 0 0 0 4px var(--success-bg);
    }
    .who {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .timer {
      font-family: var(--font-mono);
      font-size: 18px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
    .right {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-left: auto;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid transparent;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }
    .btn:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .btn:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .btn.outline {
      border-color: var(--entry-session);
      background: var(--surface-raised);
      color: var(--success);
    }
    /* Plein, ambre (jamais rouge) : warning plutôt que flag, pour 4,5:1 avec le texte. */
    .btn.filled {
      border-color: var(--warning);
      background: var(--warning);
      color: var(--primary-on);
    }
    .btn.ghost {
      background: none;
      color: var(--primary);
    }
    /* Dépassement (04b, état 4) : ambre, le fait en mots, le bouton plein. */
    .overtime {
      border-bottom-color: var(--flag);
      background: var(--warning-bg);
      color: var(--warning);
    }
    .overtime .pulse {
      background: var(--flag);
      box-shadow: 0 0 0 4px var(--warning-bg);
    }
    .overtime .plan b {
      font-weight: 700;
    }
    /* Non clôturée (3 h) : gris, sans pulsation. */
    .unclosed {
      border-bottom: 0;
      background: var(--surface-sunken);
      color: var(--text-secondary);
    }
    .unclosed .pulse {
      background: var(--text-disabled);
      box-shadow: none;
    }
    .unclosed .btn.outline {
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
    @media (max-width: 720px) {
      .session-bar {
        padding: 8px 14px;
        font-size: 13px;
      }
      .timer {
        font-size: 15px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionBarComponent {
  readonly session = input.required<ShellSession>();
  /** Durée prévue en minutes (followUp.durationMin, sinon la préférence). */
  readonly planned = input.required<number>();
  /** Au-delà de ce nombre de minutes, la barre grise « non clôturée » (UNCLOSED_SESSION_AFTER_MIN). */
  readonly unclosedAfterMin = input.required<number>();
  /** Nombre d'entrées notées ; null tant qu'il n'est pas lu. */
  readonly notedCount = input<number | null>(null);
  /** Une action de séance est en cours : bouton inactif. */
  readonly busy = input(false);
  /** Horloge, avancée par la page (à la seconde). */
  readonly now = input.required<Date>();

  readonly closeRequested = output<void>();
  readonly resumeRequested = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly elapsed = computed(() => elapsedMinutes(this.session().startedAt, this.now()));
  protected readonly overtime = computed(() => overtimeMinutes(this.elapsed(), this.planned()));
  protected readonly mode = computed<SessionBarMode>(() => {
    if (this.elapsed() > this.unclosedAfterMin()) return 'unclosed';
    return this.overtime() > 0 ? 'overtime' : 'running';
  });
  protected readonly timer = computed(() => formatTimer(this.session().startedAt, this.now()));
  protected readonly startedAtText = computed(() =>
    formatClock(this.session().startedAt, this.locale),
  );
  protected readonly where = computed(() => modalityLabel(this.session().modality));
  protected readonly day = computed(() =>
    formatDate(this.session().startedAt, this.locale, 'medium'),
  );
}
