import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { uniqueId } from '../../../shared/util';
import { EMOTION_FAMILIES, EmotionFamily, familyLabel } from '../../entries';
import { emotionLabelOf } from '../data/capture.model';

/** Ce que la proposition demande à la barre de créer (POST /api/me/emotions). */
export interface EmotionRequest {
  label: string;
  family: EmotionFamily;
}

/**
 * Proposition de création d'une émotion personnalisée (B5 : « Créer l'émotion custom “…” » avec un
 * choix de famille en une ligne ; fiche 17) : le mot saisi devant une intensité n'est aucune émotion
 * du vocabulaire. La famille est obligatoire (contrat : CreateEmotionRequest.family) ; sans elle, un
 * message le dit. 409 EMOTION_LABEL_EXISTS et 422 arrivent par `problem`, sous la ligne.
 */
@Component({
  selector: 'pm-emotion-proposal',
  template: `
    <div class="proposal" role="group" [attr.aria-labelledby]="titleId">
      <span class="title" [id]="titleId">{{ title() }}</span>
      <label
        class="family-label"
        [for]="familyId"
        i18n="Famille de l'émotion à créer@@capture.emotion.family"
        >Famille</label
      >
      <select
        class="family"
        [id]="familyId"
        [attr.aria-invalid]="missing() ? 'true' : null"
        [attr.aria-describedby]="message() ? errorId : null"
        (change)="choose($any($event.target).value)"
        (keydown.enter)="submit($event)"
      >
        <option
          value=""
          [selected]="!family()"
          i18n="Choix de famille vide@@capture.emotion.familyPlaceholder"
        >
          Choisir…
        </option>
        @for (item of families; track item) {
          <option [value]="item" [selected]="family() === item">{{ label(item) }}</option>
        }
      </select>
      <button
        type="button"
        class="create"
        [disabled]="busy()"
        (click)="submit($event)"
        i18n="Bouton de création d'une émotion depuis la barre@@capture.emotion.create"
      >
        Créer l'émotion
      </button>
      @if (message(); as text) {
        <p class="error" role="alert" [id]="errorId">{{ text }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .proposal {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      padding: 8px 10px;
      border: 1px dashed var(--border-strong);
      border-radius: 10px;
      font: var(--mat-sys-body-medium);
      color: var(--text-primary);
    }
    .title {
      font-weight: 600;
    }
    .family-label {
      color: var(--text-secondary);
    }
    .family {
      min-height: 32px;
      padding: 0 8px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
    }
    .family[aria-invalid='true'] {
      border-color: var(--danger);
    }
    .create {
      min-height: 32px;
      padding: 0 12px;
      border: 1px solid var(--primary);
      border-radius: 8px;
      background: var(--primary);
      color: var(--primary-on);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .create:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .family:focus-visible,
    .create:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
    .error {
      flex-basis: 100%;
      margin: 0;
      color: var(--danger);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmotionProposalComponent {
  /** Le mot saisi devant l'intensité (« stress »). */
  readonly word = input.required<string>();
  readonly busy = input(false);
  /** Message d'un refus du serveur (409, 422), ou null. */
  readonly problem = input<string | null>(null);

  readonly create = output<EmotionRequest>();

  protected readonly families = EMOTION_FAMILIES;
  protected readonly titleId = uniqueId('pm-capture-emotion');
  protected readonly familyId = uniqueId('pm-capture-family');
  protected readonly errorId = uniqueId('pm-capture-emotion-error');

  protected readonly family = signal<EmotionFamily | null>(null);
  protected readonly missing = signal(false);

  protected readonly emotionLabel = computed(() => emotionLabelOf(this.word()));
  protected readonly title = computed(() => {
    const label = this.emotionLabel();
    return $localize`:Proposition de la barre de commande@@capture.emotion.proposal:Créer l'émotion personnalisée « ${label}:label: »`;
  });
  protected readonly message = computed(() => {
    if (this.missing()) {
      return $localize`:Famille manquante@@capture.emotion.familyRequired:Choisissez la famille de l'émotion.`;
    }
    return this.problem();
  });

  protected label(family: EmotionFamily): string {
    return familyLabel(family);
  }

  protected choose(value: string): void {
    this.family.set(EMOTION_FAMILIES.find((item) => item === value) ?? null);
    if (this.family()) this.missing.set(false);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const family = this.family();
    if (!family) {
      this.missing.set(true);
      return;
    }
    if (this.busy()) return;
    this.create.emit({ label: this.emotionLabel(), family });
  }
}
