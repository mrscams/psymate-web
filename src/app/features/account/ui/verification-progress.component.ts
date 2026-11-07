import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { VerificationStatus } from '../../../core/auth';

interface Milestone {
  label: string;
  detail: string;
  state: 'done' | 'current' | 'todo';
}

/**
 * Progression en quatre jalons (fiche 13 §3) : Compte créé · E-mail confirmé · Justificatifs ·
 * Validation. `<ol aria-label>` avec `aria-current="step"` sur le jalon courant.
 */
@Component({
  selector: 'pm-verification-progress',
  template: `
    <ol class="progress" [attr.aria-label]="label">
      @for (step of steps(); track step.label) {
        <li [class]="step.state" [attr.aria-current]="step.state === 'current' ? 'step' : null">
          <span class="dot" aria-hidden="true"></span>
          <span class="label">{{ step.label }}</span>
          <span class="detail">{{ step.detail }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    .progress {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 12px 10px 28px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
    }
    .dot {
      position: absolute;
      top: 14px;
      left: 10px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid var(--border-subtle);
    }
    .done .dot {
      border-color: var(--success);
      background: var(--success);
    }
    .current {
      border: 2px solid var(--primary);
      padding: 9px 11px 9px 27px;
    }
    .current .dot {
      border-color: var(--primary);
      background: var(--primary);
    }
    .label {
      font: var(--mat-sys-title-small);
    }
    .detail {
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
    .todo .label {
      color: var(--text-secondary);
    }
    @media (max-width: 720px) {
      .progress {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationProgressComponent {
  readonly status = input.required<VerificationStatus>();
  readonly documentCount = input(0);
  readonly missingCount = input(0);

  protected readonly label = $localize`:Étiquette de la progression du dossier@@account.verification.progress.label:Progression du dossier`;

  protected readonly steps = computed<Milestone[]>(() => {
    const status = this.status();
    const docsDone = status === 'under_review' || status === 'approved';
    const count = this.documentCount();
    const missing = this.missingCount();
    const docsDetail = docsDone
      ? $localize`:Jalon justificatifs, dossier soumis@@account.verification.progress.docs.submitted:${count}:count: déposés · dossier soumis`
      : missing > 0
        ? $localize`:Jalon justificatifs, pièces manquantes@@account.verification.progress.docs.missing:${count}:count: déposés · ${missing}:missing: manquant(s)`
        : $localize`:Jalon justificatifs, complet@@account.verification.progress.docs.complete:${count}:count: déposés · prêt à soumettre`;
    return [
      {
        label: $localize`:Jalon 1@@account.verification.progress.created:Compte créé`,
        detail: $localize`:Détail du jalon 1@@account.verification.progress.created.detail:Fait`,
        state: 'done',
      },
      {
        label: $localize`:Jalon 2@@account.verification.progress.emailConfirmed:E-mail confirmé`,
        detail: $localize`:Détail du jalon 2@@account.verification.progress.emailConfirmed.detail:Fait`,
        state: 'done',
      },
      {
        label: $localize`:Jalon 3@@account.verification.progress.docs:Justificatifs`,
        detail: docsDetail,
        state: docsDone ? 'done' : 'current',
      },
      {
        label: $localize`:Jalon 4@@account.verification.progress.validation:Validation`,
        detail:
          status === 'approved'
            ? $localize`:Détail du jalon 4, approuvé@@account.verification.progress.validation.approved:Dossier approuvé`
            : status === 'under_review'
              ? $localize`:Détail du jalon 4, en cours@@account.verification.progress.validation.underReview:En cours, sous 2 jours ouvrés`
              : $localize`:Détail du jalon 4, à venir@@account.verification.progress.validation.todo:Sous 2 jours ouvrés après soumission`,
        state: status === 'approved' ? 'done' : status === 'under_review' ? 'current' : 'todo',
      },
    ];
  });
}
