import { PlatformLocation } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, LOCALE_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { localeSwitchHref, otherLocale, toAppLocale } from './core/i18n/locales';

/**
 * Coquille de l'application. M0-06 : une page vide et la bascule FR / EN.
 * La barre d'application (fiche 00) la remplacera en M0-09.
 */
@Component({
  selector: 'pm-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly baseHref = inject(PlatformLocation).getBaseHrefFromDOM();

  protected readonly locale = toAppLocale(inject(LOCALE_ID));
  protected readonly other = otherLocale(this.locale);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly switchHref = computed(() =>
    localeSwitchHref(this.baseHref, this.url(), this.other),
  );
}
