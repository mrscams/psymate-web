import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  Injector,
  LOCALE_ID,
  afterNextRender,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { formatDate, toAppLocale } from '../../../core/i18n';
import { StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { paramsFromQuery } from '../data/directory-query';
import {
  ContactMessage,
  EMPTY_QUERY,
  MODALITIES,
  PractitionerProfile,
} from '../data/directory.models';
import { PractitionerStore } from '../data/practitioner.store';
import { VocabularyStore } from '../data/vocabulary.store';
import { PUBLIC_FEATURE_PATHS } from '../public-paths';
import { parseBio } from '../ui/bio';
import { ContactFormComponent } from '../ui/contact-form.component';
import { professionLabel, professionPlural, vocabularyLabel, VocabularyKind } from '../ui/labels';
import {
  AvailabilityComponent,
  PractitionerAvatarComponent,
  ProfessionChipComponent,
  VerifiedBadgeComponent,
} from '../ui/practitioner-badges.component';
import { PublicMeta } from './page-meta';

/**
 * /praticiens/:slug (fiche 09, B3 flux 7) : carte identité, présentation, pratique, contacts
 * affichés seulement, cabinet, formulaire de contact. Une section vide n'est pas rendue. Profil
 * inconnu ou non publié : 404, page « introuvable » non indexée. Rendue dans le navigateur
 * (app.routes.server.ts) ; titre, description, Open Graph et JSON-LD posés au chargement.
 */
@Component({
  selector: 'pm-practitioner-page',
  imports: [
    MatButtonModule,
    RouterLink,
    StateComponent,
    AvailabilityComponent,
    ContactFormComponent,
    PractitionerAvatarComponent,
    ProfessionChipComponent,
    VerifiedBadgeComponent,
  ],
  providers: [PractitionerStore],
  templateUrl: './practitioner.page.html',
  styleUrl: './practitioner.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PractitionerPage {
  /** Paramètre de route :slug (withComponentInputBinding). */
  readonly slug = input.required<string>();

  protected readonly store = inject(PractitionerStore);
  private readonly vocabularyStore = inject(VocabularyStore);
  private readonly meta = inject(PublicMeta);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Fragment de l'URL : #contact (« Contacter » d'une fiche résumée, « Prendre contact »). */
  private readonly fragment = toSignal(inject(ActivatedRoute).fragment, { initialValue: null });
  private readonly destroyRef = inject(DestroyRef);
  protected readonly locale = toAppLocale(inject(LOCALE_ID));

  protected readonly paths = PUBLIC_FEATURE_PATHS;
  protected readonly stateKind = stateKind;
  protected readonly profile = computed(() => this.store.profile().data);

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'erreur de la fiche@@public.practitioner.error.retry:Réessayer`,
    handler: () => void this.store.load(this.slug()),
  };

  // Libellés de la fiche (liste fermée, langue de l'interface).
  protected readonly specialties = computed(() => this.labels('specialties', 'specialties'));
  protected readonly audiences = computed(() => this.labels('audiences', 'audiences'));
  protected readonly languages = computed(() => this.labels('languages', 'languages').join(', '));
  /** Les trois modalités, proposées ou non (fiche 09) ; rien si le praticien n'en a déclaré aucune. */
  protected readonly modalities = computed(() => {
    const profile = this.profile();
    if (!profile?.modalities.length) return [];
    return MODALITIES.map((code) => ({
      code,
      label: vocabularyLabel(this.vocabularyStore.lists(), 'modalities', code, this.locale),
      offered: profile.modalities.includes(code),
    }));
  });
  protected readonly offeredModalities = computed(() =>
    this.modalities()
      .filter((modality) => modality.offered)
      .map((modality) => modality.label.toLocaleLowerCase(this.locale))
      .join(', '),
  );
  protected readonly bio = computed(() => parseBio(this.profile()?.bio ?? null));
  protected readonly professionLabel = computed(() =>
    professionLabel(this.profile()?.profession ?? ''),
  );
  protected readonly nextSlot = computed(() => {
    const date = this.profile()?.nextSlotAt;
    return date ? formatDate(date, this.locale, 'long', 'UTC') : null;
  });

  /** Fil d'Ariane : Annuaire › Profession › Ville › Nom, avec la recherche correspondante. */
  protected readonly crumbs = computed(() => {
    const profile = this.profile();
    if (!profile) return [];
    const professions = profile.profession ? [profile.profession] : [];
    const crumbs = [
      {
        label: professionPlural(profile.profession),
        params: paramsFromQuery({ ...EMPTY_QUERY, professions }),
      },
    ];
    if (profile.city) {
      crumbs.push({
        label: profile.city,
        params: paramsFromQuery({ ...EMPTY_QUERY, professions, city: profile.city }),
      });
    }
    return crumbs;
  });

  /** Adresse du cabinet pour « Ouvrir dans un plan » (lien sortant, pas de carte tierce, fiche 09). */
  protected readonly mapHref = computed(() => {
    const profile = this.profile();
    if (!profile?.address) return null;
    const query = [profile.address, profile.postalCode, profile.city].filter(Boolean).join(' ');
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
  });

  protected readonly hasContactMeans = computed(() => {
    const profile = this.profile();
    return !!(profile?.phone || profile?.email || profile?.websiteUrl);
  });

  constructor() {
    // Rendue dans le navigateur seulement (app.routes.server.ts) ; garde pour le serveur de dev.
    if (this.browser) {
      void this.vocabularyStore.ensureLoaded();
      effect(() => {
        const slug = this.slug();
        untracked(() => void this.store.load(slug));
      });
    }
    // #contact : le formulaire n'existe qu'une fois la fiche chargée ; on y va à ce moment-là.
    effect(() => {
      if (this.fragment() === 'contact' && this.profile()) {
        untracked(() => this.scrollToContact());
      }
    });
    // Balises : fiche chargée → indexable ; introuvable → noindex (fiche 09).
    effect(() => {
      const profile = this.profile();
      const notFound = this.store.notFound();
      untracked(() => {
        if (profile) this.applyMeta(profile);
        else if (notFound) {
          this.meta.apply(
            {
              title: $localize`:Titre d'onglet, fiche introuvable@@public.practitioner.notFound.pageTitle:Fiche introuvable · PsyMate`,
              description: $localize`:Description d'une fiche introuvable@@public.practitioner.notFound.description:Cette fiche n'existe pas ou n'est plus publiée dans l'annuaire PsyMate.`,
              robots: 'noindex,follow',
              canonicalPath: null,
            },
            this.destroyRef,
          );
        }
      });
    });
  }

  /** Défile jusqu'au formulaire et y place le focus (titre focalisable), après le rendu. */
  protected scrollToContact(): void {
    afterNextRender(
      () => {
        const title = this.document.getElementById('contact-title');
        if (!title) return;
        title.scrollIntoView({ block: 'start' });
        title.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  protected sendMessage(message: ContactMessage): void {
    void this.store.send(message);
  }

  /** Partager : feuille de partage du système si elle existe, sinon copie du lien. */
  protected async share(): Promise<void> {
    const profile = this.profile();
    const view = this.document.defaultView;
    if (!profile || !view) return;
    const url = view.location.href.split('#')[0];
    const navigator = view.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.displayName, url });
      } catch {
        // partage annulé par le visiteur
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success(
        $localize`:Toast après copie du lien de la fiche@@public.practitioner.share.copied:Lien de la fiche copié.`,
      );
    } catch {
      this.toast.warning(
        $localize`:Toast si la copie du lien échoue@@public.practitioner.share.failed:Impossible de copier le lien. Copiez l'adresse de la page.`,
      );
    }
  }

  private labels(kind: VocabularyKind, field: 'specialties' | 'audiences' | 'languages'): string[] {
    const profile = this.profile();
    if (!profile) return [];
    return profile[field].map((code) =>
      vocabularyLabel(this.vocabularyStore.lists(), kind, code, this.locale),
    );
  }

  private applyMeta(profile: PractitionerProfile): void {
    const profession = professionLabel(profile.profession);
    const where = profile.city ? ` · ${profile.city}` : '';
    const description =
      (profile.bio ?? '').replace(/\s+/g, ' ').trim().slice(0, 155) ||
      $localize`:Description par défaut d'une fiche@@public.practitioner.meta.description:${profession}:profession: ${profile.displayName}:name: dans l'annuaire PsyMate.`;
    this.meta.apply(
      {
        title: `${profile.displayName} · ${profession}${where} · PsyMate`,
        description,
        robots: 'index,follow',
        canonicalPath: `${PUBLIC_FEATURE_PATHS.practitioners}/${encodeURIComponent(profile.slug)}`,
        ogType: 'profile',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: profile.displayName,
          jobTitle: profession,
          ...(profile.city
            ? { address: { '@type': 'PostalAddress', addressLocality: profile.city } }
            : {}),
        },
      },
      this.destroyRef,
    );
  }
}
