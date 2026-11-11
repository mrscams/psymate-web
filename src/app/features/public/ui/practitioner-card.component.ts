import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { AppLocale } from '../../../core/i18n';
import { DirectoryVocabulary, PractitionerCard } from '../data/directory.models';
import { practitionerPath } from '../public-paths';
import { plainText } from './bio';
import { vocabularyLabel, VocabularyKind } from './labels';
import {
  AvailabilityComponent,
  PractitionerAvatarComponent,
  ProfessionChipComponent,
  VerifiedBadgeComponent,
} from './practitioner-badges.component';

/** Spécialités montrées sur une fiche résumée (fiche 08 : 4 au plus). */
export const CARD_SPECIALTIES_MAX = 4;

/**
 * Fiche résumée d'un praticien dans les résultats (fiche 08, schéma Card, sans tarif, distance ni
 * coordonnées), en trois lignes sous l'identité (UX-D6) : titre et extrait, spécialités, puis une
 * ligne de méta (ville, modalités, publics, langues). Une seule puce de disponibilité, à droite de
 * l'identité. Toute la carte mène à la fiche (lien du nom étendu) ; « Contacter » mène à son
 * formulaire (#contact).
 */
@Component({
  selector: 'pm-practitioner-card',
  imports: [
    MatButtonModule,
    RouterLink,
    AvailabilityComponent,
    PractitionerAvatarComponent,
    ProfessionChipComponent,
    VerifiedBadgeComponent,
  ],
  templateUrl: './practitioner-card.component.html',
  styleUrl: './practitioner-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PractitionerCardComponent {
  readonly card = input.required<PractitionerCard>();
  readonly vocabulary = input<DirectoryVocabulary | null>(null);
  readonly locale = input<AppLocale>('fr');

  protected readonly link = computed(() => practitionerPath(this.card().slug));
  /** Titre et extrait sur une ligne (maquette 08 : « Psychologue clinicienne · TCC et… »). */
  protected readonly summary = computed(() => {
    const title = this.card().titleLabel?.trim() ?? '';
    const excerpt = plainText(this.card().bioExcerpt);
    // Un extrait qui commence déjà par le titre ne le répète pas.
    if (!title || excerpt.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())) return excerpt;
    return excerpt ? `${title} · ${excerpt}` : title;
  });

  protected readonly specialties = computed(() =>
    this.labels('specialties', this.card().specialties.slice(0, CARD_SPECIALTIES_MAX)),
  );
  protected readonly audiences = computed(() =>
    this.labels('audiences', this.card().audiences).join(', '),
  );
  protected readonly modalities = computed(() =>
    this.labels('modalities', this.card().modalities).join(', '),
  );
  protected readonly languages = computed(() =>
    this.labels('languages', this.card().languages).join(', '),
  );

  private labels(kind: VocabularyKind, codes: string[]): string[] {
    return codes.map((code) => vocabularyLabel(this.vocabulary(), kind, code, this.locale()));
  }
}
