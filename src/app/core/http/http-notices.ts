import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** 429 : « Trop de requêtes, réessayez dans N s » ; replaying dit si un GET est rejoué tout seul. */
export interface RateLimitedNotice {
  kind: 'rate-limited';
  retryAfterSeconds: number | null;
  replaying: boolean;
  seq: number;
}

/** Retour du réseau : nombre de requêtes retenues qui repartent (« 2 brouillons envoyés »). */
export interface ReconnectedNotice {
  kind: 'reconnected';
  replayed: number;
  seq: number;
}

export type HttpNotice = RateLimitedNotice | ReconnectedNotice;

/**
 * Ce que les intercepteurs transverses ont à dire à l'interface (handbook §6.4 ; fiche 00 §7 ;
 * planche 29) : le dernier avis (toast), l'état hors ligne (bandeau) et les rejeux en attente.
 * core ne connaît pas shared/ui : les composants de shared/ui/toast et de shared/ui/status-banner
 * lisent ces signaux.
 */
@Injectable({ providedIn: 'root' })
export class HttpNotices {
  private seq = 0;
  private readonly retry$ = new Subject<void>();

  /** Dernier avis à montrer en toast ; chaque avis a un seq distinct, même texte ou pas. */
  readonly notice = signal<HttpNotice | null>(null);
  /** Vrai dès qu'une requête n'a reçu aucune réponse (statut 0) ; faux au premier succès. */
  readonly offline = signal(false);
  /** Requêtes retenues en attendant le retour du réseau. */
  readonly pendingReplays = signal(0);

  /** « Réessayer maintenant » du bandeau : rejoue les requêtes retenues sans attendre l'événement online. */
  readonly retryRequests: Observable<void> = this.retry$.asObservable();

  rateLimited(retryAfterSeconds: number | null, replaying: boolean): void {
    this.notice.set({ kind: 'rate-limited', retryAfterSeconds, replaying, seq: ++this.seq });
  }

  wentOffline(): void {
    this.offline.set(true);
  }

  hold(): void {
    this.pendingReplays.update((n) => n + 1);
  }

  release(): void {
    this.pendingReplays.update((n) => Math.max(0, n - 1));
  }

  /** Une réponse est arrivée : le bandeau disparaît ; après une coupure, un toast le dit. */
  backOnline(): void {
    if (!this.offline()) return;
    this.offline.set(false);
    this.notice.set({ kind: 'reconnected', replayed: this.pendingReplays(), seq: ++this.seq });
  }

  retryNow(): void {
    this.retry$.next();
  }
}
