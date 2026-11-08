import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../../core/http';
import { Emotion } from '../../data/emotions.api';
import { emotionProblemMessage } from './vocabulary-messages';
import { familyColor, familyLabel } from './vocabulary-labels';

/** Renomme ou fusionne ; renvoie null si c'est fait, sinon le problème du serveur. */
export type RenameEmotionFn = (code: string, labelFr: string) => Promise<ApiProblem | null>;
export type MergeEmotionFn = (sourceCode: string, targetCode: string) => Promise<ApiProblem | null>;

interface Editing {
  kind: 'rename' | 'merge';
  code: string;
}

/**
 * Tableau « Mes émotions » (fiche 17, structure 4 et 5) : émotion avec badge « perso », famille
 * (pastille + nom), actions Renommer (en place) et Fusionner… (confirmation en ligne sous la ligne,
 * focus à l'ouverture, rendu au bouton à la fermeture). Cible par défaut : même famille ; une autre
 * famille demande une confirmation supplémentaire (les courbes changent de couleur). Ni
 * « Proposer au global » (V2, G Q8) ni « Désactiver » (absent du contrat).
 */
@Component({
  selector: 'pm-custom-emotions',
  imports: [FormsModule, MatButtonModule],
  templateUrl: './custom-emotions.component.html',
  styleUrl: './vocabulary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomEmotionsComponent {
  /** Émotions personnalisées actives. */
  readonly customs = input.required<readonly Emotion[]>();
  /** Toutes les émotions actives : cibles de fusion possibles. */
  readonly emotions = input.required<readonly Emotion[]>();
  /** Code de l'émotion dont l'écriture est en cours. */
  readonly busyCode = input<string | null>(null);
  readonly rename = input.required<RenameEmotionFn>();
  readonly merge = input.required<MergeEmotionFn>();

  private readonly injector = inject(Injector);

  protected readonly familyLabel = familyLabel;
  protected readonly familyColor = familyColor;

  protected readonly editing = signal<Editing | null>(null);
  protected readonly draft = signal('');
  protected readonly targetCode = signal('');
  protected readonly allFamilies = signal(false);
  protected readonly familyConfirmed = signal(false);
  protected readonly rowError = signal<string | null>(null);

  protected readonly source = computed(() => {
    const editing = this.editing();
    return editing ? (this.customs().find((e) => e.code === editing.code) ?? null) : null;
  });

  /** Cibles : globales puis personnalisées, même famille sauf si « autres familles » est coché. */
  protected readonly targets = computed(() => {
    const source = this.source();
    if (!source) return { globals: [], customs: [] };
    const candidates = this.emotions().filter(
      (e) => e.code !== source.code && (this.allFamilies() || e.family === source.family),
    );
    return {
      globals: candidates.filter((e) => e.scope === 'global'),
      customs: candidates.filter((e) => e.scope === 'custom'),
    };
  });

  protected readonly target = computed(
    () => this.emotions().find((e) => e.code === this.targetCode()) ?? null,
  );

  protected readonly familyChange = computed(() => {
    const source = this.source();
    const target = this.target();
    return !!source && !!target && source.family !== target.family;
  });

  protected readonly canMerge = computed(
    () => !!this.target() && (!this.familyChange() || this.familyConfirmed()),
  );

  protected isEditing(kind: Editing['kind'], code: string): boolean {
    const editing = this.editing();
    return editing?.kind === kind && editing.code === code;
  }

  protected startRename(emotion: Emotion): void {
    this.open({ kind: 'rename', code: emotion.code });
    this.draft.set(emotion.labelFr);
    this.focus(`rename-input-${emotion.code}`);
  }

  protected startMerge(emotion: Emotion): void {
    this.open({ kind: 'merge', code: emotion.code });
    this.focus(`merge-target-${emotion.code}`);
  }

  protected toggleAllFamilies(checked: boolean): void {
    this.allFamilies.set(checked);
    if (!checked && this.familyChange()) this.targetCode.set('');
    this.familyConfirmed.set(false);
  }

  protected selectTarget(code: string): void {
    this.targetCode.set(code);
    this.familyConfirmed.set(false);
    this.rowError.set(null);
  }

  /** Échap ou Annuler : ferme et rend le focus au bouton qui a ouvert. */
  protected cancel(): void {
    const editing = this.editing();
    this.editing.set(null);
    if (editing) this.focus(`${editing.kind}-btn-${editing.code}`);
  }

  protected async saveRename(emotion: Emotion): Promise<void> {
    const label = this.draft().trim();
    if (!label) {
      this.rowError.set(
        $localize`:Erreur, libellé vide au renommage@@vocabulary.rename.required:Saisissez un libellé.`,
      );
      return;
    }
    if (label === emotion.labelFr) {
      this.cancel();
      return;
    }
    const problem = await this.rename()(emotion.code, label);
    if (problem) this.rowError.set(emotionProblemMessage(problem));
    else this.cancel();
  }

  protected async confirmMerge(emotion: Emotion): Promise<void> {
    const target = this.target();
    if (!target || !this.canMerge()) return;
    const problem = await this.merge()(emotion.code, target.code);
    if (problem) {
      this.rowError.set(emotionProblemMessage(problem));
      return;
    }
    // La ligne disparaît (la source fusionnée sort de la liste) : le focus va au titre du journal.
    this.editing.set(null);
    this.focus('h-merge-journal');
  }

  private open(editing: Editing): void {
    this.editing.set(editing);
    this.targetCode.set('');
    this.allFamilies.set(false);
    this.familyConfirmed.set(false);
    this.rowError.set(null);
  }

  private focus(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
