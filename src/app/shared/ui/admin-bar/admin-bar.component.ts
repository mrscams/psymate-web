import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { initials } from '../../util';

/** Routes de l'administration (fiches 20, 21, 22, 28 ; pas de Signalements en V1, G Q26). */
export const ADMIN_PATHS = {
  validation: '/admin/validation',
  practitioners: '/admin/praticiens',
  journal: '/admin/journal',
  vocabulary: '/admin/vocabulaire',
} as const;

/**
 * Barre d'administration (fiche 00 §5) : fond sombre, étiquette ADMIN, onglets Validation (n) ·
 * Praticiens · Journal · Vocabulaire, rappel « Aucune donnée patient n'est accessible depuis
 * l'administration », avatar ambre avec Déconnexion. Composant bête : la feature admin passe le
 * compteur et l'administrateur.
 */
@Component({
  selector: 'pm-admin-bar',
  imports: [MatMenuModule, RouterLink, RouterLinkActive],
  templateUrl: './admin-bar.component.html',
  styleUrl: './admin-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBarComponent {
  /** Dossiers à vérifier, affiché dans l'onglet Validation ; null tant qu'il n'est pas connu. */
  readonly pendingCount = input<number | null>(null);
  readonly user = input<{ displayName: string } | null>(null);
  readonly logout = output<void>();

  protected readonly paths = ADMIN_PATHS;
  protected readonly initials = computed(() => initials(this.user()?.displayName ?? ''));
}
