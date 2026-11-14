import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';

import { AppLocale } from '../../../core/i18n';
import { ShortcutService } from '../../../core/shortcuts';
import { initials } from '../../util';

/** Qui est connecté, pour l'avatar et son menu. */
export interface AppBarUser {
  displayName: string;
}

/** Routes de Mon compte (fiche 00 §3), reprises par la navigation de compte. */
export const ACCOUNT_PATHS = {
  profile: '/mon-compte/profil-public',
  preferences: '/mon-compte/preferences',
  emotions: '/mon-compte/emotions',
  verification: '/mon-compte/dossier-professionnel',
  security: '/mon-compte/securite',
  data: '/mon-compte/donnees',
} as const;

/**
 * Barre d'application du praticien (fiche 00 §1) : 48 px, logo + PsyMate, section courante, champ
 * de recherche ouvert par `/` (recherche globale, ou du dossier sur un écran patient : la feature
 * décide ce qu'elle fait de `search`), bouton de langue FR / EN, avatar avec menu (Mon compte,
 * Déconnexion). Lien « Aller au contenu » vers #main. Composant bête : la coquille lui passe la
 * session et reçoit `logout`.
 *
 * UX-S8 : avec `navigation`, un bouton ☰ à gauche du logo, visible seulement sous 900 px (le rail
 * de navigation disparaît) ; il émet `navigationToggle` et la coquille ouvre le tiroir de
 * navigation (shared/ui/nav-rail) ; `navigationOpen` porte son `aria-expanded`.
 */
@Component({
  selector: 'pm-app-bar',
  imports: [MatButtonModule, MatMenuModule, RouterLink],
  templateUrl: './app-bar.component.html',
  styleUrl: './app-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppBarComponent {
  /** Section courante (« Patients », « Mon compte »). */
  readonly section = input<string>();
  /** Fil d'Ariane sous la section (nom du patient, « Recherche »). */
  readonly crumb = input<string>();
  readonly user = input<AppBarUser | null>(null);
  /** Lien vers la même page dans l'autre langue (core/i18n localeSwitchHref). */
  readonly switchHref = input.required<string>();
  readonly switchLang = input.required<AppLocale>();
  readonly showSearch = input(true);
  /** Bouton ☰ du tiroir de navigation, sous 900 px (UX-S8). */
  readonly navigation = input(false);
  /** Le tiroir de navigation est ouvert (aria-expanded du bouton ☰). */
  readonly navigationOpen = input(false);
  readonly searchPlaceholder = input<string>();
  /** Texte du champ de recherche ; la feature le lit ou l'écrit (fiche 07). */
  readonly query = model('');

  /** Entrée dans le champ de recherche. */
  readonly searchSubmit = output<string>();
  readonly logout = output<void>();
  /** Bouton ☰ : ouvrir le tiroir de navigation. */
  readonly navigationToggle = output<void>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly shortcuts = inject(ShortcutService);

  protected readonly homePath = '/patients';
  protected readonly accountPath = ACCOUNT_PATHS.profile;
  protected readonly initials = computed(() => initials(this.user()?.displayName ?? ''));
  protected readonly placeholder = computed(
    () =>
      this.searchPlaceholder() ??
      $localize`:Champ de recherche de la barre d'application@@appBar.search.placeholder:Rechercher`,
  );

  constructor() {
    effect((onCleanup) => {
      if (!this.showSearch()) return;
      const release = this.shortcuts.register('/', () => this.focusSearch());
      onCleanup(release);
    });
  }

  /** Donne le focus au champ de recherche (touche `/`). */
  focusSearch(): void {
    const input = this.searchInput()?.nativeElement;
    input?.focus();
    input?.select();
  }

  protected submitSearch(): void {
    this.searchSubmit.emit(this.query().trim());
  }
}
