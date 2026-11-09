import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { globalShortcuts, ShortcutService } from '../../core/shortcuts';
import { SidePanelRef, SidePanelService } from '../../shared/ui';
import type { ShortcutsHelpData } from './panels/shortcuts-help.panel';
import { HelpRow, helpRows } from './ui/shortcuts-help.model';

/** Où l'on est, pour griser les gestes de formulaire sans objet (planche 29 §6). */
export interface HelpContext {
  /** Dossier d'un patient (/patients/:id/**) : barre de saisie et éditeur d'entrée. */
  folder: boolean;
  /** Un formulaire qui s'enregistre par Ctrl+Entrée (fiche patient, création). */
  form: boolean;
}

/** /patients/:id/** hors fiche et création : le dossier ; /patients/nouveau, …/fiche : formulaires. */
export function helpContext(url: string): HelpContext {
  const path = url.split(/[?#]/)[0];
  const form = /^\/patients\/(nouveau|[^/]+\/fiche)\/?$/.test(path);
  const folder = !form && /^\/patients\/[^/]+(\/|$)/.test(path);
  return { folder, form };
}

/**
 * Gestes de la barre de commande et des formulaires (fiche 05, M6-02), décrits ici : ils ne passent
 * pas par le registre (modificateur, ou action dans un champ).
 */
export function formShortcuts(context: HelpContext): HelpRow[] {
  const enter = $localize`:Nom de la touche Entrée@@patientShell.help.enterKey:Entrée`;
  return [
    {
      keys: [enter],
      label: $localize`:Aide des raccourcis, barre de saisie@@patientShell.help.enter:Barre de saisie du dossier : enregistrer l'entrée`,
      available: context.folder,
    },
    {
      keys: ['Ctrl', enter],
      combo: true,
      label: $localize`:Aide des raccourcis, Ctrl+Entrée@@patientShell.help.ctrlEnter:Enregistrer le formulaire · depuis la barre de saisie, ouvrir l'éditeur prérempli`,
      available: context.folder || context.form,
    },
    {
      keys: ['Ctrl', 'S'],
      combo: true,
      label: $localize`:Aide des raccourcis, Ctrl+S@@patientShell.help.ctrlS:Enregistrer l'entrée en brouillon, à compléter après la séance`,
      available: context.folder,
    },
  ];
}

/**
 * Aide des raccourcis (planche 29 §6, M7-03) : ouvre le panneau, alimenté par le registre au moment
 * de l'ouverture (core/shortcuts : liste de référence et inscriptions actives avec leur
 * description) et par les gestes de formulaire décrits ci-dessus. Ouvert par `?`
 * (ShortcutsHelpComponent), par « Voir les raccourcis » de l'accueil (features/patients). Le
 * panneau s'empile sur un panneau déjà ouvert (éditeur d'entrée) au lieu de le fermer. Le
 * composant du panneau est chargé à la première ouverture : seuls la touche et ce service sont dans
 * le paquet initial.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutsHelp {
  private readonly shortcuts = inject(ShortcutService);
  private readonly panels = inject(SidePanelService);
  private readonly router = inject(Router);
  private ref: SidePanelRef | null = null;
  /** Chargement du panneau en cours (première ouverture) : un second ? n'ouvre rien de plus. */
  private opening = false;

  /** Le panneau d'aide est ouvert. */
  readonly isOpen = signal(false);

  async open(): Promise<void> {
    if (this.ref || this.opening) return;
    // Photo avant l'ouverture : le panneau inscrit ensuite son propre Échap, sans description.
    const rows = helpRows(
      globalShortcuts(),
      this.shortcuts.active(),
      formShortcuts(helpContext(this.router.url)),
    );
    this.opening = true;
    let ref: SidePanelRef | null;
    try {
      const { ShortcutsHelpPanel } = await import('./panels/shortcuts-help.panel');
      ref = this.panels.open<InstanceType<typeof ShortcutsHelpPanel>, ShortcutsHelpData>(
        ShortcutsHelpPanel,
        { data: { rows }, width: 420, stack: true },
      );
    } finally {
      this.opening = false;
    }
    if (!ref) return;
    this.ref = ref;
    this.isOpen.set(true);
    void ref.closed.then(() => {
      if (this.ref === ref) {
        this.ref = null;
        this.isOpen.set(false);
      }
    });
  }

  close(): void {
    this.ref?.close();
  }

  /** `?` : ouvre, ou ferme si l'aide est déjà ouverte. */
  toggle(): void {
    if (this.ref) this.close();
    else void this.open();
  }
}

/**
 * Branche la touche `?` sur l'aide pour toute l'application connectée (fiche 00 : registre global,
 * inactif dans un champ). Posé une fois par la coquille (app.component, habillage praticien) ; ne
 * rend rien.
 */
@Component({
  selector: 'pm-shortcuts-help',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShortcutsHelpComponent {
  constructor() {
    const help = inject(ShortcutsHelp);
    inject(DestroyRef).onDestroy(
      inject(ShortcutService).register(
        '?',
        () => help.toggle(),
        $localize`:Aide des raccourcis@@shortcuts.help:Afficher cette aide`,
      ),
    );
  }
}
