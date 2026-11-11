import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { AppLocale } from '../../../core/i18n';
import { uniqueId } from '../../../shared/util';
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

/** Spécialités visibles avant « Afficher les n autres » (maquette 08). */
export const SPECIALTIES_VISIBLE = 6;

export interface FacetOption {
  code: string;
  label: string;
  /** Null tant que la première réponse n'est pas arrivée : aucun compteur affiché. */
  count: number | null;
  checked: boolean;
  /** Compteur à 0 et non coché : visible mais désactivé (fiche 08). */
  disabled: boolean;
}

/** Comment une facette replie ses valeurs secondaires. */
type MoreKind = 'specialties' | 'audiences' | 'languages';

export interface FacetGroup {
  filter: ListFilter;
  legend: string;
  /** Valeurs toujours visibles. */
  options: FacetOption[];
  /** Valeurs repliées sous un bouton (vide : pas de bouton). */
  more: FacetOption[];
  moreKind: MoreKind | null;
}

export interface FilterToggle {
  filter: ListFilter;
  code: string;
  checked: boolean;
}

/**
 * Colonne de filtres de l'annuaire (fiche 08, UX-D6) : en-tête « Filtres » + « Tout effacer », un
 * fieldset par facette avec les compteurs de la réponse (exacts jusqu'à 500 fiches, G Q48), la case
 * « Accepte de nouveaux patients ». Profession et modalités : liste fixe, codes à 0 visibles mais
 * désactivés. Spécialités (`facets.specialties`) : seules les valeurs présentes, 6 visibles puis
 * « Afficher les n autres ». Publics et langues : les valeurs présentes, les autres repliées sous
 * « Autres publics (n) » / « Autres langues (n) ». Une valeur cochée reste toujours visible.
 * Composant de présentation : la page tient la recherche et l'URL ; elle projette le bouton de
 * fermeture du panneau mobile dans l'en-tête.
 */
@Component({
  selector: 'pm-directory-filters',
  imports: [NgTemplateOutlet],
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
  /** Identifiant du titre « Filtres » (le panneau mobile s'y rattache). */
  readonly titleId = input('directory-filters-title');

  readonly filterToggle = output<FilterToggle>();
  readonly acceptingChange = output<boolean>();
  readonly clearAll = output<void>();

  protected readonly idPrefix = uniqueId('pm-facet');
  /** Facettes dépliées (état d'écran). */
  private readonly expanded = signal<ReadonlySet<ListFilter>>(new Set());

  protected readonly groups = computed<FacetGroup[]>(() => {
    const vocabulary = this.vocabulary();
    const locale = this.locale();
    const label =
      (kind: 'specialties' | 'audiences' | 'modalities' | 'languages') => (code: string) =>
        vocabularyLabel(vocabulary, kind, code, locale);
    const codes = (kind: 'audiences' | 'languages') =>
      vocabulary?.[kind].map((item) => item.code) ?? [];

    const groups: FacetGroup[] = [
      {
        filter: 'professions',
        legend: $localize`:Légende de la facette profession@@public.filters.professions:Profession`,
        options: this.options('professions', [...PROFESSIONS], professionLabel),
        more: [],
        moreKind: null,
      },
    ];

    // Spécialités : la facette ne rend que les codes présents (triés par nombre décroissant).
    const specialties = this.options('specialties', [], label('specialties')).filter(
      (option) => option.checked || (option.count ?? 0) > 0,
    );
    if (specialties.length) {
      const visible = specialties.filter(
        (option, index) => index < SPECIALTIES_VISIBLE || option.checked,
      );
      groups.push({
        filter: 'specialties',
        legend: $localize`:Légende de la facette spécialités@@public.filters.specialties:Spécialités`,
        options: visible,
        more: specialties.filter((option) => !visible.includes(option)),
        moreKind: 'specialties',
      });
    }

    groups.push(
      this.split(
        'audiences',
        $localize`:Légende de la facette publics@@public.filters.audiences:Publics`,
        this.options('audiences', codes('audiences'), label('audiences')),
      ),
      {
        filter: 'modalities',
        legend: $localize`:Légende de la facette modalités@@public.filters.modalities:Modalités`,
        options: this.options('modalities', [...MODALITIES], label('modalities')),
        more: [],
        moreKind: null,
      },
      this.split(
        'languages',
        $localize`:Légende de la facette langues@@public.filters.languages:Langues`,
        this.options('languages', codes('languages'), label('languages')),
      ),
    );
    return groups;
  });

  protected readonly hasFilters = computed(() => {
    const query = this.query();
    return (
      query.accepting ||
      (['professions', 'specialties', 'audiences', 'modalities', 'languages'] as const).some(
        (filter) => query[filter].length > 0,
      )
    );
  });

  protected isExpanded(filter: ListFilter): boolean {
    return this.expanded().has(filter);
  }

  protected toggleMore(filter: ListFilter): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  protected moreLabel(group: FacetGroup): string {
    const n = group.more.length;
    switch (group.moreKind) {
      case 'specialties':
        if (this.isExpanded(group.filter)) {
          return $localize`:Replie les spécialités secondaires@@public.filters.specialties.less:Afficher moins`;
        }
        return n === 1
          ? $localize`:Déplie la dernière spécialité@@public.filters.specialties.moreOne:Afficher 1 autre`
          : $localize`:Déplie les spécialités secondaires@@public.filters.specialties.more:Afficher les ${n}:count: autres`;
      case 'audiences':
        return $localize`:Déplie les publics sans fiche@@public.filters.audiences.more:Autres publics (${n}:count:)`;
      case 'languages':
        return $localize`:Déplie les langues sans fiche@@public.filters.languages.more:Autres langues (${n}:count:)`;
      default:
        return '';
    }
  }

  /** Publics et langues : valeurs présentes visibles, les autres repliées. */
  private split(filter: 'audiences' | 'languages', legend: string, all: FacetOption[]): FacetGroup {
    const present = (option: FacetOption) => option.checked || (option.count ?? 0) > 0;
    return {
      filter,
      legend,
      options: all.filter(present),
      more: all.filter((option) => !present(option)),
      moreKind: filter,
    };
  }

  /**
   * Options d'une facette : la liste connue (fixe ou vocabulaire), complétée des codes renvoyés par
   * la facette ou présents dans la recherche, avec leur compteur (0 si absent de la réponse). Ordre :
   * celui de la liste connue, sinon celui de la facette (nombre décroissant).
   */
  private options(
    filter: ListFilter,
    known: string[],
    label: (code: string) => string,
  ): FacetOption[] {
    const facets = this.facets();
    const counts: FacetCount[] = facets?.[filter] ?? [];
    const selected = this.query()[filter];
    const all = [...new Set([...known, ...counts.map((c) => c.code), ...selected])];
    return all.map((code) => {
      const count = facets ? (counts.find((c) => c.code === code)?.count ?? 0) : null;
      const checked = selected.includes(code);
      return {
        code,
        label: label(code),
        count,
        checked,
        disabled: count === 0 && !checked,
      };
    });
  }
}
