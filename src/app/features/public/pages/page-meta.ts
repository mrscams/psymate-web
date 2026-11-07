import { DOCUMENT, PlatformLocation } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { APP_LOCALES } from '../../../core/i18n';

export type RobotsPolicy = 'index,follow' | 'noindex,follow';

export interface PublicPageMeta {
  /** Titre d'onglet ; absent : celui de la route (data title) reste. */
  title?: string;
  description: string;
  robots: RobotsPolicy;
  /** Chemin de la page sans la langue (« /annuaire ») ; null : pas d'URL canonique. */
  canonicalPath: string | null;
  /** og:type : website par défaut, profile pour une fiche praticien. */
  ogType?: 'website' | 'profile';
  /** Données structurées JSON-LD (fiche 09 : Person minimal), ou null. */
  jsonLd?: Record<string, unknown> | null;
}

const MANAGED_SELECTOR = '[data-pm-public-meta]';

/**
 * Balises des pages publiques (fiches 08, 09, 24) : description, robots, Open Graph, URL
 * canonique, alternatives de langue et JSON-LD, écrites dans le HTML prérendu comme dans le
 * navigateur. Chaque page appelle `apply` ; les balises sont retirées quand la page est quittée,
 * pour qu'aucune page authentifiée n'hérite d'un « index » ou d'une URL canonique.
 */
@Injectable({ providedIn: 'root' })
export class PublicMeta {
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);
  private readonly baseHref = inject(PlatformLocation).getBaseHrefFromDOM();

  /** Pose les balises et les retire à la destruction de la page appelante. */
  apply(page: PublicPageMeta, destroyRef?: DestroyRef): void {
    if (page.title) this.title.setTitle(page.title);
    const title = page.title ?? this.title.getTitle();
    this.tag('name', 'description', page.description);
    this.tag('name', 'robots', page.robots);
    this.tag('property', 'og:title', title);
    this.tag('property', 'og:description', page.description);
    this.tag('property', 'og:type', page.ogType ?? 'website');
    this.tag('property', 'og:site_name', 'PsyMate');
    this.links(page.canonicalPath);
    this.jsonLd(page.jsonLd ?? null);
    destroyRef?.onDestroy(() => this.clear());
  }

  /** Retire toutes les balises posées par `apply`. */
  clear(): void {
    for (const name of ['description', 'robots']) this.meta.removeTag(`name="${name}"`);
    for (const property of ['og:title', 'og:description', 'og:type', 'og:site_name']) {
      this.meta.removeTag(`property="${property}"`);
    }
    this.document.head.querySelectorAll(MANAGED_SELECTOR).forEach((node) => node.remove());
  }

  private tag(attribute: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attribute]: key, content }, `${attribute}="${key}"`);
  }

  /** URL canonique et alternatives fr / en, relatives à la racine du site (/fr/…, /en/…). */
  private links(path: string | null): void {
    this.document.head.querySelectorAll(`link${MANAGED_SELECTOR}`).forEach((node) => node.remove());
    if (path === null) return;
    const root = this.baseHref.replace(/\/(fr|en)\/?$/, '/').replace(/\/?$/, '/');
    const href = (locale: string) => `${root}${locale}${path}`;
    const current = /\/en\/?$/.test(this.baseHref) ? 'en' : 'fr';
    this.link({ rel: 'canonical', href: href(current) });
    for (const locale of APP_LOCALES) {
      this.link({ rel: 'alternate', hreflang: locale, href: href(locale) });
    }
  }

  private link(attributes: Record<string, string>): void {
    const link = this.document.createElement('link');
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    link.setAttribute('data-pm-public-meta', '');
    this.document.head.appendChild(link);
  }

  private jsonLd(data: Record<string, unknown> | null): void {
    this.document.head
      .querySelectorAll(`script${MANAGED_SELECTOR}`)
      .forEach((node) => node.remove());
    if (!data) return;
    const script = this.document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-pm-public-meta', '');
    // « < » échappé : le texte d'un praticien ne peut pas fermer la balise script.
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }
}
