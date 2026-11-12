import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { formatDate, minutesBetween } from '../../../core/i18n';
import { PatientSessionInfo, sessionModalityLabel } from './patient-header.component';

/** « 00:21:07 » : heures, minutes, secondes écoulées, chiffres tabulaires. */
export function formatElapsed(startedAt: string, now: Date): string {
  const start = new Date(startedAt).getTime();
  const seconds = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now.getTime() - start) / 1000));
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(Math.floor(seconds / 3600))}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
}

/**
 * Barre de séance (proposition 04b « Session bar » : 44 px, fond session-tint, texte success,
 * chronomètre JetBrains Mono 18/600 tabulaire), posée au-dessus de l'en-tête patient tant qu'une
 * séance est ouverte : « Séance en cours · cabinet · démarrée à 09:08 », le temps écoulé
 * « 00:21:07 », « sur 50 min prévues », « n entrées notées » quand le nombre est connu, et le
 * bouton Clôturer la séance (en `output()`). Au-delà de `unclosedAfterMin` (UX-A8, 180 min), la
 * barre devient grise, sans chronomètre : « Séance du 12 nov. · démarrée à 09:08 · non clôturée »,
 * Clôturer toujours proposé. Le chronomètre est calculé sur le client depuis `startedAt`, la durée
 * prévue vient de la préférence `sessions.defaultDurationMin` (le dossier les fournit). Composant
 * bête, aucune lecture.
 */
@Component({
  selector: 'pm-session-bar',
  imports: [MatButtonModule],
  templateUrl: './session-bar.component.html',
  styleUrl: './session-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionBarComponent {
  /** La séance ouverte ; la barre n'affiche rien pour une autre valeur. */
  readonly session = input<PatientSessionInfo | null>(null);
  /** Durée prévue en minutes (« sur 50 min prévues ») ; null : la mention est omise. */
  readonly plannedMin = input<number | null>(null);
  /** Entrées notées pendant la séance ; null tant que le nombre n'est pas connu (mention omise). */
  readonly entriesCount = input<number | null>(null);
  /** Une action de séance est en cours : Clôturer inactif. */
  readonly busy = input(false);
  /** Au-delà de cette durée en minutes, « non clôturée » ; null : toujours le chronomètre. */
  readonly unclosedAfterMin = input<number | null>(null);

  readonly closeSession = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly now = signal(new Date());

  protected readonly current = computed(() => {
    const session = this.session();
    return session?.kind === 'current' ? session : null;
  });

  protected readonly unclosed = computed(() => {
    const session = this.current();
    const threshold = this.unclosedAfterMin();
    if (!session || threshold === null) return false;
    return minutesBetween(session.startedAt, this.now()) > threshold;
  });

  protected readonly elapsed = computed(() => {
    const session = this.current();
    return session ? formatElapsed(session.startedAt, this.now()) : '';
  });

  /** « cabinet · démarrée à 09:08 » (la modalité quand elle est connue). */
  protected readonly detail = computed(() => {
    const session = this.current();
    if (!session) return '';
    const time = new Intl.DateTimeFormat(this.locale, { timeStyle: 'short' }).format(
      new Date(session.startedAt),
    );
    const started = $localize`:Heure de début dans la barre de séance@@sessionBar.startedAt:démarrée à ${time}:time:`;
    const modality = sessionModalityLabel(session.modality);
    return modality ? `${modality} · ${started}` : started;
  });

  /** « Séance du 12 nov. 2026 · démarrée à 09:08 · non clôturée ». */
  protected readonly unclosedText = computed(() => {
    const session = this.current();
    if (!session) return '';
    const day = formatDate(session.startedAt, this.locale, 'medium');
    return $localize`:Séance ouverte depuis plus de 3 h dans la barre de séance@@sessionBar.unclosed:Séance du ${day}:day: · ${this.detail()}:detail: · non clôturée`;
  });

  protected readonly plannedText = computed(() => {
    const planned = this.plannedMin();
    if (!planned) return '';
    return $localize`:Durée prévue dans la barre de séance@@sessionBar.planned:sur ${planned}:minutes: min prévues`;
  });

  protected readonly countText = computed(() => {
    const count = this.entriesCount();
    if (count === null) return '';
    if (count === 0) {
      return $localize`:Aucune entrée notée dans la barre de séance@@sessionBar.count.none:rien de noté encore`;
    }
    if (count === 1) {
      return $localize`:Une entrée notée dans la barre de séance@@sessionBar.count.one:1 entrée notée`;
    }
    return $localize`:Entrées notées dans la barre de séance@@sessionBar.count.many:${count}:count: entrées notées`;
  });

  protected readonly timerLabel = $localize`:Étiquette du chronomètre de la barre de séance@@sessionBar.timer.label:Temps écoulé`;
  protected readonly closeLabel = $localize`:Bouton de la barre de séance@@patientHeader.session.close:Clôturer la séance`;

  constructor() {
    // Seconde par seconde tant qu'une séance est ouverte : le chronomètre, puis le passage à
    // « non clôturée » au-delà du seuil, sans rechargement.
    effect((onCleanup) => {
      if (!this.current()) return;
      this.now.set(new Date());
      const timer = setInterval(() => this.now.set(new Date()), 1_000);
      onCleanup(() => clearInterval(timer));
    });
  }
}
