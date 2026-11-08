import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { startWith } from 'rxjs';

import { ApiProblem } from '../../../core/http';
import { applyProblem, fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { DecisionInput, VerificationDecision } from '../data/admin.model';

/** Points de la liste de contrôle (fiche 20), enregistrés tels quels dans `checklist`. */
export const CHECKLIST = [
  {
    key: 'nameMatches',
    label: $localize`:Point de la liste de contrôle@@admin.checklist.name:Le nom concorde sur toutes les pièces`,
  },
  {
    key: 'diplomaMatchesProfession',
    label: $localize`:Point de la liste de contrôle@@admin.checklist.diploma:Le diplôme correspond à la profession déclarée`,
  },
  {
    key: 'registryFound',
    label: $localize`:Point de la liste de contrôle@@admin.checklist.registry:Le numéro est retrouvé dans le registre public`,
  },
  {
    key: 'documentsReadable',
    label: $localize`:Point de la liste de contrôle@@admin.checklist.readable:Les documents sont lisibles et non altérés`,
  },
] as const;
export type ChecklistKey = (typeof CHECKLIST)[number]['key'];

/** Annuaire santé public (RPPS) : registre où retrouver un numéro professionnel. */
const PUBLIC_REGISTRY = 'https://annuaire.sante.fr/';

/**
 * Liste de contrôle et décision (fiche 20, B3 flux 10) : note interne (jamais envoyée), message au
 * praticien (obligatoire pour un complément ou un refus : boutons inactifs sans lui, le serveur
 * reste juge avec un 422), Approuver / Demander un complément / Refuser et suspendre. Approuver
 * avec des points non cochés ou des justificatifs non conformes demande une confirmation en ligne,
 * qui exige la note interne (approbation forcée).
 */
@Component({
  selector: 'pm-decision-form',
  imports: [ReactiveFormsModule, MatButtonModule, FieldErrorsComponent],
  templateUrl: './decision-form.component.html',
  styleUrl: './decision-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionFormComponent {
  readonly displayName = input.required<string>();
  /** Justificatifs non purgés qui ne sont pas conformes. */
  readonly nonConform = input(0);
  readonly submitting = input(false);
  readonly problem = input<ApiProblem | null>(null);
  readonly decide = output<DecisionInput>();

  protected readonly checklist = CHECKLIST;
  protected readonly registryUrl = PUBLIC_REGISTRY;
  protected readonly fieldId = fieldId;

  protected readonly checked = signal<Record<ChecklistKey, boolean>>({
    nameMatches: false,
    diplomaMatchesProfession: false,
    registryFound: false,
    documentsReadable: false,
  });

  protected readonly form = new FormGroup({
    internalNote: new FormControl('', { nonNullable: true }),
    messageToPractitioner: new FormControl('', { nonNullable: true }),
  });
  private readonly values = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { requireSync: true },
  );

  protected readonly hasMessage = computed(
    () => (this.values().messageToPractitioner ?? '').trim().length > 0,
  );
  protected readonly hasNote = computed(() => (this.values().internalNote ?? '').trim().length > 0);
  protected readonly unchecked = computed(
    () => Object.values(this.checked()).filter((value) => !value).length,
  );

  /** Confirmation en ligne de l'approbation forcée. */
  protected readonly confirming = signal(false);
  protected readonly confirmText = computed(() => {
    const parts: string[] = [];
    const points = this.unchecked();
    const documents = this.nonConform();
    if (points > 0) {
      parts.push(
        $localize`:Points de contrôle non cochés@@admin.decision.unchecked:${points}:count: point(s) de contrôle non coché(s)`,
      );
    }
    if (documents > 0) {
      parts.push(
        $localize`:Justificatifs non conformes@@admin.decision.nonConform:${documents}:count: justificatif(s) non marqué(s) conforme(s)`,
      );
    }
    const summary = parts.join(' · ');
    return $localize`:Confirmation d'une approbation forcée@@admin.decision.confirm:${summary}:summary: — approuver quand même ?`;
  });

  /** Message de l'API qui ne vise aucun champ (409 d'état, erreur réseau). */
  protected readonly generalError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const problem = this.problem();
      if (!problem) {
        this.generalError.set(null);
        return;
      }
      if (problem.code === 'ADMIN_APPROVAL_INCOMPLETE') {
        this.confirming.set(true);
        this.generalError.set(null);
        return;
      }
      const { unmatched } = applyProblem(this.form, problem);
      if (problem.status === 422 && unmatched.length === 0) {
        this.generalError.set(null);
        return;
      }
      this.generalError.set(errorText(problem));
    });
  }

  protected toggle(key: ChecklistKey, event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.checked.update((current) => ({ ...current, [key]: value }));
  }

  protected approve(): void {
    if (this.unchecked() > 0 || this.nonConform() > 0) {
      this.confirming.set(true);
      return;
    }
    this.emit('approved', false);
  }

  /** Approbation malgré les points ouverts : force si des justificatifs ne sont pas conformes. */
  protected approveAnyway(): void {
    this.emit('approved', true);
  }

  protected cancelConfirm(): void {
    this.confirming.set(false);
  }

  /** Complément ou refus : le bouton est inactif sans message ; s'il est forcé, le serveur répond 422. */
  protected send(kind: VerificationDecision): void {
    this.confirming.set(false);
    this.emit(kind, false);
  }

  private emit(kind: VerificationDecision, force: boolean): void {
    const value = this.form.getRawValue();
    this.decide.emit({
      kind,
      internalNote: value.internalNote,
      messageToPractitioner: value.messageToPractitioner,
      checklist: { ...this.checked() },
      force,
    });
  }
}

function errorText(problem: ApiProblem): string {
  switch (problem.code) {
    case 'ADMIN_DOSSIER_NOT_REVIEWABLE':
      return $localize`:Dossier déjà décidé@@admin.decision.notReviewable:Ce dossier n'est plus en attente de décision : il a peut-être été traité entre-temps. Rechargez la file.`;
    case 'ADMIN_DOSSIER_NOT_FOUND':
      return $localize`:Dossier introuvable@@admin.decision.notFound:Ce dossier n'existe plus.`;
    default:
      return (
        problem.detail ??
        $localize`:Erreur d'envoi d'une décision@@admin.decision.error:La décision n'a pas pu être enregistrée. Rien n'a été modifié.`
      );
  }
}
