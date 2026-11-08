import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { SEARCH_DEBOUNCE_MS, effectiveQuery } from './data/search.model';

/** /patients/<uuid>[/onglet] : un écran patient, où le champ de la barre cherche dans le dossier. */
const PATIENT_PATH =
  /^\/patients\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/[^/?#]*)?/i;

export interface PatientLocation {
  patientId: string;
  /** Segment d'onglet (timeline, graph, search, fiche) ; '' pour la vue d'ensemble. */
  tab: string;
}

/** L'écran patient d'une URL, ou null hors dossier. */
export function patientLocation(url: string): PatientLocation | null {
  const match = PATIENT_PATH.exec(url);
  if (!match) return null;
  return { patientId: match[1].toLowerCase(), tab: (match[2] ?? '').slice(1) };
}

/** Ce que la page de recherche ouverte sait faire quand la barre parle (Entrée). */
export interface SearchBarHost {
  /** Entrée dans le champ : ouvrir le résultat sélectionné dans la timeline. */
  submit(): void;
}

/**
 * Branchement du champ de la barre d'application (shared/ui/app-bar : `query`, `searchSubmit`)
 * sur la recherche du dossier (fiche 07, B2) : sur un écran patient, `/` met le focus dans le
 * champ (app-bar) et la saisie ouvre /patients/:id/search?q=… après 250 ms sans frappe, à partir
 * de 2 caractères ; sur l'écran de recherche, elle met à jour ?q= (sans entrée d'historique).
 * Retient l'écran d'où l'on vient pour qu'Échap y revienne. Hors dossier, le champ ne fait rien.
 * Fourni à la racine : app.component le lit et lui transmet les sorties de la barre.
 */
@Injectable({ providedIn: 'root' })
export class DossierSearchBar {
  private readonly router = inject(Router);
  private readonly url = signal(this.router.url);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private host: SearchBarHost | null = null;
  /** URL de l'écran patient quitté pour la recherche, par patient. */
  private origin: { patientId: string; url: string } | null = null;

  /** Texte du champ de la barre. */
  readonly query = signal('');

  /** Sur un écran patient, le champ annonce sa portée. */
  readonly placeholder = computed(() =>
    patientLocation(this.url())
      ? $localize`:Champ de recherche de la barre sur un écran patient@@search.bar.placeholder:Rechercher dans le dossier`
      : undefined,
  );

  constructor() {
    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        const before = patientLocation(this.url());
        const url = this.router.url;
        this.url.set(url);
        const here = patientLocation(url);
        // En quittant la recherche ou l'écran (autre onglet, autre patient), le champ se vide ;
        // un simple changement de paramètre sur le même écran ne coupe pas une frappe en cours.
        const sameScreen =
          !!before && !!here && before.patientId === here.patientId && before.tab === here.tab;
        if (here?.tab !== 'search' && !sameScreen) {
          this.cancel();
          this.query.set('');
        }
        if (!here || (this.origin && this.origin.patientId !== here.patientId)) this.origin = null;
      });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.cancel();
    });
  }

  /** Saisie dans le champ de la barre (queryChange). */
  input(text: string): void {
    this.query.set(text);
    this.cancel();
    if (!patientLocation(this.router.url)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync(text);
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Entrée dans le champ (searchSubmit) : recherche immédiate, ou ouverture de la sélection. */
  submit(text: string): void {
    const here = patientLocation(this.router.url);
    if (!here) return;
    const pending = this.timer !== null;
    this.cancel();
    if (here.tab === 'search' && !pending && this.host) {
      this.host.submit();
      return;
    }
    void this.sync(text);
  }

  /** La page de recherche s'inscrit à son arrivée ; renvoie la désinscription. */
  attach(host: SearchBarHost): () => void {
    this.host = host;
    return () => {
      if (this.host === host) this.host = null;
    };
  }

  /** La page relit ?q= : la barre l'affiche, sauf pendant une frappe pas encore partie. */
  showQuery(q: string): void {
    if (this.timer === null) this.query.set(q);
  }

  /** L'écran à retrouver par Échap : celui d'où l'on vient, sinon l'onglet 1 du dossier. */
  returnUrl(patientId: string): string {
    return this.origin?.patientId === patientId ? this.origin.url : `/patients/${patientId}`;
  }

  private async sync(text: string): Promise<void> {
    const url = this.router.url;
    const here = patientLocation(url);
    if (!here) return;
    const tree = this.router.parseUrl(url);
    if (here.tab === 'search') {
      const q = text.trim() ? text : null;
      if ((tree.queryParams['q'] ?? null) === q) return;
      tree.queryParams = { ...tree.queryParams, q };
      if (q === null) delete tree.queryParams['q'];
      await this.router.navigateByUrl(tree, { replaceUrl: true });
      return;
    }
    if (!effectiveQuery(text)) return;
    this.origin = { patientId: here.patientId, url };
    await this.router.navigate(['/patients', here.patientId, 'search'], {
      queryParams: { q: text },
    });
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
