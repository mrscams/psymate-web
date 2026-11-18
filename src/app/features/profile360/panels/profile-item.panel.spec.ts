import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApiProblem } from '../../../core/http';
import { ConfirmDialogService } from '../../../shared/ui';
import { Profile360Api } from '../data/profile360.api';
import { fullProfile, profileItem } from '../data/profile360.fixtures';
import { ProfileCategory, ProfileItem } from '../data/profile360.model';
import { Profile360Store } from '../data/profile360.store';
import { ProfileItemPanel } from './profile-item.panel';

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await wait();
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

interface RenderOptions {
  category?: ProfileCategory;
  item?: ProfileItem | null;
  api?: Record<string, unknown>;
  confirmed?: boolean;
}

/** Le panneau avec un vrai store et un service de données simulé (aucune requête HTTP). */
async function render(options: RenderOptions = {}) {
  const api = {
    profile: vi.fn().mockResolvedValue(fullProfile()),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    ...options.api,
  };
  const dialogRef = { close: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(options.confirmed ?? true) };
  TestBed.configureTestingModule({
    providers: [
      Profile360Store,
      { provide: Profile360Api, useValue: api },
      {
        provide: DIALOG_DATA,
        useFactory: () => ({
          store: inject(Profile360Store),
          category: options.category ?? 'history',
          item: options.item ?? null,
        }),
      },
      { provide: DialogRef, useValue: dialogRef },
      { provide: ConfirmDialogService, useValue: confirm },
    ],
  });
  const store = TestBed.inject(Profile360Store);
  await store.load('p-1');
  api.profile.mockClear();
  const fixture = TestBed.createComponent(ProfileItemPanel);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { api, dialogRef, confirm, fixture, el, store };
}

function field<T extends HTMLElement>(el: HTMLElement, name: string): T | null {
  return el.querySelector<T>(`#field-${name}`);
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`bouton « ${label} » absent`);
  return found;
}

async function submit(el: HTMLElement, fixture: ComponentFixture<unknown>): Promise<void> {
  el.querySelector('form')!.dispatchEvent(new Event('submit'));
  await settle(fixture);
}

describe('ProfileItemPanel', () => {
  it('création : titre « Ajouter au profil », rubrique affichée préremplie, focus initial sur Information, pas de « Retirer »', async () => {
    const { el } = await render({ category: 'family' });
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('Ajouter au profil');
    expect(field<HTMLSelectElement>(el, 'category')?.value).toBe('family');
    expect(field(el, 'title')?.hasAttribute('cdkFocusInitial')).toBe(true);
    expect(button(el, 'Ajouter').type).toBe('submit');
    expect(el.textContent).not.toContain('Retirer du profil');
    expect(field(el, 'periodLabel')).toBeNull();
    expect(field(el, 'periodYear')).toBeNull();
  });

  it('Période et Année pour Histoire et souvenirs seulement ; quitter la rubrique les vide, y revenir les réaffiche vides', async () => {
    const { el, fixture } = await render({ category: 'history' });
    type(field<HTMLInputElement>(el, 'periodLabel')!, 'Enfance');
    type(field<HTMLInputElement>(el, 'periodYear')!, '1991');
    choose(field<HTMLSelectElement>(el, 'category')!, 'health');
    await settle(fixture);
    expect(field(el, 'periodLabel')).toBeNull();
    expect(field(el, 'periodYear')).toBeNull();
    choose(field<HTMLSelectElement>(el, 'category')!, 'history');
    await settle(fixture);
    expect(field<HTMLInputElement>(el, 'periodLabel')?.value).toBe('');
    expect(field<HTMLInputElement>(el, 'periodYear')?.value).toBe('');
  });

  it('ajout dans une autre rubrique : POST sans periodLabel ni periodYear, relecture, fermeture avec le résultat', async () => {
    const { el, fixture, api, dialogRef } = await render({ category: 'history' });
    type(field<HTMLInputElement>(el, 'periodLabel')!, 'Enfance');
    type(field<HTMLInputElement>(el, 'periodYear')!, '1991');
    choose(field<HTMLSelectElement>(el, 'category')!, 'health');
    type(field<HTMLInputElement>(el, 'title')!, '  Asthme  ');
    await submit(el, fixture);
    expect(api.create).toHaveBeenCalledWith('p-1', { category: 'health', title: 'Asthme' });
    expect(api.profile).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith({
      action: 'created',
      category: 'health',
      itemId: null,
    });
  });

  it('ajout dans Histoire et souvenirs : période et année envoyées', async () => {
    const { el, fixture, api } = await render({ category: 'history' });
    type(field<HTMLInputElement>(el, 'title')!, 'Déménagement à Lyon');
    type(field<HTMLTextAreaElement>(el, 'detail')!, 'Nouveau collège');
    type(field<HTMLInputElement>(el, 'periodLabel')!, 'Vers 2005');
    type(field<HTMLInputElement>(el, 'periodYear')!, '2005');
    await submit(el, fixture);
    expect(api.create).toHaveBeenCalledWith('p-1', {
      category: 'history',
      title: 'Déménagement à Lyon',
      detail: 'Nouveau collège',
      periodLabel: 'Vers 2005',
      periodYear: 2005,
    });
  });

  it('titre vide : aucune requête, message sous le champ', async () => {
    const { el, fixture, api, dialogRef } = await render();
    type(field<HTMLInputElement>(el, 'title')!, '   ');
    await submit(el, fixture);
    expect(api.create).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(el.querySelector('#field-title-error')?.textContent?.trim()).toBe(
      'Ce champ est obligatoire.',
    );
    expect(field(el, 'title')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('année hors de 1900 à 2100 : aucune requête', async () => {
    const { el, fixture, api } = await render();
    type(field<HTMLInputElement>(el, 'title')!, 'Enfance');
    type(field<HTMLInputElement>(el, 'periodYear')!, '1850');
    await submit(el, fixture);
    expect(api.create).not.toHaveBeenCalled();
    expect(el.querySelector('#field-periodYear-error')).not.toBeNull();
  });

  it('422 du serveur sur un champ : le message s’affiche sous ce champ, le panneau reste ouvert', async () => {
    const problem: ApiProblem = {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'detail', code: 'OUT_OF_RANGE', message: '2 000 caractères au plus.' }],
    };
    const { el, fixture, dialogRef } = await render({
      api: { create: vi.fn().mockRejectedValue(problem) },
    });
    type(field<HTMLInputElement>(el, 'title')!, 'Enfance');
    await submit(el, fixture);
    expect(el.querySelector('#field-detail-error')?.textContent?.trim()).toBe(
      '2 000 caractères au plus.',
    );
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('422 PROFILE_ITEM_LIMIT_REACHED : message dans le panneau', async () => {
    const { el, fixture, dialogRef } = await render({
      api: {
        create: vi.fn().mockRejectedValue({ status: 422, code: 'PROFILE_ITEM_LIMIT_REACHED' }),
      },
    });
    type(field<HTMLInputElement>(el, 'title')!, 'Enfance');
    await submit(el, fixture);
    expect(el.querySelector('.form-message[role="alert"]')?.textContent).toContain(
      'déjà 500 informations',
    );
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it.each([
    ['404 PROFILE_ITEM_NOT_FOUND', { status: 404, code: 'PROFILE_ITEM_NOT_FOUND' }, 'gone'],
    ['409 PROFILE_ITEM_ARCHIVED', { status: 409, code: 'PROFILE_ITEM_ARCHIVED' }, 'gone'],
    ['409 PATIENT_ARCHIVED', { status: 409, code: 'PATIENT_ARCHIVED' }, 'archived'],
  ])('%s : fermeture avec %s', async (_label, problem, action) => {
    const item = profileItem('health', 'Migraines');
    const { el, fixture, dialogRef } = await render({
      item,
      api: { update: vi.fn().mockRejectedValue(problem) },
    });
    type(field<HTMLInputElement>(el, 'title')!, 'Migraines rares');
    await submit(el, fixture);
    expect(dialogRef.close).toHaveBeenCalledWith({ action });
  });

  it('modification : champs préremplis, « Enregistrer », PATCH des seuls champs modifiés, précision effacée par null', async () => {
    const item = profileItem('history', 'Enfance', {
      detail: 'Nantes',
      periodLabel: '1991 – 2002',
      periodYear: 1991,
    });
    const { el, fixture, api, dialogRef } = await render({ item, category: 'family' });
    expect(el.querySelector('h2')?.textContent?.trim()).toBe("Modifier l'information");
    expect(field<HTMLSelectElement>(el, 'category')?.value).toBe('history');
    expect(field<HTMLInputElement>(el, 'title')?.value).toBe('Enfance');
    expect(field<HTMLTextAreaElement>(el, 'detail')?.value).toBe('Nantes');
    expect(field<HTMLInputElement>(el, 'periodLabel')?.value).toBe('1991 – 2002');
    expect(field<HTMLInputElement>(el, 'periodYear')?.value).toBe('1991');

    type(field<HTMLInputElement>(el, 'title')!, 'Enfance à Nantes');
    type(field<HTMLTextAreaElement>(el, 'detail')!, '');
    expect(button(el, 'Enregistrer').type).toBe('submit');
    await submit(el, fixture);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith('p-1', item.id, {
      title: 'Enfance à Nantes',
      detail: null,
    });
    expect(api.profile).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith({
      action: 'updated',
      category: 'history',
      itemId: item.id,
    });
  });

  it('« Retirer du profil » : bouton texte neutre, confirmation partagée non destructive, DELETE puis relecture', async () => {
    const item = profileItem('family', 'Thomas');
    const { el, fixture, api, confirm, dialogRef } = await render({ item });
    const remove = button(el, 'Retirer du profil');
    expect(remove.classList.contains('btn-text')).toBe(true);
    remove.click();
    await settle(fixture);
    expect(confirm.confirm).toHaveBeenCalledWith({
      title: 'Retirer cette information du profil ?',
      description: 'Elle ne sera plus affichée.',
      confirmLabel: 'Retirer',
    });
    expect(api.remove).toHaveBeenCalledWith('p-1', item.id);
    expect(api.profile).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith({
      action: 'removed',
      category: 'family',
      itemId: item.id,
    });
  });

  it('retrait annulé à la confirmation : rien ne change', async () => {
    const item = profileItem('family', 'Thomas');
    const { el, fixture, api, dialogRef } = await render({ item, confirmed: false });
    button(el, 'Retirer du profil').click();
    await settle(fixture);
    expect(api.remove).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('Annuler ferme sans résultat ; modification sans changement : fermeture sans requête', async () => {
    const { el, dialogRef } = await render();
    button(el, 'Annuler').click();
    expect(dialogRef.close).toHaveBeenCalledWith();
    TestBed.resetTestingModule();

    const item = profileItem('health', 'Migraines');
    const unchanged = await render({ item });
    await submit(unchanged.el, unchanged.fixture);
    expect(unchanged.api.update).not.toHaveBeenCalled();
    expect(unchanged.dialogRef.close).toHaveBeenCalledWith();
  });
});
