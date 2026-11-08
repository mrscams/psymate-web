import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Emotion, EMOTION_FAMILIES } from '../../data/emotions.api';
import { familyColor, familyLabel } from './vocabulary-labels';

/**
 * Vocabulaire global (fiche 17, structure 6) : référence en lecture seule, les 29 émotions rangées
 * par famille (pastille + nom de la famille, libellés séparés par « · »).
 */
@Component({
  selector: 'pm-global-vocabulary',
  template: `
    <dl class="global-grid">
      @for (group of groups(); track group.family) {
        <div class="global-family">
          <dt>
            <span class="dot" [style.background]="group.color" aria-hidden="true"></span>
            {{ group.label }}
          </dt>
          <dd>{{ group.names }}</dd>
        </div>
      }
    </dl>
  `,
  styleUrl: './vocabulary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalVocabularyComponent {
  readonly globals = input.required<readonly Emotion[]>();

  protected readonly groups = computed(() =>
    EMOTION_FAMILIES.map((family) => ({
      family,
      label: familyLabel(family),
      color: familyColor(family),
      names: this.globals()
        .filter((e) => e.family === family)
        .map((e) => e.labelFr.toLocaleLowerCase())
        .join(' · '),
    })).filter((group) => group.names.length > 0),
  );
}
