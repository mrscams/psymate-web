import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../../core/http';
import { Tag } from '../../data/tags.api';
import { tagProblemMessage } from './vocabulary-messages';

export type RenameTagFn = (id: string, label: string) => Promise<ApiProblem | null>;
export type MergeTagFn = (sourceId: string, targetId: string) => Promise<ApiProblem | null>;

interface Editing {
  kind: 'rename' | 'merge';
  id: string;
}

/**
 * Tableau des tags (/mon-compte/tags) : libellé, usages, date de création ; Renommer en place,
 * Fusionner… avec aperçu en ligne (« réétiquette N usages ») et confirmation. La fusion de tags
 * n'a pas d'annulation dans le contrat : l'aperçu le dit.
 */
@Component({
  selector: 'pm-tag-table',
  imports: [FormsModule, MatButtonModule],
  templateUrl: './tag-table.component.html',
  styleUrl: './vocabulary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagTableComponent {
  readonly tags = input.required<readonly Tag[]>();
  readonly busyId = input<string | null>(null);
  readonly rename = input.required<RenameTagFn>();
  readonly merge = input.required<MergeTagFn>();

  private readonly injector = inject(Injector);
  private readonly date = new Intl.DateTimeFormat(inject(LOCALE_ID), { dateStyle: 'medium' });

  protected readonly editing = signal<Editing | null>(null);
  protected readonly draft = signal('');
  protected readonly targetId = signal('');
  protected readonly rowError = signal<string | null>(null);

  protected readonly target = computed(
    () => this.tags().find((tag) => tag.id === this.targetId()) ?? null,
  );

  protected targetsFor(tag: Tag): Tag[] {
    return this.tags().filter((other) => other.id !== tag.id);
  }

  protected created(tag: Tag): string {
    const time = Date.parse(tag.createdAt);
    return Number.isFinite(time) ? this.date.format(new Date(time)) : '';
  }

  protected isEditing(kind: Editing['kind'], id: string): boolean {
    const editing = this.editing();
    return editing?.kind === kind && editing.id === id;
  }

  protected startRename(tag: Tag): void {
    this.open({ kind: 'rename', id: tag.id });
    this.draft.set(tag.label);
    this.focus(`tag-rename-input-${tag.id}`);
  }

  protected startMerge(tag: Tag): void {
    this.open({ kind: 'merge', id: tag.id });
    this.focus(`tag-merge-target-${tag.id}`);
  }

  protected selectTarget(id: string): void {
    this.targetId.set(id);
    this.rowError.set(null);
  }

  protected cancel(): void {
    const editing = this.editing();
    this.editing.set(null);
    if (editing) this.focus(`tag-${editing.kind}-btn-${editing.id}`);
  }

  protected async saveRename(tag: Tag): Promise<void> {
    const label = this.draft().replace(/#/g, '').trim();
    if (!label) {
      this.rowError.set(
        $localize`:Erreur, libellé vide au renommage@@vocabulary.rename.required:Saisissez un libellé.`,
      );
      return;
    }
    if (label === tag.label) {
      this.cancel();
      return;
    }
    const problem = await this.rename()(tag.id, this.draft());
    if (problem) this.rowError.set(tagProblemMessage(problem));
    else this.cancel();
  }

  protected async confirmMerge(tag: Tag): Promise<void> {
    const target = this.target();
    if (!target) return;
    const problem = await this.merge()(tag.id, target.id);
    if (problem) {
      this.rowError.set(tagProblemMessage(problem));
      return;
    }
    // La source sort de la liste : le focus va à la ligne de la cible.
    this.editing.set(null);
    this.focus(`tag-merge-btn-${target.id}`);
  }

  private open(editing: Editing): void {
    this.editing.set(editing);
    this.targetId.set('');
    this.rowError.set(null);
  }

  private focus(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
