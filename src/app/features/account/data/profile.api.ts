import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  DirectoryVocabularyDto,
  Item,
  ProfilAnnuaireService,
  ProfileDto,
  UpdateProfileRequest,
  UpdateProfileRequestAvailabilityEnum,
  VocabulaireDeLannuaireService,
} from '../../../api';
import { Profession } from '../../../core/auth';

/** Disponibilité affichée sur la fiche (contrat : availability). */
export type Availability = 'accepting' | 'waitlist' | 'closed' | 'unknown';

export const AVAILABILITIES: readonly Availability[] = [
  'accepting',
  'waitlist',
  'closed',
  'unknown',
];

/** Limites du contrat (PUT /api/me/profile), reprises par les validateurs de forme du formulaire. */
export const PROFILE_LIMITS = {
  displayName: 120,
  titleLabel: 120,
  contactPhone: 30,
  contactEmail: 254,
  websiteUrl: 300,
  address: 300,
  city: 100,
  postalCode: 20,
  responseDelay: 60,
  fees: 500,
  bio: 1200,
  specialties: 8,
} as const;

/**
 * Champs éditables du profil d'annuaire : exactement ce que PUT /api/me/profile remplace. Les
 * textes vides valent '' côté écran (le serveur les rogne et les enregistre à null).
 */
export interface ProfileFields {
  displayName: string;
  titleLabel: string;
  showProfessionalNumber: boolean;
  availability: Availability;
  nextSlotAt: string;
  bio: string;
  specialties: string[];
  audiences: string[];
  modalities: string[];
  languages: string[];
  fees: string;
  contactPhone: string;
  showPhone: boolean;
  contactEmail: string;
  showEmail: boolean;
  websiteUrl: string;
  responseDelay: string;
  address: string;
  postalCode: string;
  city: string;
  showAddress: boolean;
  country: string;
}

/** Profil d'annuaire du praticien connecté (GET /api/me/profile) : champs éditables + lecture seule. */
export interface Profile extends ProfileFields {
  slug: string;
  published: boolean;
  publishedAt: string | null;
  /** Profession du compte (lecture seule ici). */
  profession: Profession | null;
  /** Une photo existe (photoAssetKey) ; aucune route ne la sert encore (contrat : photoUrl null). */
  hasPhoto: boolean;
  updatedAt: string | null;
}

/** Entrée d'une liste fermée de l'annuaire. */
export interface VocabularyItem {
  code: string;
  labelFr: string;
  labelEn: string | null;
}

/** Listes fermées de l'annuaire (GET /api/vocabulary/directory, G Q15). */
export interface DirectoryVocabulary {
  specialties: VocabularyItem[];
  audiences: VocabularyItem[];
  modalities: VocabularyItem[];
  languages: VocabularyItem[];
}

/**
 * Service de données du profil public (fiche 10) : GET / PUT /api/me/profile, photo, publication,
 * et la liste fermée GET /api/vocabulary/directory. Seul fichier de l'écran qui voit le client généré.
 */
@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly service = inject(ProfilAnnuaireService);
  private readonly vocabularyService = inject(VocabulaireDeLannuaireService);

  /** GET /api/me/profile (créé vide au premier appel par le serveur). */
  async load(): Promise<Profile> {
    return toProfile(await firstValueFrom(this.service.get()));
  }

  /** PUT /api/me/profile : contenu complet ; renvoie le profil enregistré. */
  async save(fields: ProfileFields): Promise<Profile> {
    return toProfile(await firstValueFrom(this.service.update(toRequest(fields))));
  }

  /** POST /api/me/profile/photo (multipart, partie file) ; renvoie le profil à jour. */
  async uploadPhoto(photo: Blob): Promise<Profile> {
    return toProfile(await firstValueFrom(this.service.uploadPhoto(photo)));
  }

  /** DELETE /api/me/profile/photo → 204 (idempotent). */
  async deletePhoto(): Promise<void> {
    await firstValueFrom(this.service.deletePhoto());
  }

  /** POST /api/me/profile/publish → 204, ou 409 PROFILE_INCOMPLETE avec missing[]. */
  async publish(): Promise<void> {
    await firstValueFrom(this.service.publish());
  }

  /** POST /api/me/profile/unpublish → 204 (idempotent). */
  async unpublish(): Promise<void> {
    await firstValueFrom(this.service.unpublish());
  }

  /** GET /api/vocabulary/directory : spécialités, publics, modalités, langues actives. */
  async vocabulary(): Promise<DirectoryVocabulary> {
    return toVocabulary(await firstValueFrom(this.vocabularyService.get1()));
  }
}

function toProfile(dto: ProfileDto): Profile {
  return {
    slug: dto.slug ?? '',
    published: dto.published ?? false,
    publishedAt: dto.publishedAt ?? null,
    profession: isProfession(dto.profession) ? dto.profession : null,
    hasPhoto: Boolean(dto.photoAssetKey),
    updatedAt: dto.updatedAt ?? null,
    displayName: dto.displayName ?? '',
    titleLabel: dto.titleLabel ?? '',
    showProfessionalNumber: dto.showProfessionalNumber ?? false,
    availability: isAvailability(dto.availability) ? dto.availability : 'unknown',
    nextSlotAt: dto.nextSlotAt ?? '',
    bio: dto.bio ?? '',
    specialties: [...(dto.specialties ?? [])],
    audiences: [...(dto.audiences ?? [])],
    modalities: [...(dto.modalities ?? [])],
    languages: [...(dto.languages ?? [])],
    fees: dto.fees ?? '',
    contactPhone: dto.contactPhone ?? '',
    showPhone: dto.showPhone ?? false,
    contactEmail: dto.contactEmail ?? '',
    showEmail: dto.showEmail ?? false,
    websiteUrl: dto.websiteUrl ?? '',
    responseDelay: dto.responseDelay ?? '',
    address: dto.address ?? '',
    postalCode: dto.postalCode ?? '',
    city: dto.city ?? '',
    showAddress: dto.showAddress ?? false,
    country: dto.country ?? 'FR',
  };
}

/** Corps complet du PUT : un champ absent reprendrait sa valeur par défaut côté serveur. */
export function toRequest(fields: ProfileFields): UpdateProfileRequest {
  return {
    displayName: fields.displayName,
    titleLabel: fields.titleLabel,
    showProfessionalNumber: fields.showProfessionalNumber,
    availability: fields.availability as UpdateProfileRequestAvailabilityEnum,
    // Date AAAA-MM-JJ : une chaîne vide serait illisible pour le serveur (400), on l'omet.
    nextSlotAt: fields.nextSlotAt || undefined,
    bio: fields.bio,
    specialties: [...fields.specialties],
    audiences: [...fields.audiences],
    modalities: [...fields.modalities],
    languages: [...fields.languages],
    fees: fields.fees,
    contactPhone: fields.contactPhone,
    showPhone: fields.showPhone,
    contactEmail: fields.contactEmail,
    showEmail: fields.showEmail,
    websiteUrl: fields.websiteUrl,
    responseDelay: fields.responseDelay,
    address: fields.address,
    postalCode: fields.postalCode,
    city: fields.city,
    showAddress: fields.showAddress,
    country: fields.country || 'FR',
  };
}

/** Champs éditables d'un profil (copie, pour initialiser le formulaire). */
export function fieldsOf(profile: Profile): ProfileFields {
  return {
    displayName: profile.displayName,
    titleLabel: profile.titleLabel,
    showProfessionalNumber: profile.showProfessionalNumber,
    availability: profile.availability,
    nextSlotAt: profile.nextSlotAt,
    bio: profile.bio,
    specialties: [...profile.specialties],
    audiences: [...profile.audiences],
    modalities: [...profile.modalities],
    languages: [...profile.languages],
    fees: profile.fees,
    contactPhone: profile.contactPhone,
    showPhone: profile.showPhone,
    contactEmail: profile.contactEmail,
    showEmail: profile.showEmail,
    websiteUrl: profile.websiteUrl,
    responseDelay: profile.responseDelay,
    address: profile.address,
    postalCode: profile.postalCode,
    city: profile.city,
    showAddress: profile.showAddress,
    country: profile.country,
  };
}

function toVocabulary(dto: DirectoryVocabularyDto): DirectoryVocabulary {
  return {
    specialties: (dto.specialties ?? []).map(toItem),
    audiences: (dto.audiences ?? []).map(toItem),
    modalities: (dto.modalities ?? []).map(toItem),
    languages: (dto.languages ?? []).map(toItem),
  };
}

function toItem(item: Item): VocabularyItem {
  return {
    code: item.code ?? '',
    labelFr: item.labelFr ?? item.code ?? '',
    labelEn: item.labelEn ?? null,
  };
}

function isAvailability(value: unknown): value is Availability {
  return typeof value === 'string' && (AVAILABILITIES as readonly string[]).includes(value);
}

function isProfession(value: unknown): value is Profession {
  return value === 'psychologist' || value === 'psychiatrist' || value === 'coach';
}
