import { ChangeDetectionStrategy, Component, effect, inject, LOCALE_ID } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { HttpNotice, HttpNotices } from '../../../core/http';
import { formatDelay } from '../../../core/i18n';
import { Toast, ToastLevel, ToastService } from './toast.service';

/**
 * Pile de toasts en bas à droite (planche 29 §5) : `aria-live="polite"`, icône + mot du niveau,
 * action optionnelle, bouton de fermeture. Posé une fois dans la coquille de l'application. Relaie
 * aussi les avis transverses de core/http : 429 (« réessayez dans N s ») et retour du réseau.
 */
@Component({
  selector: 'pm-toast-outlet',
  imports: [MatButtonModule],
  templateUrl: './toast-outlet.component.html',
  styleUrl: './toast-outlet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastOutletComponent {
  protected readonly toasts = inject(ToastService);
  private readonly notices = inject(HttpNotices);
  private readonly locale = inject(LOCALE_ID);
  private lastSeq = 0;

  protected readonly closeLabel = $localize`:Bouton de fermeture d'un toast@@toast.close:Fermer`;

  constructor() {
    effect(() => {
      const notice = this.notices.notice();
      if (!notice || notice.seq === this.lastSeq) return;
      this.lastSeq = notice.seq;
      this.toasts.show(toToast(notice, this.locale));
    });
  }

  protected levelLabel(level: ToastLevel): string {
    switch (level) {
      case 'success':
        return $localize`:Mot du niveau d'un toast@@toast.level.success:Succès`;
      case 'info':
        return $localize`:Mot du niveau d'un toast@@toast.level.info:Information`;
      case 'warning':
        return $localize`:Mot du niveau d'un toast@@toast.level.warning:Avertissement`;
    }
  }

  protected act(toast: Toast): void {
    toast.action?.handler();
    this.toasts.dismiss(toast.id);
  }
}

function toToast(notice: HttpNotice, locale: string): { level: ToastLevel; message: string } {
  if (notice.kind === 'rate-limited') {
    const delay =
      notice.retryAfterSeconds === null ? null : formatDelay(notice.retryAfterSeconds, locale);
    const message =
      delay === null
        ? $localize`:Toast 429 sans délai connu@@toast.rateLimited.noDelay:Trop de requêtes, réessayez dans un instant. Votre saisie est conservée.`
        : $localize`:Toast 429 avec le délai Retry-After@@toast.rateLimited:Trop de requêtes, réessayez dans ${delay}:delay:. Votre saisie est conservée.`;
    return { level: 'warning', message };
  }
  const n = notice.replayed;
  const message =
    n === 0
      ? $localize`:Toast de retour du réseau, rien à renvoyer@@toast.reconnected.none:Connexion rétablie.`
      : n === 1
        ? $localize`:Toast de retour du réseau, un envoi@@toast.reconnected.one:Connexion rétablie · 1 brouillon renvoyé.`
        : $localize`:Toast de retour du réseau, plusieurs envois@@toast.reconnected.many:Connexion rétablie · ${n}:count: brouillons renvoyés.`;
  return { level: 'success', message };
}
