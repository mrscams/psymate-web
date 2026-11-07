import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HttpNotices } from '../../../core/http';
import { NetworkBannerComponent } from './network-banner.component';
import { StatusBannerComponent } from './status-banner.component';
import { verificationBanner, VerificationBannerComponent } from './verification-banner.component';

function configure(): void {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
}

describe('StatusBannerComponent', () => {
  it('role status, mot du niveau pour les lecteurs d’écran, lien d’action', async () => {
    configure();
    const fixture = TestBed.createComponent(StatusBannerComponent);
    fixture.componentRef.setInput('message', 'Dossier en cours de vérification.');
    fixture.componentRef.setInput('actionLabel', 'Voir le dossier');
    fixture.componentRef.setInput('actionLink', '/mon-compte/dossier-professionnel');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('.banner');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.classList.contains('warning')).toBe(true);
    expect(banner?.querySelector('.sr-only')?.textContent).toContain('Avertissement');
    expect(banner?.querySelector('a.action')?.getAttribute('href')).toBe(
      '/mon-compte/dossier-professionnel',
    );
  });

  it('niveaux succès et information, bouton d’action', async () => {
    configure();
    const fixture = TestBed.createComponent(StatusBannerComponent);
    fixture.componentRef.setInput('message', 'Profil vérifié.');
    fixture.componentRef.setInput('level', 'success');
    fixture.componentRef.setInput('actionLabel', 'OK');
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.banner.success .sr-only')?.textContent).toContain('Succès');
    el.querySelector<HTMLButtonElement>('button.action')?.click();
    expect(action).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('level', 'info');
    await fixture.whenStable();
    expect(el.querySelector('.banner.info .sr-only')?.textContent).toContain('Information');
  });
});

describe('VerificationBannerComponent', () => {
  it('ambre tant que le dossier n’est pas approuvé, rien sinon', async () => {
    expect(verificationBanner('approved')).toBeNull();
    expect(verificationBanner(null)).toBeNull();
    expect(verificationBanner('under_review')?.level).toBe('warning');
    expect(verificationBanner('needs_more')?.message).toContain('complément');
    expect(verificationBanner('docs_pending')?.message).toContain('incomplet');

    configure();
    const fixture = TestBed.createComponent(VerificationBannerComponent);
    fixture.componentRef.setInput('status', 'under_review');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.banner.warning')?.textContent).toContain('en cours de vérification');
    expect(el.querySelector('a.action')?.getAttribute('href')).toBe(
      '/mon-compte/dossier-professionnel',
    );

    fixture.componentRef.setInput('status', 'approved');
    await fixture.whenStable();
    expect(el.querySelector('.banner')).toBeNull();
  });
});

describe('NetworkBannerComponent', () => {
  it('suit l’état hors ligne et rejoue sur « Réessayer maintenant »', async () => {
    configure();
    const fixture = TestBed.createComponent(NetworkBannerComponent);
    const notices = TestBed.inject(HttpNotices);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.banner')).toBeNull();

    notices.wentOffline();
    await fixture.whenStable();
    expect(el.querySelector('.banner.warning')?.textContent).toContain('Connexion perdue');
    const retry = vi.fn();
    notices.retryRequests.subscribe(retry);
    el.querySelector<HTMLButtonElement>('button.action')?.click();
    expect(retry).toHaveBeenCalledOnce();

    notices.backOnline();
    await fixture.whenStable();
    expect(el.querySelector('.banner')).toBeNull();
  });
});
