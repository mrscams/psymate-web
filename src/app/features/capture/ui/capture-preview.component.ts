import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import {
  EntryIconComponent,
  EntryType,
  entryTypeLabel,
  StateAction,
  StateComponent,
} from '../../../shared/ui';
import { formatOccurred, StateKind } from '../../../shared/util';
import { CaptureEmotion, CapturePreview } from '../data/capture.model';
import {
  intensityText,
  precisionLabel,
  quoted,
  targetIssueText,
  warningText,
} from './capture-labels';

/** Une ligne d'avertissement : texte traduit, caractère bloquant, émotions à choisir (ambiguïté). */
interface WarningLine {
  key: string;
  text: string;
  blocking: boolean;
  choices: CaptureEmotion[];
}

/**
 * Aperçu interprété de la barre de commande (B5, fiche 05 état A) : en une ligne, le type, l'émotion
 * avec la pastille de sa famille et l'intensité, le texte, le moment et sa précision, la séance, la
 * cible du `>` avec le type de lien proposé ; dessous, les avertissements du parseur (« À corriger »
 * bloque Entrée, « À vérifier » non), et les émotions à choisir quand le mot est ambigu. Trois états
 * (shared/ui/state) : vide (aide de la syntaxe, champ vide), chargement et erreur du vocabulaire.
 * Composant bête : la barre lui donne l'aperçu, il rend le choix d'une émotion.
 */
@Component({
  selector: 'pm-capture-preview',
  imports: [EntryIconComponent, StateComponent],
  templateUrl: './capture-preview.component.html',
  styleUrl: './capture-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CapturePreviewComponent {
  private readonly locale = inject(LOCALE_ID);

  readonly preview = input<CapturePreview | null>(null);
  /** empty : champ vide (aide) ; loading, error : vocabulaire des émotions ; null : l'aperçu. */
  readonly state = input<StateKind | null>(null);
  readonly emotions = input<readonly CaptureEmotion[]>([]);
  /** Séance à laquelle l'entrée sera rattachée (« séance en cours »), ou null. */
  readonly session = input<string | null>(null);

  readonly retry = output<void>();
  /** Une des émotions d'un mot ambigu, choisie. */
  readonly pickEmotion = output<CaptureEmotion>();

  protected readonly emptyTitle = $localize`:Aide de la barre de commande, champ vide@@capture.preview.emptyTitle:Notez au clavier`;
  protected readonly emptyMessage = $localize`:Aide de la barre de commande, champ vide@@capture.preview.emptyMessage:« anx 8 n'a pas dormi » crée un ressenti ; /evt, /sit, /med, /note choisissent le type ; « > entretien » lie l'entrée. Entrée enregistre, Ctrl+Entrée ouvre l'éditeur, Ctrl+S garde un brouillon.`;
  protected readonly errorTitle = $localize`:Vocabulaire illisible dans la barre de commande@@capture.preview.errorTitle:Impossible de charger les émotions`;
  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };

  protected readonly typeLabel = computed(() => {
    const preview = this.preview();
    return preview ? entryTypeLabel(preview.type) : '';
  });

  /** Mot saisi à la place d'une émotion inconnue ou ambiguë (« stress ? »). */
  protected readonly pendingWord = computed(() => {
    const preview = this.preview();
    if (!preview || preview.emotion) return null;
    return preview.unknownEmotion ?? preview.ambiguous?.word ?? null;
  });

  protected readonly when = computed(() => {
    const preview = this.preview();
    if (!preview) return '';
    if (!preview.dateExpression) {
      return $localize`:Moment par défaut dans l'aperçu de la barre de commande@@capture.preview.now:maintenant`;
    }
    const date = formatOccurred(preview.occurred, this.locale);
    const precision = precisionLabel(preview.occurred.precision);
    return $localize`:Moment interprété dans l'aperçu (date, précision)@@capture.preview.when:${date}:date: (${precision}:precision:)`;
  });

  protected readonly warnings = computed<WarningLine[]>(() => {
    const preview = this.preview();
    if (!preview) return [];
    const emotions = this.emotions();
    const lines: WarningLine[] = preview.warnings.map((warning, index) => ({
      key: `${warning.code}-${index}`,
      text: warningText(warning, preview.type, emotions, this.locale),
      blocking: warning.blocking,
      choices: warning.code === 'AMBIGUOUS_EMOTION' ? (preview.ambiguous?.candidates ?? []) : [],
    }));
    if (preview.targetIssue) {
      lines.push({
        key: preview.targetIssue.code,
        text: targetIssueText(preview.targetIssue, preview.type),
        blocking: true,
        choices: [],
      });
    }
    return lines;
  });

  protected readonly quote = quoted;
  protected readonly intensity = intensityText;

  protected entryTypeName(type: EntryType): string {
    return entryTypeLabel(type);
  }

  protected dotClass(emotion: CaptureEmotion): string {
    return `dot family-${emotion.family ?? 'none'}`;
  }

  protected proposedLink(label: string): string {
    return $localize`:Type de lien proposé dans l'aperçu de la barre de commande@@capture.preview.proposedLink:lien « ${label}:label: » proposé`;
  }
}
