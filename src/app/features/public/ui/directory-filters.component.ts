import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { AppLocale } from '../../../core/i18n';
import {
  DirectoryFacets,
  DirectoryQuery,
  DirectoryVocabulary,
  FacetCount,
  ListFilter,
  MODALITIES,
  PROFESSIONS,
} from '../data/directory.models';
import { professionLabel, vocabularyLabel } from './labels';

export interface FacetOption {
  code: string;
  label: string;
  count: number;
  checked: boolean;
  /** Compteur à 0 et non coché : visible mais désactivé (fiche 08). */
  disabled: boolean;
}

export interface FacetGroup {
  filter: Exclude<ListFilter, 'specialties'>;
  legend: string;
  options: FacetOption[];
}

export interface FilterToggle {
  filter: ListFilter;
  code: string;
  checked: boolean;
}

/**
 * Colonne de filtres de l'annuaire (fiche 08) : un fieldset par facette (profession, publics,
 * modalités, langues) avec les compteurs de la réponse (exacts jusqu'à 500 fiches, G Q48), la case
 * « Accepte de nouveaux patients » et « Tout effacer ». Les codes à 0 restent visibles, désactivés.
 * Composant de présentation : la page tient la recherche et l'URL.
 */
@Component({
  selector: 'pm-directory-filters',
  imports: [MatButtonModule, MatCheckboxModule],
  templateUrl: './directory-filters.component.html',
  styleUrl: './directory-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryFiltersComponent {
  readonly query = input.required<DirectoryQuery>();
  readonly facets = input<DirectoryFacets | null>(null);
  readonly vocabulary = input<DirectoryVocabulary | null>(null);
  readonly locale = input<AppLocale>('fr');
  /** Pendant un 429 : les filtres attendent la fin du délai. */
  readonly disabled = input(false);

  readonly filterToggle = output<FilterToggle>();
  readonly acceptingChange = output<boolean>();
  readonly clearAll = output<void>();

  protected readonly groups = computed<FacetGroup[]>(() => {
    const vocabulary = this.vocabulary();
    const locale = this.locale();
    const codes = (kind: 'audiences' | 'languages') =>
      vocabulary?.[kind].map((item) => item.code) ?? [];
    return [
      {
        filter: 'professions',
        legend: $localize`:Légende de la facette profession@@public.filters.professions:Profession`,
        options: this.options('professions', [...PROFESSIONS], professionLabel),
      },
      {
        filter: 'audiences',
        legend: $localize`:Légende de la facette publics@@public.filters.audiences:Publics`,
        options: this.options('audiences', codes('audiences'), (code) =>
          vocabularyLabel(vocabulary, 'audiences', code, locale),
        ),
      },
      {
        filter: 'modalities',
        legend: $localize`:Légende de la facette modalités@@public.filters.modalities:Modalités`,
        options: this.options('modalities', [...MODALITIES], (code) =>
          vocabularyLabel(vocabulary, 'modalities', code, locale),
        ),
      },
      {
        filter: 'languages',
        legend: $localize`:Légende de la facette langues@@public.filters.languages:Langues`,
        options: this.options('languages', codes('languages'), (code) =>
          vocabularyLabel(vocabulary, 'languages', code, locale),
        ),
      },
    ];
  });

  /**
   * Options d'une facette : la liste connue (fixe ou vocabulaire), complétée des codes renvoyés par
   * la facette ou présents dans la recherche, avec leur compteur (0 si absent de la réponse).
   */
  private options(
    filter: FacetGroup['filter'],
    known: string[],
    label: (code: string) => string,
  ): FacetOption[] {
    const counts: FacetCount[] = this.facets()?.[filter] ?? [];
    const selected = this.query()[filter];
    const all = [...new Set([...known, ...counts.map((c) => c.code), ...selected])];
    const facetsKnown = this.facets() !== null;
    return all.map((code) => {
      const count = counts.find((c) => c.code === code)?.count ?? 0;
      const checked = selected.includes(code);
      return {
        code,
        label: label(code),
        count,
        checked,
        disabled: facetsKnown && count === 0 && !checked,
      };
    });
  }

  protected readonly hasFilters = computed(() => {
    const query = this.query();
    return (
      query.accepting ||
      (['professions', 'specialties', 'audiences', 'modalities', 'languages'] as const).some(
        (filter) => query[filter].length > 0,
      )
    );
  });
}
