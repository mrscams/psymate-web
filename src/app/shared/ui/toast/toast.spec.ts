import { TestBed } from '@angular/core/testing';

import { HttpNotices } from '../../../core/http';
import { ToastOutletComponent } from './toast-outlet.component';
import { ToastService } from './toast.service';

/** Intl sépare nombre et unité par une espace fine insécable : on la ramène à une espace. */
const plain = (text: string | null | undefined): string => (text ?? '').replace(/[  ]/g, ' ');

describe('ToastService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('6 s par défaut, trois au plus, les plus anciens sortent', () => {
    const service = TestBed.inject(ToastService);
    service.success('un');
    service.info('deux');
    service.warning('trois');
    service.success('quatre');
    expect(service.toasts().map((t) => t.message)).toEqual(['deux', 'trois', 'quatre']);

    vi.advanceTimersByTime(5_999);
    expect(service.toasts()).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(service.toasts()).toHaveLength(0);
  });

  it('fermeture manuelle, durée 0 = reste', () => {
    const service = TestBed.inject(ToastService);
    const id = service.show({ level: 'info', message: 'reste', durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(service.toasts()).toHaveLength(1);
    service.dismiss(id);
    expect(service.toasts()).toHaveLength(0);
  });
});

describe('ToastOutletComponent', () => {
  async function render() {
    TestBed.configureTestingModule({ imports: [ToastOutletComponent] });
    const fixture = TestBed.createComponent(ToastOutletComponent);
    await fixture.whenStable();
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      service: TestBed.inject(ToastService),
      notices: TestBed.inject(HttpNotices),
    };
  }

  it('région aria-live polite, mot du niveau, action puis fermeture', async () => {
    const { fixture, el, service } = await render();
    const region = el.querySelector('.toasts');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelectorAll('.toast')).toHaveLength(0);

    const undo = vi.fn();
    service.show({
      level: 'success',
      message: 'Entrée enregistrée',
      action: { label: 'Annuler', handler: undo },
      durationMs: 0,
    });
    service.show({ level: 'warning', message: 'Dossier en cours de vérification', durationMs: 0 });
    await fixture.whenStable();
    const toasts = el.querySelectorAll('.toast');
    expect(toasts).toHaveLength(2);
    expect(toasts[0].querySelector('.level')?.classList.contains('sr-only')).toBe(true);
    expect(toasts[1].querySelector('.level')?.textContent).toContain('Avertissement');
    expect(toasts[1].querySelector('.level')?.classList.contains('sr-only')).toBe(false);

    toasts[0].querySelector<HTMLButtonElement>('button.action')?.click();
    await fixture.whenStable();
    expect(undo).toHaveBeenCalledOnce();
    expect(el.querySelectorAll('.toast')).toHaveLength(1);

    const close = el.querySelector<HTMLButtonElement>('button.close');
    expect(close?.getAttribute('aria-label')).toBe('Fermer');
    close?.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('relaie un 429 (« réessayez dans N s ») et le retour du réseau', async () => {
    const { fixture, el, notices } = await render();
    notices.rateLimited(12, true);
    await fixture.whenStable();
    expect(plain(el.querySelector('.toast.warning .message')?.textContent)).toBe(
      'Trop de requêtes, réessayez dans 12 s. Votre saisie est conservée.',
    );

    notices.wentOffline();
    notices.hold();
    notices.hold();
    notices.backOnline();
    await fixture.whenStable();
    expect(el.querySelector('.toast.success .message')?.textContent).toBe(
      'Connexion rétablie · 2 brouillons renvoyés.',
    );
    expect(el.querySelectorAll('.toast')).toHaveLength(2);
  });
});
