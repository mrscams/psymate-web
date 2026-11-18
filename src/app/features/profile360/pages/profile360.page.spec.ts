import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { reflectComponentType, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { ApiProblem } from '../../../core/http';
import { PatientShellStore } from '../../patient-shell';
import { Profile360Api } from '../data/profile360.api';
import { fullProfile, profileItem } from '../data/profile360.fixtures';
import { ProfileItem } from '../data/profile360.model';
import { loadProfile360Page } from '../index';
import { Profile360Page } from './profile360.page';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const networkError: ApiProblem = { status: 0, code: 'NETWORK_ERROR' };

async function render(
  url = '/patients/p-1/profile',
  profile: (patientId: string) => Promise<ProfileItem[]> = () => Promise.resolve(fullProfile()),
) {
  const api = { profile: vi.fn(profile) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'patients/:id/profile', component: Profile360Page }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Profile360Api, useValue: api },
      { provide: PatientShellStore, useValue: { patientId: signal('p-1') } },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, Profile360Page);
  await tick();
  harness.detectChanges();
  await harness.fixture.whenStable();
  return { api, harness, el: harness.routeNativeElement as HTMLElement };
}

function menuLinks(el: HTMLElement): HTMLAnchorElement[] {
  return Array.from(
    el.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Rubriques du profil"] a'),
  );
}

function rubricHeading(el: HTMLElement): string {
  return el.querySelector('pm-profile-rubric h3')?.textContent?.trim() ?? '';
}

function titles(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('pm-profile-rubric li .t')).map(
    (t) => t.textContent?.trim() ?? '',
  );
}

describe('Profile360Page', () => {
  it('titre de l’onglet pour les lecteurs d’écran, un seul appel au service de données, aucune requête HTTP directe', async () => {
    const { api, el } = await render();
    const heading = el.querySelector('h2#profile360-heading');
    expect(heading?.textContent?.trim()).toBe('Profil 360');
    expect(el.querySelector('section')?.getAttribute('aria-labelledby')).toBe('profile360-heading');
    expect(api.profile).toHaveBeenCalledTimes(1);
    expect(api.profile).toHaveBeenCalledWith('p-1');
    TestBed.inject(HttpTestingController).verify();
  });

  it('menu : quatre rubriques dans l’ordre, compteurs du store, compteur lu avec le libellé', async () => {
    const { el } = await render();
    const links = menuLinks(el);
    expect(links.map((a) => a.querySelector('.n')?.textContent?.trim())).toEqual([
      'Histoire et souvenirs',
      'Famille et entourage',
      'Santé et antécédents',
      'Valeurs et projets',
    ]);
    expect(links.map((a) => a.querySelector('.c')?.textContent?.trim())).toEqual([
      '3',
      '2',
      '1',
      '1',
    ]);
    expect(links[1].getAttribute('aria-label')).toBe('Famille et entourage 2 informations');
    expect(links[3].getAttribute('aria-label')).toBe('Valeurs et projets 1 information');
    expect(links[1].getAttribute('href')).toBe('/patients/p-1/profile?rubrique=family');
  });

  it('sans ?rubrique= : Histoire et souvenirs, fil chronologique dans l’ordre du serveur, période à gauche', async () => {
    const { el } = await render();
    expect(rubricHeading(el)).toBe('Histoire et souvenirs');
    expect(menuLinks(el)[0].getAttribute('aria-current')).toBe('true');
    expect(menuLinks(el)[1].hasAttribute('aria-current')).toBe(false);
    expect(el.querySelector('pm-profile-rubric .txt')?.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('pm-profile-rubric p')?.textContent).toContain('3 informations');

    const list = el.querySelector('pm-profile-rubric ol.tl');
    expect(list).not.toBeNull();
    expect(titles(el)).toEqual(['Enfance à Nantes', 'Divorce des parents', "L'odeur du tilleul"]);
    const first = list!.querySelector('li')!;
    // La période est le premier enfant (à gauche, lue avant le titre) ; le point est décoratif.
    expect(first.children[0].classList.contains('k')).toBe(true);
    expect(first.children[0].textContent?.trim()).toBe('1991 – 2002');
    expect(first.querySelector('.dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(first.querySelector('.d')?.textContent?.trim()).toBe('« Sage, première de classe »');
    // Sans année ni période : la colonne de gauche reste vide, l'information est en dernier.
    const last = list!.querySelectorAll('li')[2];
    expect(last.querySelector('.k')?.textContent?.trim()).toBe('');
    // Pas de bouton : les informations ne sont pas activables avant M13-07.
    expect(el.querySelectorAll('pm-profile-rubric button')).toHaveLength(0);
  });

  it('?rubrique=family : Famille et entourage, pastille à la première lettre du titre, titre et détail seulement', async () => {
    const { el } = await render('/patients/p-1/profile?rubrique=family');
    expect(rubricHeading(el)).toBe('Famille et entourage');
    expect(menuLinks(el)[1].getAttribute('aria-current')).toBe('true');
    expect(el.querySelector('pm-profile-rubric p')?.textContent?.trim()).toBe(
      'Les personnes qui comptent · 2 informations',
    );
    const rows = Array.from(el.querySelectorAll('pm-profile-rubric ul.people li'));
    expect(rows).toHaveLength(2);
    expect(rows.map((li) => li.querySelector('.av')?.textContent?.trim())).toEqual(['T', 'H']);
    expect(rows[0].querySelector('.av')?.getAttribute('aria-hidden')).toBe('true');
    expect(rows[0].querySelector('.t')?.textContent?.trim()).toBe('Thomas, compagnon');
    expect(rows[0].querySelector('.d')?.textContent?.trim()).toBe('Vie commune depuis 2020');
    // Aucune colonne de période hors Histoire et souvenirs.
    expect(el.querySelector('pm-profile-rubric .k')).toBeNull();
  });

  it('Santé et Valeurs : une ligne par information, ni pastille ni étiquette à gauche', async () => {
    for (const [param, title] of [
      ['health', 'Migraines'],
      ['values_goals', 'Reprendre le piano'],
    ]) {
      TestBed.resetTestingModule();
      const { el } = await render(`/patients/p-1/profile?rubrique=${param}`);
      const rows = Array.from(el.querySelectorAll('pm-profile-rubric ul.std li'));
      expect(rows).toHaveLength(1);
      expect(rows[0].querySelector('.t')?.textContent?.trim()).toBe(title);
      expect(rows[0].children).toHaveLength(1);
      expect(el.querySelector('pm-profile-rubric .av, pm-profile-rubric .k')).toBeNull();
    }
  });

  it('valeur de ?rubrique= inconnue : Histoire et souvenirs', async () => {
    const { el } = await render('/patients/p-1/profile?rubrique=inconnue');
    expect(rubricHeading(el)).toBe('Histoire et souvenirs');
  });

  it('cliquer une rubrique du menu l’affiche et met à jour ?rubrique=, sans relire le profil', async () => {
    const { api, harness, el } = await render();
    menuLinks(el)[2].click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/patients/p-1/profile?rubrique=health');
    expect(rubricHeading(el)).toBe('Santé et antécédents');
    expect(api.profile).toHaveBeenCalledTimes(1);
  });

  it('rubrique vide dans un profil non vide : « Rien dans cette rubrique pour l’instant »', async () => {
    const { el } = await render('/patients/p-1/profile?rubrique=values_goals', () =>
      Promise.resolve([profileItem('history', 'Enfance')]),
    );
    expect(rubricHeading(el)).toBe('Valeurs et projets');
    const empty = el.querySelector('pm-profile-rubric pm-state [role="status"]');
    expect(empty?.textContent).toContain("Rien dans cette rubrique pour l'instant");
    expect(menuLinks(el).map((a) => a.querySelector('.c')?.textContent?.trim())).toEqual([
      '1',
      '0',
      '0',
      '0',
    ]);
  });

  it('chargement : état « chargement » de shared/ui/state, ni menu ni erreur', async () => {
    const { el } = await render(undefined, () => new Promise<ProfileItem[]>(() => undefined));
    const loading = el.querySelector('pm-state [aria-busy="true"]');
    expect(loading?.textContent).toContain('Chargement…');
    expect(menuLinks(el)).toHaveLength(0);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('profil vide : « Aucune information dans le profil », sans menu', async () => {
    const { el } = await render(undefined, () => Promise.resolve([]));
    const empty = el.querySelector('pm-state [role="status"]');
    expect(empty?.textContent).toContain('Aucune information dans le profil');
    expect(menuLinks(el)).toHaveLength(0);
  });

  it('erreur : état erreur avec « Réessayer », qui relit le profil', async () => {
    let fail = true;
    const { api, harness, el } = await render(undefined, () =>
      fail ? Promise.reject(networkError) : Promise.resolve(fullProfile()),
    );
    const alert = el.querySelector('pm-state [role="alert"]');
    expect(alert?.textContent).toContain("Le profil n'a pas pu être chargé");
    const retry = Array.from(el.querySelectorAll<HTMLButtonElement>('pm-state button')).find(
      (b) => b.textContent?.trim() === 'Réessayer',
    );
    expect(retry).toBeDefined();

    fail = false;
    retry!.click();
    await tick();
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(api.profile).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(rubricHeading(el)).toBe('Histoire et souvenirs');
  });

  it('loadProfile360Page (index public) charge la page à la demande', async () => {
    const component = await loadProfile360Page();
    expect(component).toBe(Profile360Page);
    expect(reflectComponentType(component)?.selector).toBe('pm-profile360-page');
  });
});
