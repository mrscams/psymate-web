import { Injectable, signal } from '@angular/core';

/** Jamais d'erreur en toast (planche 29) : elle s'affiche là où elle s'est produite. */
export type ToastLevel = 'success' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  handler: () => void;
}

export interface ToastInput {
  level: ToastLevel;
  message: string;
  action?: ToastAction;
  /** Durée d'affichage ; 6 s par défaut, 0 pour rester jusqu'à fermeture. */
  durationMs?: number;
}

export interface Toast extends ToastInput {
  id: number;
}

export const TOAST_DURATION_MS = 6_000;
export const TOAST_MAX = 3;

/**
 * File des toasts (fiche 00 §7, planche 29) : trois au plus, les plus anciens sortent, 6 s par
 * défaut, fermables, action optionnelle (« Annuler »). Le composant pm-toast-outlet les affiche.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<Toast[]>([]);

  show(input: ToastInput): number {
    const toast: Toast = { ...input, id: this.nextId++ };
    this.toasts.update((list) => {
      const next = [...list, toast];
      for (const dropped of next.slice(0, Math.max(0, next.length - TOAST_MAX))) {
        this.clearTimer(dropped.id);
      }
      return next.slice(-TOAST_MAX);
    });
    const duration = input.durationMs ?? TOAST_DURATION_MS;
    if (duration > 0) {
      this.timers.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), duration),
      );
    }
    return toast.id;
  }

  success(message: string, action?: ToastAction): number {
    return this.show({ level: 'success', message, action });
  }

  info(message: string, action?: ToastAction): number {
    return this.show({ level: 'info', message, action });
  }

  warning(message: string, action?: ToastAction): number {
    return this.show({ level: 'warning', message, action });
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  clear(): void {
    for (const id of this.timers.keys()) this.clearTimer(id);
    this.toasts.set([]);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(id);
  }
}
