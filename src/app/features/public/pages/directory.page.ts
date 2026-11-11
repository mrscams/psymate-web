import { CdkTrapFocus } from '@angular/cdk/a11y';
import { BreakpointObserver } from '@angular/cdk/layout';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  LOCALE_ID,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HttpNotices } from '../../../core/http';
import { toAppLocale } from '../../../core/i18n';
import { StateAction, StateComponent } from '../../../shared/ui';
import { isRefreshing, stateKind } from '../../../shared/util';
import {
  activeFilterCount,
  LIST_FILTERS,
  paramsFromQuery,
  queryFromParams,
  sameQuery,
  sanitizeQuery,
} from '../data/directory-query';
import {
  DIRECTORY_TEXT_MAX,
  DirectoryQuery,
  DirectorySort,
  ListFilter,
  PROFESSIONS,
} from '../data/directory.models';
import { DirectoryStore } from '../data/directory.store';
import { VocabularyStore } from '../data/vocabulary.store';
import { PUBLIC_FEATURE_PATHS } from '../public-paths';
import { DirectoryFiltersComponent, FilterToggle } from '../ui/directory-filters.component';
import { itemLabel, professionLabel, vocabularyLabel } from '../ui/labels';
import { PaginationComponent } from '../ui/pagination.component';
import { PractitionerCardComponent } from '../ui/practitioner-card.component';
import { PublicMeta } from './page-meta';

/** Délai d'inactivité avant qu'un changement de filtre parte (fiche 08). */
export const FILTER_DEBOUNCE_MS = 300;

/** Sous cette largeur, les filtres se replient sous « Filtres (n) » (fiche 08, 390 px). */
export const FILTERS_PANEL_QUERY = '(max-width: 760px)';

/** Un filtre actif, retirable en un clic (état C, fiche 08). */
interface ActiveChip {
  filter: ListFilter | 'accepting' | 'city' | 'q';
  code: string;
  label: string;
}

/**
 * /annuaire (fiche 08, B3 flux 7) : recherche (mot-clé, ville, profession, spécialité), facettes
 * avec compteurs, fiches résumées, pagination par page, aucun résultat avec suggestions. L'URL
 * porte toute la recherche : la page la lit, le DirectoryStore interroge l'API. Prérendue au build
 * (formulaire et textes) ; les résultats se chargent dans le navigateur après hydratation.
 */
@Component({
  selector: 'pm-directory-page',
  imports: [
    CdkTrapFocus,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    StateComponent,
    DirectoryFiltersComponent,
    PaginationComponent,
    PractitionerCardComponent,
  ],
  templateUrl: './directory.page.html',
  styleUrl: './directory.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryPage {
  protected readonly store = inject(DirectoryStore);
  protected readonly vocabularyStore = inject(VocabularyStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notices = inject(HttpNotices);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly locale = toAppLocale(inject(LOCALE_ID));

  protected readonly paths = PUBLIC_FEATURE_PATHS;
  protected readonly professions = PROFESSIONS;
  protected readonly professionLabel = professionLabel;
  protected readonly textMax = DIRECTORY_TEXT_MAX;
  protected readonly stateKind = stateKind;

  /** Recherche de l'URL, telle que lue (avant le tri des codes inconnus). */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly urlQuery = computed(() => queryFromParams(this.params()));
  private readonly urlQ = computed(() => this.urlQuery().q);
  private readonly urlCity = computed(() => this.urlQuery().city);

  /** Filtres modifiés qui n'ont pas encore atteint l'URL (300 ms d'inactivité). */
  private readonly draft = signal<DirectoryQuery | null>(null);
  /** Ce que la page montre : le brouillon s'il existe, sinon l'URL. */
  protected readonly query = computed(() => this.draft() ?? this.urlQuery());

  /** Saisie libre (état d'écran) : part à la soumission du formulaire, pas à chaque touche. */
  protected readonly qText = signal('');
  protected readonly cityText = signal('');
  /** Filtres repliés sous « Filtres (n) » sur petit écran. */
  protected readonly filtersOpen = signal(false);
  /** Petit écran : la colonne de filtres devient un panneau plein écran. */
  protected readonly compact = toSignal(
    inject(BreakpointObserver)
      .observe(FILTERS_PANEL_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  /** Panneau ouvert : dialogue modal, focus piégé, Échap ferme. */
  protected readonly panelMode = computed(() => this.compact() && this.filtersOpen());
  private readonly filtersToggle = viewChild('filtersToggle', { read: ElementRef<HTMLElement> });
  private readonly filtersPanel = viewChild('filtersPanel', { read: ElementRef<HTMLElement> });
  private readonly injector = inject(Injector);

  protected readonly vocabulary = this.vocabularyStore.lists;
  protected readonly result = this.store.result;
  protected readonly page = this.store.page;
  protected readonly refreshing = computed(() => isRefreshing(this.result()));
  protected readonly filterCount = computed(() => activeFilterCount(this.query()));
  protected readonly resultTotal = computed(() => this.page()?.total ?? 0);

  /** Options du sélecteur Spécialité : liste fermée, compteur de la facette (0 si absent). */
  protected readonly specialtyOptions = computed(() => {
    const counts = this.store.facets()?.specialties ?? [];
    return (this.vocabulary()?.specialties ?? []).map((item) => ({
      code: item.code,
      label: itemLabel(item, this.locale),
      count: counts.find((facet) => facet.code === item.code)?.count ?? 0,
    }));
  });

  protected readonly selectedProfession = computed(() => {
    const professions = this.query().professions;
    return professions.length === 1 ? professions[0] : '';
  });
  protected readonly selectedSpecialty = computed(() => {
    const specialties = this.query().specialties;
    return specialties.length === 1 ? specialties[0] : '';
  });

  /** Ville de la dernière recherche lancée (« N praticiens à Paris »). */
  protected readonly searchedCity = computed(() => this.store.query()?.city.trim() ?? '');

  // 429 (fiche 08, G Q24) : « réessayez dans n s », Rechercher désactivé jusque-là.
  private readonly now = signal(Date.now());
  protected readonly retrySeconds = computed(() => {
    const until = this.store.rateLimitedUntil();
    return until === null ? 0 : Math.max(0, Math.ceil((until - this.now()) / 1000));
  });
  protected readonly rateLimited = computed(() => this.retrySeconds() > 0);

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'erreur de l'annuaire@@public.directory.error.retry:Réessayer`,
    handler: () => void this.store.search(this.searchable(this.urlQuery()), { force: true }),
  };

  /** Filtres actifs, retirables un par un (état C). */
  protected readonly chips = computed<ActiveChip[]>(() => {
    const query = this.query();
    const vocabulary = this.vocabulary();
    const chips: ActiveChip[] = [];
    if (query.q) chips.push({ filter: 'q', code: query.q, label: `« ${query.q} »` });
    if (query.city) chips.push({ filter: 'city', code: query.city, label: query.city });
    for (const filter of LIST_FILTERS) {
      for (const code of query[filter]) {
        const label =
          filter === 'professions'
            ? professionLabel(code)
            : vocabularyLabel(vocabulary, filter, code, this.locale);
        chips.push({ filter, code, label });
      }
    }
    if (query.accepting) {
      chips.push({
        filter: 'accepting',
        code: 'true',
        label: $localize`:Filtre actif « accepte de nouveaux patients »@@public.directory.chip.accepting:Accepte de nouveaux patients`,
      });
    }
    return chips;
  });

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private lastNoticeSeq = this.notices.notice()?.seq ?? 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(PublicMeta).apply(
      {
        description: $localize`:Description de l'annuaire pour les moteurs de recherche@@public.directory.meta.description:Trouvez un psychologue, un psychiatre ou un coach dont le dossier a été vérifié, et contactez-le directement.`,
        robots: 'index,follow',
        canonicalPath: PUBLIC_FEATURE_PATHS.directory,
      },
      destroyRef,
    );
    destroyRef.onDestroy(() => this.cancelDebounce());

    // Panneau de filtres ouvert (sous 760 px) : la page derrière ne défile plus ; rétablie à la
    // fermeture, au passage en grand écran et à la sortie de la page.
    const root = inject(DOCUMENT).documentElement;
    effect((onCleanup) => {
      if (!this.panelMode()) return;
      const previous = root.style.overflow;
      root.style.overflow = 'hidden';
      onCleanup(() => (root.style.overflow = previous));
    });

    // La saisie libre suit le mot-clé et la ville de l'URL (lien partagé, retour arrière), mais
    // seulement quand ils changent : un filtre appliqué pendant la saisie ne l'efface pas.
    effect(() => {
      const q = this.urlQ();
      const city = this.urlCity();
      untracked(() => {
        this.qText.set(q);
        this.cityText.set(city);
      });
    });
    effect(() => {
      this.urlQuery();
      untracked(() => this.draft.set(null));
    });

    if (!this.browser) return; // prérendu : aucune donnée de l'API dans le HTML

    void this.vocabularyStore.ensureLoaded();

    // Recherche de l'URL, une fois le vocabulaire connu (codes inconnus ignorés, fiche 08).
    effect(() => {
      const query = this.urlQuery();
      const status = this.vocabularyStore.vocabulary().status;
      if (status === 'idle' || status === 'loading') return;
      untracked(() => {
        const clean = this.searchable(query);
        // L'URL n'est corrigée que si la liste fermée est connue (pas pendant une panne).
        if (status === 'loaded' && !sameQuery(clean, query)) {
          void this.navigate(clean, { replaceUrl: true });
          return;
        }
        void this.store.search(clean);
      });
    });

    // 429 vu par l'intercepteur sur une requête de l'annuaire : délai affiché, recherche retenue.
    effect(() => {
      const notice = this.notices.notice();
      if (!notice || notice.kind !== 'rate-limited' || notice.seq <= this.lastNoticeSeq) return;
      this.lastNoticeSeq = notice.seq;
      untracked(() => this.store.rateLimited(notice.retryAfterSeconds));
    });

    // Compte à rebours du 429, puis reprise de la recherche retenue.
    effect((onCleanup) => {
      if (this.store.rateLimitedUntil() === null) return;
      const timer = setInterval(() => {
        this.now.set(Date.now());
        if (this.retrySeconds() === 0) void this.store.resume();
      }, 1000);
      this.now.set(Date.now());
      onCleanup(() => clearInterval(timer));
    });
  }

  /** Rechercher (ou Entrée dans un champ) : mot-clé et ville, retour en page 1, tout de suite. */
  protected submit(): void {
    if (this.rateLimited()) return;
    this.cancelDebounce();
    const next = {
      ...this.query(),
      q: this.qText().trim().slice(0, DIRECTORY_TEXT_MAX),
      city: this.cityText().trim().slice(0, DIRECTORY_TEXT_MAX),
      page: 1,
    };
    this.draft.set(null);
    if (sameQuery(next, this.urlQuery())) {
      void this.store.search(this.searchable(next), { force: true });
    } else {
      void this.navigate(next);
    }
  }

  protected setProfession(code: string): void {
    this.change({ professions: code ? [code] : [] });
  }

  protected setSpecialty(code: string): void {
    this.change({ specialties: code ? [code] : [] });
  }

  protected setSort(sort: DirectorySort): void {
    this.change({ sort });
  }

  protected toggleFilter({ filter, code, checked }: FilterToggle): void {
    const values = this.query()[filter].filter((value) => value !== code);
    this.change({ [filter]: checked ? [...values, code] : values });
  }

  protected setAccepting(accepting: boolean): void {
    this.change({ accepting });
  }

  /** « Tout effacer » : filtres retirés, mot-clé et ville gardés. */
  protected clearFilters(): void {
    this.change({
      professions: [],
      specialties: [],
      audiences: [],
      modalities: [],
      languages: [],
      accepting: false,
    });
  }

  protected removeChip(chip: ActiveChip): void {
    switch (chip.filter) {
      case 'q':
        this.apply({ q: '' });
        return;
      case 'city':
        this.apply({ city: '' });
        return;
      case 'accepting':
        this.apply({ accepting: false });
        return;
      default:
        this.apply({ [chip.filter]: this.query()[chip.filter].filter((c) => c !== chip.code) });
    }
  }

  // Suggestions de l'état « aucun résultat » (fiche 08, état C).
  protected readonly canWiden = computed(() => !!this.query().city || !!this.query().q);
  protected readonly lastChip = computed(() => {
    const chips = this.chips().filter((chip) => chip.filter !== 'q' && chip.filter !== 'city');
    return chips.at(-1) ?? null;
  });
  protected readonly canIncludeVideo = computed(
    () => !!this.query().city || !this.query().modalities.includes('video'),
  );

  /** Élargir : sans ville ni mot-clé, filtres gardés. */
  protected widen(): void {
    this.apply({ city: '', q: '' });
  }

  /** Inclure la visio : une consultation en visio ne dépend pas de la ville. */
  protected includeVideo(): void {
    const modalities = this.query().modalities.includes('video')
      ? this.query().modalities
      : [...this.query().modalities, 'video'];
    this.apply({ city: '', modalities });
  }

  /** « Filtres (n) » : le panneau s'ouvre et reçoit le focus (il est nommé par son titre). */
  protected openFilters(): void {
    this.filtersOpen.set(true);
    afterNextRender(() => this.filtersPanel()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** Croix, Échap ou « Voir les n praticiens » : le focus revient au bouton « Filtres (n) ». */
  protected closeFilters(): void {
    if (!this.filtersOpen()) return;
    this.filtersOpen.set(false);
    // Le bouton reste affiché derrière le panneau : le focus y revient tout de suite.
    this.filtersToggle()?.nativeElement.focus();
  }

  /** Changement de filtre : visible tout de suite, envoyé après 300 ms d'inactivité, page 1. */
  private change(patch: Partial<DirectoryQuery>): void {
    if (this.rateLimited()) return;
    const next = { ...this.query(), ...patch, page: 1 };
    this.draft.set(next);
    this.cancelDebounce();
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.navigate(next, { replaceUrl: true });
    }, FILTER_DEBOUNCE_MS);
  }

  /** Changement immédiat (puce retirée, suggestion) : nouvelle entrée d'historique. */
  private apply(patch: Partial<DirectoryQuery>): void {
    if (this.rateLimited()) return;
    this.cancelDebounce();
    this.draft.set(null);
    void this.navigate({ ...this.query(), ...patch, page: 1 });
  }

  private navigate(query: DirectoryQuery, extras: { replaceUrl?: boolean } = {}) {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: paramsFromQuery(query),
      ...extras,
    });
  }

  private searchable(query: DirectoryQuery): DirectoryQuery {
    const status = this.vocabularyStore.vocabulary().status;
    return sanitizeQuery(query, status === 'loaded' ? this.vocabulary() : null);
  }

  private cancelDebounce(): void {
    if (this.debounce !== null) clearTimeout(this.debounce);
    this.debounce = null;
  }
}
