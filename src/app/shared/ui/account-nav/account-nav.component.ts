import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { VerificationStatus } from '../../../core/auth';
import { ACCOUNT_PATHS } from '../app-bar/app-bar.component';

interface AccountEntry {
  path: string;
  label: string;
  badge?: { text: string; tone: 'success' | 'warning' } | null;
}

/** Pastille de l'entrée Dossier professionnel selon le statut (fiche 00 §3). */
export function verificationBadge(
  status: VerificationStatus | null,
): { text: string; tone: 'success' | 'warning' } | null {
  switch (status) {
    case 'docs_pending':
    case 'under_review':
      return {
        text: $localize`:Pastille du dossier professionnel@@accountNav.badge.pending:en attente`,
        tone: 'warning',
      };
    case 'needs_more':
      return {
        text: $localize`:Pastille du dossier professionnel@@accountNav.badge.needsMore:complément demandé`,
        tone: 'warning',
      };
    case 'approved':
      return {
        text: $localize`:Pastille du dossier professionnel@@accountNav.badge.approved:approuvé`,
        tone: 'success',
      };
    default:
      return null;
  }
}

/**
 * Navigation Mon compte (fiche 00 §3) : colonne 220 px avec le nom, profession · ville, et six
 * entrées ; pastille « publié » sur Profil public, pastille d'état sur Dossier professionnel. Sous
 * 760 px, onglets horizontaux. `aria-current="page"` sur l'entrée active.
 */
@Component({
  selector: 'pm-account-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav
      class="account-nav"
      aria-label="Mon compte"
      i18n-aria-label="Étiquette de la navigation Mon compte@@accountNav.label"
    >
      <div class="who">
        <p class="name">{{ name() }}</p>
        @if (subtitle(); as subtitle) {
          <p class="subtitle">{{ subtitle }}</p>
        }
      </div>
      <ul>
        @for (entry of entries(); track entry.path) {
          <li>
            <a [routerLink]="entry.path" routerLinkActive="active" ariaCurrentWhenActive="page">
              <span class="label">{{ entry.label }}</span>
              @if (entry.badge; as badge) {
                <span class="badge" [class]="badge.tone">{{ badge.text }}</span>
              }
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styleUrl: './account-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountNavComponent {
  readonly name = input.required<string>();
  /** « Psychologue · Lyon ». */
  readonly subtitle = input<string>();
  readonly published = input(false);
  readonly verificationStatus = input<VerificationStatus | null>(null);

  protected readonly entries = computed<AccountEntry[]>(() => [
    {
      path: ACCOUNT_PATHS.profile,
      label: $localize`:Entrée de Mon compte@@accountNav.profile:Profil public`,
      badge: this.published()
        ? {
            text: $localize`:Pastille du profil public publié@@accountNav.badge.published:publié`,
            tone: 'success',
          }
        : null,
    },
    {
      path: ACCOUNT_PATHS.preferences,
      label: $localize`:Entrée de Mon compte@@accountNav.preferences:Préférences`,
    },
    {
      path: ACCOUNT_PATHS.emotions,
      label: $localize`:Entrée de Mon compte@@accountNav.emotions:Émotions personnalisées`,
    },
    {
      path: ACCOUNT_PATHS.verification,
      label: $localize`:Entrée de Mon compte@@accountNav.verification:Dossier professionnel`,
      badge: verificationBadge(this.verificationStatus()),
    },
    {
      path: ACCOUNT_PATHS.security,
      label: $localize`:Entrée de Mon compte@@accountNav.security:Compte et sécurité`,
    },
    {
      path: ACCOUNT_PATHS.data,
      label: $localize`:Entrée de Mon compte@@accountNav.data:Données et export`,
    },
  ]);
}
