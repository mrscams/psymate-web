import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { applyProblem, FieldErrorsComponent, fieldId, PmValidators } from '../../../shared/forms';
import { ConfirmDialogService, SidePanelComponent } from '../../../shared/ui';
import {
  CATEGORY_META,
  DETAIL_MAX,
  hasPeriod,
  PERIOD_LABEL_MAX,
  PROFILE_CATEGORIES,
  ProfileCategory,
  ProfileItem,
  ProfileItemInput,
  TITLE_MAX,
  YEAR_MAX,
  YEAR_MIN,
} from '../data/profile360.model';
import { Profile360Store, WriteOutcome } from '../data/profile360.store';

/** Ce que la page donne au panneau : le store de l'onglet, la rubrique affichée, l'information. */
export interface ProfileItemPanelData {
  store: Profile360Store;
  /** Rubrique préremplie : celle qui est affichée (création) ; ignorée en modification. */
  category: ProfileCategory;
  /** L'information à modifier ; null en création. */
  item: ProfileItem | null;
}

/**
 * Ce que le panneau rend à la page : une écriture réussie (profil déjà relu par le store), une
 * information retirée entre-temps (profil relu), un patient archivé ; undefined si fermé sans
 * écrire (Annuler, Échap, croix, modification sans changement).
 */
export type ProfileItemPanelResult =
  | { action: 'created' | 'updated' | 'removed'; category: ProfileCategory; itemId: string | null }
  | { action: 'gone' | 'archived' };

/** Année : un entier (la plage 1900 à 2100 est vérifiée par min et max). */
function integer(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return value === null || value === '' || Number.isInteger(value) ? null : { pattern: true };
}

/** Texte saisi → valeur envoyée : blancs de bord retirés, vide → null. */
function textOrNull(value: string): string | null {
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Panneau « Ajouter au profil » / « Modifier l'information » (fiche 30, Structure 3 ; G Q54) : un
 * seul composant pour créer et modifier, dans le panneau latéral partagé de 480 px. Champs :
 * Rubrique (préremplie), Information (obligatoire, 200), Précision (facultative, 2 000) et, pour
 * Histoire et souvenirs seulement, Période (60) et Année (1900 à 2100). Quitter Histoire et
 * souvenirs masque et vide Période et Année, sans déplacer le focus. Pied : « Ajouter » ou
 * « Enregistrer » (cobalt), « Annuler », et en modification « Retirer du profil » (bouton texte
 * neutre, jamais rouge) après le dialogue de confirmation partagé ; pas d'annulation après coup.
 * L'écriture et la relecture du profil sont faites par le store ; le panneau se ferme avec son
 * résultat, et la page affiche la rubrique, le toast et rend le focus. Erreurs : 422 par champ
 * sous le champ (shared/forms) ; 422 PROFILE_ITEM_LIMIT_REACHED et les autres échecs en message
 * dans le panneau ; information retirée entre-temps et patient archivé : fermeture, la page le dit.
 */
@Component({
  selector: 'pm-profile-item-panel',
  imports: [ReactiveFormsModule, SidePanelComponent, FieldErrorsComponent],
  templateUrl: './profile-item.panel.html',
  styleUrl: './profile-item.panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'holdEscape($event)' },
})
export class ProfileItemPanel {
  protected readonly data = inject<ProfileItemPanelData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<ProfileItemPanelResult>>(DialogRef);
  private readonly confirm = inject(ConfirmDialogService);
  protected readonly store = this.data.store;

  protected readonly fieldId = fieldId;
  protected readonly formId = 'profile360-item-form';
  protected readonly editing = this.data.item !== null;
  protected readonly categories = PROFILE_CATEGORIES;
  protected readonly categoryLabel = (category: ProfileCategory) => CATEGORY_META[category].label;
  protected readonly titleMax = TITLE_MAX;
  protected readonly detailMax = DETAIL_MAX;
  protected readonly periodLabelMax = PERIOD_LABEL_MAX;
  protected readonly yearMin = YEAR_MIN;
  protected readonly yearMax = YEAR_MAX;

  protected readonly title = this.editing
    ? $localize`:Titre du panneau en modification@@profile360.panel.editTitle:Modifier l'information`
    : $localize`:Titre du panneau en création@@profile360.panel.addTitle:Ajouter au profil`;
  protected readonly submitLabel = this.editing
    ? $localize`:Bouton principal du panneau en modification@@profile360.panel.save:Enregistrer`
    : $localize`:Bouton principal du panneau en création@@profile360.panel.create:Ajouter`;

  private readonly item = this.data.item;

  protected readonly form = inject(NonNullableFormBuilder).group({
    category: [this.item?.category ?? this.data.category],
    title: [
      this.item?.title ?? '',
      [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(TITLE_MAX)],
    ],
    detail: [this.item?.detail ?? '', PmValidators.maxLengthTrimmed(DETAIL_MAX)],
    periodLabel: [this.item?.periodLabel ?? '', PmValidators.maxLengthTrimmed(PERIOD_LABEL_MAX)],
    periodYear: [
      this.item?.periodYear ?? (null as number | null),
      [Validators.min(YEAR_MIN), Validators.max(YEAR_MAX), integer],
    ],
  });

  /** La rubrique choisie : Période et Année n'existent que pour Histoire et souvenirs. */
  protected readonly category = signal<ProfileCategory>(this.form.controls.category.value);
  protected readonly withPeriod = computed(() => hasPeriod(this.category()));

  /** Message dans le panneau : limite atteinte, erreur sans champ, échec réseau ou serveur. */
  protected readonly message = signal<string | null>(null);
  /** Soumission tentée : les messages de champ s'affichent même sans saisie. */
  protected readonly submitted = signal(false);

  constructor() {
    // Quitter Histoire et souvenirs vide Période et Année ; y revenir les réaffiche vides.
    this.form.controls.category.valueChanges.pipe(takeUntilDestroyed()).subscribe((category) => {
      this.category.set(category);
      if (!hasPeriod(category)) {
        this.form.controls.periodLabel.reset('');
        this.form.controls.periodYear.reset(null);
      }
    });
  }

  /** Ajouter ou Enregistrer : forme vérifiée ici, règles au serveur (G Q55 : relecture ensuite). */
  protected async submit(): Promise<void> {
    if (this.store.saving()) return;
    this.submitted.set(true);
    this.message.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const input = this.input();
    const outcome = this.item
      ? await this.store.update(this.item, input)
      : await this.store.create(input);
    this.settle(outcome, this.item ? 'updated' : 'created', input.category);
  }

  /** « Retirer du profil » : confirmation partagée (bouton neutre), puis retrait et relecture. */
  protected async remove(): Promise<void> {
    const item = this.item;
    if (!item || this.store.saving()) return;
    const ok = await this.confirm.confirm({
      title: $localize`:Confirmation du retrait d'une information@@profile360.remove.title:Retirer cette information du profil ?`,
      description: $localize`:Explication du retrait d'une information@@profile360.remove.body:Elle ne sera plus affichée.`,
      confirmLabel: $localize`:Bouton de confirmation du retrait@@profile360.remove.confirm:Retirer`,
    });
    if (!ok) return;
    this.message.set(null);
    this.settle(await this.store.remove(item), 'removed', item.category);
  }

  protected cancel(): void {
    if (this.store.saving()) return;
    this.dialogRef.close();
  }

  /** Échap pendant l'envoi : le panneau reste ouvert jusqu'à la réponse. */
  protected holdEscape(event: Event): void {
    if (!this.store.saving()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  private input(): ProfileItemInput {
    const value = this.form.getRawValue();
    const period = hasPeriod(value.category);
    return {
      category: value.category,
      title: value.title.trim(),
      detail: textOrNull(value.detail),
      periodLabel: period ? textOrNull(value.periodLabel) : null,
      periodYear: period ? value.periodYear : null,
    };
  }

  private settle(
    outcome: WriteOutcome,
    action: 'created' | 'updated' | 'removed',
    category: ProfileCategory,
  ): void {
    switch (outcome.status) {
      case 'done':
        this.dialogRef.close({ action, category, itemId: this.item?.id ?? null });
        return;
      case 'unchanged':
        this.dialogRef.close();
        return;
      case 'gone':
      case 'archived':
        this.dialogRef.close({ action: outcome.status });
        return;
      case 'invalid': {
        const { unmatched } = applyProblem(this.form, outcome.problem);
        this.message.set(
          unmatched.length > 0 ? unmatched.map((error) => error.message).join(' ') : null,
        );
        return;
      }
      case 'limit':
        this.message.set(
          $localize`:Limite de 500 informations atteinte@@profile360.panel.limit:Ce profil compte déjà 500 informations. Retirez-en une avant d'en ajouter.`,
        );
        return;
      case 'failed':
        this.message.set(
          $localize`:Échec d'une écriture du Profil 360@@profile360.panel.failed:L'enregistrement n'a pas abouti. Réessayez.`,
        );
        return;
    }
  }
}
