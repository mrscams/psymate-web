import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { reflectComponentType } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { loadProfile360Page } from '../index';
import { Profile360Page } from './profile360.page';

describe('Profile360Page (squelette M13-05)', () => {
  it('titre « Profil 360 » pour les lecteurs d’écran et état « chargement », sans aucune requête', async () => {
    TestBed.configureTestingModule({
      imports: [Profile360Page],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Profile360Page);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const heading = el.querySelector('h2#profile360-heading');
    expect(heading?.textContent?.trim()).toBe('Profil 360');
    expect(el.querySelector('section')?.getAttribute('aria-labelledby')).toBe('profile360-heading');
    // État « chargement » de shared/ui/state : aria-busy, « Chargement… » lu une fois.
    const loading = el.querySelector('pm-state [aria-busy="true"]');
    expect(loading).not.toBeNull();
    expect(loading?.textContent).toContain('Chargement…');
    // Ni erreur ni vide : le profil n'est pas lu avant M13-06.
    expect(el.querySelector('[role="alert"]')).toBeNull();
    // Aucun appel d'API (les routes profile-items arrivent avec le contrat 0.14.0, M13-04).
    TestBed.inject(HttpTestingController).verify();
  });

  it('loadProfile360Page (index public) charge la page à la demande', async () => {
    const component = await loadProfile360Page();
    expect(component).toBe(Profile360Page);
    expect(reflectComponentType(component)?.selector).toBe('pm-profile360-page');
  });
});
