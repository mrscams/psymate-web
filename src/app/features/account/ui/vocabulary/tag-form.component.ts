import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../../core/http';
import { tagProblemMessage } from './vocabulary-messages';

/** Crée le tag ; renvoie null si c'est fait, sinon le problème du serveur. */
export type CreateTagFn = (label: string) => Promise<ApiProblem | null>;

/**
 * Ajout d'un tag (/mon-compte/tags). Le client vérifie la forme (non vide) ; le serveur juge
 * l'unicité (409 TAG_EXISTS) et refuse un libellé d'émotion (422 TAG_IS_EMOTION, avec l'émotion
 * proposée).
 */
@Component({
  selector: 'pm-tag-form',
  imports: [FormsModule, MatButtonModule],
  template: `
    <form (ngSubmit)="submit()" novalidate aria-labelledby="h-add-tag">
      <h2 id="h-add-tag" i18n="Titre de la carte d'ajout de tag@@vocabulary.tags.add.title">
        Ajouter un tag
      </h2>
      <div class="tag-form-row">
        <div class="field">
          <label for="field-tag-label" i18n="Libellé du champ tag@@vocabulary.tags.add.label"
            >Libellé du tag</label
          >
          <input
            id="field-tag-label"
            name="label"
            type="text"
            autocomplete="off"
            maxlength="80"
            [ngModel]="label()"
            (ngModelChange)="label.set($event); error.set(null)"
            [attr.aria-invalid]="error() !== null"
            [attr.aria-describedby]="error() ? 'field-tag-label-error' : 'field-tag-label-help'"
          />
        </div>
        <button mat-flat-button type="submit" [disabled]="busy()">
          <span i18n="Bouton de création de tag@@vocabulary.tags.add.submit">Créer le tag</span>
        </button>
      </div>
      @if (error(); as error) {
        <p class="error" id="field-tag-label-error" role="alert">{{ error }}</p>
      } @else {
        <p
          class="muted"
          id="field-tag-label-help"
          i18n="Aide du champ tag@@vocabulary.tags.add.help"
        >
          Un mot-clé libre pour regrouper patients et entrées (« # » facultatif). Un ressenti se
          note avec une émotion, pas avec un tag.
        </p>
      }
    </form>
  `,
  styleUrl: './vocabulary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagFormComponent {
  readonly busy = input(false);
  readonly save = input.required<CreateTagFn>();

  protected readonly label = signal('');
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    const label = this.label().replace(/#/g, '').trim();
    if (!label) {
      this.error.set(
        $localize`:Erreur, libellé de tag vide@@vocabulary.tags.add.required:Saisissez un libellé.`,
      );
      return;
    }
    const problem = await this.save()(this.label());
    if (problem) {
      this.error.set(tagProblemMessage(problem));
      return;
    }
    this.label.set('');
  }
}
