import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AnnuairePublicService,
  Card,
  ContactPublicService,
  DirectoryVocabularyDto,
  FacetCount as FacetCountDto,
  Item,
  PublicProfile,
  SearchResult,
} from '../../../api';
import {
  Availability,
  ContactMessage,
  DirectoryPage,
  DirectoryQuery,
  DirectoryVocabulary,
  FacetCount,
  PractitionerCard,
  PractitionerProfile,
  VocabularyItem,
} from './directory.models';

/**
 * Service de données de l'annuaire public (fiches 08, 09) : seul fichier de features/public qui
 * importe le client généré. Routes publiques, sans session : GET /api/public/directory,
 * GET /api/public/directory/vocabulary, GET et POST /api/public/directory/practitioners/{slug}….
 * Les erreurs arrivent en ApiProblem (core/http) ; un 429 sur un GET est rejoué par l'intercepteur.
 */
@Injectable({ providedIn: 'root' })
export class DirectoryApi {
  private readonly directory = inject(AnnuairePublicService);
  private readonly contact = inject(ContactPublicService);

  /** GET /api/public/directory : une page de 20 fiches et les facettes du lot filtré. */
  async search(query: DirectoryQuery): Promise<DirectoryPage> {
    const result = await firstValueFrom(
      this.directory.searchPublicDirectory(
        query.q.trim() || undefined,
        query.city.trim() || undefined,
        undefined,
        undefined,
        undefined,
        listOrUndefined(query.professions),
        listOrUndefined(query.specialties),
        listOrUndefined(query.modalities),
        listOrUndefined(query.audiences),
        listOrUndefined(query.languages),
        query.accepting || undefined,
        query.sort === 'relevance' ? undefined : query.sort,
        query.page > 1 ? query.page : undefined,
      ),
    );
    return toPage(result);
  }

  /** GET /api/public/directory/vocabulary : listes fermées et libellés FR/EN. */
  async vocabulary(): Promise<DirectoryVocabulary> {
    const dto: DirectoryVocabularyDto = await firstValueFrom(
      this.directory.getPublicDirectoryVocabulary(),
    );
    return {
      specialties: (dto.specialties ?? []).map(toItem),
      audiences: (dto.audiences ?? []).map(toItem),
      modalities: (dto.modalities ?? []).map(toItem),
      languages: (dto.languages ?? []).map(toItem),
    };
  }

  /** GET /api/public/directory/practitioners/{slug} : 404 PROFILE_NOT_FOUND si non publiée. */
  async profile(slug: string): Promise<PractitionerProfile> {
    return toProfile(await firstValueFrom(this.directory.getPublicPractitionerProfile(slug)));
  }

  /**
   * POST /api/public/directory/practitioners/{slug}/contact → 202 sans corps, y compris quand le
   * serveur ignore l'envoi en silence (piège rempli, envoi trop rapide) ; 422 et 429 en ApiProblem.
   */
  async sendMessage(slug: string, message: ContactMessage): Promise<void> {
    await firstValueFrom(
      this.contact.submitContactRequest(slug, {
        name: message.name.trim(),
        email: message.email.trim(),
        subject: message.subject.trim() || undefined,
        message: message.message.trim(),
        consent: message.consent,
        website: message.website || undefined,
        formShownAt: message.formShownAt,
      }),
    );
  }
}

function listOrUndefined(values: string[]): string[] | undefined {
  return values.length ? values : undefined;
}

function toItem(item: Item): VocabularyItem {
  return {
    code: item.code ?? '',
    labelFr: item.labelFr ?? item.code ?? '',
    labelEn: item.labelEn ?? null,
  };
}

function toCounts(counts: FacetCountDto[] | undefined): FacetCount[] {
  return (counts ?? []).map((facet) => ({ code: facet.code ?? '', count: facet.count ?? 0 }));
}

function toAvailability(value: string | undefined): Availability {
  return value === 'accepting' || value === 'waitlist' || value === 'closed' ? value : 'unknown';
}

function toCard(card: Card): PractitionerCard {
  return {
    slug: card.slug ?? '',
    displayName: card.displayName ?? '',
    profession: card.profession ?? '',
    titleLabel: card.titleLabel ?? null,
    verified: card.verified ?? false,
    availability: toAvailability(card.availability),
    bioExcerpt: card.bioExcerpt ?? null,
    city: card.city ?? null,
    specialties: card.specialties ?? [],
    audiences: card.audiences ?? [],
    modalities: card.modalities ?? [],
    languages: card.languages ?? [],
  };
}

function toPage(result: SearchResult): DirectoryPage {
  const facets = result.facets ?? {};
  return {
    items: (result.items ?? []).map(toCard),
    facets: {
      professions: toCounts(facets.professions),
      specialties: toCounts(facets.specialties),
      modalities: toCounts(facets.modalities),
      audiences: toCounts(facets.audiences),
      languages: toCounts(facets.languages),
    },
    page: result.page ?? 1,
    totalPages: result.totalPages ?? 0,
    total: result.total ?? 0,
  };
}

function toProfile(profile: PublicProfile): PractitionerProfile {
  return {
    slug: profile.slug ?? '',
    displayName: profile.displayName ?? '',
    profession: profile.profession ?? '',
    titleLabel: profile.titleLabel ?? null,
    professionalNumber: profile.professionalNumber ?? null,
    verified: profile.verified ?? false,
    availability: toAvailability(profile.availability),
    bio: profile.bio ?? null,
    specialties: profile.specialties ?? [],
    audiences: profile.audiences ?? [],
    modalities: profile.modalities ?? [],
    languages: profile.languages ?? [],
    city: profile.city ?? null,
    postalCode: profile.postalCode ?? null,
    country: profile.country ?? null,
    address: profile.address ?? null,
    phone: profile.phone ?? null,
    email: profile.email ?? null,
    websiteUrl: profile.websiteUrl ?? null,
    fees: profile.fees ?? null,
    responseDelay: profile.responseDelay ?? null,
    nextSlotAt: profile.nextSlotAt ?? null,
  };
}
