import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  LOCALE_ID,
  inject,
  viewChild,
} from '@angular/core';

import { toAppLocale } from '../../../../core/i18n';
import { DirectoryVocabulary, ProfileFields } from '../../data/profile.api';
import { availabilityLabel, initialsOf, labelsOf } from './profile-labels';

/** Longueur de la présentation dans l'aperçu (carte réduite). */
const BIO_EXCERPT = 220;
/** Spécialités montrées avant « +n ». */
const SPECIALTIES_SHOWN = 3;

/**
 * Aperçu « ce que voit un visiteur » (fiche 10, colonne droite) : carte réduite de la fiche
 * publique, mise à jour pendant la saisie. Même règle que la fiche (écran 9) : un champ vide n'est
 * pas rendu, un contact n'apparaît que si son interrupteur « Afficher » est actif. Pas d'aria-live
 * (trop bavard) : le bouton « Rafraîchir l'aperçu » amène le focus sur la carte à jour (lecteur
 * d'écran, et à 390 px où l'aperçu est sous le formulaire). Visible pour tous depuis UX-G2b.
 */
@Component({
  selector: 'pm-profile-preview',
  template: `
    <div class="head">
      <h2 id="preview-title" i18n="Titre de l'aperçu@@profile.preview.title">
        Aperçu · ce que voit un visiteur
      </h2>
      <button
        type="button"
        class="refresh"
        (click)="focusCard()"
        i18n="Bouton qui place le focus sur la carte d'aperçu@@profile.preview.refresh"
      >
        Rafraîchir l'aperçu
      </button>
    </div>
    <article #card class="card" tabindex="-1" aria-labelledby="preview-title" data-testid="preview">
      <div class="identity">
        <div class="avatar" aria-hidden="true">
          @if (photoUrl(); as url) {
            <img [src]="url" alt="" />
          } @else {
            <span>{{ initials() }}</span>
          }
        </div>
        <div class="who">
          @if (fields().displayName.trim(); as name) {
            <p class="name">{{ name }}</p>
          }
          @if (profession(); as label) {
            <span class="profession">{{ label }}</span>
          }
          @if (fields().titleLabel.trim(); as title) {
            <p class="line">{{ title }}</p>
          }
          @if (placeLine(); as place) {
            <p class="line">{{ place }}</p>
          }
          @if (availability(); as text) {
            <p class="availability" [class]="fields().availability">
              <span class="dot" aria-hidden="true"></span>{{ text }}
            </p>
          }
        </div>
      </div>

      @if (bioExcerpt(); as bio) {
        <p class="bio">{{ bio }}</p>
      }

      @if (specialties().length > 0) {
        <ul class="chips">
          @for (label of shownSpecialties(); track label) {
            <li>{{ label }}</li>
          }
          @if (moreSpecialties() > 0) {
            <li>+{{ moreSpecialties() }}</li>
          }
        </ul>
      }

      @if (fields().fees.trim(); as fees) {
        <p class="line">
          <span class="key" i18n="Tarif dans l'aperçu@@profile.preview.fees">Tarif :</span>
          {{ fees }}
        </p>
      }

      @if (contacts().length > 0) {
        <div class="contacts">
          <p class="key" i18n="Contacts affichés dans l'aperçu@@profile.preview.contacts">
            Contact affiché
          </p>
          @for (contact of contacts(); track contact) {
            <p class="contact">{{ contact }}</p>
          }
        </div>
      }

      @if (fields().websiteUrl.trim(); as website) {
        <p class="line">
          <span class="key" i18n="Site web dans l'aperçu@@profile.preview.website">Site web :</span>
          {{ website }}
        </p>
      }

      <span class="cta" aria-hidden="true" i18n="Bouton factice de l'aperçu@@profile.preview.cta"
        >Prendre contact</span
      >
    </article>
    <p class="note" i18n="Note sous l'aperçu@@profile.preview.note">
      L'aperçu se met à jour pendant la saisie. Les champs vides ne sont pas affichés sur la fiche.
    </p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-label-medium);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }
    /*
     * Visible (UX-G2b) : masqué hors focus, il mesurait 18 × 10 px pour la sonde des cibles. Même
     * registre que les boutons de la carte de publication (bordure, rayon 8 px), en plus compact :
     * 32 px de haut quelle que soit la police.
     */
    .refresh {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 0 12px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-medium);
      cursor: pointer;
    }
    .refresh:hover {
      background: var(--surface-sunken);
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px;
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      background: var(--surface-raised);
    }
    .identity {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .avatar {
      flex: 0 0 64px;
      width: 64px;
      height: 64px;
      border-radius: 12px;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--primary-tint);
      color: var(--primary-hover);
      font: 600 22px/1 var(--font-ui);
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .who {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }
    .name {
      margin: 0;
      color: var(--text-primary);
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .profession {
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--primary-tint);
      color: var(--primary-hover);
      font: var(--mat-sys-label-medium);
      font-weight: 600;
    }
    .line,
    .bio,
    .contact {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
    .bio {
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
    }
    .key {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
      font-weight: 600;
    }
    .availability {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font: var(--mat-sys-body-small);
      font-weight: 600;
      color: var(--text-secondary);
    }
    .availability.accepting {
      color: var(--success);
    }
    .availability.waitlist {
      color: var(--warning);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .chips li {
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      background: var(--surface-sunken);
      color: var(--text-primary);
      font: var(--mat-sys-body-small);
    }
    .contacts {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 12px;
      border-top: 1px solid var(--border-subtle);
    }
    .contact {
      color: var(--text-primary);
      font-family: var(--font-mono);
    }
    .cta {
      display: block;
      padding: 10px;
      border-radius: 8px;
      background: var(--primary);
      color: var(--primary-on);
      text-align: center;
      font: var(--mat-sys-label-large);
    }
    .note {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePreviewComponent {
  readonly fields = input.required<ProfileFields>();
  readonly profession = input<string>('');
  readonly vocabulary = input<DirectoryVocabulary | null>(null);
  readonly photoUrl = input<string | null>(null);

  private readonly locale = toAppLocale(inject(LOCALE_ID));
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  protected readonly initials = computed(() => initialsOf(this.fields().displayName));

  protected readonly placeLine = computed(() => {
    const fields = this.fields();
    const modalities = labelsOf(fields.modalities, this.vocabulary()?.modalities, this.locale);
    return [fields.city.trim(), modalities.join(', ')].filter(Boolean).join(' · ');
  });

  protected readonly availability = computed(() => {
    const value = this.fields().availability;
    return value === 'unknown' ? null : availabilityLabel(value);
  });

  protected readonly bioExcerpt = computed(() => {
    const bio = this.fields().bio.trim();
    if (bio.length <= BIO_EXCERPT) return bio;
    return `${bio.slice(0, BIO_EXCERPT).trimEnd()}…`;
  });

  protected readonly specialties = computed(() =>
    labelsOf(this.fields().specialties, this.vocabulary()?.specialties, this.locale),
  );
  protected readonly shownSpecialties = computed(() =>
    this.specialties().slice(0, SPECIALTIES_SHOWN),
  );
  protected readonly moreSpecialties = computed(() =>
    Math.max(0, this.specialties().length - SPECIALTIES_SHOWN),
  );

  /** Moyens de contact affichés (contrat : téléphone, e-mail, adresse avec leur interrupteur). */
  protected readonly contacts = computed(() => {
    const fields = this.fields();
    const contacts: string[] = [];
    if (fields.showPhone && fields.contactPhone.trim()) contacts.push(fields.contactPhone.trim());
    if (fields.showEmail && fields.contactEmail.trim()) contacts.push(fields.contactEmail.trim());
    if (fields.showAddress && fields.address.trim()) {
      contacts.push(
        [fields.address.trim(), [fields.postalCode.trim(), fields.city.trim()].join(' ').trim()]
          .filter(Boolean)
          .join(', '),
      );
    }
    return contacts;
  });

  protected focusCard(): void {
    this.card()?.nativeElement.focus();
  }
}
