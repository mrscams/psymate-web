import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { subjectLabel, SubjectVocabulary } from '../../../core/i18n';

/** Les trois étapes de la première connexion (B3 flux 1, C5 : première entrée en moins de 3 min). */
export type OnboardingStep = 1 | 2 | 3;

interface StepView {
  n: OnboardingStep;
  title: string;
  detail: string;
  state: 'done' | 'current' | 'upcoming';
}

/**
 * Accueil de la première connexion (planche 29 §2, M7-03) : trois étapes jusqu'à la première
 * entrée, l'étape en cours marquée (`aria-current="step"`, et en toutes lettres), le lien « Voir les
 * raccourcis ? » et une phrase neutre sur les suggestions, préparée pour la V2 (aucune fonction,
 * aucun appel). L'étape en cours vient de la page, qui la dérive des données lues ; rien n'est
 * mémorisé ici.
 */
@Component({
  selector: 'pm-onboarding',
  template: `
    <section class="welcome" aria-labelledby="onboarding-title">
      <h2
        id="onboarding-title"
        class="title"
        i18n="Titre de l'accueil de première connexion@@patients.onboarding.title"
      >
        Bienvenue dans PsyMate
      </h2>
      <p class="lead" i18n="Phrase d'introduction de l'accueil@@patients.onboarding.lead">
        Trois étapes jusqu'à votre première entrée :
      </p>
      <ol class="steps">
        @for (step of steps(); track step.n) {
          <li
            class="step"
            [class.current]="step.state === 'current'"
            [class.done]="step.state === 'done'"
            [attr.aria-current]="step.state === 'current' ? 'step' : null"
          >
            <span class="num" aria-hidden="true">{{ step.n }}</span>
            <span class="text">
              <strong>{{ step.title }}</strong>
              <span class="detail">{{ step.detail }}</span>
            </span>
            @switch (step.state) {
              @case ('current') {
                <span class="badge" i18n="Marque de l'étape en cours@@patients.onboarding.current"
                  >Étape en cours</span
                >
              }
              @case ('done') {
                <span class="badge done" i18n="Marque d'une étape faite@@patients.onboarding.done"
                  >Fait</span
                >
              }
            }
          </li>
        }
      </ol>
      @if (hasDemo()) {
        <p
          class="demo"
          i18n="Invitation à explorer le patient de démonstration@@patients.onboarding.demo"
        >
          Vous pouvez aussi explorer le dossier de démonstration ci-dessous, puis le supprimer.
        </p>
      }
      <button type="button" class="shortcuts" aria-keyshortcuts="?" (click)="showShortcuts.emit()">
        <span i18n="Lien vers l'aide des raccourcis@@patients.onboarding.shortcuts"
          >Voir les raccourcis</span
        >
        <kbd aria-hidden="true">?</kbd>
      </button>
      <p
        class="soon"
        i18n="Message préparé pour les suggestions (V2)@@patients.onboarding.suggestions"
      >
        Bientôt : des suggestions de liens entre vos entrées. Elles résumeront des régularités dans
        ce que vous avez saisi ; vous seul déciderez de ce qui fait sens.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .welcome {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border: 1px dashed var(--border-strong);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
    }

    .title {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }

    .lead,
    .demo,
    .soon {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-medium);
    }

    .soon {
      font: var(--mat-sys-body-small);
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .step {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 8px 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;

      &.current {
        border-color: var(--primary);
        background: var(--primary-tint);
      }
    }

    .num {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--surface-sunken);
      color: var(--text-primary);
      font: var(--mat-sys-label-medium);
    }

    .current .num {
      background: var(--primary);
      color: var(--primary-on);
    }

    .text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      font: var(--mat-sys-body-medium);
    }

    .detail {
      color: var(--text-secondary);
    }

    .badge {
      flex: none;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-medium);

      &.done {
        background: var(--success-bg);
        color: var(--success);
      }
    }

    .shortcuts {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      align-self: flex-start;
      min-height: 44px;
      padding: 0 4px;
      border: 0;
      background: none;
      color: var(--primary);
      font: var(--mat-sys-label-large);
      text-decoration: underline;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  /** Étape en cours, dérivée des données par la page (1 tant qu'aucun vrai patient n'existe). */
  readonly current = input<OnboardingStep>(1);
  /** Un patient de démonstration est dans la liste : on invite à l'explorer. */
  readonly hasDemo = input(false);
  /** « Voir les raccourcis » : la page ouvre l'aide (features/patient-shell). */
  readonly showShortcuts = output<void>();

  private readonly vocabulary = inject(SubjectVocabulary);

  protected readonly steps = computed<StepView[]>(() => {
    const one = subjectLabel(this.vocabulary.label(), 'one');
    const current = this.current();
    const texts: Record<OnboardingStep, { title: string; detail: string }> = {
      1: {
        title: $localize`:Étape 1 de l'accueil@@patients.onboarding.step1.title:Créez un ${one}:subject:`,
        detail: $localize`:Détail de l'étape 1@@patients.onboarding.step1.detail:Seul le nom affiché est obligatoire. Touche N depuis cette liste.`,
      },
      2: {
        title: $localize`:Étape 2 de l'accueil@@patients.onboarding.step2.title:Ouvrez son dossier`,
        detail: $localize`:Détail de l'étape 2@@patients.onboarding.step2.detail:Il s'ouvre dès la création, sur la vue d'ensemble.`,
      },
      3: {
        title: $localize`:Étape 3 de l'accueil@@patients.onboarding.step3.title:Saisissez la première entrée`,
        detail: $localize`:Détail de l'étape 3@@patients.onboarding.step3.detail:Dans le dossier : touche N, le bouton + ou la barre « Noter quelque chose ».`,
      },
    };
    return ([1, 2, 3] as const).map((n) => ({
      n,
      ...texts[n],
      state: n < current ? 'done' : n === current ? 'current' : 'upcoming',
    }));
  });
}
