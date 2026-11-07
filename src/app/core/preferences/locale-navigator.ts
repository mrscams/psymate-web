import { DOCUMENT, PlatformLocation } from '@angular/common';
import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { Router } from '@angular/router';

import { AppLocale, localeSwitchHref, toAppLocale } from '../i18n';

/**
 * Passage d'une langue à l'autre : les deux langues sont deux bundles (/fr/, /en/), donc une
 * navigation complète vers la même route dans l'autre bundle (core/i18n localeSwitchHref). Isolé
 * dans un service pour que les tests le remplacent.
 */
@Injectable({ providedIn: 'root' })
export class LocaleNavigator {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly baseHref = inject(PlatformLocation).getBaseHrefFromDOM();

  /** Langue du bundle en cours d'exécution. */
  readonly current: AppLocale = toAppLocale(inject(LOCALE_ID));

  /** Recharge l'application dans la langue demandée, sur la route courante ; rien si c'est déjà elle. */
  goTo(locale: AppLocale): void {
    if (locale === this.current) return;
    const href = localeSwitchHref(this.baseHref, this.router.url, locale);
    this.document.defaultView?.location.assign(href);
  }
}
