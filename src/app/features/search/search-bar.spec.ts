import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { DossierSearchBar, patientLocation } from './search-bar';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

const ID = '8943f30b-07b2-4933-8a06-7bb3ac736ea7';

async function setup(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', component: Blank }])],
  });
  const router = TestBed.inject(Router);
  const bar = TestBed.inject(DossierSearchBar);
  await router.navigateByUrl(url);
  return { router, bar };
}

describe('DossierSearchBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('patientLocation : écran patient (uuid) et onglet', () => {
    expect(patientLocation(`/patients/${ID}`)).toEqual({ patientId: ID, tab: '' });
    expect(patientLocation(`/patients/${ID}/timeline?x=1`)).toEqual({
      patientId: ID,
      tab: 'timeline',
    });
    expect(patientLocation('/patients/nouveau')).toBeNull();
    expect(patientLocation('/patients')).toBeNull();
  });

  it('sur un écran patient : la saisie ouvre la recherche après 250 ms, à partir de 2 caractères', async () => {
    const { router, bar } = await setup(`/patients/${ID}/timeline`);
    expect(bar.placeholder()).toBe('Rechercher dans le dossier');
    bar.input('e');
    await vi.advanceTimersByTimeAsync(300);
    expect(router.url).toBe(`/patients/${ID}/timeline`);
    bar.input('en');
    await vi.advanceTimersByTimeAsync(200);
    expect(router.url).toBe(`/patients/${ID}/timeline`);
    await vi.advanceTimersByTimeAsync(60);
    expect(router.url).toBe(`/patients/${ID}/search?q=en`);
    expect(bar.query()).toBe('en');
    expect(bar.returnUrl(ID)).toBe(`/patients/${ID}/timeline`);
  });

  it('sur la recherche : ?q= mis à jour sans quitter la page, autres filtres gardés', async () => {
    const { router, bar } = await setup(`/patients/${ID}/search?q=en&types=note`);
    bar.input('entretien');
    await vi.advanceTimersByTimeAsync(260);
    expect(router.url).toBe(`/patients/${ID}/search?q=entretien&types=note`);
  });

  it('Entrée : recherche immédiate hors de la page, sinon la page ouvre la sélection', async () => {
    const { router, bar } = await setup(`/patients/${ID}`);
    bar.input('manager');
    bar.submit('manager');
    await vi.advanceTimersByTimeAsync(0);
    expect(router.url).toBe(`/patients/${ID}/search?q=manager`);
    const submit = vi.fn();
    const detach = bar.attach({ submit });
    bar.submit('manager');
    expect(submit).toHaveBeenCalledTimes(1);
    detach();
    bar.submit('manager');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('hors dossier : rien ne part, le champ se vide en quittant la recherche', async () => {
    const { router, bar } = await setup('/patients');
    expect(bar.placeholder()).toBeUndefined();
    bar.input('marie');
    await vi.advanceTimersByTimeAsync(300);
    expect(router.url).toBe('/patients');
    await router.navigateByUrl(`/patients/${ID}/search?q=marie`);
    bar.showQuery('marie');
    await router.navigateByUrl(`/patients/${ID}/graph`);
    expect(bar.query()).toBe('');
    expect(bar.returnUrl(ID)).toBe(`/patients/${ID}`);
  });
});
