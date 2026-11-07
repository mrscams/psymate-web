import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { normalizeText, PractitionerTag } from '../data/patient.model';

/**
 * Tags du patient (fiche 16) : puces avec bouton « Retirer le tag #travail », champ de saisie
 * avec autocomplétion sur les tags du praticien (datalist). Entrée ajoute le libellé saisi ; la
 * page le résout (tag existant, ou création par POST /api/tags, refusée pour une émotion).
 */
@Component({
  selector: 'pm-tag-editor',
  template: `
    @if (tags().length > 0) {
      <ul class="chips" [attr.aria-label]="listLabel">
        @for (tag of tags(); track tag) {
          <li class="chip">
            <span>#{{ tag }}</span>
            <button
              type="button"
              class="remove"
              [disabled]="disabled()"
              [attr.aria-label]="removeLabel(tag)"
              (click)="remove.emit(tag)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        }
      </ul>
    }
    <div class="field">
      <label for="field-tags" i18n="Champ d'ajout de tag@@patients.tags.add">Ajouter un tag</label>
      <div class="row">
        <input
          id="field-tags"
          type="text"
          list="patient-tag-suggestions"
          autocomplete="off"
          [value]="draft()"
          [disabled]="disabled()"
          [attr.aria-invalid]="problem() ? true : null"
          aria-describedby="field-tags-hint field-tags-error"
          (input)="draft.set($any($event.target).value)"
          (keydown.enter)="submit($event)"
        />
        <button
          type="button"
          class="add"
          [disabled]="disabled() || busy() || !draft().trim()"
          (click)="submit($event)"
          i18n="Bouton d'ajout de tag@@patients.tags.addButton"
        >
          Ajouter
        </button>
      </div>
      <datalist id="patient-tag-suggestions">
        @for (tag of suggestionsLeft(); track tag.id) {
          <option [value]="tag.label"></option>
        }
      </datalist>
      <p id="field-tags-hint" class="hint" i18n="Aide du champ tag@@patients.tags.hint">
        Communs à tous vos dossiers. Une émotion ne peut pas servir de tag.
      </p>
      @if (problem(); as message) {
        <p id="field-tags-error" class="field-error" role="alert">{{ message }}</p>
      }
    </div>
  `,
  styleUrl: './tag-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagEditorComponent {
  readonly tags = input<string[]>([]);
  readonly suggestions = input<PractitionerTag[]>([]);
  readonly problem = input<string | null>(null);
  readonly busy = input(false);
  readonly disabled = input(false);
  /** Texte en cours de saisie ; la page le vide une fois le tag ajouté. */
  readonly draft = model('');

  readonly add = output<string>();
  readonly remove = output<string>();

  protected readonly listLabel = $localize`:Étiquette de la liste des tags du patient@@patients.tags.list:Tags du dossier`;

  protected readonly suggestionsLeft = computed(() => {
    const taken = new Set(this.tags().map(normalizeText));
    return this.suggestions().filter((tag) => !taken.has(normalizeText(tag.label)));
  });

  protected removeLabel(tag: string): string {
    return $localize`:Bouton de retrait d'un tag@@patients.tags.remove:Retirer le tag #${tag}:tag:`;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const label = this.draft().trim();
    if (label && !this.busy()) this.add.emit(label);
  }
}
